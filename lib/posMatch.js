/**
 * lib/posMatch.js — Smart bulk match engine.
 *
 * Match priority (first hit wins):
 *   1. barcode     — POS barcode === Shopify variant barcode (exact)
 *   2. sku         — POS SKU    === Shopify variant SKU (exact)
 *   3. sku_in_title — POS SKU found as a token inside Shopify product title
 *   4. name_token  — model codes extracted from POS name, found in Shopify title
 *
 * A "model code" token must:
 *   - Contain both a letter AND a digit
 *   - Be at least 3 characters long
 *   - Start with a letter (HX68, J164, C150B, ET-M110…)
 *   - NOT look like a product spec (45W, 120W, 8000MAH, 130000RPM, PD45W…)
 *
 * Spec detection: if a token ends with a known unit suffix (W, RPM, MAH, V, A,
 * GB, HZ, etc.) AND has a digit immediately before that suffix → it's a spec.
 *
 * Tokens that map to more than one Shopify product are marked AMBIGUOUS and
 * excluded — prevents a shared model number from creating wrong matches.
 */

import db from './db'

const COLS_PER_ROW = 10
const MAX_ROWS     = Math.floor(32000 / COLS_PER_ROW)  // 3200 rows per batch

// ── Unit suffixes that indicate a spec, not a model code ─────────────────────
// Order matters: longer suffixes first so "MAH" is checked before "H", "AH"
const UNIT_SUFFIXES = [
  'MAMP', 'WATT', 'VOLT',
  'RPM', 'MAH', 'KWH', 'MHZ', 'GHZ', 'KHZ',
  'GB', 'MB', 'TB', 'KB', 'WH', 'KW', 'MW', 'MA', 'AH', 'KG', 'KM', 'MM', 'CM', 'IN', 'FT',
  'PORT', 'PIN',
  'W', 'V', 'A', 'G', 'M', 'K',
]

function isSpecToken(token) {
  // If the token ends with a known unit suffix AND has a digit just before that suffix,
  // it's a measurement/spec (45W, 8000MAH, 130000RPM, PD45W, 5V, 3A, 256GB…)
  for (const suffix of UNIT_SUFFIXES) {
    if (token.endsWith(suffix) && token.length > suffix.length) {
      const before = token.slice(0, -suffix.length)
      if (/\d$/.test(before)) return true   // digit right before the unit
    }
  }
  return false
}

function extractModelCodes(text) {
  if (!text) return []

  // Split on whitespace and common separators; keep hyphens inside tokens
  const raw = text.toUpperCase().split(/[\s,;:|/\\()\[\]{}'"+&]+/)

  return raw.filter(t => {
    t = t.trim()
    if (t.length < 3)          return false   // too short (W, 4K, 5G…)
    if (!/[A-Z]/.test(t))      return false   // must have a letter
    if (!/[0-9]/.test(t))      return false   // must have a digit
    if (!/^[A-Z]/.test(t))     return false   // must START with a letter (model codes do)
    if (isSpecToken(t))        return false   // skip specs like 45W, 8000MAH, 130000RPM
    return true
  })
}

export async function runPosMatch() {
  // 1. Load Shopify variants → lookup maps
  const variants = await db.variant.findMany({
    select: {
      id: true, sku: true, barcode: true,
      price: true, inventoryQuantity: true,
      product: { select: { title: true, status: true } },
    },
  })

  const byBarcode    = new Map()   // barcode (upper) → variant
  const bySku        = new Map()   // sku (upper)     → variant
  const byTitleToken = new Map()   // model token     → variant | 'AMBIGUOUS'

  for (const v of variants) {
    if (v.barcode?.trim()) {
      byBarcode.set(v.barcode.trim().toUpperCase(), v)
    }
    if (v.sku?.trim()) {
      bySku.set(v.sku.trim().toUpperCase(), v)
    }
    // Index every model-code token from the Shopify title
    const tokens = extractModelCodes(v.product?.title || '')
    for (const token of tokens) {
      if (byTitleToken.has(token)) {
        byTitleToken.set(token, 'AMBIGUOUS')   // same code in 2+ products → unusable
      } else {
        byTitleToken.set(token, v)
      }
    }
  }

  // 2. Load all POS products
  const posProducts = await db.posProduct.findMany()

  // 3. Match each POS product in memory
  let matched = 0, unmatched = 0
  const matchTypeCounts = { barcode: 0, sku: 0, sku_in_title: 0, name_token: 0 }

  const rows = posProducts.map(pos => {
    let variant = null, matchType = null

    // Priority 1: exact barcode
    if (!variant && pos.barcode?.trim()) {
      const v = byBarcode.get(pos.barcode.trim().toUpperCase())
      if (v) { variant = v; matchType = 'barcode' }
    }

    // Priority 2: exact SKU
    if (!variant && pos.sku?.trim()) {
      const v = bySku.get(pos.sku.trim().toUpperCase())
      if (v) { variant = v; matchType = 'sku' }
    }

    // Priority 3: POS SKU found as a model-code token in Shopify title
    if (!variant && pos.sku?.trim()) {
      const skuToken = pos.sku.trim().toUpperCase()
      if (!isSpecToken(skuToken) && skuToken.length >= 3) {
        const v = byTitleToken.get(skuToken)
        if (v && v !== 'AMBIGUOUS') { variant = v; matchType = 'sku_in_title' }
      }
    }

    // Priority 4: model codes from POS name found in Shopify title
    if (!variant) {
      const posTokens = extractModelCodes(pos.name || '')
      for (const token of posTokens) {
        const v = byTitleToken.get(token)
        if (v && v !== 'AMBIGUOUS') {
          variant = v
          matchType = 'name_token'
          break
        }
      }
    }

    if (variant) { matched++; matchTypeCounts[matchType]++ }
    else         { unmatched++ }

    return {
      posProductId:     pos.id,
      shopifyVariantId: variant?.id              ?? null,
      matchType:        matchType,
      newStatus:        variant ? 'pending' : 'unmatched',
      posStockMain:     pos.stockMain,
      posStockStore:    pos.stockStore,
      posPrice:         pos.price,
      shopifyStock:     variant?.inventoryQuantity ?? null,
      shopifyPrice:     variant?.price             ?? null,
      shopifyStatus:    variant?.product?.status   ?? null,
    }
  })

  console.log(`[POS MATCH] ${matched} matched / ${unmatched} unmatched`, matchTypeCounts)

  // 4. Bulk upsert — one SQL per batch, preserves confirmed/rejected rows
  for (let i = 0; i < rows.length; i += MAX_ROWS) {
    const batch  = rows.slice(i, i + MAX_ROWS)
    const values = []
    const params = []
    let   p      = 1

    for (const r of batch) {
      values.push(`(gen_random_uuid()::text, $${p++}::text, $${p++}::text, $${p++}::text, $${p++}::text, $${p++}::int, $${p++}::int, $${p++}::float8, $${p++}::float8, $${p++}::float8, $${p++}::text, NOW(), NOW())`)
      params.push(
        r.posProductId, r.shopifyVariantId, r.matchType, r.newStatus,
        r.posStockMain, r.posStockStore, r.posPrice,
        r.shopifyStock, r.shopifyPrice, r.shopifyStatus,
      )
    }

    await db.$executeRawUnsafe(`
      INSERT INTO "PosMatch"
        (id, "posProductId", "shopifyVariantId", "matchType", status,
         "posStockMain", "posStockStore", "posPrice",
         "shopifyStock", "shopifyPrice", "shopifyStatus",
         "createdAt", "updatedAt")
      VALUES ${values.join(',')}
      ON CONFLICT ("posProductId") DO UPDATE SET
        "shopifyVariantId" = CASE WHEN "PosMatch".status IN ('confirmed','rejected')
                                  THEN "PosMatch"."shopifyVariantId"
                                  ELSE EXCLUDED."shopifyVariantId" END,
        "matchType"        = CASE WHEN "PosMatch".status IN ('confirmed','rejected')
                                  THEN "PosMatch"."matchType"
                                  ELSE EXCLUDED."matchType" END,
        status             = CASE WHEN "PosMatch".status IN ('confirmed','rejected')
                                  THEN "PosMatch".status
                                  ELSE EXCLUDED.status END,
        "posStockMain"  = EXCLUDED."posStockMain",
        "posStockStore" = EXCLUDED."posStockStore",
        "posPrice"      = EXCLUDED."posPrice",
        "shopifyStock"  = EXCLUDED."shopifyStock",
        "shopifyPrice"  = EXCLUDED."shopifyPrice",
        "shopifyStatus" = EXCLUDED."shopifyStatus",
        "updatedAt"     = NOW()
    `, ...params)
  }

  return { total: posProducts.length, matched, unmatched, matchTypeCounts }
}
