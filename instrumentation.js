/**
 * instrumentation.js — Next.js 14 server startup hook.
 *
 * Runs ONCE when the Node.js server boots (including after Railway deploys).
 * This is the only reliable place to schedule background work — API-route
 * module state is reset on every deploy, so setInterval registered there
 * dies whenever Railway restarts the container.
 *
 * What it does:
 *  1. Waits 10 s for Prisma + Shopify to be ready
 *  2. Checks the last successful sync time from the DB
 *  3. Fires an immediate sync if data is stale (> AUTO_SYNC_HOURS old)
 *  4. Sets up a recurring sync every AUTO_SYNC_HOURS hours
 */

export async function register() {
  // Only run in the Node.js runtime — not in edge workers
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const AUTO_SYNC_HOURS  = 6
  const INTERVAL_MS      = AUTO_SYNC_HOURS * 60 * 60 * 1000
  const STARTUP_DELAY_MS = 10_000   // give Prisma time to connect on cold start

  // Build the base URL for internal HTTP calls
  // RAILWAY_PUBLIC_DOMAIN is injected automatically by Railway
  // Fall back to the known production URL, then localhost for local dev
  const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN
    || process.env.NEXT_PUBLIC_APP_URL
    || null

  const baseUrl = publicDomain
    ? `https://${publicDomain}`
    : `http://localhost:${process.env.PORT || 3001}`

  const syncKey = process.env.INTERNAL_SYNC_KEY || ''

  let syncRunning = false

  async function runSync(reason) {
    if (syncRunning) return
    syncRunning = true
    console.log(`[autosync] ▶ starting sync — reason: ${reason}`)
    try {
      const res  = await fetch(`${baseUrl}/api/sync`, {
        method:  'POST',
        headers: { 'x-internal-key': syncKey, 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => ({}))
      if (data.ok) {
        console.log(`[autosync] ✅ done — ${data.products ?? '?'} products · ${data.orders ?? '?'} orders` +
          (data.warnings?.length ? ` · ⚠️ ${data.warnings[0]}` : ''))
      } else {
        console.error('[autosync] ❌ sync API error:', data.error || JSON.stringify(data).slice(0, 200))
      }
    } catch (e) {
      console.error('[autosync] ❌ fetch failed:', e.message)
    } finally {
      syncRunning = false
    }
  }

  async function init() {
    // Dynamically import Prisma only inside the async fn so it doesn't break edge builds
    const { default: db } = await import('./lib/db.js')

    let needsImmediateSync = false
    try {
      const lastSync = await db.syncLog.findFirst({
        where:   { status: 'success' },
        orderBy: { startedAt: 'desc' },
      })
      const lastSyncAt  = lastSync?.completedAt ? new Date(lastSync.completedAt) : null
      const staleAfter  = new Date(Date.now() - INTERVAL_MS)
      needsImmediateSync = !lastSyncAt || lastSyncAt < staleAfter

      console.log(
        `[autosync] startup check — last sync: ${lastSyncAt?.toISOString() ?? 'never'}` +
        ` · ${needsImmediateSync ? 'STALE — will sync now' : 'fresh'}`
      )
    } catch (e) {
      // DB not ready yet — trigger sync anyway, it will retry internally
      console.warn('[autosync] DB check failed:', e.message, '— triggering sync anyway')
      needsImmediateSync = true
    }

    if (needsImmediateSync) {
      await runSync('stale on boot')
    }

    // Recurring sync every AUTO_SYNC_HOURS — runs for the lifetime of this process
    setInterval(() => runSync('scheduled'), INTERVAL_MS)
    console.log(`[autosync] scheduler armed — every ${AUTO_SYNC_HOURS}h · baseUrl: ${baseUrl}`)
  }

  // Arm the sync scheduler after warmup — prisma db push (in start script) already
  // ensures the DB schema is in sync before this process starts accepting requests.
  setTimeout(init, STARTUP_DELAY_MS)
}
