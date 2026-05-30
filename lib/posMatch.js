/**
 * lib/posMatch.js
 *
 * Auto-matching engine — runs in the background after every POS sync.
 * Reads PosProduct + Variant tables, writes results to PosMatch.
 *
 * Match priority:
 *   1. PosProduct.barcode === Variant.barcode  (exact, high confidence)
 *   2. PosProduct.sku     === Variant.sku      (exact, high confidence)
 *
 * Rules:
 *   - Never modifies PosProduct or Variant/Product tables
 *   - Creates one PosMatch row per PosProduct
 *   - Only updates rows still in "pending" or "unmatched" status
 *     (confirmed / rejected = user has reviewed, do not overwrite)
 *   - Snapshot fields (posStockMain, shopifyStock, etc.) always refreshed
 *     so the comparison view shows current numbers
 */

import { db } from './db'

export async function runPosMatch() {
  // Load all Shopify variants with the fields we need for matching + snapshot
  const variants = await db.variant.findMany({
    select: {
      id:                true,
      sku:               true,
      barcode:           true,
      price:             true,
      inventoryQuantity: true,
      product: {
        select: { id: true, title: true, status: true },
      },
    },
  })

  // Build lookup maps
  const byBarcode = new Map()
  const bySku     = new Map()
  for (const v of variants) {
    if (v.barcode?.trim()) byBarcode.set(v.barcode.trim(), v)
    if (v.sku?.trim())     bySku.set(v.sku.trim(), v)
  }

  // Load all POS products
  const posProducts = await db.posProduct.findMany()

  let matched   = 0
  let unmatched = 0

  for (const pos of posProducts) {
    // Find existing match row
    const existing = await db.posMatch.findUnique({ where: { posProductId: pos.id } })

    // Don't overwrite user decisions
    const userDecided = existing?.status === 'confirmed' || existing?.status === 'rejected'

    // Try to find a Shopify variant
    let variant   = null
    let matchType = null

    if (pos.barcode?.trim()) {
      const v = byBarcode.get(pos.barcode.trim())
      if (v) { variant = v; matchType = 'barcode' }
    }
    if (!variant && pos.sku?.trim()) {
      const v = bySku.get(pos.sku.trim())
      if (v) { variant = v; matchType = 'sku' }
    }

    // Always update snapshot fields (stock numbers change every sync)
    // But only update match fields if user hasn't decided yet
    const snapshotData = {
      posStockMain:  pos.stockMain,
      posStockStore: pos.stockStore,
      posPrice:      pos.price,
      shopifyStock:  variant?.inventoryQuantity ?? null,
      shopifyPrice:  variant?.price ?? null,
      shopifyStatus: variant?.product?.status ?? null,
    }

    if (!existing) {
      // First time — create the row
      await db.posMatch.create({
        data: {
          posProductId:     pos.id,
          shopifyVariantId: variant?.id ?? null,
          matchType:        matchType,
          status:           variant ? 'pending' : 'unmatched',
          ...snapshotData,
        },
      })
    } else if (userDecided) {
      // User confirmed/rejected — only refresh snapshot numbers
      await db.posMatch.update({
        where: { posProductId: pos.id },
        data:  snapshotData,
      })
    } else {
      // Still pending/unmatched — refresh everything including match
      await db.posMatch.update({
        where: { posProductId: pos.id },
        data:  {
          shopifyVariantId: variant?.id ?? null,
          matchType:        matchType,
          status:           variant ? 'pending' : 'unmatched',
          ...snapshotData,
        },
      })
    }

    if (variant) matched++
    else unmatched++
  }

  return { total: posProducts.length, matched, unmatched }
}
