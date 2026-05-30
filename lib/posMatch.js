/**
 * lib/posMatch.js — Smart bulk match engine.
 *
 * Match priority (first hit wins):
 *   1. barcode  — POS barcode === Shopify variant barcode (exact)
 *   2. sku      — POS SKU    === Shopify variant SKU (exact)
 *   3. sku_in_title — POS SKU found as a token inside Shopify product title
 *   4. name_token  — extract model codes from POS name, find in Shopify title
 *
 * "Model code" = any token that contains both a letter and a digit
 * (ET-M110, WP931B8, CB-53, Z28…). Pure words like "USB" or "Car" are skipped.
 * Tokens that appear in multiple Shopify products are excluded (too ambiguous).
 *
 * Handles 11K+ products in a few seconds via single SQL upsert per batch.
 */

import db from './db'

// PostgreSQL max params = 65535. With 10 cols per row → max 6553 rows per batch.
const COLS_PER_ROW = 10
const MAX_ROWS     = Math.floor(32000 / COLS_PER_ROW)  // 3200

// ─── Model-code extractor ─────────────────────────────────────────────────────
// Splits a string into uppercase tokens, keeps only those that look like a
// product model code (contains at least one letter AND one digit, length ≥ 3).
// Hyphens inside tokens are preserved so "ET-M110" stays as one token.
function extractModelCodes(text) {
  if (!text) return []
  // Split on whitespace and common separators, but keep hyphens inside words
  const raw = text.toUpperCase().split(/[\s,;:|/\\()\[\]{}'"+&]+/)
  return raw.filter(t => {
    t = t.trim()
    if (t.length < 3)         return false
    const hasLetter = /[A-Z]/.test(t)
    const hasDigit  = /[0-9]/.test(t)
    return hasLetter && hasDigit
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
    // 1a. barcode index
    if (v.barcode?.trim()) {
      byBarcode.set(v.barcode.trim().toUpperCase(), v)
    }
    // 1b. SKU index
    if (v.sku?.trim()) {
      bySku.set(v.sku.trim().toUpperCase(), v)
    }
    // 1c. Title-token index
    const tokens = extractModelCodes(v.product?.title || '')
    for (const token of tokens) {
      if (byTitleToken.has(token)) {
        // Two different Shopify products share this token → ambiguous, unusable
        byTitleToken.set(token, 'AMBIGUOUS')
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

    // Priority 3: POS SKU found as a token inside Shopify title
    if (!variant && pos.sku?.trim()) {
      const v = byTitleToken.get(pos.sku.trim().toUpperCase())
      if (v && v !== 'AMBIGUOUS') { variant = v; matchType = 'sku_in_title' }
    }

    // Priority 4: model codes extracted from POS name found in Shopify title
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

  // 4. Bulk upsert in batches — one SQL statement per batch
  //    ON CONFLICT: always update snapshot fields;
  //    only update match fields if status is pending/unmatched (not confirmed/rejected)
  for (let i = 0; i < rows.length; i += MAX_ROWS) {
    const batch  = rows.slice(i, i + MAX_ROWS)
    const values = []
    const params = []
    let   p      = 1

    for (const r of batch) {
      values.push(`(gen_random_uuid()::text, $${p++}::text, $${p++}::text, $${p++}::text, $${p++}::text, $${p++}::int, $${p++}::int, $${p++}::float8, $${p++}::float8, $${p++}::float8, $${p++}::text, NOW(), NOW())`)
      params.push(
        r.posProductId,
        r.shopifyVariantId,
        r.matchType,
        r.newStatus,
        r.posStockMain,
        r.posStockStore,
        r.posPrice,
        r.shopifyStock,
        r.shopifyPrice,
        r.shopifyStatus,
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
        -- match fields: only update if user hasn't decided yet
        "shopifyVariantId" = CASE WHEN "PosMatch".status IN ('confirmed','rejected')
                                  THEN "PosMatch"."shopifyVariantId"
                                  ELSE EXCLUDED."shopifyVariantId" END,
        "matchType"        = CASE WHEN "PosMatch".status IN ('confirmed','rejected')
                                  THEN "PosMatch"."matchType"
                                  ELSE EXCLUDED."matchType" END,
        status             = CASE WHEN "PosMatch".status IN ('confirmed','rejected')
                                  THEN "PosMatch".status
                                  ELSE EXCLUDED.status END,
        -- snapshot fields: always refresh
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
