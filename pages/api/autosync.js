/**
 * GET /api/autosync
 *
 * Called once on app startup by the Layout component.
 * - Checks if the local DB has data and when it was last synced.
 * - If empty OR data is older than AUTO_SYNC_HOURS, kicks off a background sync.
 * - Also sets up a recurring sync interval for the server's lifetime.
 *
 * Returns immediately — sync runs in the background.
 */

import db from '../../lib/db'
import { withAuth } from '../../lib/auth'

const AUTO_SYNC_HOURS = 6                              // re-sync if data is older than this
const SYNC_INTERVAL_MS = AUTO_SYNC_HOURS * 60 * 60 * 1000

// ── Module-level state (survives between requests in the same Node process) ──
let scheduled    = false   // have we set up the interval yet?
let syncRunning  = false   // is a sync in progress?
let lastAutoSync = null    // timestamp of last auto-triggered sync

async function runBackgroundSync(baseUrl) {
  if (syncRunning) return
  syncRunning = true
  lastAutoSync = new Date()
  console.log('[autosync] ▶ background sync started…')
  try {
    const res  = await fetch(`${baseUrl}/api/sync`, {
      method:  'POST',
      headers: { 'x-internal-key': process.env.INTERNAL_SYNC_KEY || '' },
    })
    const data = await res.json()
    if (data.ok) {
      console.log(`[autosync] ✅ done — ${data.products} products · ${data.orders} orders` +
        (data.warnings?.length ? ` · ⚠️ ${data.warnings[0]}` : ''))
    } else {
      console.error('[autosync] ❌ sync returned error:', data.error)
    }
  } catch (e) {
    console.error('[autosync] ❌ fetch failed:', e.message)
  } finally {
    syncRunning = false
  }
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Build internal base URL from the incoming request
  const host     = req.headers.host || `localhost:${process.env.PORT || 3001}`
  const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  const baseUrl  = `${protocol}://${host}`

  // Query DB state
  const [lastSync, productCount] = await Promise.all([
    db.syncLog.findFirst({ where: { status: 'success' }, orderBy: { startedAt: 'desc' } }),
    db.product.count(),
  ])

  const lastSyncAt   = lastSync?.completedAt ? new Date(lastSync.completedAt) : null
  const staleAfter   = new Date(Date.now() - SYNC_INTERVAL_MS)
  const isEmpty      = productCount === 0
  const isStale      = !lastSyncAt || lastSyncAt < staleAfter
  const needsSync    = isEmpty || isStale

  // One-time setup per server lifetime
  if (!scheduled) {
    scheduled = true

    if (needsSync) {
      // Kick off immediately (500ms delay so the server is fully warmed up)
      setTimeout(() => runBackgroundSync(baseUrl), 500)
    }

    // Schedule recurring sync every AUTO_SYNC_HOURS regardless
    setInterval(() => runBackgroundSync(baseUrl), SYNC_INTERVAL_MS)
    console.log(
      `[autosync] scheduler set up — interval: ${AUTO_SYNC_HOURS}h` +
      (needsSync ? ` · immediate sync triggered (${isEmpty ? 'empty DB' : 'stale data'})` : ' · data is fresh')
    )
  }

  return res.status(200).json({
    status:       isEmpty ? 'empty' : isStale ? 'stale' : 'fresh',
    productCount,
    lastSync:     lastSyncAt?.toISOString() || null,
    syncRunning,
    needsSync,
    nextSyncIn:   lastSyncAt
      ? Math.max(0, Math.round((lastSyncAt.getTime() + SYNC_INTERVAL_MS - Date.now()) / 60000))
      : 0,
  })
}

export default withAuth(handler, 'view_all')
