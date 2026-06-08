/**
 * POST /api/pos/sync
 * Receives product + stock data from the PROACT GEN PowerShell agent.
 * Uses raw SQL to bypass any Prisma client caching issues.
 *
 * After upserting PosProduct data:
 *   - Detects stock changes on confirmed PosMatch rows
 *   - Pushes updated stock to Shopify for those products (fire-and-forget)
 *   - Auto-activates draft products that received stock > 0
 *
 * Auth: x-sync-key header
 */

import db from '../../../lib/db'
import { updateVariant, setInventoryLevel, adjustInventoryLevel, updateProduct } from '../../../lib/shopify'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const key = req.headers['x-sync-key']
  const validKeys = ['sync-proact-2026', process.env.INTERNAL_SYNC_KEY].filter(Boolean)
  if (!validKeys.includes(key)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const body = req.body || {}
  const { products, syncedAt, agentVersion } = body
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'No products provided' })
  }

  let upserted = 0
  let errors   = 0

  try {
    // Ensure PosProduct table exists (create if not)
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PosProduct" (
        id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        barcode          TEXT UNIQUE NOT NULL,
        name             TEXT NOT NULL DEFAULT '',
        price            DOUBLE PRECISION NOT NULL DEFAULT 0,
        "costPrice"      DOUBLE PRECISION NOT NULL DEFAULT 0,
        "stockMain"      INTEGER NOT NULL DEFAULT 0,
        "stockStore"     INTEGER NOT NULL DEFAULT 0,
        category         TEXT,
        unit             TEXT,
        sku              TEXT,
        status           TEXT,
        "lastSyncedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Ensure PosSync table exists
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PosSync" (
        id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "productsReceived" INTEGER NOT NULL DEFAULT 0,
        "productsUpserted" INTEGER NOT NULL DEFAULT 0,
        matched            INTEGER NOT NULL DEFAULT 0,
        errors             INTEGER NOT NULL DEFAULT 0,
        "agentVersion"     TEXT,
        "syncedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Upsert each product via raw SQL
    for (const p of products) {
      const barcode = String(p.barcode || '').trim()
      if (!barcode) { errors++; continue }

      try {
        await db.$executeRawUnsafe(`
          INSERT INTO "PosProduct"
            (id, barcode, name, price, "costPrice", "stockMain", "stockStore",
             category, unit, sku, status, "lastSyncedAt", "createdAt", "updatedAt")
          VALUES
            (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (barcode) DO UPDATE SET
            name           = EXCLUDED.name,
            price          = EXCLUDED.price,
            "costPrice"    = EXCLUDED."costPrice",
            "stockMain"    = EXCLUDED."stockMain",
            "stockStore"   = EXCLUDED."stockStore",
            category       = EXCLUDED.category,
            unit           = EXCLUDED.unit,
            sku            = EXCLUDED.sku,
            status         = EXCLUDED.status,
            "lastSyncedAt" = CURRENT_TIMESTAMP,
            "updatedAt"    = CURRENT_TIMESTAMP
        `,
          barcode,
          String(p.name || ''),
          Number(p.price)     || 0,
          Number(p.costPrice) || 0,
          Number(p.stockMain) || 0,
          Number(p.stockStore)|| 0,
          p.category || null,
          p.unit     || null,
          p.sku      || null,
          p.status   || null,
        )
        upserted++
      } catch (e) {
        console.error('[POS SYNC] upsert error:', e.message)
        errors++
      }
    }

    // Log sync run
    await db.$executeRawUnsafe(`
      INSERT INTO "PosSync"
        (id, "productsReceived", "productsUpserted", matched, errors, "agentVersion", "syncedAt", "createdAt")
      VALUES
        (gen_random_uuid()::text, $1, $2, 0, $3, $4, $5, CURRENT_TIMESTAMP)
    `,
      products.length,
      upserted,
      errors,
      agentVersion || 'ps-1.0',
      syncedAt ? new Date(syncedAt) : new Date(),
    ).catch(e => console.error('[POS SYNC] log error:', e.message))

    // ── Fire-and-forget: push stock changes to Shopify for confirmed products ──
    pushConfirmedStockChanges(products).catch(err =>
      console.error('[POS SYNC] Stock push error:', err)
    )

    return res.status(200).json({
      ok:       true,
      received: products.length,
      upserted,
      errors,
    })

  } catch (err) {
    console.error('[POS SYNC] Fatal:', err)
    return res.status(500).json({ error: err.message })
  }
}

/**
 * After every POS sync, find confirmed products whose POS stock changed
 * and apply the DELTA to Shopify inventory.
 *
 * WHY DELTA AND NOT OVERWRITE:
 *   Portal cannot write to the POS system. Shopify is the source of truth
 *   for online inventory. When POS reports "stock went from 10 → 8", it means
 *   2 units were sold in the physical store. We apply -2 to Shopify so that
 *   any online Shopify orders that already decremented inventory are preserved.
 *
 *   Example:
 *     POS: 10 → 8  (delta = -2, 2 sold in store)
 *     Shopify had 2 online orders → Shopify stock = 8
 *     Delta approach: Shopify 8 + (-2) = 6  ✅  (correctly reflects 4 total sold)
 *     Overwrite approach: set Shopify to 8   ❌  (loses the 2 online order decrements)
 *
 * Also auto-activates draft products that received stock > 0.
 */
async function pushConfirmedStockChanges(products) {
  // Build a barcode → new stock map from the incoming sync batch
  const stockMap = new Map()
  for (const p of products) {
    const barcode = String(p.barcode || '').trim()
    if (barcode) {
      stockMap.set(barcode, {
        stockMain:  Number(p.stockMain)  || 0,
        stockStore: Number(p.stockStore) || 0,
      })
    }
  }

  // Load all confirmed PosMatches that have a Shopify variant linked
  const confirmed = await db.posMatch.findMany({
    where: { status: 'confirmed', shopifyVariantId: { not: null } },
    include: {
      posProduct: true,
      variant: {
        include: {
          inventoryLevels: true,
          product: { select: { id: true, status: true } },
        },
      },
    },
  })

  let pushed = 0, activated = 0
  for (const match of confirmed) {
    if (!match.posProduct || !match.variant) continue

    const newStock = stockMap.get(match.posProduct.barcode)
    if (!newStock) continue  // not in this sync batch

    const oldPosTotal = (match.posStockMain || 0) + (match.posStockStore || 0)
    const newPosTotal = newStock.stockMain + newStock.stockStore

    // Calculate how many units were physically sold/added in the store since last sync
    const posDelta = newPosTotal - oldPosTotal

    if (posDelta === 0) continue  // no physical stock change — skip

    console.log(`[POS SYNC PUSH] ${match.posProduct.barcode} POS ${oldPosTotal}→${newPosTotal} (delta ${posDelta >= 0 ? '+' : ''}${posDelta})`)

    try {
      // Apply the POS delta RELATIVELY to each Shopify location.
      // This preserves any online Shopify order decrements that already happened.
      for (const level of match.variant.inventoryLevels) {
        await adjustInventoryLevel({
          inventoryItemId: Number(match.variant.inventoryItemId),
          locationId:      Number(level.locationId),
          adjustment:      posDelta,
        })
      }

      // Update our local variant snapshot (estimated — actual Shopify stock may differ due to online orders)
      const estimatedShopifyStock = Math.max(0, (match.shopifyStock ?? 0) + posDelta)
      await db.variant.update({
        where: { id: match.variant.id },
        data:  { inventoryQuantity: estimatedShopifyStock },
      })

      // Update PosMatch snapshots
      const matchUpdate = {
        posStockMain:  newStock.stockMain,
        posStockStore: newStock.stockStore,
        shopifyStock:  estimatedShopifyStock,
      }

      // Auto-activate draft product when POS stock goes from 0 to > 0.
      // Also sets published_at so the product is visible on the storefront —
      // status:'active' alone is NOT enough if published_at is null.
      if (newPosTotal > 0 && oldPosTotal === 0 && match.variant.product?.status === 'draft') {
        try {
          const now = new Date().toISOString()
          await updateProduct(match.variant.product.id, {
            status:       'active',
            published_at: now,           // ← required for storefront visibility
          })
          await db.product.update({
            where: { id: match.variant.product.id },
            data:  { status: 'active', publishedAt: new Date(now) },
          })
          matchUpdate.shopifyStatus = 'active'
          activated++
          console.log(`[POS SYNC PUSH] Auto-activated + published ${match.variant.product.id}`)
        } catch (ae) {
          console.error(`[POS SYNC PUSH] Auto-activate failed:`, ae.message)
        }
      }

      await db.posMatch.update({
        where: { id: match.id },
        data:  matchUpdate,
      })

      pushed++
    } catch (e) {
      console.error(`[POS SYNC PUSH] Failed for ${match.posProduct.barcode}:`, e.message)
    }
  }

  if (pushed > 0 || activated > 0) {
    console.log(`[POS SYNC PUSH] Done — ${pushed} delta adjustments pushed, ${activated} products activated`)
  }
}
