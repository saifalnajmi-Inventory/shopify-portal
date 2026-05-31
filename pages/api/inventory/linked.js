/**
 * GET /api/inventory/linked
 * Returns all confirmed POS↔Shopify linked products.
 * This is the data source for the Inventory Manager page.
 *
 * The portal acts as the master inventory system for these products:
 *   - POS is the physical store count (read-only, syncs every 2h)
 *   - Shopify tracks online orders automatically (decrements on order)
 *   - Portal's shopifyStock = what we last pushed to Shopify
 *   - True online available ≈ shopifyStock (Shopify auto-decrements for orders)
 *
 * Query: ?q=&sort=name|stock|updated&dir=asc|desc&page=1&limit=50&alert=low|out
 *
 * Auth: manage_settings
 */

import db           from '../../../lib/db'
import { withAuth } from '../../../lib/auth'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const q      = (req.query.q     || '').trim()
  const sort   = req.query.sort   || 'updated'
  const dir    = req.query.dir    === 'asc' ? 'asc' : 'desc'
  const page   = Math.max(1, parseInt(req.query.page)  || 1)
  const limit  = Math.min(100, parseInt(req.query.limit) || 50)
  const alert  = req.query.alert  || ''   // 'low' | 'out' | ''
  const LOW_STOCK_THRESHOLD = parseInt(req.query.threshold) || 5

  try {
    // Base where: confirmed rows with a Shopify variant
    const where = {
      status: 'confirmed',
      shopifyVariantId: { not: null },
      ...(q ? {
        OR: [
          { posProduct: { name:    { contains: q, mode: 'insensitive' } } },
          { posProduct: { barcode: { contains: q, mode: 'insensitive' } } },
          { posProduct: { sku:     { contains: q, mode: 'insensitive' } } },
          { variant:    { product: { title: { contains: q, mode: 'insensitive' } } } },
        ],
      } : {}),
    }

    // Alert filters (applied after fetch due to computed field)
    // We load a bit extra then filter — acceptable for typical catalogue sizes
    const [matches, total] = await Promise.all([
      db.posMatch.findMany({
        where,
        include: {
          posProduct: {
            select: { name: true, barcode: true, sku: true, category: true,
                      price: true, costPrice: true, stockMain: true, stockStore: true,
                      lastSyncedAt: true },
          },
          variant: {
            select: {
              id: true, sku: true, barcode: true, price: true, inventoryQuantity: true,
              product: { select: { id: true, title: true, status: true, firstImageSrc: true, handle: true } },
            },
          },
        },
        orderBy: sort === 'name'    ? { posProduct: { name: 'asc' } }
               : sort === 'stock'   ? { posStockMain: dir }
               :                      { updatedAt: dir },
      }),
      db.posMatch.count({ where }),
    ])

    // Build enriched rows
    let rows = matches.map(m => {
      const posStock     = (m.posStockMain || 0) + (m.posStockStore || 0)
      const shopifyStock = m.shopifyStock ?? null   // null = never pushed yet
      const stockDelta   = shopifyStock !== null ? posStock - shopifyStock : null

      // Estimate: how many units were sold online since we last set stock
      // (if shopifyStock > estimated current Shopify, online orders consumed the diff)
      const onlineConsumed = shopifyStock !== null && m.variant?.inventoryQuantity !== null
        ? Math.max(0, shopifyStock - (m.variant?.inventoryQuantity ?? shopifyStock))
        : 0

      return {
        matchId:         m.id,
        matchType:       m.matchType,
        confirmedBy:     m.confirmedBy,
        confirmedAt:     m.confirmedAt,
        updatedAt:       m.updatedAt,

        // POS side
        posBarcode:      m.posProduct?.barcode || '',
        posName:         m.posProduct?.name    || '',
        posSku:          m.posProduct?.sku     || '',
        posCategory:     m.posProduct?.category || '',
        posStockMain:    m.posStockMain,
        posStockStore:   m.posStockStore,
        posStock,                              // total POS physical stock
        posPrice:        m.posPrice,
        posLastSync:     m.posProduct?.lastSyncedAt,

        // Shopify side
        shopifyVariantId: m.shopifyVariantId,
        shopifyProductId: m.variant?.product?.id,
        shopifyTitle:     m.variant?.product?.title || '',
        shopifyStatus:    m.shopifyStatus || m.variant?.product?.status || '',
        shopifyPrice:     m.shopifyPrice,
        shopifyStock,                          // last value we pushed
        shopifyLiveStock: m.variant?.inventoryQuantity ?? null, // cached from local DB
        shopifyImage:     m.variant?.product?.firstImageSrc,
        shopifyHandle:    m.variant?.product?.handle,
        shopifyAdminUrl:  m.variant?.product?.id
          ? `https://admin.shopify.com/store/e608ce-82/products/${m.variant.product.id}`
          : null,

        // Computed
        onlineConsumed,    // estimated units sold online
        stockDelta,        // posStock minus shopifyStock (drift indicator)

        // Alert flags
        isOutOfStock: posStock === 0,
        isLowStock:   posStock > 0 && posStock <= LOW_STOCK_THRESHOLD,
      }
    })

    // Apply alert filter
    if (alert === 'out') rows = rows.filter(r => r.isOutOfStock)
    if (alert === 'low') rows = rows.filter(r => r.isLowStock)

    // Paginate
    const totalFiltered = rows.length
    const paged         = rows.slice((page - 1) * limit, page * limit)

    // Summary stats across ALL confirmed (not just the filtered subset)
    const allConfirmed = matches
    const outOfStock   = allConfirmed.filter(m => (m.posStockMain + m.posStockStore) === 0).length
    const lowStock     = allConfirmed.filter(m => {
      const t = m.posStockMain + m.posStockStore
      return t > 0 && t <= LOW_STOCK_THRESHOLD
    }).length

    res.setHeader('Cache-Control', 'no-store')
    return res.json({
      ok:     true,
      total:  totalFiltered,
      page,
      pages:  Math.ceil(totalFiltered / limit),
      limit,
      summary: {
        totalLinked: total,
        outOfStock,
        lowStock,
        healthy:     total - outOfStock - lowStock,
      },
      rows:   paged,
    })
  } catch (err) {
    console.error('[INVENTORY LINKED]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'manage_settings')
