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

    // Run queries sequentially in groups to avoid SQLite locking
    const totalProducts    = await db.product.count()
    const activeProducts   = await db.product.count({ where: { status: 'active' } })
    const draftProducts    = await db.product.count({ where: { status: 'draft' } })
    const archivedProducts = await db.product.count({ where: { status: 'archived' } })
    const totalVariants    = await db.variant.count()

    // Stock counts (via variant aggregations on products)
    const inStockVariants = await db.product.count({
      where: { variants: { some: { inventoryQuantity: { gt: 0 } } } },
    })

    // Out of stock: products where ALL variants are at 0
    const outOfStockVariants = await db.product.count({
      where: {
        AND: [
          { variants: { none: { inventoryQuantity: { gt: 0 } } } },
          { variants: { some: {} } }, // has at least one variant
        ],
      },
    })

    const lowStockVariants = await db.product.count({
      where: { variants: { some: { inventoryQuantity: { gt: 0, lt: 3 } } } },
    })

    const belowThresholdVariants = await db.product.count({
      where: { variants: { some: { inventoryQuantity: { gt: 0, lt: 5 } } } },
    })

    // OOS duration
    const oos7Days = await db.product.count({
      where: {
        variants: {
          some: {
            inventoryQuantity: { lte: 0 },
            firstOutOfStockAt: { not: null, lte: ago7 },
          },
        },
      },
    })

    const oos14Days = await db.product.count({
      where: {
        variants: {
          some: {
            inventoryQuantity: { lte: 0 },
            firstOutOfStockAt: { not: null, lte: ago14 },
          },
        },
      },
    })

    const oos30Days = await db.product.count({
      where: {
        variants: {
          some: {
            inventoryQuantity: { lte: 0 },
            firstOutOfStockAt: { not: null, lte: ago30 },
          },
        },
      },
    })

    // Never restocked: has had sales, currently OOS, firstOutOfStockAt still set
    // (meaning they went OOS and were never restocked since portal started tracking)
    const neverRestocked = await db.product.count({
      where: {
        variants: {
          some: {
            inventoryQuantity: { lte: 0 },
            totalSold:         { gt: 0 },
            firstOutOfStockAt: { not: null },
          },
        },
      },
    })

    // Sales intelligence
    const noSalesProducts  = await db.product.count({
      where: { variants: { none: { totalSold: { gt: 0 } } } },
    })
    const recentProducts   = await db.product.count({ where: { createdAtShopify: { gte: ago30 } } })
    const missingImages    = await db.product.count({ where: { imageCount: 0 } })
    const missingSeo       = await db.product.count({
      where: { OR: [{ seoTitle: null }, { seoTitle: '' }, { seoDescription: null }, { seoDescription: '' }] },
    })
    const missingVendor    = await db.product.count({
      where: { OR: [{ vendor: null }, { vendor: '' }] },
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

    return res.status(200).json({
      lastSync: lastSync?.completedAt || null,
      cards: {
        totalProducts, activeProducts, draftProducts, archivedProducts,
        totalVariants, inStockVariants, outOfStockVariants, lowStockVariants,
        belowThresholdVariants, oos7Days, oos14Days, oos30Days,
        neverRestocked,
        noSalesProducts, recentProducts, missingImages, missingSeo, missingVendor,
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
