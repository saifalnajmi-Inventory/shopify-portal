/**
 * GET  /api/admin/dedupe-notifications  — dry-run: duplicates + stale (already-restocked) alerts
 * POST /api/admin/dedupe-notifications  — delete duplicates, resolve stale alerts
 *
 * Two cleanups in one pass:
 *  1. Duplicates — restockEngine.js used to fire the OOS notification twice per
 *     event (fixed). Same productId + sku + oldValue + newValue + type='oos',
 *     created within 10s of each other. Keeps the more "progressed" one
 *     (resolved > read > unread), deletes the rest.
 *  2. Stale alerts — an open oos/low_stock notification whose product/variant
 *     is no longer actually out-of-stock/low in the DB (e.g. the auto-resolve-
 *     on-restock transition already fired before it existed, or a sync
 *     silently updated the number without a notification ever closing the
 *     loop). Matched via productId + variantName (same expression used when
 *     the alert was created — sku is often empty and unreliable to match on).
 */
import { withAuth } from '../../../lib/auth'
import db from '../../../lib/db'
import logger from '../../../lib/logger'

const STATUS_RANK = { resolved: 2, read: 1, unread: 0 }

async function findDuplicateGroups() {
  const notifications = await db.notification.findMany({
    where: { type: 'oos' },
    orderBy: [{ productId: 'asc' }, { sku: 'asc' }, { createdAt: 'asc' }],
  })

  const groups = []
  let current = null

  for (const n of notifications) {
    const key = `${n.productId}|${n.sku}|${n.oldValue}|${n.newValue}`
    const gap = current ? new Date(n.createdAt) - new Date(current.items[current.items.length - 1].createdAt) : null
    if (current && current.key === key && gap <= 10_000) {
      current.items.push(n)
    } else {
      current = { key, items: [n] }
      groups.push(current)
    }
  }

  return { total: notifications.length, dupGroups: groups.filter(g => g.items.length > 1) }
}

async function findStaleAlerts() {
  const openAlerts = await db.notification.findMany({
    where: { type: { in: ['oos', 'low_stock'] }, status: { not: 'resolved' } },
  })
  if (!openAlerts.length) return []

  const productIds = [...new Set(openAlerts.map(n => n.productId).filter(Boolean))]
  const variants = await db.variant.findMany({
    where:  { productId: { in: productIds } },
    select: { productId: true, title: true, inventoryQuantity: true },
  })

  const settingRows     = await db.globalSetting.findMany()
  const globalSettings  = Object.fromEntries(settingRows.map(r => [r.key, r.value]))
  const globalThreshold = parseInt(globalSettings.restock_threshold || '10', 10)

  const stale = []
  for (const n of openAlerts) {
    const v = variants.find(v =>
      v.productId === n.productId &&
      (v.title !== 'Default Title' ? v.title : null) === n.variantName
    )
    if (!v) continue // no matching variant found — leave alone, don't guess

    const stillApplies = n.type === 'oos'
      ? v.inventoryQuantity <= 0
      : v.inventoryQuantity < globalThreshold

    if (!stillApplies) stale.push(n)
  }
  return stale
}

async function handler(req, res) {
  const ctx = logger.fromReq(req)

  if (req.method === 'GET') {
    const [{ total, dupGroups }, staleAlerts] = await Promise.all([
      findDuplicateGroups(),
      findStaleAlerts(),
    ])
    const toDelete = dupGroups.reduce((sum, g) => sum + (g.items.length - 1), 0)

    return res.status(200).json({
      total,
      duplicateGroups: dupGroups.length,
      toDelete,
      staleCount: staleAlerts.length,
      sample: dupGroups.slice(0, 8).map(g => ({
        product: g.items[0].productName || g.key,
        copies:  g.items.length,
        statuses: g.items.map(i => i.status),
      })),
      staleSample: staleAlerts.slice(0, 8).map(n => ({
        product: n.productName || n.productId,
        type:    n.type,
        stock:   n.newValue,
      })),
    })
  }

  if (req.method === 'POST') {
    const [{ dupGroups }, staleAlerts] = await Promise.all([
      findDuplicateGroups(),
      findStaleAlerts(),
    ])
    const toDelete = []

    for (const g of dupGroups) {
      const sorted = [...g.items].sort((a, b) => {
        const rankDiff = STATUS_RANK[b.status] - STATUS_RANK[a.status]
        if (rankDiff !== 0) return rankDiff
        return new Date(a.createdAt) - new Date(b.createdAt)
      })
      const [, ...drop] = sorted
      toDelete.push(...drop.map(d => d.id))
    }

    let deleted = 0
    if (toDelete.length) {
      const result = await db.notification.deleteMany({ where: { id: { in: toDelete } } })
      deleted = result.count
    }

    let resolved = 0
    if (staleAlerts.length) {
      const result = await db.notification.updateMany({
        where: { id: { in: staleAlerts.map(n => n.id) } },
        data:  { status: 'resolved', resolvedAt: new Date(), resolvedBy: 'system:reconcile' },
      })
      resolved = result.count
    }

    logger.info('api/admin/dedupe-notifications', 'cleanup_run', `Deleted ${deleted} duplicates, resolved ${resolved} stale alerts`, {
      ...ctx, deleted, resolved, groups: dupGroups.length,
    })

    return res.status(200).json({ ok: true, deleted, resolved })
  }

  res.status(405).end()
}

export default withAuth(handler, 'delete_notifications')
