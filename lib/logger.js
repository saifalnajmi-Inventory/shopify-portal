/**
 * lib/logger.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised structured logger for the Shopify Inventory Portal.
 *
 * ENVIRONMENT BEHAVIOUR
 *   Development  → coloured, human-readable console output
 *   Production   → single-line JSON written to stdout (captured by Coolify / PM2)
 *
 * SECURITY RULES — enforced automatically
 *   ✗ Never logs passwords, tokens, secrets, cookies, hashes, or env vars.
 *   ✗ Never exposes stack traces in production.
 *   ✓ All meta objects are sanitised before writing.
 *
 * USAGE
 *   import logger from '../lib/logger'
 *
 *   // Basic
 *   logger.info('auth/login', 'login_success', 'User logged in', { username, ip })
 *   logger.warn('auth', 'session_expired', 'Session not found', { requestId })
 *   logger.error('api/sync', 'shopify_fetch_failed', 'Products fetch failed', { error: err, requestId })
 *   logger.debug('db', 'query', 'Running upsert', { table: 'Variant', count: 42 })
 *
 *   // Extract request context (generates + caches requestId on the req object)
 *   const ctx = logger.fromReq(req)
 *   logger.info('api/quickpush', 'push_success', 'Stock updated', { ...ctx, variantId, newQty })
 *
 *   // Standalone requestId
 *   const id = logger.requestId()
 *
 * FUTURE — multi-tenant
 *   Add tenantId to req.user, fromReq() will pick it up automatically.
 */

import crypto from 'crypto'

// ── Constants ──────────────────────────────────────────────────────────────────

const IS_PROD  = process.env.NODE_ENV === 'production'
const IS_DEBUG = process.env.LOG_DEBUG === 'true' || !IS_PROD

// Any key whose lowercase form contains one of these strings is redacted.
const SENSITIVE_PATTERNS = [
  'password', 'passwordhash', 'hash',
  'token', 'sessiontoken', 'accesstoken',
  'secret', 'apikey', 'api_key',
  'authorization', 'cookie',
  'shopify_access_token', 'database_url',
  'internal_sync_key', 'jwt',
]

// Dev console colour codes
const COLOURS = {
  DEBUG: '\x1b[36m', // cyan
  INFO:  '\x1b[32m', // green
  WARN:  '\x1b[33m', // yellow
  ERROR: '\x1b[31m', // red
  RESET: '\x1b[0m',
  DIM:   '\x1b[2m',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Recursively strip sensitive keys from a meta object.
 * Objects and nested objects are walked; arrays are left as-is.
 */
function sanitize(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || depth > 5) {
    return obj
  }

  const safe = {}
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase()
    if (SENSITIVE_PATTERNS.some(p => lower.includes(p))) {
      safe[k] = '[REDACTED]'
    } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      safe[k] = sanitize(v, depth + 1)
    } else {
      safe[k] = v
    }
  }
  return safe
}

/**
 * Serialize an Error into a safe loggable object.
 * Stack traces are stripped in production.
 */
function serializeError(err) {
  if (!err || !(err instanceof Error)) return err
  return {
    message: err.message,
    name:    err.name,
    code:    err.code,
    ...(IS_PROD ? {} : { stack: err.stack?.split('\n').slice(0, 6).join('\n') }),
  }
}

/** Generate a short random request ID (8 hex chars = 4 bytes). */
function requestId() {
  return crypto.randomBytes(4).toString('hex')
}

/**
 * Extract standard context fields from a Next.js req object.
 * Generates and caches a requestId on the req object so it is
 * consistent across multiple log calls in the same request.
 */
function fromReq(req) {
  if (!req) return {}

  if (!req._logRequestId) {
    req._logRequestId = requestId()
  }

  const ip =
    req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    undefined

  return {
    requestId: req._logRequestId,
    userId:    req.user?.id       || undefined,
    username:  req.user?.username || undefined,
    role:      req.user?.role     || undefined,
    tenantId:  req.user?.tenantId || undefined, // ready for multi-tenant
    ip,
  }
}

// ── Core writer ────────────────────────────────────────────────────────────────

const TOP_LEVEL_KEYS = ['requestId', 'userId', 'username', 'role', 'tenantId', 'ip']

function writeLog(level, module, action, message, meta = {}) {
  if (level === 'debug' && !IS_DEBUG) return

  const timestamp = new Date().toISOString()

  // Pull error out before sanitising so we can serialise it properly
  const { error: rawError, ...restMeta } = meta
  const errorInfo = rawError instanceof Error
    ? serializeError(rawError)
    : rawError

  const safeMeta  = sanitize(restMeta)
  const safeError = rawError instanceof Error ? errorInfo : sanitize(errorInfo)

  // ── Structured entry (always built — used for JSON path) ──────────────────
  const entry = {
    timestamp,
    level:   level.toUpperCase(),
    module,
    action,
    message,
    // Top-level standard fields (present only if defined)
    ...(safeMeta.requestId !== undefined ? { requestId: safeMeta.requestId } : {}),
    ...(safeMeta.userId    !== undefined ? { userId:    safeMeta.userId }    : {}),
    ...(safeMeta.username  !== undefined ? { username:  safeMeta.username }  : {}),
    ...(safeMeta.role      !== undefined ? { role:      safeMeta.role }      : {}),
    ...(safeMeta.tenantId  !== undefined ? { tenantId:  safeMeta.tenantId }  : {}),
    ...(safeMeta.ip        !== undefined ? { ip:        safeMeta.ip }        : {}),
    // Remaining caller-supplied fields
    ...Object.fromEntries(
      Object.entries(safeMeta).filter(([k]) => !TOP_LEVEL_KEYS.includes(k))
    ),
    ...(safeError !== undefined ? { error: safeError } : {}),
  }

  // ── Production: JSON to stdout ─────────────────────────────────────────────
  if (IS_PROD) {
    process.stdout.write(JSON.stringify(entry) + '\n')
    return
  }

  // ── Development: coloured human-readable ──────────────────────────────────
  const c    = COLOURS
  const lvl  = entry.level
  const col  = COLOURS[lvl] || ''

  const badge = `${col}[${lvl.padEnd(5)}]${c.RESET}`
  const loc   = `${c.DIM}[${module} › ${action}]${c.RESET}`

  const ctxParts = [
    safeMeta.requestId ? `req:${safeMeta.requestId}` : null,
    safeMeta.username  ? `@${safeMeta.username}` : null,
    safeMeta.role      ? `(${safeMeta.role})` : null,
    safeMeta.ip        ? safeMeta.ip : null,
  ].filter(Boolean)

  const ctxStr = ctxParts.length
    ? ` ${c.DIM}· ${ctxParts.join('  ')}${c.RESET}`
    : ''

  // Extra meta to display (everything except top-level + error)
  const extraMeta = Object.fromEntries(
    Object.entries(safeMeta).filter(([k]) => !TOP_LEVEL_KEYS.includes(k))
  )
  const hasExtra = Object.keys(extraMeta).length > 0 || safeError !== undefined

  const line = `${c.DIM}${timestamp.slice(11, 23)}${c.RESET} ${badge} ${loc} ${message}${ctxStr}`

  if (hasExtra) {
    console.log(line, {
      ...extraMeta,
      ...(safeError !== undefined ? { error: safeError } : {}),
    })
  } else {
    console.log(line)
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

const logger = {
  /** General information — normal operation, completed actions. */
  info(module, action, message, meta = {}) {
    writeLog('info', module, action, message, meta)
  },

  /** Something unexpected but recoverable — partial failures, fallbacks. */
  warn(module, action, message, meta = {}) {
    writeLog('warn', module, action, message, meta)
  },

  /** An operation failed — always investigate. Error object safe to pass. */
  error(module, action, message, meta = {}) {
    writeLog('error', module, action, message, meta)
  },

  /** Verbose tracing — only emitted when LOG_DEBUG=true or in development. */
  debug(module, action, message, meta = {}) {
    writeLog('debug', module, action, message, meta)
  },

  /**
   * Extract standard context from a Next.js API request.
   * Call once at the top of a handler and spread the result into every log call.
   *
   * @param {import('http').IncomingMessage} req
   * @returns {{ requestId, userId, username, role, tenantId, ip }}
   */
  fromReq,

  /**
   * Generate a standalone requestId (use when you don't have a req object).
   * @returns {string} 8-char hex string
   */
  requestId,

  /**
   * Manually sanitise an object before including it in log meta.
   * Useful if you want to verify what will be logged before calling logger.
   */
  safe: sanitize,
}

export default logger
