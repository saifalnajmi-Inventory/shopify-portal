/**
 * POST /api/sync
 * Pulls all Shopify data into the local SQLite database.
 *
 * Graceful degradation — if a Shopify scope is missing the step is skipped
 * with a warning, so the rest of the sync still completes.
 *
 * Required scopes:   read_products, read_orders
 * Optional scopes:   read_locations (per-location inventory breakdown)
 *                    read_product_listings (collection membership)
 */

import db from '../../lib/db'
import { withAuthOrInternal } from '../../lib/auth'
import logger from '../../lib/logger'
import {
  fetchAllProducts,
  fetchAllOrders,
  fetchLocations,
  fetchAllInventoryLevels,
  fetchAllCollections,
  fetchAllCollects,
} from '../../lib/shopify'
import { calcRestockScore, calcMarketingScore } from '../../lib/scoring'
import { runRestockChecksForAll, createNotification } from '../../lib/restockEngine'
import { subDays } from 'date-fns'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const syncStartedAt = new Date()
  const ctx = logger.fromReq(req)

  logger.info('api/sync', 'sync_started', 'Shopify full sync initiated', {
    ...ctx,
    triggeredBy: req.user?.username || 'unknown',
  })

  const syncLog = await db.syncLog.create({
    data: { syncType: 'full', status: 'running' },
  })

  const warnings = []

  try {
    // ── Step 1: Locations (optional — requires read_locations) ───────────────
    let locations       = []
    let activeLocationIds = []

    try {
      locations         = await fetchLocations()
      activeLocationIds = locations.filter(l => l.active).map(l => String(l.id))

      for (const loc of locations) {
        await db.location.upsert({
          where:  { id: String(loc.id) },
          update: { name: loc.name, active: loc.active },
          create: { id: String(loc.id), name: loc.name, active: loc.active },
        })
      }
    } catch (e) {
      warnings.push(`Locations skipped: ${e.message}`)
      logger.warn('api/sync', 'locations_skipped', 'Locations step skipped', { ...ctx, error: e })
    }

    // ── Snapshot pre-sync quantities for restock engine ──────────────────────
    const preQtyRows = await db.variant.findMany({ select: { id: true, inventoryQuantity: true } })
    const prevQtyMap = Object.fromEntries(preQtyRows.map(v => [v.id, v.inventoryQuantity]))

    // ── Step 2: Products & Variants ──────────────────────────────────────────
    const shopifyProducts = await fetchAllProducts()
    let variantsTotal = 0
    const inventoryItemToVariantId = {}

    for (const p of shopifyProducts) {
      const seoTitle = p.metafields_global_title_tag || null
      const seoDesc  = p.metafields_global_description_tag || null

      await db.product.upsert({
        where:  { id: String(p.id) },
        update: {
          title:            p.title,
          handle:           p.handle,
          status:           p.status,
          productType:      p.product_type || null,
          vendor:           p.vendor       || null,
          tags:             p.tags         || null,
          bodyHtml:         p.body_html    || null,
          seoTitle,
          seoDescription:   seoDesc,
          imageCount:       p.images?.length    || 0,
          firstImageSrc:    p.images?.[0]?.src  || null,
          updatedAtShopify: new Date(p.updated_at),
          publishedAt:      p.published_at ? new Date(p.published_at) : null,
          syncedAt:         new Date(),
        },
        create: {
          id:               String(p.id),
          title:            p.title,
          handle:           p.handle,
          status:           p.status,
          productType:      p.product_type || null,
          vendor:           p.vendor       || null,
          tags:             p.tags         || null,
          bodyHtml:         p.body_html    || null,
          seoTitle,
          seoDescription:   seoDesc,
          imageCount:       p.images?.length    || 0,
          firstImageSrc:    p.images?.[0]?.src  || null,
          createdAtShopify: new Date(p.created_at),
          updatedAtShopify: new Date(p.updated_at),
          publishedAt:      p.published_at ? new Date(p.published_at) : null,
        },
      })

      for (const v of p.variants || []) {
        variantsTotal++
        inventoryItemToVariantId[String(v.inventory_item_id)] = String(v.id)

        const existing = await db.variant.findUnique({ where: { id: String(v.id) } })
        const qty      = v.inventory_quantity ?? 0
        let firstOos   = existing?.firstOutOfStockAt ?? null
        if (qty === 0 && !firstOos) firstOos = new Date()
        if (qty > 0)                 firstOos = null

        await db.variant.upsert({
          where:  { id: String(v.id) },
          update: {
            title:             v.title,
            sku:               v.sku               || null,
            barcode:           v.barcode           || null,
            price:             parseFloat(v.price) || 0,
            compareAtPrice:    v.compare_at_price  ? parseFloat(v.compare_at_price) : null,
            inventoryItemId:   String(v.inventory_item_id),
            inventoryQuantity: qty,
            option1:           v.option1    || null,
            option2:           v.option2    || null,
            option3:           v.option3    || null,
            weight:            v.weight     ? parseFloat(v.weight) : null,
            weightUnit:        v.weight_unit || null,
            firstOutOfStockAt: firstOos,
            syncedAt:          new Date(),
          },
          create: {
            id:                String(v.id),
            productId:         String(p.id),
            title:             v.title,
            sku:               v.sku               || null,
            barcode:           v.barcode           || null,
            price:             parseFloat(v.price) || 0,
            compareAtPrice:    v.compare_at_price  ? parseFloat(v.compare_at_price) : null,
            inventoryItemId:   String(v.inventory_item_id),
            inventoryQuantity: qty,
            option1:           v.option1    || null,
            option2:           v.option2    || null,
            option3:           v.option3    || null,
            weight:            v.weight     ? parseFloat(v.weight) : null,
            weightUnit:        v.weight_unit || null,
            firstOutOfStockAt: firstOos,
          },
        })
      }
    }

    // ── Step 3: Inventory Levels per location (optional) ─────────────────────
    if (activeLocationIds.length > 0) {
      try {
        const inventoryItemIds = Object.keys(inventoryItemToVariantId)
        const locationMap      = Object.fromEntries(locations.map(l => [String(l.id), l.name]))
        const inventoryLevels  = await fetchAllInventoryLevels(inventoryItemIds, activeLocationIds)

        for (const level of inventoryLevels) {
          const variantId = inventoryItemToVariantId[String(level.inventory_item_id)]
          if (!variantId) continue

          await db.inventoryLevel.upsert({
            where: {
              variantId_locationId: {
                variantId,
                locationId: String(level.location_id),
              },
            },
            update: { available: level.available ?? 0 },
            create: {
              variantId,
              locationId:   String(level.location_id),
              locationName: locationMap[String(level.location_id)] || null,
              available:    level.available ?? 0,
            },
          })
        }
      } catch (e) {
        warnings.push(`Inventory levels skipped: ${e.message}`)
        logger.warn('api/sync', 'inventory_levels_skipped', 'Inventory levels step skipped', { ...ctx, error: e })
      }
    } else {
      warnings.push('Inventory levels skipped — add read_locations scope for per-location breakdown. Stock totals still synced from product variants.')
    }

    // ── Step 4: Collections (optional) ───────────────────────────────────────
    try {
      const collections = await fetchAllCollections()
      for (const c of collections) {
        await db.collection.upsert({
          where:  { id: String(c.id) },
          update: { title: c.title, handle: c.handle },
          create: { id: String(c.id), title: c.title, handle: c.handle },
        })
      }

      const collects = await fetchAllCollects()
      await db.productCollection.deleteMany()
      for (const col of collects) {
        const productId    = String(col.product_id)
        const collectionId = String(col.collection_id)
        const [pExists, cExists] = await Promise.all([
          db.product.findUnique({ where: { id: productId } }),
          db.collection.findUnique({ where: { id: collectionId } }),
        ])
        if (!pExists || !cExists) continue
        await db.productCollection.upsert({
          where:  { productId_collectionId: { productId, collectionId } },
          update: {},
          create: { productId, collectionId },
        })
      }
    } catch (e) {
      warnings.push(`Collections skipped: ${e.message}`)
      logger.warn('api/sync', 'collections_skipped', 'Collections step skipped', { ...ctx, error: e })
    }

    // ── Step 5: Orders ────────────────────────────────────────────────────────
    let ordersCount = 0
    try {
      const orders = await fetchAllOrders()

      for (const o of orders) {
        if (o.cancelled_at) continue
        ordersCount++

        await db.order.upsert({
          where:  { id: String(o.id) },
          update: {
            totalPrice:        parseFloat(o.total_price) || 0,
            financialStatus:   o.financial_status,
            fulfillmentStatus: o.fulfillment_status || null,
            cancelledAt:       null,
          },
          create: {
            id:                String(o.id),
            orderNumber:       o.order_number,
            email:             o.email            || null,
            totalPrice:        parseFloat(o.total_price) || 0,
            financialStatus:   o.financial_status,
            fulfillmentStatus: o.fulfillment_status || null,
            createdAt:         new Date(o.created_at),
            processedAt:       o.processed_at ? new Date(o.processed_at) : null,
            cancelledAt:       null,
          },
        })

        for (const li of o.line_items || []) {
          const variantId = li.variant_id ? String(li.variant_id) : null
          let linkedVariantId = null
          if (variantId) {
            const vExists = await db.variant.findUnique({ where: { id: variantId } })
            if (vExists) linkedVariantId = variantId
          }

          await db.orderLineItem.upsert({
            where:  { id: String(li.id) },
            update: { quantity: li.quantity, price: parseFloat(li.price) || 0, variantId: linkedVariantId },
            create: {
              id:          String(li.id),
              orderId:     String(o.id),
              variantId:   linkedVariantId,
              productId:   li.product_id ? String(li.product_id) : null,
              title:       li.title,
              variantTitle: li.variant_title || null,
              quantity:    li.quantity,
              price:       parseFloat(li.price) || 0,
              sku:         li.sku     || null,
              createdAt:   new Date(o.created_at),
            },
          })
        }
      }
    } catch (e) {
      warnings.push(`Orders skipped: ${e.message}`)
      logger.warn('api/sync', 'orders_skipped', 'Orders step skipped', { ...ctx, error: e })
    }

    // ── Step 6: Compute sales stats & scores ─────────────────────────────────
    const now   = new Date()
    const ago30 = subDays(now, 30)
    const ago7  = subDays(now, 7)

    const allVariants = await db.variant.findMany({ include: { product: true } })

    for (const v of allVariants) {
      const [totalSold, sold30, sold7, lastOrder] = await Promise.all([
        db.orderLineItem.aggregate({ where: { variantId: v.id }, _sum: { quantity: true } }),
        db.orderLineItem.aggregate({ where: { variantId: v.id, createdAt: { gte: ago30 } }, _sum: { quantity: true } }),
        db.orderLineItem.aggregate({ where: { variantId: v.id, createdAt: { gte: ago7 } },  _sum: { quantity: true } }),
        db.orderLineItem.findFirst({ where: { variantId: v.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      ])

      const totalSoldVal = totalSold._sum.quantity || 0
      const sold30Val    = sold30._sum.quantity    || 0
      const sold7Val     = sold7._sum.quantity     || 0

      const variantData    = { ...v, sold30Days: sold30Val, sold7Days: sold7Val }
      const restockScore   = calcRestockScore(variantData)
      const marketingScore = calcMarketingScore(v.product, variantData)

      // ── OOS date backfill ──────────────────────────────────────────────────
      // On first sync, firstOutOfStockAt is set to "now" for any OOS item.
      // We can do better: if the item was sold before and is now OOS, use the
      // lastSoldAt date as the estimated OOS start (item went OOS sometime after its last sale).
      // Only overwrite if firstOutOfStockAt was set during THIS sync (within last 5 min).
      let firstOosUpdate = undefined  // undefined = don't change the field
      if (
        v.inventoryQuantity <= 0 &&
        lastOrder?.createdAt &&
        v.firstOutOfStockAt &&
        v.firstOutOfStockAt >= new Date(syncStartedAt.getTime() - 5 * 60 * 1000)
      ) {
        // firstOutOfStockAt was just set this sync to "now" → backfill from lastSoldAt
        firstOosUpdate = lastOrder.createdAt
      }

      await db.variant.update({
        where: { id: v.id },
        data: {
          totalSold: totalSoldVal,
          sold30Days: sold30Val,
          sold7Days:  sold7Val,
          lastSoldAt: lastOrder?.createdAt || null,
          restockScore,
          marketingScore,
          ...(firstOosUpdate !== undefined ? { firstOutOfStockAt: firstOosUpdate } : {}),
        },
      })
    }

    // ── Step 7: Auto-restock + notification checks ───────────────────────────
    try {
      const settingRows = await db.globalSetting.findMany()
      const globalSettings = Object.fromEntries(settingRows.map(r => [r.key, r.value]))
      await runRestockChecksForAll(prevQtyMap, globalSettings)
    } catch (e) {
      warnings.push(`Restock check skipped: ${e.message}`)
      logger.warn('api/sync', 'restock_check_skipped', 'Restock engine check failed', { ...ctx, error: e })
    }

    // ── Done ──────────────────────────────────────────────────────────────────
    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status:        'success',
        completedAt:   new Date(),
        productsCount: shopifyProducts.length,
        variantsCount: variantsTotal,
        ordersCount,
        errorMessage:  warnings.length ? warnings.join(' | ') : null,
      },
    })

    logger.info('api/sync', 'sync_complete', 'Shopify full sync completed', {
      ...ctx,
      products: shopifyProducts.length,
      variants: variantsTotal,
      orders:   ordersCount,
      warnings: warnings.length,
      durationMs: Date.now() - syncStartedAt.getTime(),
    })

    return res.status(200).json({
      ok:       true,
      products: shopifyProducts.length,
      variants: variantsTotal,
      orders:   ordersCount,
      warnings,
    })
  } catch (err) {
    logger.error('api/sync', 'sync_failed', 'Shopify full sync failed', { ...ctx, error: err })
    await db.syncLog.update({
      where: { id: syncLog.id },
      data:  { status: 'failed', completedAt: new Date(), errorMessage: err.message },
    })
    // Sync failure notification
    try {
      await createNotification({
        type: 'sync_failed', severity: 'critical',
        message: `Shopify sync failed: ${err.message}`,
      })
    } catch {}
    return res.status(500).json({ ok: false, error: err.message })
  }
}

export default withAuthOrInternal(handler, 'sync_shopify')

export const config = {
  api: { bodyParser: false, responseLimit: false },
}
