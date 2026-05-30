/**
 * POST /api/pos/sync
 * Receives product + stock data from the PROACT GEN PowerShell agent.
 * Upserts PosProduct records (raw POS data — never touched by matching logic).
 * Immediately auto-runs the background match engine after saving.
 *
 * Auth: x-sync-key header (INTERNAL_SYNC_KEY env var)
 */

import { db }          from '../../../lib/db'
import { runPosMatch } from '../../../lib/posMatch'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const VALID_KEY = process.env.INTERNAL_SYNC_KEY || 'sync-proact-2026'
  const key = req.headers['x-sync-key']
  if (key !== VALID_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { products, syncedAt, agentVersion } = req.body
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'No products provided' })
  }

  let upserted = 0
  let errors   = 0

  // ── 1. Upsert raw POS data ────────────────────────────────────────────────
  for (const p of products) {
    if (!p.barcode || !String(p.barcode).trim()) { errors++; continue }
    try {
      await db.posProduct.upsert({
        where:  { barcode: String(p.barcode).trim() },
        update: {
          name:         String(p.name  || ''),
          price:        Number(p.price)     || 0,
          costPrice:    Number(p.costPrice) || 0,
          stockMain:    Number(p.stockMain) || 0,
          stockStore:   Number(p.stockStore)|| 0,
          category:     p.category || null,
          unit:         p.unit     || null,
          sku:          p.sku      || null,
          status:       p.status   || null,
          lastSyncedAt: new Date(),
        },
        create: {
          barcode:      String(p.barcode).trim(),
          name:         String(p.name  || ''),
          price:        Number(p.price)     || 0,
          costPrice:    Number(p.costPrice) || 0,
          stockMain:    Number(p.stockMain) || 0,
          stockStore:   Number(p.stockStore)|| 0,
          category:     p.category || null,
          unit:         p.unit     || null,
          sku:          p.sku      || null,
          status:       p.status   || null,
          lastSyncedAt: new Date(),
        },
      })
      upserted++
    } catch {
      errors++
    }
  }

  // ── 2. Auto-run matching in background ────────────────────────────────────
  let matchResult = { total: 0, matched: 0, unmatched: 0 }
  try {
    matchResult = await runPosMatch()
  } catch (matchErr) {
    console.error('[POS SYNC] Match engine error:', matchErr)
    // Don't fail the whole sync if matching errors
  }

  // ── 3. Log the sync run ───────────────────────────────────────────────────
  await db.posSync.create({
    data: {
      productsReceived: products.length,
      productsUpserted: upserted,
      matched:          matchResult.matched,
      errors,
      agentVersion: agentVersion || 'unknown',
      syncedAt:     syncedAt ? new Date(syncedAt) : new Date(),
    },
  }).catch(e => console.error('[POS SYNC] Log error:', e))

  return res.status(200).json({
    ok:       true,
    received: products.length,
    upserted,
    errors,
    matched:  matchResult.matched,
    unmatched: matchResult.unmatched,
  })
}
