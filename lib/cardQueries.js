/**
 * Shared dashboard drill-down card queries.
 *
 * Returns the Prisma { where, orderBy } for a given dashboard card so that
 * BOTH the modal data API (/api/cardproducts) and the Excel export
 * (/api/export-card) use the EXACT same filter — the exported rows always
 * match what the drill-down modal shows. Date windows are computed at call
 * time so "last 30 days" etc. stay accurate.
 */

import { subDays } from 'date-fns'

export function buildCardQuery(card, thresh = 5) {
  const now = new Date()

  const CARDS = {
    outOfStock:      { where: { inventoryQuantity: { lte: 0 } },                                              orderBy: { sold30Days: 'desc' } },
    lowStock:        { where: { inventoryQuantity: { gt: 0, lt: 3 } },                                        orderBy: { inventoryQuantity: 'asc' } },
    belowThreshold:  { where: { inventoryQuantity: { gt: 0, lt: thresh } },                                   orderBy: { inventoryQuantity: 'asc' } },
    inStock:         { where: { inventoryQuantity: { gt: 0 } },                                               orderBy: { sold30Days: 'desc' } },
    oos7:            { where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { not: null, lte: subDays(now, 7)  } }, orderBy: { firstOutOfStockAt: 'asc' } },
    oos14:           { where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { not: null, lte: subDays(now, 14) } }, orderBy: { firstOutOfStockAt: 'asc' } },
    oos30:           { where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { not: null, lte: subDays(now, 30) } }, orderBy: { firstOutOfStockAt: 'asc' } },
    noSales:         { where: { totalSold: 0 },                                                               orderBy: { inventoryQuantity: 'desc' } },
    recent:          { where: { product: { createdAtShopify: { gte: subDays(now, 30) } } },                   orderBy: { product: { createdAtShopify: 'desc' } } },
    missingImages:   { where: { product: { imageCount: 0 } },                                                 orderBy: { sold30Days: 'desc' } },
    missingSeo:      { where: { product: { OR: [{ seoTitle: null }, { seoTitle: '' }, { seoDescription: null }, { seoDescription: '' }] } }, orderBy: { sold30Days: 'desc' } },
    missingVendor:   { where: { product: { OR: [{ vendor: null }, { vendor: '' }] } },                        orderBy: { sold30Days: 'desc' } },
    neverRestocked:  { where: { inventoryQuantity: { lte: 0 }, totalSold: { gt: 0 }, firstOutOfStockAt: { not: null } }, orderBy: { sold30Days: 'desc' } },
    draftProducts:   { where: { product: { status: 'draft' } },                                               orderBy: { sold30Days: 'desc' } },
    activeProducts:  { where: { product: { status: 'active' } },                                              orderBy: { sold30Days: 'desc' } },
    archivedProducts:{ where: { product: { status: 'archived' } },                                            orderBy: { sold30Days: 'desc' } },
    // Went OOS buckets
    wentOosLast30:   { where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { gte: subDays(now, 30) } },                                           orderBy: { firstOutOfStockAt: 'desc' } },
    wentOos31to60:   { where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { gte: subDays(now, 60), lt: subDays(now, 30) } },                     orderBy: { firstOutOfStockAt: 'desc' } },
    wentOos61to90:   { where: { inventoryQuantity: { lte: 0 }, firstOutOfStockAt: { gte: subDays(now, 90), lt: subDays(now, 60) } },                     orderBy: { firstOutOfStockAt: 'desc' } },
  }

  return CARDS[card] || null
}
