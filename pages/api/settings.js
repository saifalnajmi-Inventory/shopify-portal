/**
 * GET  /api/settings  — return all global settings as { key: value } map
 * PUT  /api/settings  — upsert one or many settings { key, value } or [{ key, value }]
 *
 * GET  requires view_all
 * PUT  requires manage_settings (client_admin+)
 */
import db from '../../lib/db'
import { withAuth, can } from '../../lib/auth'
import logger from '../../lib/logger'

const DEFAULTS = {
  restock_threshold:    '10',
  restock_target:       '10',
  auto_push_enabled:    'false',
  notify_low_stock:     'true',
  notify_oos:           'true',
  notify_back_in_stock: 'true',
  notify_sync_fail:     'true',
}

async function handler(req, res) {
  const ctx = logger.fromReq(req)

  if (req.method === 'GET') {
    const rows   = await db.globalSetting.findMany()
    const stored = Object.fromEntries(rows.map(r => [r.key, r.value]))
    return res.status(200).json({ settings: { ...DEFAULTS, ...stored } })
  }

  if (req.method === 'PUT') {
    // PUT requires manage_settings
    if (!can(req.user.role, 'manage_settings')) {
      logger.warn('api/settings', 'permission_denied', 'Settings update blocked — insufficient role', ctx)
      return res.status(403).json({ error: 'Requires manage_settings permission' })
    }

    const body = Array.isArray(req.body) ? req.body : [req.body]
    const updatedKeys = []
    for (const { key, value } of body) {
      if (!key) continue
      await db.globalSetting.upsert({
        where:  { key },
        update: { value: String(value) },
        create: { key,  value: String(value) },
      })
      updatedKeys.push(key)
    }

    logger.info('api/settings', 'settings_updated', 'Global settings updated', {
      ...ctx,
      updatedKeys,
    })

    const rows   = await db.globalSetting.findMany()
    const stored = Object.fromEntries(rows.map(r => [r.key, r.value]))
    return res.status(200).json({ ok: true, settings: { ...DEFAULTS, ...stored } })
  }

  res.status(405).end()
}

export default withAuth(handler, 'view_all')
