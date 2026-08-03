/**
 * GET  /api/admin/dedupe-notifications  — dry-run: count duplicate OOS notifications
 * POST /api/admin/dedupe-notifications  — delete the duplicates, keep one per event
 *
 * One-off cleanup for the restockEngine.js bug that fired the OOS notification
 * twice per event (fixed — see lib/restockEngine.js). Safe to remove once run.
 *
 * A duplicate pair = same productId + sku + oldValue + newValue + type='oos',
 * created within 10 seconds of each other. Keeps the more "progressed" one
 * (resolved > read > unread), deletes the rest.
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

async function handler(req, res) {
  const ctx = logger.fromReq(req)

  if (req.method === 'GET') {
    const { total, dupGroups } = await findDuplicateGroups()
    const toDelete = dupGroups.reduce((sum, g) => sum + (g.items.length - 1), 0)
    return res.status(200).json({
      total,
      duplicateGroups: dupGroups.length,
      toDelete,
      sample: dupGroups.slice(0, 8).map(g => ({
        product: g.items[0].productName || g.key,
        copies:  g.items.length,
        statuses: g.items.map(i => i.status),
      })),
    })
  }

  if (req.method === 'POST') {
    const { dupGroups } = await findDuplicateGroups()
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

    logger.info('api/admin/dedupe-notifications', 'duplicates_deleted', `Deleted ${deleted} duplicate OOS notifications`, {
      ...ctx, deleted, groups: dupGroups.length,
    })

    return res.status(200).json({ ok: true, deleted })
  }

  res.status(405).end()
}

export default withAuth(handler, 'delete_notifications')
