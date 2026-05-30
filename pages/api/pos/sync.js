/**
 * POST /api/pos/sync
 * Receives product + stock data from the PROACT GEN PowerShell agent.
 * Uses raw SQL to bypass any Prisma client caching issues.
 *
 * Auth: x-sync-key header
 */

import { db } from '../../../lib/db'

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
