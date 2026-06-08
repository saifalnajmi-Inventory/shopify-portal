/**
 * POST /api/fetch-new-uploads
 * Lightweight incremental pull: fetches Shopify products created since the
 * newest product we already have, and upserts just product + variant rows.
 *
 * Unlike POST /api/sync (the full 6-hourly sync), this does NOT touch orders,
 * inventory levels, collections, sales stats or restock scores — so it returns
 * in seconds and is safe to click on demand right after uploading products.
 *
 * Required scope: read_products
 */

import db from '../../lib/db'
import { withAuthOrInternal } from '../../lib/auth'
import logger from '../../lib/logger'
import { fetchProductsCreatedSince } from '../../lib/shopify'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const ctx = logger.fromReq(req)
  try {
    // Cutoff = newest product we already have (so we only pull genuinely new
    // uploads). First-ever run with an empty DB falls back to the last 7 days.
    const newest = await db.product.findFirst({
      orderBy: { createdAtShopify: 'desc' },
      select:  { createdAtShopify: true },
    })
    const createdAtMin = (newest?.createdAtShopify
      ? newest.createdAtShopify
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).toISOString()

    const shopifyProducts = await fetchProductsCreatedSince(createdAtMin)

    let created = 0
    let updated = 0
    let variantsTotal = 0

    for (const p of shopifyProducts) {
      const existing = await db.product.findUnique({ where: { id: String(p.id) }, select: { id: true } })

      const common = {
        title:            p.title,
        handle:           p.handle,
        status:           p.status,
        productType:      p.product_type || null,
        vendor:           p.vendor       || null,
        tags:             p.tags         || null,
        bodyHtml:         p.body_html    || null,
        seoTitle:         p.metafields_global_title_tag       || null,
        seoDescription:   p.metafields_global_description_tag || null,
        imageCount:       p.images?.length   || 0,
        firstImageSrc:    p.images?.[0]?.src || null,
        updatedAtShopify: new Date(p.updated_at),
        publishedAt:      p.published_at ? new Date(p.published_at) : null,
        syncedAt:         new Date(),
      }

      await db.product.upsert({
        where:  { id: String(p.id) },
        update: common,
        create: { id: String(p.id), createdAtShopify: new Date(p.created_at), ...common },
      })
      existing ? updated++ : created++

      for (const v of p.variants || []) {
        variantsTotal++
        const qty = v.inventory_quantity ?? 0
        const vCommon = {
          title:             v.title,
          sku:               v.sku             || null,
          barcode:           v.barcode         || null,
          price:             parseFloat(v.price) || 0,
          compareAtPrice:    v.compare_at_price ? parseFloat(v.compare_at_price) : null,
          inventoryItemId:   String(v.inventory_item_id),
          inventoryQuantity: qty,
          option1:           v.option1     || null,
          option2:           v.option2     || null,
          option3:           v.option3     || null,
          weight:            v.weight      ? parseFloat(v.weight) : null,
          weightUnit:        v.weight_unit || null,
          syncedAt:          new Date(),
        }
        await db.variant.upsert({
          where:  { id: String(v.id) },
          update: vCommon,
          create: {
            id:                String(v.id),
            productId:         String(p.id),
            firstOutOfStockAt: qty === 0 ? new Date() : null,
            ...vCommon,
          },
        })
      }
    }

    logger.info('api/fetch-new-uploads', 'fetch_new_complete', 'Incremental product fetch complete', {
      ...ctx, since: createdAtMin, fetched: shopifyProducts.length, created, updated, variants: variantsTotal,
    })

    return res.status(200).json({
      ok:        true,
      since:     createdAtMin,
      fetched:   shopifyProducts.length,
      newCount:  created,
      updated,
      variants:  variantsTotal,
    })
  } catch (err) {
    logger.error('api/fetch-new-uploads', 'fetch_new_failed', 'Incremental product fetch failed', { ...ctx, error: err })
    return res.status(500).json({ ok: false, error: err.message })
  }
}

export default withAuthOrInternal(handler, 'sync_shopify')

export const config = { api: { bodyParser: false } }
