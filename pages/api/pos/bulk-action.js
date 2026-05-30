/**
 * POST /api/pos/bulk-action
 * Bulk status update for multiple PosMatch rows.
 *
 * Body: { matchIds: string[], status: 'confirmed' | 'rejected' | 'pending', autoActivate?: boolean }
 *
 * For confirmed rows with a shopifyVariantId, fires pushToShopify
 * fire-and-forget (same as single update-match).
 * If autoActivate=true, sets draft products to active when stock > 0.
 *
 * Auth: manage_settings
 */

import db           from '../../../lib/db'
import { withAuth } from '../../../lib/auth'
import { updateVariant, setInventoryLevel, updateProduct } from '../../../lib/shopify'

const ALLOWED = ['confirmed', 'rejected', 'pending']

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user                                  = req.user
  const { matchIds, status, autoActivate }    = req.body

  if (!Array.isArray(matchIds) || matchIds.length === 0)
    return res.status(400).json({ error: 'matchIds array required' })
  if (!ALLOWED.includes(status))
    return res.status(400).json({ error: 'Invalid status' })

  try {
    // Bulk update in DB
    await db.posMatch.updateMany({
      where: { id: { in: matchIds } },
      data: {
        status,
        confirmedBy: status === 'confirmed' ? user.username : null,
        confirmedAt: status === 'confirmed' ? new Date()    : null,
      },
    })

    // For confirmed rows: push barcode + stock to Shopify (fire-and-forget)
    if (status === 'confirmed') {
      pushManyToShopify(matchIds, !!autoActivate).catch(err =>
        console.error('[BULK CONFIRM PUSH]', err)
      )
    }

    return res.json({ ok: true, updated: matchIds.length })
  } catch (err) {
    console.error('[BULK ACTION]', err)
    return res.status(500).json({ error: err.message })
  }
}

async function pushManyToShopify(matchIds, autoActivate = false) {
  const matches = await db.posMatch.findMany({
    where:   { id: { in: matchIds }, shopifyVariantId: { not: null } },
    include: {
      posProduct: true,
      variant:    {
        include: {
          inventoryLevels: true,
          product: { select: { id: true, status: true } },
        },
      },
    },
  })

  for (const match of matches) {
    if (!match.posProduct || !match.variant) continue
    const pos   = match.posProduct
    const v     = match.variant
    const total = pos.stockMain + pos.stockStore

    try {
      await updateVariant(v.id, { barcode: pos.barcode })
      for (const level of v.inventoryLevels) {
        await setInventoryLevel({
          inventoryItemId: Number(v.inventoryItemId),
          locationId:      Number(level.locationId),
          available:       total,
        })
      }
      await db.variant.update({
        where: { id: v.id },
        data:  { barcode: pos.barcode, inventoryQuantity: total },
      })

      // Auto-activate draft product if stock > 0 and toggle is on
      if (autoActivate && total > 0 && v.product?.status === 'draft') {
        try {
          await updateProduct(v.product.id, { status: 'active' })
          await db.product.update({ where: { id: v.product.id }, data: { status: 'active' } })
          await db.posMatch.update({ where: { id: match.id }, data: { shopifyStatus: 'active' } })
          console.log(`[BULK PUSH] Auto-activated product ${v.product.id}`)
        } catch (ae) {
          console.error(`[BULK PUSH] Auto-activate failed for ${v.product.id}:`, ae.message)
        }
      }

      console.log(`[BULK PUSH] ${pos.barcode} → ${v.id} stock=${total}`)
    } catch (e) {
      console.error(`[BULK PUSH] Failed for ${v.id}:`, e.message)
    }
  }
}

export default withAuth(handler, 'manage_settings')
