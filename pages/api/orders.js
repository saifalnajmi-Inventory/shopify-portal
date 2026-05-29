/**
 * GET /api/orders
 * Query: tab=all|unfulfilled|unpaid|cancelled, page, limit, search
 */
import { withAuth } from '../../lib/auth'
import db          from '../../lib/db'

function buildWhere(tab, search) {
  const conditions = []

  // ── Tab filter ─────────────────────────────────────────────────────────────
  if (tab === 'cancelled') {
    conditions.push({ cancelledAt: { not: null } })
  } else if (tab === 'unfulfilled') {
    conditions.push({ cancelledAt: null })
    conditions.push({
      OR: [
        { fulfillmentStatus: null },
        { fulfillmentStatus: 'partial' },
      ],
    })
  } else if (tab === 'unpaid') {
    conditions.push({ cancelledAt: null })
    conditions.push({ financialStatus: { in: ['pending', 'authorized'] } })
  }
  // 'all' — no tab filter

  // ── Search filter ──────────────────────────────────────────────────────────
  if (search && search.trim()) {
    const s   = search.trim()
    const num = parseInt(s, 10)
    const orClauses = [
      { email:        { contains: s, mode: 'insensitive' } },
      { customerName: { contains: s, mode: 'insensitive' } },
    ]
    if (!isNaN(num)) orClauses.push({ orderNumber: num })
    conditions.push({ OR: orClauses })
  }

  return conditions.length > 0 ? { AND: conditions } : {}
}

export default withAuth(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { tab = 'all', page = '1', limit = '50', search = '' } = req.query
  const pageNum = Math.max(1, parseInt(page,  10))
  const take    = Math.min(100, parseInt(limit, 10))
  const skip    = (pageNum - 1) * take

  const where = buildWhere(tab, search)

  // Fetch current page + total + tab counts + cancelled value sum in parallel
  const [orders, total, allCount, unfulfilledCount, unpaidCount, cancelledCount, cancelledValueRows] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        lineItems: {
          select: {
            id:          true,
            title:       true,
            variantTitle: true,
            quantity:    true,
            price:       true,
            sku:         true,
            variantId:   true,
            productId:   true,
            // Pull current stock + product image so the cancelled orders page
            // can show "this is why the order was cancelled"
            variant: {
              select: {
                inventoryQuantity: true,
                product: { select: { firstImageSrc: true } },
              },
            },
          },
          take: 10,
        },
        _count: { select: { lineItems: true } },
      },
    }),
    db.order.count({ where }),
    db.order.count({ where: buildWhere('all',         '') }),
    db.order.count({ where: buildWhere('unfulfilled', '') }),
    db.order.count({ where: buildWhere('unpaid',      '') }),
    db.order.count({ where: buildWhere('cancelled',   '') }),
    db.$queryRaw`SELECT COALESCE(SUM(CAST("totalPrice" AS REAL)), 0) as total FROM "Order" WHERE "cancelledAt" IS NOT NULL`,
  ])

  const cancelledTotalValue = parseFloat(String(cancelledValueRows[0]?.total ?? 0))

  return res.json({
    orders,
    total,
    page:    pageNum,
    hasMore: skip + orders.length < total,
    cancelledTotalValue,
    tabs: {
      all:         allCount,
      unfulfilled: unfulfilledCount,
      unpaid:      unpaidCount,
      cancelled:   cancelledCount,
    },
  })
}, 'view_reports')
