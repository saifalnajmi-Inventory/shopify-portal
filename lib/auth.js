/**
 * Auth library — sessions, RBAC, API route protection.
 * Server-side only. Never imported in pages/*.js directly.
 */

import bcrypt    from 'bcryptjs'
import crypto    from 'crypto'
import db        from './db'
import logger    from './logger'

// ── Roles & Permissions ────────────────────────────────────────────────────────

export const PERMISSIONS = {
  super_admin:  [
    'view_all', 'manage_users', 'manage_settings',
    'sync_shopify', 'push_inventory',
    'view_reports', 'export_reports', 'delete_notifications',
  ],
  client_admin: [
    'view_all', 'manage_users', 'manage_settings',
    'view_reports', 'export_reports',
  ],
  manager: [
    'view_all', 'sync_shopify', 'push_inventory',
    'view_reports', 'export_reports',
  ],
  viewer: ['view_all'],
}

export const ROLE_LABELS = {
  super_admin:  'Super Admin',
  client_admin: 'Client Admin',
  manager:      'Manager',
  viewer:       'Viewer',
}

/** Check whether a role has a permission */
export function can(role, permission) {
  return PERMISSIONS[role]?.includes(permission) ?? false
}

// ── Password hashing ───────────────────────────────────────────────────────────

export async function hashPassword(password) {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

// ── Sessions ───────────────────────────────────────────────────────────────────

const SESSION_DAYS = 30

export async function createSession(userId, req) {
  const token     = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await db.session.create({
    data: {
      userId,
      token,
      expiresAt,
      ipAddress: req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
               || req?.socket?.remoteAddress
               || null,
      userAgent: req?.headers?.['user-agent'] || null,
    },
  })

  return token
}

export async function getSessionUser(token) {
  if (!token) return null
  try {
    const session = await db.session.findUnique({
      where:   { token },
      include: { user: true },
    })
    if (!session)                       return null
    if (session.expiresAt < new Date()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {})
      return null
    }
    if (!session.user.active)           return null
    return session.user
  } catch {
    return null
  }
}

export async function deleteSession(token) {
  if (!token) return
  await db.session.deleteMany({ where: { token } }).catch(() => {})
}

// ── Cookie helpers ─────────────────────────────────────────────────────────────

export function serializeSessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  const maxAge = SESSION_DAYS * 24 * 60 * 60
  return `inv_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`
}

export function clearSessionCookie() {
  return `inv_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
}

// ── API route wrappers ─────────────────────────────────────────────────────────

/**
 * Wrap an API handler with session auth + optional permission check.
 *
 * Usage:
 *   export default withAuth(handler)               // requires view_all
 *   export default withAuth(handler, 'push_inventory')
 */
export function withAuth(handler, requiredPermission = 'view_all') {
  return async (req, res) => {
    const ctx   = logger.fromReq(req)
    const token = req.cookies?.inv_session

    if (!token) {
      logger.warn('auth', 'no_session', 'Request without session cookie', {
        ...ctx,
        permission: requiredPermission,
        method:     req.method,
        path:       req.url,
      })
      return res.status(401).json({ error: 'Not authenticated', requestId: ctx.requestId })
    }

    const user = await getSessionUser(token)
    if (!user) {
      res.setHeader('Set-Cookie', clearSessionCookie())
      logger.warn('auth', 'session_invalid', 'Session expired or user inactive', {
        ...ctx,
        method: req.method,
        path:   req.url,
      })
      return res.status(401).json({ error: 'Session expired or invalid', requestId: ctx.requestId })
    }

    if (requiredPermission && !can(user.role, requiredPermission)) {
      logger.warn('auth', 'permission_denied', `Permission denied — requires ${requiredPermission}`, {
        ...ctx,
        userId:     user.id,
        username:   user.username,
        role:       user.role,
        permission: requiredPermission,
        method:     req.method,
        path:       req.url,
      })
      return res.status(403).json({
        error:     `Requires '${requiredPermission}' permission. Your role: ${user.role}`,
        requestId: ctx.requestId,
      })
    }

    req.user = user
    logger.debug('auth', 'session_ok', 'Session validated', {
      ...ctx,
      userId:   user.id,
      username: user.username,
      role:     user.role,
    })
    return handler(req, res)
  }
}

/**
 * Like withAuth but also allows internal server-to-server calls
 * (e.g. autosync → sync). The caller must send:
 *   x-internal-key: <INTERNAL_SYNC_KEY from .env.local>
 */
export function withAuthOrInternal(handler, requiredPermission = 'sync_shopify') {
  return async (req, res) => {
    const ctx         = logger.fromReq(req)
    const internalKey = req.headers['x-internal-key']
    const envKey      = process.env.INTERNAL_SYNC_KEY

    if (internalKey && envKey && internalKey === envKey) {
      req.user = { id: 'internal', username: 'autosync', role: 'super_admin' }
      logger.debug('auth', 'internal_call', 'Internal server-to-server call authenticated', {
        ...ctx,
        username: 'autosync',
        path:     req.url,
      })
      return handler(req, res)
    }

    // Fall back to regular session auth
    return withAuth(handler, requiredPermission)(req, res)
  }
}
