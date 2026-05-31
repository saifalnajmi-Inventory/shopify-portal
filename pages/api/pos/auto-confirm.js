/**
 * POST /api/pos/auto-confirm
 * Called server-to-server by the SPF Wizard immediately after a product is pushed to Shopify.
 * Performs a targeted mini-sync of just that product, then auto-confirms the PosMatch link.
 *
 * Auth: x-sync-key header (same key as export-unmatched)
 *
 * Body: {
 *   posMatchId        string  — portal PosMatch.id
 *   shopifyProductId  string  — Shopify product id (number as string)
 *   shopifyVariantId  string  — Shopify first variant id (number as string)
 *   shopifyHandle     string  — for logging only
 * }
 *
 * Returns: { ok, linked, message }
 */

import db from '../../../lib/db'

const SHOPIFY_STORE  = process.env.SHOPIFY_STORE_DOMAIN
const SHOPIFY_TOKEN  = process.env.SHOPIFY_ACCESS_TOKEN

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth
  const key       = req.headers['x-sync-key']
  const validKeys = ['sync-proact-2026', process.env.INTERNAL_SYNC_KEY].filter(Boolean)
  if (!validKeys.includes(key)) {
    return res.status(401).json({ error: 'Unauthorized — include x-sync-key header' })
  }

  const { posMatchId, shopifyProductId, shopifyVariantId, shopifyHandle } = req.body

  if (!posMatchId || !shopifyProductId) {
    return res.status(400).json({ error: 'posMatchId and shopifyProductId required' })
  }

  try {
    // ── 1. Find the PosMatch ─────────────────────────────────────────────────
    const match = await db.posMatch.findUnique({
      where:   { id: posMatchId },
      include: { posProduct: true },
    })
    if (!match) {
      return res.status(404).json({ error: `PosMatch ${posMatchId} not found` })
    }
    if (match.status === 'confirmed') {
      return res.json({ ok: true, linked: false, message: 'Already confirmed' })
    }

    // ── 2. Mini-sync: fetch the just-pushed product from Shopify ────────────
    //    This creates the Product + Variant rows in the portal DB so we can link them.
    let shopifyVariantDbId = shopifyVariantId ? String(shopifyVariantId) : null
    let shopifyPrice       = null
    let shopifyStock       = null
    let shopifyStatus      = null

    if (SHOPIFY_STORE && SHOPIFY_TOKEN) {
      try {
        const r = await fetch(
          `https://${SHOPIFY_STORE}/admin/api/2024-01/products/${shopifyProductId}.json`,
          { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
        )
        if (r.ok) {
          const { product: sp } = await r.json()

          shopifyStatus = sp.status || null

          // Upsert Product
          await db.product.upsert({
            where:  { id: String(sp.id) },
            update: {
              title:         sp.title,
              status:        sp.status,
              publishedAt:   sp.published_at ? new Date(sp.published_at) : null,
              vendor:        sp.vendor || '',
              productType:   sp.product_type || '',
              tags:          sp.tags || '',
              handle:        sp.handle,
              syncedAt:      new Date(),
            },
            create: {
              id:            String(sp.id),
              title:         sp.title,
              status:        sp.status,
              publishedAt:   sp.published_at ? new Date(sp.published_at) : null,
              vendor:        sp.vendor || '',
              productType:   sp.product_type || '',
              tags:          sp.tags || '',
              handle:        sp.handle,
              firstImageSrc: (sp.images || [])[0]?.src || null,
              syncedAt:      new Date(),
            },
          })

          // Upsert all variants
          for (const v of sp.variants || []) {
            const vid = String(v.id)
            await db.variant.upsert({
              where:  { id: vid },
              update: {
                sku:               v.sku  || '',
                barcode:           v.barcode || '',
                price:             parseFloat(v.price) || 0,
                compareAtPrice:    v.compare_at_price ? parseFloat(v.compare_at_price) : null,
                inventoryQuantity: v.inventory_quantity || 0,
                inventoryItemId:   String(v.inventory_item_id),
                title:             v.title || 'Default Title',
                option1:           v.option1 || null,
                option2:           v.option2 || null,
                option3:           v.option3 || null,
                syncedAt:          new Date(),
              },
              create: {
                id:                vid,
                productId:         String(sp.id),
                sku:               v.sku  || '',
                barcode:           v.barcode || '',
                price:             parseFloat(v.price) || 0,
                compareAtPrice:    v.compare_at_price ? parseFloat(v.compare_at_price) : null,
                inventoryQuantity: v.inventory_quantity || 0,
                inventoryItemId:   String(v.inventory_item_id),
                title:             v.title || 'Default Title',
                option1:           v.option1 || null,
                option2:           v.option2 || null,
                option3:           v.option3 || null,
                syncedAt:          new Date(),
              },
            })
          }

          // Use the first variant if no specific one given
          const firstVariant = sp.variants?.[0]
          if (firstVariant) {
            shopifyVariantDbId = String(firstVariant.id)
            shopifyPrice       = parseFloat(firstVariant.price) || null
            shopifyStock       = firstVariant.inventory_quantity ?? null
          }
        }
      } catch (syncErr) {
        // Mini-sync failed — log but continue (we'll still set the link if we have the IDs)
        console.error('[AUTO-CONFIRM] Mini-sync failed:', syncErr.message)
      }
    }

    // ── 3. Verify the Variant row exists in the DB now ───────────────────────
    let variantExists = false
    if (shopifyVariantDbId) {
      const v = await db.variant.findUnique({ where: { id: shopifyVariantDbId } })
      variantExists = !!v
      if (v) {
        shopifyPrice = shopifyPrice ?? v.price
        shopifyStock = shopifyStock ?? v.inventoryQuantity
      }
    }

    // ── 4. Confirm the PosMatch ───────────────────────────────────────────────
    await db.posMatch.update({
      where: { id: posMatchId },
      data: {
        status:          'confirmed',
        matchType:       'spf_wizard',        // linked via SPF Wizard push
        confirmedBy:     'SPF Wizard',
        confirmedAt:     new Date(),
        shopifyVariantId: variantExists ? shopifyVariantDbId : undefined,
        shopifyPrice:    shopifyPrice  ?? undefined,
        shopifyStock:    shopifyStock  ?? undefined,
        shopifyStatus:   shopifyStatus ?? undefined,
        notes:           `Auto-confirmed by SPF Wizard push. Shopify product: ${shopifyProductId}${shopifyHandle ? ` (${shopifyHandle})` : ''}`,
      },
    })

    console.log(
      `[AUTO-CONFIRM] PosMatch ${posMatchId} confirmed → Shopify ${shopifyProductId}` +
      (variantExists ? ` (variant linked)` : ` (variant pending next sync)`)
    )

    return res.json({
      ok:      true,
      linked:  variantExists,
      message: variantExists
        ? `PosMatch confirmed and variant linked to Shopify product ${shopifyProductId}`
        : `PosMatch confirmed. Variant will be fully linked on next Shopify sync.`,
    })
  } catch (err) {
    console.error('[AUTO-CONFIRM]', err)
    return res.status(500).json({ error: err.message })
  }
}
