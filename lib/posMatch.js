/**
 * lib/posMatch.js
 *
 * Bulk match engine — rewrites PosMatch in two SQL statements instead of N×2.
 *
 * Match priority:
 *   1. barcode exact match
 *   2. SKU exact match
 *
 * Rules:
 *   - Never modifies PosProduct or Variant/Product tables
 *   - Creates one PosMatch row per PosProduct
 *   - confirmed / rejected rows: only snapshot fields refreshed, match preserved
 *   - pending / unmatched rows: full refresh including match
 */

import db from './db'

export async function runPosMatch() {
  // 1. Load all Shopify variants (barcode + sku lookup)
  const variants = await db.variant.findMany({
    select: {
      id: true, sku: true, barcode: true,
      price: true, inventoryQuantity: true,
      product: { select: { id: true, title: true, status: true } },
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

  // 3. Load all existing PosMatch rows (one query)
  const existing = await db.posMatch.findMany({
    select: { posProductId: true, status: true },
  })
  const existingMap = new Map(existing.map(e => [e.posProductId, e.status]))

  // 4. Compute matches in memory
  const toCreate = []
  const toUpdateFull     = []   // pending/unmatched — refresh match + snapshot
  const toUpdateSnapshot = []   // confirmed/rejected — snapshot only

  let matched = 0, unmatched = 0

  for (const pos of posProducts) {
    let variant = null, matchType = null

    if (pos.barcode?.trim()) {
      const v = byBarcode.get(pos.barcode.trim())
      if (v) { variant = v; matchType = 'barcode' }
    }
    if (!variant && pos.sku?.trim()) {
      const v = bySku.get(pos.sku.trim())
      if (v) { variant = v; matchType = 'sku' }
    }

    const snap = {
      posStockMain:  pos.stockMain,
      posStockStore: pos.stockStore,
      posPrice:      pos.price,
      shopifyStock:  variant?.inventoryQuantity ?? null,
      shopifyPrice:  variant?.price             ?? null,
      shopifyStatus: variant?.product?.status   ?? null,
    }

    const existingStatus = existingMap.get(pos.id)
    const userDecided    = existingStatus === 'confirmed' || existingStatus === 'rejected'

    if (!existingStatus) {
      toCreate.push({
        posProductId:     pos.id,
        shopifyVariantId: variant?.id ?? null,
        matchType,
        status: variant ? 'pending' : 'unmatched',
        ...snap,
      })
    } else if (userDecided) {
      toUpdateSnapshot.push({ posProductId: pos.id, ...snap })
    } else {
      toUpdateFull.push({
        posProductId:     pos.id,
        shopifyVariantId: variant?.id ?? null,
        matchType,
        status: variant ? 'pending' : 'unmatched',
        ...snap,
      })
    }

    if (variant) matched++; else unmatched++
  }

  // 5. Bulk create new rows
  if (toCreate.length > 0) {
    await db.posMatch.createMany({ data: toCreate, skipDuplicates: true })
  }

  // 6. Bulk update — full refresh (pending/unmatched), in batches of 500
  const BATCH = 500
  for (let i = 0; i < toUpdateFull.length; i += BATCH) {
    const batch = toUpdateFull.slice(i, i + BATCH)
    await Promise.all(batch.map(row =>
      db.posMatch.update({
        where: { posProductId: row.posProductId },
        data: {
          shopifyVariantId: row.shopifyVariantId,
          matchType:        row.matchType,
          status:           row.status,
          posStockMain:     row.posStockMain,
          posStockStore:    row.posStockStore,
          posPrice:         row.posPrice,
          shopifyStock:     row.shopifyStock,
          shopifyPrice:     row.shopifyPrice,
          shopifyStatus:    row.shopifyStatus,
        },
      })
    ))
  }

  // 7. Bulk update — snapshot only (confirmed/rejected), in batches of 500
  for (let i = 0; i < toUpdateSnapshot.length; i += BATCH) {
    const batch = toUpdateSnapshot.slice(i, i + BATCH)
    await Promise.all(batch.map(row =>
      db.posMatch.update({
        where: { posProductId: row.posProductId },
        data: {
          posStockMain:  row.posStockMain,
          posStockStore: row.posStockStore,
          posPrice:      row.posPrice,
          shopifyStock:  row.shopifyStock,
          shopifyPrice:  row.shopifyPrice,
          shopifyStatus: row.shopifyStatus,
        },
      })
    ))
  }

  return { total: posProducts.length, matched, unmatched }
}
