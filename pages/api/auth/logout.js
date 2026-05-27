/**
 * POST /api/auth/logout
 * Deletes the session and clears the cookie.
 */

import db from '../../../lib/db'
import logger from '../../../lib/logger'
import {
  getSessionUser,
  deleteSession,
  clearSessionCookie,
} from '../../../lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const ctx   = logger.fromReq(req)
  const token = req.cookies?.inv_session

  if (token) {
    try {
      // Get user before deleting session so we can write audit log
      const user = await getSessionUser(token)
      if (user) {
        await db.auditLog.create({
          data: {
            userId:    user.id,
            username:  user.username,
            action:    'logout',
            detail:    `Logout from ${ctx.ip || 'unknown'}`,
            ipAddress: ctx.ip || null,
          },
        })

        logger.info('auth/logout', 'logout_success', 'User logged out', {
          ...ctx,
          userId:   user.id,
          username: user.username,
          role:     user.role,
        })
      } else {
        logger.warn('auth/logout', 'logout_no_user', 'Logout called but session had no valid user', ctx)
      }
    } catch (err) {
      logger.error('auth/logout', 'logout_error', 'Error during logout audit', { ...ctx, error: err })
    }

    await deleteSession(token)
  } else {
    logger.debug('auth/logout', 'logout_no_token', 'Logout called with no session cookie', ctx)
  }

  res.setHeader('Set-Cookie', clearSessionCookie())
  return res.status(200).json({ ok: true })
}
