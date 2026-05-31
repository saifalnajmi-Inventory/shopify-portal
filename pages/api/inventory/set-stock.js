/**
 * POST /api/inventory/set-stock
 * Manually set Shopify stock for a linked product from the portal.
 * Portal acts as master inventory system — this bypasses waiting for the next POS sync.
 *
 * Body: { matchId, newStock }
 *
 * Uses absolute set (not delta) because this is a manual portal override.
 * Updates PosMatch.shopifyStock so next POS sync delta is calculated correctly.
 *
 * Auth: manage_settings
 */

import db                               from '../../../lib/db'
import { withAuth }                     from '../../../lib/auth'
import { setInventoryLevel }            from '../../../lib/shopify'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { matchId, newStock } = req.body
  if (!matchId)                           return res.status(400).json({ error: 'matchId required' })
  if (typeof newStock !== 'number' || newStock < 0)
                                          return res.status(400).json({ error: 'newStock must be a non-negative number' })

  try {
    const match = await db.posMatch.findUnique({
      where:   { id: matchId },
      include: {
        posProduct: { select: { name: true, barcode: true } },
        variant: {
          include: {
            inventoryLevels: true,
            product: { select: { id: true, title: true } },
          },
        },
      },
    })

    if (!match)         return res.status(404).json({ error: 'Match not found' })
    if (!match.variant) return res.status(400).json({ error: 'No Shopify variant linked' })
    if (!match.variant.inventoryLevels?.length)
                        return res.status(400).json({ error: 'No inventory locations found' })

    const previousStock = match.shopifyStock ?? 0
    const pushErrors    = []

    // Push absolute stock to all Shopify locations
    for (const level of match.variant.inventoryLevels) {
      try {
        await setInventoryLevel({
          inventoryItemId: Number(match.variant.inventoryItemId),
          locationId:      Number(level.locationId),
          available:       newStock,
        })
      } catch (e) {
        pushErrors.push(e.message)
      }
    }

    if (pushErrors.length === match.variant.inventoryLevels.length) {
      return res.status(502).json({ error: 'All Shopify location pushes failed', details: pushErrors })
    }

    // Update local snapshots
    await db.variant.update({
      where: { id: match.variant.id },
      data:  { inventoryQuantity: newStock },
    })

    await db.posMatch.update({
      where: { id: matchId },
      data:  { shopifyStock: newStock },
    })

    console.log(`[INVENTORY SET] ${match.posProduct?.name || matchId}: ${previousStock} → ${newStock} (manual override by ${req.user?.username})`)

    return res.json({
      ok:            true,
      matchId,
      previousStock,
      newStock,
      pushErrors:    pushErrors.length ? pushErrors : undefined,
    })
  } catch (err) {
    console.error('[INVENTORY SET STOCK]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'manage_settings')
