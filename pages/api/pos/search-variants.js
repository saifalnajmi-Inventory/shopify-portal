/**
 * GET /api/pos/search-variants?q=ET-M110
 * Searches for Shopify variants matching name / SKU / barcode.
 *
 * Strategy:
 *  1. Query local DB first (fast, no API cost)
 *  2. If DB returns nothing — fall back to live Shopify GraphQL search.
 *     This handles products that were recently pushed (e.g. from SPF Wizard)
 *     and haven't been pulled into the local DB yet.
 *
 * Auth: manage_settings
 */

import db                        from '../../../lib/db'
import { withAuth }              from '../../../lib/auth'
import { searchProductsByQuery } from '../../../lib/shopify'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const q = (req.query.q || '').trim()
  if (!q || q.length < 2) return res.json({ variants: [] })

  try {
    // ── 1. Local DB (instant, covers already-synced products) ──────────────────
    const variants = await db.variant.findMany({
      where: {
        OR: [
          { sku:     { contains: q, mode: 'insensitive' } },
          { barcode: { contains: q, mode: 'insensitive' } },
          { product: { title: { contains: q, mode: 'insensitive' } } },
        ],
      },
      include: {
        product: {
          select: { id: true, title: true, status: true, firstImageSrc: true },
        },
      },
      take: 12,
      orderBy: { product: { title: 'asc' } },
    })

    if (variants.length > 0) {
      return res.json({ variants })
    }

    // ── 2. Live Shopify API fallback (new products not yet synced) ─────────────
    // GraphQL full-text search finds "H89" inside "Hoco H89 Crown Large…"
    console.log(`[SEARCH VARIANTS] No local DB results for "${q}" — querying live Shopify`)
    const liveVariants = await searchProductsByQuery(q)
    return res.json({ variants: liveVariants, source: 'shopify_live' })

  } catch (err) {
    console.error('[POS SEARCH VARIANTS]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'manage_settings')
