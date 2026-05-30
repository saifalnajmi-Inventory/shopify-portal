/**
 * GET /api/pos/comparison
 * Returns all PosMatch rows with full POS + Shopify data for the comparison table.
 *
 * Query params:
 *   status  = pending | confirmed | rejected | unmatched | all (default: all)
 *   stock   = all | in | out  (default: all)
 *             in  → POS total stock > 0
 *             out → POS total stock = 0
 *   page    = 1-based (default: 1)
 *   limit   = rows per page (default: 50, max: 200)
 *   q       = search by name / barcode / sku
 *
 * Auth: manage_settings
 */

import db          from '../../../lib/db'
import { withAuth } from '../../../lib/auth'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { status = 'all', stock = 'all', page = '1', limit = '50', q = '' } = req.query
  const take = Math.min(parseInt(limit) || 50, 200)
  const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take

  // Stock filter on snapshot columns (posStockMain + posStockStore)
  const stockFilter = stock === 'in'
    ? { OR: [{ posStockMain: { gt: 0 } }, { posStockStore: { gt: 0 } }] }
    : stock === 'out'
    ? { posStockMain: { lte: 0 }, posStockStore: { lte: 0 } }
    : {}

  // Build where clause
  const statusFilter = status !== 'all' ? { status } : {}
  const where = {
    ...statusFilter,
    ...stockFilter,
    ...(q.trim() ? {
      posProduct: {
        OR: [
          { name:    { contains: q.trim(), mode: 'insensitive' } },
          { barcode: { contains: q.trim(), mode: 'insensitive' } },
          { sku:     { contains: q.trim(), mode: 'insensitive' } },
        ],
      },
    } : {}),
  }

  try {
    const [rows, total] = await Promise.all([
      db.posMatch.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          posProduct: {
            select: {
              id: true, barcode: true, name: true,
              price: true, costPrice: true,
              stockMain: true, stockStore: true,
              sku: true, category: true, unit: true, status: true,
              lastSyncedAt: true,
            },
          },
          variant: {
            select: {
              id: true, sku: true, barcode: true,
              price: true, compareAtPrice: true,
              inventoryQuantity: true, title: true,
              product: {
                select: { id: true, title: true, status: true, firstImageSrc: true },
              },
            },
          },
        },
      }),
      db.posMatch.count({ where }),
    ])

    return res.status(200).json({
      ok:    true,
      total,
      page:  parseInt(page),
      pages: Math.ceil(total / take),
      rows,
    })
  } catch (err) {
    console.error('[POS COMPARISON]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'manage_settings')
