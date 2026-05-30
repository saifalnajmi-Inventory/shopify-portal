/**
 * POST /api/pos/manual-link
 * Manually links a POS product to a Shopify variant for unmatched rows.
 *
 * Body: { posMatchId, shopifyVariantId }
 *
 * Steps:
 *   1. Update PosMatch: shopifyVariantId, matchType='manual', status='confirmed'
 *   2. Push POS barcode → Shopify variant barcode
 *   3. Push POS total stock → Shopify inventory at all locations
 *   4. Refresh local snapshots
 *
 * Auth: manage_settings
 */

import db           from '../../../lib/db'
import { withAuth } from '../../../lib/auth'
import { updateVariant, setInventoryLevel, updateProduct } from '../../../lib/shopify'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user                                          = req.user
  const { posMatchId, shopifyVariantId, autoActivate } = req.body

  if (!posMatchId || !shopifyVariantId)
    return res.status(400).json({ error: 'posMatchId and shopifyVariantId required' })

  try {
    // Load POS match + POS product
    const posMatch = await db.posMatch.findUnique({
      where:   { id: posMatchId },
      include: { posProduct: true },
    })
    if (!posMatch) return res.status(404).json({ error: 'Match not found' })

    // Load target Shopify variant
    const variant = await db.variant.findUnique({
      where:   { id: shopifyVariantId },
      include: {
        product:         { select: { title: true, status: true, firstImageSrc: true } },
        inventoryLevels: true,
      },
    })
    if (!variant) return res.status(404).json({ error: 'Shopify variant not found' })

    const pos   = posMatch.posProduct
    const total = pos.stockMain + pos.stockStore

    // 1. Update PosMatch
    const updated = await db.posMatch.update({
      where: { id: posMatchId },
      data: {
        shopifyVariantId,
        matchType:   'manual',
        status:      'confirmed',
        confirmedBy: user.username,
        confirmedAt: new Date(),
        // refresh snapshot
        shopifyStock:  total,
        shopifyPrice:  variant.price,
        shopifyStatus: variant.product?.status ?? null,
      },
    })

    // 2. Push barcode to Shopify (async — errors logged)
    try {
      await updateVariant(shopifyVariantId, { barcode: pos.barcode })
    } catch (e) {
      console.error('[MANUAL LINK] barcode push failed:', e.message)
    }

    // 3. Push stock to all locations
    const pushErrors = []
    for (const level of variant.inventoryLevels) {
      try {
        await setInventoryLevel({
          inventoryItemId: Number(variant.inventoryItemId),
          locationId:      Number(level.locationId),
          available:       total,
        })
      } catch (e) {
        pushErrors.push(e.message)
      }
    }

    // 4. Refresh local Variant barcode + stock
    await db.variant.update({
      where: { id: shopifyVariantId },
      data:  { barcode: pos.barcode, inventoryQuantity: total },
    })

    // 5. Auto-activate draft product if stock > 0 and toggle is on
    let activated = false
    if (autoActivate && total > 0 && variant.product?.status === 'draft') {
      try {
        await updateProduct(variant.product.id, { status: 'active' })
        await db.product.update({ where: { id: variant.product.id }, data: { status: 'active' } })
        await db.posMatch.update({ where: { id: posMatchId }, data: { shopifyStatus: 'active' } })
        activated = true
        console.log(`[MANUAL LINK] Auto-activated product ${variant.product.id}`)
      } catch (ae) {
        console.error(`[MANUAL LINK] Auto-activate failed:`, ae.message)
      }
    }

    console.log(`[MANUAL LINK] POS ${pos.barcode} → Variant ${shopifyVariantId} (${variant.product?.title}), stock=${total}${activated ? ', activated' : ''}`)

    return res.json({
      ok:         true,
      match:      updated,
      stockPushed: total,
      activated,
      pushErrors: pushErrors.length ? pushErrors : undefined,
    })
  } catch (err) {
    console.error('[MANUAL LINK]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'manage_settings')
