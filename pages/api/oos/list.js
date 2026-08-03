/**
 * GET /api/oos/list
 *
 * Live out-of-stock list — reads current Variant/Product rows directly
 * (not the notification log), so it's always as fresh as the last sync and
 * never accumulates stale/duplicate entries. A product drops off this list
 * automatically the moment a sync sees its stock above 0.
 */
import { withAuth } from '../../../lib/auth'
import db from '../../../lib/db'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const variants = await db.variant.findMany({
    where:   { inventoryQuantity: { lte: 0 } },
    include: { product: { select: { title: true, status: true, vendor: true, firstImageSrc: true, handle: true } } },
    orderBy: { firstOutOfStockAt: 'desc' },
  })

  const items = variants
    .filter(v => v.product)
    .map(v => ({
      variantId:         v.id,
      productId:         v.productId,
      productTitle:      v.product.title,
      variantTitle:      v.title !== 'Default Title' ? v.title : null,
      sku:               v.sku,
      image:             v.product.firstImageSrc,
      productStatus:     v.product.status,
      vendor:            v.product.vendor,
      inventoryQuantity: v.inventoryQuantity,
      firstOutOfStockAt: v.firstOutOfStockAt,
    }))

  return res.status(200).json({
    items,
    count:       items.length,
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN || null,
  })
}

export default withAuth(handler, 'view_all')
