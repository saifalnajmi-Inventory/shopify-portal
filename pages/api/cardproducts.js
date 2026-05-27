/**
 * GET /api/cardproducts?card=outOfStock&page=1&limit=50&threshold=5
 *
 * Returns a paginated flat list of variants for dashboard card drill-downs.
 * Response includes: items[], total, page, totalPages, hasMore
 */

import db from '../../lib/db'
import { subDays } from 'date-fns'
import { withAuth } from '../../lib/auth'

const DEFAULT_LIMIT = 50
const MAX_LIMIT     = 500

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { card, threshold = '5', page = '1', limit = String(DEFAULT_LIMIT) } = req.query

  const thresh   = parseInt(threshold, 10) || 5
  const take     = Math.min(parseInt(limit, 10) || DEFAULT_LIMIT, MAX_LIMIT)
  const pageNum  = Math.max(1, parseInt(page, 10))
  const skip     = (pageNum - 1) * take

  const include = {
    product: {
      select: {
        id: true, title: true, firstImageSrc: true, status: true,
        vendor: true, seoTitle: true, seoDescription: true,
      },
    },
    restockRule: true,   // join so each variant knows if a rule exists
  }

  // ── WHERE clause + orderBy per card ───────────────────────────────────────────
  const CARDS = {
    outOfStock:      { where: { inventoryQuantity: { lte: 0 } },                                              orderBy: { sold30Days: 'desc' } },
    lowStock:        { where: { inventoryQuantity: { gt: 0, lt: 3 } },                                        orderBy: { inventoryQuantity: 'asc' } },
    belowThreshold:  { where: { inventoryQuantity: { gt: 0, lt: thresh } },                                   orderBy: { inventoryQuantity: 'asc' } },
    inStock:         { where: { inventoryQuantity: { gt: 0 } },                                               orderBy: { sold30Days: 'desc' } },
    oos7:            { where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { not: null, lte: subDays(new Date(), 7)  } }, orderBy: { firstOutOfStockAt: 'asc' } },
    oos14:           { where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { not: null, lte: subDays(new Date(), 14) } }, orderBy: { firstOutOfStockAt: 'asc' } },
    oos30:           { where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { not: null, lte: subDays(new Date(), 30) } }, orderBy: { firstOutOfStockAt: 'asc' } },
    noSales:         { where: { totalSold: 0 },                                                               orderBy: { inventoryQuantity: 'desc' } },
    recent:          { where: { product: { createdAtShopify: { gte: subDays(new Date(), 30) } } },            orderBy: { product: { createdAtShopify: 'desc' } } },
    missingImages:   { where: { product: { imageCount: 0 } },                                                 orderBy: { sold30Days: 'desc' } },
    missingSeo:      { where: { product: { OR: [{ seoTitle: null }, { seoTitle: '' }, { seoDescription: null }, { seoDescription: '' }] } }, orderBy: { sold30Days: 'desc' } },
    missingVendor:   { where: { product: { OR: [{ vendor: null }, { vendor: '' }] } },                        orderBy: { sold30Days: 'desc' } },
    neverRestocked:  { where: { inventoryQuantity: { lte: 0 }, totalSold: { gt: 0 }, firstOutOfStockAt: { not: null } }, orderBy: { sold30Days: 'desc' } },
    draftProducts:   { where: { product: { status: 'draft' } },                                               orderBy: { sold30Days: 'desc' } },
    activeProducts:  { where: { product: { status: 'active' } },                                              orderBy: { sold30Days: 'desc' } },
    archivedProducts:{ where: { product: { status: 'archived' } },                                            orderBy: { sold30Days: 'desc' } },
  }

  const def = CARDS[card]
  if (!def) return res.status(400).json({ error: `Unknown card: ${card}` })

  try {
    const [variants, total] = await Promise.all([
      db.variant.findMany({ where: def.where, orderBy: def.orderBy, include, take, skip }),
      db.variant.count({ where: def.where }),
    ])

    const totalPages = Math.ceil(total / take)

    const items = variants.map(v => ({
      variantId:         v.id,
      productId:         v.productId,
      productTitle:      v.product?.title       || 'Unknown',
      variantTitle:      v.title,
      image:             v.product?.firstImageSrc || null,
      sku:               v.sku,
      price:             v.price,
      status:            v.product?.status,
      vendor:            v.product?.vendor,
      seoTitle:          v.product?.seoTitle,
      seoDescription:    v.product?.seoDescription,
      currentQty:        v.inventoryQuantity,
      totalSold:         v.totalSold,
      sold30Days:        v.sold30Days,
      sold7Days:         v.sold7Days,
      firstOutOfStockAt: v.firstOutOfStockAt,
      // ── Restock rule ──────────────────────────────────────────────────────
      hasRestockRule:    !!v.restockRule,
      restockRule:       v.restockRule ? {
        id:          v.restockRule.id,
        threshold:   v.restockRule.threshold,
        restockTo:   v.restockRule.restockTo,
        autoRestock: v.restockRule.autoRestock,
        enabled:     v.restockRule.enabled,
      } : null,
    }))

    return res.status(200).json({
      items,
      card,
      page:       pageNum,
      total,
      totalPages,
      hasMore:    pageNum < totalPages,
      showing:    skip + items.length,
    })

  } catch (err) {
    console.error('[cardproducts]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'view_all')
