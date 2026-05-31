/**
 * POST /api/pos/manual-link
 * Manually links a POS product to a Shopify variant for unmatched rows.
 *
 * Body: { posMatchId, shopifyVariantId }
 *
 * Steps:
 *   1. Resolve Shopify variant — from local DB first; if missing (e.g. recently
 *      pushed product not yet synced) fetch from Shopify API and mini-upsert.
 *   2. Update PosMatch: shopifyVariantId, matchType='manual', status='confirmed'
 *   3. Push POS barcode → Shopify variant barcode
 *   4. Push POS total stock → Shopify inventory at all locations
 *   5. Refresh local snapshots
 *
 * Auth: manage_settings
 */

import db           from '../../../lib/db'
import { withAuth } from '../../../lib/auth'
import {
  updateVariant, setInventoryLevel, updateProduct,
  fetchVariantById, fetchProductById,
} from '../../../lib/shopify'

// ── Mini-sync: fetch a Shopify variant + its product + inventory levels
//    and upsert them into the local DB so manual-link logic can run normally. ──
async function resolveVariant(shopifyVariantId) {
  // 1. Try local DB
  const cached = await db.variant.findUnique({
    where:   { id: String(shopifyVariantId) },
    include: {
      product:         { select: { id: true, title: true, status: true, firstImageSrc: true } },
      inventoryLevels: true,
    },
  })
  if (cached) return cached

  // 2. Not in DB — fetch live from Shopify and upsert so future calls are fast
  console.log(`[MANUAL LINK] Variant ${shopifyVariantId} not in DB — fetching from Shopify live`)

  const shopifyVariant = await fetchVariantById(shopifyVariantId)
  if (!shopifyVariant) return null

  const shopifyProduct = await fetchProductById(shopifyVariant.product_id)
  if (!shopifyProduct) return null

  // Upsert product
  await db.product.upsert({
    where:  { id: String(shopifyProduct.id) },
    create: {
      id:               String(shopifyProduct.id),
      title:            shopifyProduct.title,
      handle:           shopifyProduct.handle || '',
      status:           shopifyProduct.status || 'draft',
      vendor:           shopifyProduct.vendor || null,
      productType:      shopifyProduct.product_type || null,
      firstImageSrc:    shopifyProduct.images?.[0]?.src || null,
      createdAtShopify: new Date(),
      updatedAtShopify: new Date(),
    },
    update: {
      title:            shopifyProduct.title,
      status:           shopifyProduct.status || 'draft',
      firstImageSrc:    shopifyProduct.images?.[0]?.src || null,
      updatedAtShopify: new Date(),
    },
  })

  // Upsert variant
  await db.variant.upsert({
    where:  { id: String(shopifyVariant.id) },
    create: {
      id:                String(shopifyVariant.id),
      productId:         String(shopifyProduct.id),
      title:             shopifyVariant.title || 'Default Title',
      sku:               shopifyVariant.sku    || null,
      barcode:           shopifyVariant.barcode || null,
      price:             parseFloat(shopifyVariant.price)   || 0,
      compareAtPrice:    parseFloat(shopifyVariant.compare_at_price) || null,
      inventoryItemId:   String(shopifyVariant.inventory_item_id),
      inventoryQuantity: shopifyVariant.inventory_quantity || 0,
    },
    update: {
      title:             shopifyVariant.title || 'Default Title',
      sku:               shopifyVariant.sku    || null,
      price:             parseFloat(shopifyVariant.price)   || 0,
      inventoryItemId:   String(shopifyVariant.inventory_item_id),
      inventoryQuantity: shopifyVariant.inventory_quantity || 0,
    },
  })

  // Fetch + upsert inventory levels so stock push works
  const { default: fetch } = await import('node-fetch')
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token  = process.env.SHOPIFY_ACCESS_TOKEN
  const invRes = await fetch(
    `https://${domain}/admin/api/2024-04/inventory_levels.json?inventory_item_ids=${shopifyVariant.inventory_item_id}&limit=250`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const invData    = await invRes.json()
  const invLevels  = invData.inventory_levels || []

  for (const level of invLevels) {
    await db.inventoryLevel.upsert({
      where:  { variantId_locationId: { variantId: String(shopifyVariant.id), locationId: String(level.location_id) } },
      create: { variantId: String(shopifyVariant.id), locationId: String(level.location_id), available: level.available || 0 },
      update: { available: level.available || 0 },
    })
  }

  console.log(`[MANUAL LINK] Mini-synced variant ${shopifyVariant.id} (${shopifyProduct.title}) with ${invLevels.length} inventory level(s)`)

  // Return in the same shape that the rest of the handler expects
  return {
    id:               String(shopifyVariant.id),
    sku:              shopifyVariant.sku    || null,
    barcode:          shopifyVariant.barcode || null,
    price:            parseFloat(shopifyVariant.price)   || 0,
    inventoryItemId:  String(shopifyVariant.inventory_item_id),
    inventoryLevels:  invLevels.map(l => ({ locationId: String(l.location_id), available: l.available })),
    product: {
      id:            String(shopifyProduct.id),
      title:         shopifyProduct.title,
      status:        shopifyProduct.status || 'draft',
      firstImageSrc: shopifyProduct.images?.[0]?.src || null,
    },
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user                                           = req.user
  const { posMatchId, shopifyVariantId, autoActivate } = req.body

  if (!posMatchId || !shopifyVariantId)
    return res.status(400).json({ error: 'posMatchId and shopifyVariantId required' })

  try {
    // Load POS match + POS product
    const posMatch = await db.posMatch.findUnique({
      where:   { id: posMatchId },
      include: { posProduct: true },
    })
    if (!posMatch) return res.status(404).json({ error: 'Match not found' })

    // Resolve Shopify variant (DB first, live Shopify API as fallback)
    const variant = await resolveVariant(shopifyVariantId)
    if (!variant) return res.status(404).json({ error: 'Shopify variant not found in DB or live Shopify API' })

    const pos   = posMatch.posProduct
    const total = pos.stockMain + pos.stockStore

    // 1. Update PosMatch
    const updated = await db.posMatch.update({
      where: { id: posMatchId },
      data: {
        shopifyVariantId: String(shopifyVariantId),
        matchType:   'manual',
        status:      'confirmed',
        confirmedBy: user.username,
        confirmedAt: new Date(),
        // refresh snapshot
        shopifyStock:  total,
        shopifyPrice:  variant.price,
        shopifyStatus: variant.product?.status ?? null,
      },
    })

    // 2. Push barcode to Shopify
    try {
      await updateVariant(String(shopifyVariantId), { barcode: pos.barcode })
    } catch (e) {
      console.error('[MANUAL LINK] barcode push failed:', e.message)
    }

    // 3. Push stock to all locations
    const pushErrors = []
    for (const level of variant.inventoryLevels) {
      try {
        await setInventoryLevel({
          inventoryItemId: Number(variant.inventoryItemId),
          locationId:      Number(level.locationId),
          available:       total,
        })
      } catch (e) {
        pushErrors.push(e.message)
      }
    }

    // 4. Refresh local Variant barcode + stock
    try {
      await db.variant.update({
        where: { id: String(shopifyVariantId) },
        data:  { barcode: pos.barcode, inventoryQuantity: total },
      })
    } catch (e) {
      console.error('[MANUAL LINK] local variant refresh failed:', e.message)
    }

    // 5. Auto-activate draft product if stock > 0 and toggle is on
    let activated = false
    if (autoActivate && total > 0 && variant.product?.status === 'draft') {
      try {
        await updateProduct(variant.product.id, { status: 'active' })
        await db.product.update({ where: { id: variant.product.id }, data: { status: 'active' } })
        await db.posMatch.update({ where: { id: posMatchId }, data: { shopifyStatus: 'active' } })
        activated = true
        console.log(`[MANUAL LINK] Auto-activated product ${variant.product.id}`)
      } catch (ae) {
        console.error(`[MANUAL LINK] Auto-activate failed:`, ae.message)
      }
    }

    console.log(`[MANUAL LINK] POS ${pos.barcode} → Variant ${shopifyVariantId} (${variant.product?.title}), stock=${total}${activated ? ', activated' : ''}`)

    return res.json({
      ok:          true,
      match:       updated,
      stockPushed: total,
      activated,
      pushErrors:  pushErrors.length ? pushErrors : undefined,
    })
  } catch (err) {
    console.error('[MANUAL LINK]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'manage_settings')
