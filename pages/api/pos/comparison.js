/**
 * GET /api/pos/comparison
 * Returns all PosMatch rows with full POS + Shopify data for the comparison table.
 *
 * Query params:
 *   status  = pending | confirmed | rejected | unmatched | all (default: all)
 *   page    = 1-based (default: 1)
 *   limit   = rows per page (default: 50, max: 200)
 *   q       = search by name / barcode / sku
 *
 * Auth: super_admin only.
 */

import db from '../../../lib/db'
import { requireAuth } from '../../../lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res, ['super_admin'])
  if (!user) return

  const { status = 'all', page = '1', limit = '50', q = '' } = req.query
  const take = Math.min(parseInt(limit) || 50, 200)
  const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take

  // Build where clause
  const statusFilter = status !== 'all' ? { status } : {}
  const where = {
    ...statusFilter,
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
