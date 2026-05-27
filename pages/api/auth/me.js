/**
 * GET /api/auth/me
 * Returns the currently authenticated user + permissions.
 * Never returns passwordHash.
 */

import logger from '../../../lib/logger'
import { getSessionUser, PERMISSIONS, ROLE_LABELS } from '../../../lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const ctx   = logger.fromReq(req)
  const token = req.cookies?.inv_session

  if (!token) {
    logger.debug('auth/me', 'no_token', 'Session check — no cookie present', ctx)
    return res.status(401).json({ error: 'Not authenticated' })
  }

  const user = await getSessionUser(token)
  if (!user) {
    logger.debug('auth/me', 'session_expired', 'Session check — token expired or invalid', ctx)
    return res.status(401).json({ error: 'Session expired' })
  }

  logger.debug('auth/me', 'session_valid', 'Session check — valid', {
    ...ctx,
    userId:   user.id,
    username: user.username,
    role:     user.role,
  })

  return res.status(200).json({
    user: {
      id:          user.id,
      username:    user.username,
      name:        user.name,
      role:        user.role,
      roleLabel:   ROLE_LABELS[user.role] || user.role,
      lastLoginAt: user.lastLoginAt,
    },
    permissions: PERMISSIONS[user.role] || [],
  })
}
