/**
 * POST /api/pos/update-match
 * Updates the status of a PosMatch row (confirm / reject / reset to pending).
 *
 * When confirming a matched row:
 *   1. Marks as confirmed in DB
 *   2. Writes POS barcode → Shopify variant barcode (so future auto-matches work)
 *   3. Sets Shopify inventory = POS total stock (stockMain + stockStore)
 *
 * Auth: manage_settings (super_admin + client_admin + owner)
 */

import db            from '../../../lib/db'
import { withAuth }  from '../../../lib/auth'
import { updateVariant, setInventoryLevel, updateProduct } from '../../../lib/shopify'

const ALLOWED_STATUSES = ['confirmed', 'rejected', 'pending']

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user                              = req.user   // set by withAuth
  const { matchId, status, autoActivate } = req.body

  if (!matchId)                           return res.status(400).json({ error: 'matchId required' })
  if (!ALLOWED_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' })

  try {
    // Update match status in DB
    const updated = await db.posMatch.update({
      where: { id: matchId },
      data: {
        status,
        confirmedBy: status === 'confirmed' ? user.username : null,
        confirmedAt: status === 'confirmed' ? new Date()    : null,
      },
    })

    // ── When confirming: push barcode + stock to Shopify ─────────────────────
    if (status === 'confirmed' && updated.shopifyVariantId) {
      // Run in background so the UI response is fast — errors logged, not surfaced
      pushToShopify(updated, !!autoActivate).catch(err =>
        console.error('[POS CONFIRM PUSH]', err)
      )
    }

    return res.status(200).json({ ok: true, match: updated })
  } catch (err) {
    console.error('[POS UPDATE MATCH]', err)
    return res.status(500).json({ error: err.message })
  }
}

/**
 * Push POS barcode + stock to Shopify variant.
 * Runs fire-and-forget after the DB update so the UI responds immediately.
 * If autoActivate=true and stock > 0 and the Shopify product is draft → set it active.
 */
async function pushToShopify(match, autoActivate = false) {
  // Load POS product + Shopify variant (with inventory levels + product status)
  const full = await db.posMatch.findUnique({
    where: { id: match.id },
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
  if (!full?.posProduct || !full?.variant) return

  const pos     = full.posProduct
  const variant = full.variant
  const total   = pos.stockMain + pos.stockStore

  // 1. Write POS barcode to Shopify variant so future auto-matches work
  await updateVariant(variant.id, { barcode: pos.barcode })

  // 2. Push stock to every location this variant is stocked at
  for (const level of variant.inventoryLevels) {
    await setInventoryLevel({
      inventoryItemId: Number(variant.inventoryItemId),
      locationId:      Number(level.locationId),
      available:       total,
    })
  }

  // 3. Refresh local DB snapshot
  await db.variant.update({
    where: { id: variant.id },
    data:  { barcode: pos.barcode, inventoryQuantity: total },
  })

  // 4. Refresh PosMatch snapshot columns
  const matchUpdate = { shopifyStock: total }

  // 5. Auto-activate draft product if stock > 0 and toggle is on
  if (autoActivate && total > 0 && variant.product?.status === 'draft') {
    try {
      await updateProduct(variant.product.id, { status: 'active' })
      await db.product.update({ where: { id: variant.product.id }, data: { status: 'active' } })
      matchUpdate.shopifyStatus = 'active'
      console.log(`[POS CONFIRM PUSH] Auto-activated product ${variant.product.id}`)
    } catch (e) {
      console.error(`[POS CONFIRM PUSH] Auto-activate failed:`, e.message)
    }
  }

  await db.posMatch.update({ where: { id: match.id }, data: matchUpdate })

  console.log(`[POS CONFIRM PUSH] Pushed barcode=${pos.barcode} stock=${total} to variant ${variant.id}`)
}

export default withAuth(handler, 'manage_settings')
