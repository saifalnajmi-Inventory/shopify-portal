/**
 * POST /api/auth/change-password
 * Allows any authenticated user to change their own password.
 * Body: { currentPassword, newPassword }
 */

import db                         from '../../../lib/db'
import { withAuth, hashPassword } from '../../../lib/auth'
import logger                     from '../../../lib/logger'
import bcrypt                     from 'bcryptjs'

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const ctx = logger.fromReq(req)
  const { currentPassword, newPassword } = req.body || {}

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' })
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' })
  }

  // Load the full user row (with hash) from DB
  const user = await db.user.findUnique({ where: { id: req.user.id } })
  if (!user) return res.status(404).json({ error: 'User not found' })

  // Verify current password
  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) {
    logger.warn('api/auth/change-password', 'change_pw_wrong_current', 'Wrong current password', ctx)
    return res.status(400).json({ error: 'Current password is incorrect' })
  }

  const newHash = await hashPassword(newPassword)
  await db.user.update({ where: { id: user.id }, data: { passwordHash: newHash } })

  await db.auditLog.create({
    data: {
      userId:   user.id,
      username: user.username,
      action:   'change_password',
      detail:   'User changed their own password',
    },
  })

  logger.info('api/auth/change-password', 'change_pw_success', 'Password changed', ctx)
  return res.status(200).json({ ok: true })
}

export default withAuth(handler)
