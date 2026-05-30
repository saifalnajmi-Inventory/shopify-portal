/**
 * POST /api/auth/login
 * Validates credentials, creates a session, sets httpOnly cookie.
 *
 * Rate limit: max 5 failed attempts per IP per 15 minutes.
 * Uses a simple in-memory map — resets on server restart (acceptable for this scale).
 * No Redis or external dependency required.
 */

import db from '../../../lib/db'
import logger from '../../../lib/logger'
import {
  verifyPassword,
  createSession,
  serializeSessionCookie,
  PERMISSIONS,
} from '../../../lib/auth'

// ── In-memory rate limiter ────────────────────────────────────────────────────
// Structure: Map<ip, { count: number, resetAt: number }>
const loginAttempts = new Map()
const MAX_ATTEMPTS  = 5               // max failed attempts
const WINDOW_MS     = 15 * 60 * 1000 // 15-minute window

function getRateLimitEntry(ip) {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  // If no entry or window has expired, start fresh
  if (!entry || entry.resetAt < now) {
    const fresh = { count: 0, resetAt: now + WINDOW_MS }
    loginAttempts.set(ip, fresh)
    return fresh
  }
  return entry
}

function isRateLimited(ip) {
  const entry = getRateLimitEntry(ip)
  return entry.count >= MAX_ATTEMPTS
}

function recordFailedAttempt(ip) {
  const entry = getRateLimitEntry(ip)
  entry.count += 1
  loginAttempts.set(ip, entry)
}

function resetAttempts(ip) {
  loginAttempts.delete(ip)
}

// Clean up stale entries every 30 minutes so the map doesn't grow forever
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of loginAttempts.entries()) {
    if (entry.resetAt < now) loginAttempts.delete(ip)
  }
}, 30 * 60 * 1000)
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const ctx = logger.fromReq(req)
  const { username, password } = req.body || {}

  // ── Rate limit check ───────────────────────────────────────────────────────
  const ip = ctx.ip || 'unknown'
  if (isRateLimited(ip)) {
    logger.warn('auth/login', 'rate_limited', 'Login blocked — too many attempts', {
      ...ctx, attemptedUsername: username?.trim()?.toLowerCase(),
    })
    return res.status(429).json({
      error: 'Too many login attempts. Please wait 15 minutes and try again.',
      requestId: ctx.requestId,
    })
  }

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
      recordFailedAttempt(ip)
      logger.warn('auth/login', 'login_failed', 'Login failed — user not found or inactive', {
        ...ctx, attemptedUsername,
      })
      return res.status(401).json({ error: 'Invalid username or password', requestId: ctx.requestId })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      recordFailedAttempt(ip)
      logger.warn('auth/login', 'login_failed', 'Login failed — wrong password', {
        ...ctx, username: user.username, role: user.role,
      })
      return res.status(401).json({ error: 'Invalid username or password', requestId: ctx.requestId })
    }

    // Successful login — clear the rate limit counter for this IP
    resetAttempts(ip)

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
