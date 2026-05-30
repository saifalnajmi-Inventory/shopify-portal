/**
 * GET /api/pos/stats
 * Summary counts for the POS Sync dashboard.
 * Auth: super_admin only.
 */

import { db }         from '../../../lib/db'
import { requireAuth } from '../../../lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res, ['super_admin'])
  if (!user) return

  try {
    const [
      totalPos,
      matched,
      pending,
      unmatched,
      confirmed,
      lastSync,
    ] = await Promise.all([
      db.posProduct.count(),
      db.posMatch.count({ where: { shopifyVariantId: { not: null } } }),
      db.posMatch.count({ where: { status: 'pending'   } }),
      db.posMatch.count({ where: { status: 'unmatched' } }),
      db.posMatch.count({ where: { status: 'confirmed' } }),
      db.posSync.findFirst({ orderBy: { syncedAt: 'desc' } }),
    ])

    return res.status(200).json({
      ok: true,
      totalPos,
      matched,       // has a Shopify link (pending or confirmed)
      pending,       // auto-matched, awaiting review
      unmatched,     // no Shopify counterpart found
      confirmed,     // user approved the match
      lastSyncedAt:  lastSync?.syncedAt  ?? null,
      lastSyncStats: lastSync
        ? {
            received:  lastSync.productsReceived,
            upserted:  lastSync.productsUpserted,
            matched:   lastSync.matched,
            errors:    lastSync.errors,
          }
        : null,
    })
  } catch (err) {
    console.error('[POS STATS]', err)
    return res.status(500).json({ error: err.message })
  }
}
