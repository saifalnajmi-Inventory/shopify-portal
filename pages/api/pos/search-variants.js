/**
 * GET /api/pos/search-variants?q=ET-M110
 * Searches local DB for Shopify variants matching name / SKU / barcode.
 * Used by the manual-link modal on the POS Sync page.
 *
 * Auth: manage_settings
 */

import db           from '../../../lib/db'
import { withAuth } from '../../../lib/auth'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const q = (req.query.q || '').trim()
  if (!q || q.length < 2) return res.json({ variants: [] })

  try {
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

    return res.json({ variants })
  } catch (err) {
    console.error('[POS SEARCH VARIANTS]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'manage_settings')
