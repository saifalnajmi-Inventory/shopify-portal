/**
 * POST /api/auth/login
 * Validates credentials, creates a session, sets httpOnly cookie.
 */

import db from '../../../lib/db'
import logger from '../../../lib/logger'
import {
  verifyPassword,
  createSession,
  serializeSessionCookie,
  PERMISSIONS,
} from '../../../lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const ctx = logger.fromReq(req)
  const { username, password } = req.body || {}

  if (!username?.trim() || !password) {
    logger.warn('auth/login', 'missing_credentials', 'Login attempt with missing fields', ctx)
    return res.status(400).json({ error: 'Username and password are required', requestId: ctx.requestId })
  }

  const attemptedUsername = username.trim().toLowerCase()

  try {
    const user = await db.user.findUnique({
      where: { username: attemptedUsername },
    })

    // Intentionally generic error — do not reveal whether username exists
    if (!user || !user.active) {
      logger.warn('auth/login', 'login_failed', 'Login failed — user not found or inactive', {
        ...ctx,
        attemptedUsername,
      })
      return res.status(401).json({ error: 'Invalid username or password', requestId: ctx.requestId })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      logger.warn('auth/login', 'login_failed', 'Login failed — wrong password', {
        ...ctx,
        username: user.username,
        role:     user.role,
      })
      return res.status(401).json({ error: 'Invalid username or password', requestId: ctx.requestId })
    }

    // Create session
    const token = await createSession(user.id, req)

    // Update last login timestamp
    await db.user.update({
      where: { id: user.id },
      data:  { lastLoginAt: new Date() },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId:    user.id,
        username:  user.username,
        action:    'login',
        detail:    `Login from ${ctx.ip || 'unknown'}`,
        ipAddress: ctx.ip || null,
      },
    })

    logger.info('auth/login', 'login_success', 'User logged in successfully', {
      ...ctx,
      userId:   user.id,
      username: user.username,
      role:     user.role,
    })

    res.setHeader('Set-Cookie', serializeSessionCookie(token))
    return res.status(200).json({
      ok: true,
      user: {
        id:          user.id,
        username:    user.username,
        name:        user.name,
        role:        user.role,
        permissions: PERMISSIONS[user.role] || [],
      },
    })
  } catch (err) {
    logger.error('auth/login', 'login_error', 'Login handler threw an unexpected error', {
      ...ctx,
      error: err,
    })
    return res.status(500).json({ error: 'Login failed — please try again', requestId: ctx.requestId })
  }
}
