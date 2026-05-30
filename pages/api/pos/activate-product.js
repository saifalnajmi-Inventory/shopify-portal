/**
 * POST /api/pos/activate-product
 * Sets a Shopify product to 'active' for an already-confirmed PosMatch row.
 * Used when a product was confirmed before auto-activate was enabled,
 * or when the toggle was off at confirmation time.
 *
 * Body: { matchId: string }
 * Auth: manage_settings
 */

import db           from '../../../lib/db'
import { withAuth } from '../../../lib/auth'
import { updateProduct } from '../../../lib/shopify'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { matchId } = req.body
  if (!matchId) return res.status(400).json({ error: 'matchId required' })

  try {
    // Load the match with variant → product
    const match = await db.posMatch.findUnique({
      where:   { id: matchId },
      include: {
        variant: {
          include: {
            product: { select: { id: true, status: true } },
          },
        },
      },
    })

    if (!match)         return res.status(404).json({ error: 'Match not found' })
    if (!match.variant) return res.status(400).json({ error: 'No Shopify variant linked' })

    const product = match.variant.product
    if (!product) return res.status(400).json({ error: 'No Shopify product found' })

    if (product.status === 'active') {
      return res.json({ ok: true, alreadyActive: true })
    }

    // Push to Shopify
    await updateProduct(product.id, { status: 'active' })

    // Update local DB
    await db.product.update({ where: { id: product.id }, data: { status: 'active' } })
    await db.posMatch.update({ where: { id: matchId },   data: { shopifyStatus: 'active' } })

    console.log(`[ACTIVATE PRODUCT] Product ${product.id} set to active via match ${matchId}`)

    return res.json({ ok: true, activated: true })
  } catch (err) {
    console.error('[ACTIVATE PRODUCT]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'manage_settings')
