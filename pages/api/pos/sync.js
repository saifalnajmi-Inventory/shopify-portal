/**
 * POST /api/pos/sync
 * Receives product + stock data from the PROACT GEN sync agent.
 * Stores in PosProduct table. Does NOT touch Shopify automatically.
 *
 * Auth: INTERNAL_SYNC_KEY header (same key used by Shopify sync)
 */

import { db } from '../../../lib/db'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth check
  const key = req.headers['x-sync-key']
  if (key !== process.env.INTERNAL_SYNC_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { products, syncedAt, agentVersion } = req.body

  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'No products provided' })
  }

  try {
    let upserted = 0
    let errors   = 0

    for (const p of products) {
      try {
        await db.posProduct.upsert({
          where:  { barcode: String(p.barcode) },
          update: {
            name:          p.name         || '',
            price:         p.price        || 0,
            stockMain:     p.stockMain    || 0,
            stockStore:    p.stockStore   || 0,
            category:      p.category     || null,
            unit:          p.unit         || null,
            sku:           p.sku          || null,
            lastSyncedAt:  new Date(),
          },
          create: {
            barcode:       String(p.barcode),
            name:          p.name         || '',
            price:         p.price        || 0,
            stockMain:     p.stockMain    || 0,
            stockStore:    p.stockStore   || 0,
            category:      p.category     || null,
            unit:          p.unit         || null,
            sku:           p.sku          || null,
            lastSyncedAt:  new Date(),
          },
        })
        upserted++
      } catch {
        errors++
      }
    }

    // Log the sync
    await db.posSync.create({
      data: {
        productsReceived: products.length,
        productsUpserted: upserted,
        errors,
        agentVersion: agentVersion || 'unknown',
        syncedAt:     syncedAt ? new Date(syncedAt) : new Date(),
      }
    })

    return res.status(200).json({
      ok:       true,
      received: products.length,
      upserted,
      errors,
    })

  } catch (err) {
    console.error('[POS SYNC]', err)
    return res.status(500).json({ error: 'Sync failed', detail: err.message })
  }
}
