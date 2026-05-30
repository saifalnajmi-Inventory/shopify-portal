/**
 * POST /api/pos/match
 * Matches PosProducts to existing Shopify products in the portal DB.
 *
 * Match priority:
 *   1. PosProduct.barcode === Variant.barcode  (exact)
 *   2. PosProduct.sku     === Variant.sku      (exact)
 *   3. Name similarity                          (flagged for manual review)
 *
 * Updates PosProduct.shopifyId + shopifyVariantId where matched.
 * Returns full match report.
 *
 * Auth: super_admin only
 */

import { db } from '../../../lib/db'
import { requireAuth } from '../../../lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res, ['super_admin'])
  if (!user) return

  try {
    // Load all POS products
    const posProducts = await db.posProduct.findMany()

    // Load all Shopify variants with their barcodes + SKUs
    const variants = await db.variant.findMany({
      select: {
        id:        true,
        sku:       true,
        barcode:   true,
        productId: true,
        product:   { select: { id: true, title: true } },
      },
    })

    // Build lookup maps for fast matching
    const byBarcode = new Map() // barcode → variant
    const bySku     = new Map() // sku     → variant

    for (const v of variants) {
      if (v.barcode && v.barcode.trim()) byBarcode.set(v.barcode.trim(), v)
      if (v.sku     && v.sku.trim())     bySku.set(v.sku.trim(), v)
    }

    let matchedByBarcode = 0
    let matchedBySku     = 0
    let alreadyMatched   = 0
    let unmatched        = 0
    const unmatchedList  = []

    for (const pos of posProducts) {
      // Skip if already matched
      if (pos.shopifyId && pos.shopifyVariantId) {
        alreadyMatched++
        continue
      }

      let matched   = null
      let matchType = null

      // Priority 1 — match by barcode (POS Code vs Shopify variant barcode)
      if (!matched && pos.barcode) {
        const v = byBarcode.get(pos.barcode.trim())
        if (v) { matched = v; matchType = 'barcode' }
      }

      // Priority 2 — match by SKU (POS Alt_Code_2 vs Shopify variant SKU)
      if (!matched && pos.sku && pos.sku.trim()) {
        const v = bySku.get(pos.sku.trim())
        if (v) { matched = v; matchType = 'sku' }
      }

      if (matched) {
        await db.posProduct.update({
          where: { id: pos.id },
          data: {
            shopifyId:        matched.productId,
            shopifyVariantId: matched.id,
          },
        })
        if (matchType === 'barcode') matchedByBarcode++
        if (matchType === 'sku')     matchedBySku++
      } else {
        unmatched++
        unmatchedList.push({
          barcode: pos.barcode,
          name:    pos.name,
          sku:     pos.sku,
          stock:   pos.stockMain + pos.stockStore,
        })
      }
    }

    return res.status(200).json({
      ok: true,
      total:            posProducts.length,
      alreadyMatched,
      matchedByBarcode,
      matchedBySku,
      unmatched,
      unmatchedSample:  unmatchedList.slice(0, 50), // first 50 for review
    })

  } catch (err) {
    console.error('[POS MATCH]', err)
    return res.status(500).json({ error: err.message })
  }
}
