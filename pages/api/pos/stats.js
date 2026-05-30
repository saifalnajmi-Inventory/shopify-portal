/**
 * GET /api/pos/stats
 * Returns POS sync statistics for the dashboard.
 * Auth: super_admin only.
 */

import { db } from '../../../lib/db'
import { requireAuth } from '../../../lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res, ['super_admin'])
  if (!user) return

  try {
    const [
      totalPos,
      matchedCount,
      lastSync,
      lastMatch,
    ] = await Promise.all([
      db.posProduct.count(),
      db.posProduct.count({ where: { shopifyId: { not: null } } }),
      db.posSync.findFirst({ orderBy: { syncedAt: 'desc' } }),
      db.posProduct.findFirst({
        where: { shopifyId: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ])

    return res.status(200).json({
      ok: true,
      totalPos,
      matched: matchedCount,
      unmatched: totalPos - matchedCount,
      lastSyncedAt: lastSync?.syncedAt ?? null,
      lastSyncStats: lastSync
        ? { received: lastSync.productsReceived, upserted: lastSync.productsUpserted, errors: lastSync.errors }
        : null,
      lastMatchedAt: lastMatch?.updatedAt ?? null,
    })
  } catch (err) {
    console.error('[POS STATS]', err)
    return res.status(500).json({ error: err.message })
  }
}
