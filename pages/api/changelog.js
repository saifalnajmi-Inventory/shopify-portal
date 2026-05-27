import { withAuth } from '../../lib/auth'
/**
 * GET /api/changelog
 * Returns paginated change log history.
 */

import db from '../../lib/db'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { page = '1', limit = '50', status = '', entityName = '' } = req.query
  const skip = (parseInt(page) - 1) * parseInt(limit)
  const take = parseInt(limit)

  const where = {}
  if (status)     where.status     = status
  if (entityName) where.entityName = { contains: entityName }

  const [logs, total] = await Promise.all([
    db.changeLog.findMany({ where, orderBy: { pushedAt: 'desc' }, skip, take }),
    db.changeLog.count({ where }),
  ])

  res.status(200).json({ logs, total, page: parseInt(page), totalPages: Math.ceil(total / take) })
}

export default withAuth(handler, 'view_all')
