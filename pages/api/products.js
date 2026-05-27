/**
 * GET /api/products
 * Returns paginated, filtered, sorted product+variant list.
 *
 * Query params:
 *   search, status, vendor, productType, collectionId, stockLevel,
 *   hasSales, hasImages, hasSeo, hasVendor,
 *   sort (field), order (asc|desc), page, limit
 */

import db from '../../lib/db'
import { withAuth } from '../../lib/auth'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  try {
  const {
    search      = '',
    status      = '',
    vendor      = '',
    productType = '',
    collectionId = '',
    stockLevel  = '',   // 0 | lt3 | lt5 | lt10 | instock | oos | custom:<n>
    hasSales    = '',   // true | false
    hasImages   = '',   // true | false
    hasSeo      = '',   // true | false
    hasVendor   = '',   // true | false
    sort        = 'title',
    order       = 'asc',
    page        = '1',
    limit       = '50',
  } = req.query

  const skip = (parseInt(page) - 1) * parseInt(limit)
  const take = parseInt(limit)

  // ── Build Prisma where clause ────────────────────────────────────────────────
  const where = {}

  if (status) where.status = status

  if (vendor) where.vendor = { contains: vendor, mode: 'insensitive' }

  if (productType) where.productType = { contains: productType, mode: 'insensitive' }

  if (search) {
    where.OR = [
      { title:       { contains: search } },
      { vendor:      { contains: search } },
      { tags:        { contains: search } },
      { variants: { some: { sku:     { contains: search } } } },
      { variants: { some: { barcode: { contains: search } } } },
    ]
  }

  if (collectionId) {
    where.collections = { some: { collectionId } }
  }

  if (hasImages === 'false') where.imageCount = 0
  if (hasImages === 'true')  where.imageCount = { gt: 0 }

  if (hasSeo === 'false') {
    where.OR = [
      ...(where.OR || []),
      { seoTitle: null }, { seoTitle: '' },
      { seoDescription: null }, { seoDescription: '' },
    ]
  }

  if (hasVendor === 'false') {
    where.OR = [...(where.OR || []), { vendor: null }, { vendor: '' }]
  }

  if (hasSales === 'false') {
    where.variants = { every: { totalSold: 0 } }
  }
  if (hasSales === 'true') {
    where.variants = { some: { totalSold: { gt: 0 } } }
  }

  // Stock level filter on variants
  const variantWhere = {}
  if (stockLevel === '0' || stockLevel === 'oos') {
    variantWhere.inventoryQuantity = { lte: 0 }
  } else if (stockLevel === 'lt3') {
    variantWhere.inventoryQuantity = { gt: 0, lt: 3 }
  } else if (stockLevel === 'lt5') {
    variantWhere.inventoryQuantity = { gt: 0, lt: 5 }
  } else if (stockLevel === 'lt10') {
    variantWhere.inventoryQuantity = { gt: 0, lt: 10 }
  } else if (stockLevel === 'instock') {
    variantWhere.inventoryQuantity = { gt: 0 }
  } else if (stockLevel.startsWith('custom:')) {
    const n = parseInt(stockLevel.split(':')[1])
    if (!isNaN(n)) variantWhere.inventoryQuantity = { gt: 0, lt: n }
  }

  if (Object.keys(variantWhere).length > 0) {
    where.variants = { some: variantWhere }
  }

  // ── Sort ─────────────────────────────────────────────────────────────────────
  const validSorts = { title: { title: order }, vendor: { vendor: order }, status: { status: order } }
  const orderBy = validSorts[sort] || { title: 'asc' }

  // ── Query ────────────────────────────────────────────────────────────────────
  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        variants: {
          orderBy: { inventoryQuantity: 'asc' },
        },
        collections: {
          include: { collection: { select: { id: true, title: true } } },
        },
      },
    }),
    db.product.count({ where }),
  ])

  // ── Aggregate variant data per product ───────────────────────────────────────
  const enriched = products.map(p => {
    const variants = p.variants
    const totalQty      = variants.reduce((s, v) => s + v.inventoryQuantity, 0)
    const totalSold     = variants.reduce((s, v) => s + v.totalSold,        0)
    const sold30Days    = variants.reduce((s, v) => s + v.sold30Days,       0)
    const sold7Days     = variants.reduce((s, v) => s + v.sold7Days,        0)
    const maxRestock    = Math.max(...variants.map(v => v.restockScore   || 0))
    const maxMarketing  = Math.max(...variants.map(v => v.marketingScore || 0))
    const minOos        = variants
      .filter(v => v.firstOutOfStockAt)
      .sort((a, b) => new Date(a.firstOutOfStockAt) - new Date(b.firstOutOfStockAt))[0]
      ?.firstOutOfStockAt || null

    return {
      id:             p.id,
      title:          p.title,
      handle:         p.handle,
      status:         p.status,
      vendor:         p.vendor,
      productType:    p.productType,
      tags:           p.tags,
      seoTitle:       p.seoTitle,
      seoDescription: p.seoDescription,
      imageCount:     p.imageCount,
      firstImageSrc:  p.firstImageSrc,
      createdAt:      p.createdAtShopify,
      publishedAt:    p.publishedAt,
      collections:    p.collections.map(pc => pc.collection),
      totalQty,
      totalSold,
      sold30Days,
      sold7Days,
      maxRestockScore:   maxRestock,
      maxMarketingScore: maxMarketing,
      firstOutOfStockAt: minOos,
      variantCount:   variants.length,
      variants:       variants.map(v => ({
        id:                v.id,
        title:             v.title,
        sku:               v.sku,
        barcode:           v.barcode,
        price:             v.price,
        compareAtPrice:    v.compareAtPrice,
        inventoryQuantity: v.inventoryQuantity,
        totalSold:         v.totalSold,
        sold30Days:        v.sold30Days,
        sold7Days:         v.sold7Days,
        restockScore:      v.restockScore,
        marketingScore:    v.marketingScore,
        firstOutOfStockAt: v.firstOutOfStockAt,
        lastSoldAt:        v.lastSoldAt,
        option1:           v.option1,
        option2:           v.option2,
        option3:           v.option3,
        inventoryItemId:   v.inventoryItemId,
      })),
    }
  })

  // ── Filter lists for dropdowns ────────────────────────────────────────────────
  const [vendors, productTypes, collections] = await Promise.all([
    db.product.findMany({ select: { vendor: true }, distinct: ['vendor'], where: { vendor: { not: null } } }),
    db.product.findMany({ select: { productType: true }, distinct: ['productType'], where: { productType: { not: null } } }),
    db.collection.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } }),
  ])

  res.status(200).json({
    products: enriched,
    total,
    page:       parseInt(page),
    totalPages: Math.ceil(total / take),
    filters: {
      vendors:      vendors.map(v => v.vendor).filter(Boolean).sort(),
      productTypes: productTypes.map(p => p.productType).filter(Boolean).sort(),
      collections,
    },
  })
  } catch (err) {
    console.error('[products]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'view_all')
