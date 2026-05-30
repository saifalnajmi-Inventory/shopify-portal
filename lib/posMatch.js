/**
 * lib/posMatch.js — Bulk match engine using single SQL upsert per batch.
 * Handles 11K+ products in a few seconds instead of timing out.
 */

import db from './db'

// PostgreSQL max params = 65535. With 10 cols per row → max 6553 rows per batch.
const COLS_PER_ROW = 10
const MAX_ROWS     = Math.floor(65000 / COLS_PER_ROW)  // 6500

export async function runPosMatch() {
  // 1. Load Shopify variants → lookup maps
  const variants = await db.variant.findMany({
    select: {
      id: true, sku: true, barcode: true,
      price: true, inventoryQuantity: true,
      product: { select: { status: true } },
    },
  })
  const byBarcode = new Map()
  const bySku     = new Map()
  for (const v of variants) {
    if (v.barcode?.trim()) byBarcode.set(v.barcode.trim(), v)
    if (v.sku?.trim())     bySku.set(v.sku.trim(), v)
  }

  // 2. Load all POS products
  const posProducts = await db.posProduct.findMany()

  // 3. Compute match for every POS product in memory
  let matched = 0, unmatched = 0
  const rows = posProducts.map(pos => {
    let variant = null, matchType = null
    if (pos.barcode?.trim()) {
      const v = byBarcode.get(pos.barcode.trim())
      if (v) { variant = v; matchType = 'barcode' }
    }
    if (!variant && pos.sku?.trim()) {
      const v = bySku.get(pos.sku.trim())
      if (v) { variant = v; matchType = 'sku' }
    }
    if (variant) matched++; else unmatched++

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

  return { total: posProducts.length, matched, unmatched }
}
