/**
 * GET /api/dashboard
 * Returns aggregated stats for all 20 dashboard cards.
 */

import db from '../../lib/db'
import { subDays } from 'date-fns'
import { withAuth } from '../../lib/auth'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const now  = new Date()
    const ago7  = subDays(now, 7)
    const ago14 = subDays(now, 14)
    const ago30 = subDays(now, 30)
    const ago60 = subDays(now, 60)
    const ago90 = subDays(now, 90)

    // Run queries sequentially in groups to avoid SQLite locking
    const totalProducts    = await db.product.count()
    const activeProducts   = await db.product.count({ where: { status: 'active' } })
    const draftProducts    = await db.product.count({ where: { status: 'draft' } })
    const archivedProducts = await db.product.count({ where: { status: 'archived' } })
    const totalVariants    = await db.variant.count()

    // Stock counts — counted per VARIANT to exactly match the drilldown numbers
    const inStockVariants        = await db.variant.count({ where: { inventoryQuantity: { gt: 0 } } })
    const outOfStockVariants     = await db.variant.count({ where: { inventoryQuantity: { lte: 0 } } })
    const lowStockVariants       = await db.variant.count({ where: { inventoryQuantity: { gt: 0, lt: 3 } } })
    const belowThresholdVariants = await db.variant.count({ where: { inventoryQuantity: { gt: 0, lt: 5 } } })

    const oos7Days  = await db.variant.count({ where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { not: null, lte: ago7  } } })
    const oos14Days = await db.variant.count({ where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { not: null, lte: ago14 } } })
    const oos30Days = await db.variant.count({ where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { not: null, lte: ago30 } } })

    const neverRestocked = await db.variant.count({
      where: { inventoryQuantity: { lte: 0 }, totalSold: { gt: 0 }, firstOutOfStockAt: { not: null } },
    })

    // "Went OOS" buckets — products that became out of stock within each time window
    const wentOosLast30  = await db.variant.count({
      where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { gte: ago30 } },
    })
    const wentOos31to60  = await db.variant.count({
      where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { gte: ago60, lt: ago30 } },
    })
    const wentOos61to90  = await db.variant.count({
      where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { gte: ago90, lt: ago60 } },
    })

    // Catalog quality — counted per variant to match drilldown
    const noSalesProducts = await db.variant.count({ where: { totalSold: 0 } })
    const recentProducts  = await db.variant.count({ where: { product: { createdAtShopify: { gte: ago30 } } } })
    const missingImages   = await db.variant.count({ where: { product: { imageCount: 0 } } })
    const missingSeo      = await db.variant.count({
      where: { product: { OR: [{ seoTitle: null }, { seoTitle: '' }, { seoDescription: null }, { seoDescription: '' }] } },
    })
    const missingVendor   = await db.variant.count({
      where: { product: { OR: [{ vendor: null }, { vendor: '' }] } },
    })

    // Top lists
    const variantSelect = {
      id: true, productId: true, title: true, sku: true,
      price: true, inventoryQuantity: true,
      totalSold: true, sold30Days: true, sold7Days: true,
      product: { select: { title: true, firstImageSrc: true } },
    }

    const bestSelling = await db.variant.findMany({
      where:   { totalSold: { gt: 0 } },
      orderBy: { totalSold: 'desc' },
      take:    15,
      select:  variantSelect,
    })

    const fastMovingLowStock = await db.variant.findMany({
      where:   { sold7Days: { gte: 2 }, inventoryQuantity: { lte: 10 } },
      orderBy: { sold7Days: 'desc' },
      take:    15,
      select:  variantSelect,
    })

    const highSalesOos = await db.variant.findMany({
      where:   { sold30Days: { gte: 3 }, inventoryQuantity: { lte: 0 } },
      orderBy: { sold30Days: 'desc' },
      take:    15,
      select:  variantSelect,
    })

    // Normalise to a flat shape for the QuickStockCard component
    const normalise = (v) => ({
      variantId:    v.id,
      productId:    v.productId,
      productTitle: v.product?.title || 'Unknown',
      variantTitle: v.title,
      image:        v.product?.firstImageSrc || null,
      sku:          v.sku,
      price:        v.price,
      currentQty:   v.inventoryQuantity,
      totalSold:    v.totalSold,
      sold30Days:   v.sold30Days,
      sold7Days:    v.sold7Days,
    })

    const lastSync = await db.syncLog.findFirst({
      where:   { status: 'success' },
      orderBy: { startedAt: 'desc' },
    })

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    return res.status(200).json({
      lastSync: lastSync?.completedAt || null,
      cards: {
        totalProducts, activeProducts, draftProducts, archivedProducts,
        totalVariants, inStockVariants, outOfStockVariants, lowStockVariants,
        belowThresholdVariants, oos7Days, oos14Days, oos30Days,
        neverRestocked,
        noSalesProducts, recentProducts, missingImages, missingSeo, missingVendor,
        wentOosLast30, wentOos31to60, wentOos61to90,
      },
      lists: {
        bestSelling:      bestSelling.map(normalise),
        fastMovingLowStock: fastMovingLowStock.map(normalise),
        highSalesOos:     highSalesOos.map(normalise),
      },
    })
  } catch (err) {
    console.error('[dashboard]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'view_all')
