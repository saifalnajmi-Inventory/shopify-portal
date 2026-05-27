/**
 * GET    /api/notifications           — list (filter: status, type, severity)
 * POST   /api/notifications           — create a notification
 * PATCH  /api/notifications           — bulk action: mark read/resolved, or single { id, action }
 * DELETE /api/notifications           — delete resolved notifications
 */
import { withAuth } from '../../../lib/auth'
import db from '../../../lib/db'
import logger from '../../../lib/logger'

async function handler(req, res) {
  const ctx = logger.fromReq(req)

  // ── LIST ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { status = '', type = '', severity = '', limit = '100' } = req.query
    const where = {}
    if (status)   where.status   = status
    if (type)     where.type     = type
    if (severity) where.severity = severity

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take:    parseInt(limit, 10) || 100,
      }),
      db.notification.count({ where: { status: 'unread' } }),
    ])

    return res.status(200).json({ notifications, unreadCount })
  }

  // ── CREATE ────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const {
      type, severity = 'info', productId, productName, variantName,
      sku, message, oldValue, newValue, actionType, actionData,
    } = req.body

    if (!type || !message) return res.status(400).json({ error: 'type and message required' })

    const notification = await db.notification.create({
      data: {
        type, severity,
        productId:   productId   || null,
        productName: productName || null,
        variantName: variantName || null,
        sku:         sku         || null,
        message,
        oldValue:    oldValue    !== undefined ? String(oldValue)   : null,
        newValue:    newValue    !== undefined ? String(newValue)   : null,
        actionType:  actionType  || null,
        actionData:  actionData  ? JSON.stringify(actionData) : null,
      },
    })

    logger.info('api/notifications', 'notification_created', `Notification created: ${type}`, {
      ...ctx,
      notificationType: type,
      severity,
      productName: productName || undefined,
    })
    return res.status(201).json({ ok: true, notification })
  }

  // ── BULK ACTIONS ──────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { ids, action, id } = req.body
    // Single item action
    if (id && action) {
      const data = {}
      if (action === 'read')     { data.status = 'read' }
      if (action === 'resolved') { data.status = 'resolved'; data.resolvedAt = new Date(); data.resolvedBy = 'admin' }
      if (action === 'unread')   { data.status = 'unread'; data.resolvedAt = null }
      const notification = await db.notification.update({ where: { id }, data })
      return res.status(200).json({ ok: true, notification })
    }
    // Bulk
    if (ids?.length && action) {
      const data = {}
      if (action === 'read')     { data.status = 'read' }
      if (action === 'resolved') { data.status = 'resolved'; data.resolvedAt = new Date(); data.resolvedBy = 'admin' }
      await db.notification.updateMany({ where: { id: { in: ids } }, data })
      return res.status(200).json({ ok: true, updated: ids.length })
    }
    // Mark ALL as read
    if (action === 'read_all') {
      const { count } = await db.notification.updateMany({
        where: { status: 'unread' },
        data:  { status: 'read' },
      })
      logger.info('api/notifications', 'notifications_read_all', 'All notifications marked as read', { ...ctx, count })
      return res.status(200).json({ ok: true, updated: count })
    }
    return res.status(400).json({ error: 'ids/id and action required' })
  }

  // ── DELETE resolved ───────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { ids } = req.body
    if (ids?.length) {
      await db.notification.deleteMany({ where: { id: { in: ids } } })
      return res.status(200).json({ ok: true })
    }
    // Delete all resolved
    const { count } = await db.notification.deleteMany({ where: { status: 'resolved' } })
    return res.status(200).json({ ok: true, deleted: count })
  }

  res.status(405).end()
}

export default withAuth(handler, 'view_all')
