/**
 * GET /api/pos/export-unmatched
 * Returns unmatched POS products for the SPF Wizard to import.
 * Called server-side by the SPF Wizard (localhost → Railway).
 *
 * Auth: x-sync-key header (same key as PROACT agent)
 * Query: ?limit=20&offset=0&q=
 *
 * Returns:
 *   { ok, total, exported, products: [{ name, barcode, sku, category, price, costPrice }] }
 */

import db from '../../../lib/db'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Same key as the PROACT sync agent
  const key       = req.headers['x-sync-key']
  const validKeys = ['sync-proact-2026', process.env.INTERNAL_SYNC_KEY].filter(Boolean)
  if (!validKeys.includes(key)) {
    return res.status(401).json({ error: 'Unauthorized — include x-sync-key header' })
  }

  const limit  = Math.min(parseInt(req.query.limit)  || 20, 100)
  const offset = Math.max(parseInt(req.query.offset) || 0,  0)
  const q      = (req.query.q || '').trim()

  try {
    const where = {
      status: 'unmatched',
      ...(q ? {
        posProduct: {
          OR: [
            { name:    { contains: q, mode: 'insensitive' } },
            { barcode: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } },
          ],
        },
      } : {}),
      // Only export products that have stock (no point creating empty listings)
      OR: [
        { posStockMain:  { gt: 0 } },
        { posStockStore: { gt: 0 } },
      ],
    }

    const [matches, total] = await Promise.all([
      db.posMatch.findMany({
        where,
        skip:  offset,
        take:  limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          posProduct: {
            select: {
              name: true, barcode: true, sku: true,
              category: true, price: true, costPrice: true,
              stockMain: true, stockStore: true,
            },
          },
        },
      }),
      db.posMatch.count({ where }),
    ])

    const products = matches
      .filter(m => m.posProduct)
      .map(m => ({
        posMatchId: m.id,
        name:       m.posProduct.name,
        barcode:    m.posProduct.barcode,
        sku:        m.posProduct.sku       || '',
        category:   m.posProduct.category  || '',
        price:      m.posProduct.price     || 0,
        costPrice:  m.posProduct.costPrice || 0,
        stock:      (m.posProduct.stockMain || 0) + (m.posProduct.stockStore || 0),
      }))

    res.setHeader('Cache-Control', 'no-store')
    return res.json({
      ok:       true,
      total,
      exported: products.length,
      offset,
      limit,
      products,
    })
  } catch (err) {
    console.error('[EXPORT UNMATCHED]', err)
    return res.status(500).json({ error: err.message })
  }
}
