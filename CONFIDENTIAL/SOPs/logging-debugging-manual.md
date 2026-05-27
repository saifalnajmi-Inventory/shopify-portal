# Logging & Debugging Manual — CONFIDENTIAL
## Shopify Inventory Portal — Internal Developer Reference

---

## Overview

All server-side activity is logged through `lib/logger.js`. Every log entry is
structured, timestamped, and sanitised — passwords, tokens, and cookies are
**never** written to logs.

---

## Log Format

### Development (human-readable)

```
12:34:56.789 [INFO ] [auth/login › login_success] User logged in · @admin  (super_admin)  127.0.0.1
12:34:57.001 [WARN ] [auth › permission_denied] Permission denied — requires sync_shopify { role: 'viewer', permission: 'sync_shopify' }
12:34:57.999 [ERROR] [api/sync › sync_failed] Shopify full sync failed { error: { message: '429 Too Many Requests', code: undefined } }
```

### Production (JSON, one line per entry)

```json
{"timestamp":"2026-05-24T12:34:56.789Z","level":"INFO","module":"auth/login","action":"login_success","message":"User logged in successfully","requestId":"a1b2c3d4","userId":"cm...","username":"admin","role":"super_admin","ip":"1.2.3.4"}
{"timestamp":"2026-05-24T12:34:57.001Z","level":"WARN","module":"auth","action":"permission_denied","message":"Permission denied — requires sync_shopify","requestId":"e5f6a7b8","username":"john","role":"viewer"}
```

---

## Log Fields Reference

| Field       | Always present | Description |
|---|---|---|
| `timestamp` | ✅ | ISO 8601 UTC |
| `level`     | ✅ | INFO / WARN / ERROR / DEBUG |
| `module`    | ✅ | Source file/layer (e.g. `auth/login`, `api/sync`) |
| `action`    | ✅ | Specific event (e.g. `login_success`, `sync_failed`) |
| `message`   | ✅ | Human-readable summary |
| `requestId` | When available | 8-char hex — trace a single HTTP request across all logs |
| `userId`    | When authenticated | Prisma User `id` |
| `username`  | When authenticated | Login username |
| `role`      | When authenticated | `super_admin` / `client_admin` / `manager` / `viewer` |
| `tenantId`  | Future | Multi-tenant client ID (reserved) |
| `ip`        | When available | Client IP from `x-forwarded-for` or socket |
| `error`     | On errors | `{ message, name, code }` — no stack traces in production |

---

## Log Levels

| Level   | When to use |
|---|---|
| `INFO`  | Normal operations completed — login, sync done, rule saved |
| `WARN`  | Unexpected but non-fatal — bad credentials, permission denied, scope missing |
| `ERROR` | An operation failed and needs attention |
| `DEBUG` | Verbose tracing — session validation, internal calls. Only visible in dev or when `LOG_DEBUG=true` |

---

## Reading Logs in Production

### Via Coolify (recommended)

1. Open Coolify dashboard → your app → **Logs** tab
2. Logs stream in real-time
3. Each line is one JSON object — use the Coolify search bar to filter

### Via SSH

```bash
# Tail live logs
docker logs -f <container_id> 2>&1

# Filter by level
docker logs <container_id> 2>&1 | grep '"level":"ERROR"'

# Filter by user
docker logs <container_id> 2>&1 | grep '"username":"john"'

# Filter by requestId (trace a single request)
docker logs <container_id> 2>&1 | grep '"requestId":"a1b2c3d4"'

# Filter by action
docker logs <container_id> 2>&1 | grep '"action":"sync_failed"'
```

### Parse JSON logs with jq (most powerful)

```bash
# Pretty-print last 100 ERROR entries
docker logs <container_id> 2>&1 | grep '"level":"ERROR"' | tail -100 | jq .

# Show all login failures in the last hour
docker logs <container_id> 2>&1 | jq 'select(.action == "login_failed")' 2>/dev/null

# Show what a specific user did
docker logs <container_id> 2>&1 | jq 'select(.username == "john")' 2>/dev/null
```

---

## What Each Action Means

### Auth actions

| Action | Level | Meaning |
|---|---|---|
| `login_success` | INFO | User logged in successfully |
| `login_failed` | WARN | Wrong password or user not found |
| `login_error` | ERROR | Unexpected DB error during login |
| `logout_success` | INFO | User logged out cleanly |
| `logout_no_user` | WARN | Logout called but session was already expired |
| `no_session` | WARN | Protected route hit with no cookie |
| `session_invalid` | WARN | Cookie present but token not in DB / expired |
| `session_ok` | DEBUG | Session validated (high frequency — debug only) |
| `permission_denied` | WARN | Valid session but wrong role for this action |
| `internal_call` | DEBUG | Autosync server-to-server call authenticated |

### Sync actions

| Action | Level | Meaning |
|---|---|---|
| `sync_started` | INFO | Full Shopify sync initiated |
| `sync_complete` | INFO | Sync finished — includes counts and duration |
| `sync_failed` | ERROR | Fatal sync error — Shopify API down, token invalid |
| `locations_skipped` | WARN | `read_locations` scope missing — add it in Shopify |
| `inventory_levels_skipped` | WARN | Inventory breakdown unavailable |
| `collections_skipped` | WARN | `read_product_listings` scope issue |
| `orders_skipped` | WARN | `read_orders` scope issue |
| `restock_check_skipped` | WARN | Restock engine threw unexpectedly |

### User management actions

| Action | Level | Meaning |
|---|---|---|
| `user_created` | INFO | New user account created |
| `user_updated` | INFO | User role / name / password changed |
| `user_deleted` | INFO | User account deleted |
| `user_create_conflict` | WARN | Duplicate username attempted |
| `user_create_error` | ERROR | DB error during user creation |

### Other actions

| Action | Level | Meaning |
|---|---|---|
| `push_success` | INFO | Quick push to Shopify succeeded |
| `push_failed` | ERROR | Shopify rejected the update |
| `settings_updated` | INFO | Global settings changed |
| `rule_saved` | INFO | Restock rule created or updated |
| `rule_toggled` | INFO | Rule enabled/disabled/threshold changed |
| `rule_deleted` | INFO | Restock rule removed |
| `notification_created` | INFO | System notification generated |
| `notifications_read_all` | INFO | All notifications marked as read |

---

## Common Errors and Fixes

### Login Errors

**Problem:** `login_failed` with `attemptedUsername` in log
```json
{"action":"login_failed","message":"Login failed — user not found or inactive","attemptedUsername":"admin"}
```
**Fix:** User doesn't exist yet, or account was deactivated. Run `node scripts/seed-admin.js` if first time.

---

**Problem:** `login_failed` with `username` (user exists, wrong password)
```json
{"action":"login_failed","message":"Login failed — wrong password","username":"admin"}
```
**Fix:** Password is wrong. Reset via Users page as super_admin, or re-seed.

---

**Problem:** `login_error` with Prisma error
```json
{"action":"login_error","error":{"message":"Can't reach database server","code":"P1001"}}
```
**Fix:** Database is not running. Check:
```bash
# Is PostgreSQL container up?
docker ps | grep postgres

# Check DB connection
npx prisma db push
```

---

### Session / Auth Errors

**Problem:** `no_session` on every request from a user
**Cause:** Cookie not being set or sent.
**Fix:**
1. Check `NODE_ENV` is set correctly — `Secure` flag on cookies requires HTTPS
2. On HTTP (dev): cookie works fine without Secure
3. On production HTTP (misconfigured): browsers block Secure cookies over HTTP — enable HTTPS

---

**Problem:** `session_invalid` immediately after login
**Cause:** Session token in DB was cleaned up or DB was reset.
**Fix:** Log out, log back in. If persistent, check `Session` table in DB.

---

**Problem:** `permission_denied` for a valid user
**Cause:** User role doesn't have the required permission.
**Fix:** Check the user's role in `/users`. Promote if needed.

---

### Shopify API Errors

**Problem:** `sync_failed` with `401 Unauthorized`
```json
{"action":"sync_failed","error":{"message":"[Shopify] 401 Unauthorized"}}
```
**Fix:** The Shopify access token is invalid or revoked.
1. Go to Shopify Admin → Apps → Private apps (or Custom apps)
2. Re-generate the token
3. Update `SHOPIFY_ACCESS_TOKEN` in your `.env.local` (dev) or Coolify env vars (prod)
4. Restart the server

---

**Problem:** `sync_failed` with `429 Too Many Requests`
```json
{"action":"sync_failed","error":{"message":"[Shopify] 429 Too Many Requests"}}
```
**Fix:** Hit Shopify API rate limit. Wait 30–60 seconds and retry. For large catalogues,
the sync code already uses page-based fetching — this is usually transient.

---

**Problem:** `locations_skipped` on every sync
```
"message":"Locations step skipped — missing read_locations scope"
```
**Fix:** Add `read_locations` scope to your Shopify Private App.
Go to Shopify Admin → Apps → Edit Private App → check `read_locations` → Save → update token.

---

**Problem:** `push_failed` with `422 Unprocessable Entity`
```json
{"action":"push_failed","error":{"message":"[Shopify] 422"}}
```
**Fix:** The value being pushed is invalid (e.g. negative inventory, invalid price format).
Check the `afterValue` in the log entry.

---

### Database Errors

**Problem:** Prisma `P1001` — Can't reach DB server
```bash
# Check DATABASE_URL in env
echo $DATABASE_URL

# Test connection
npx prisma db push
```

**Problem:** Prisma `P2002` — Unique constraint failed
Usually on duplicate username creation — handled gracefully with 409 response.

**Problem:** Prisma `P2025` — Record not found on update/delete
The client sent a stale ID. Refresh the page and try again.

**Problem:** Schema out of sync after deploy
```bash
npx prisma migrate deploy
# or for dev:
npx prisma db push
```

---

### Deployment Errors

**Problem:** App crashes on startup with `MODULE_NOT_FOUND`
**Fix:** Dependencies not installed. Run `npm install`.

**Problem:** App crashes with `PrismaClientInitializationError`
**Fix:** `DATABASE_URL` env var is missing or wrong in Coolify.

**Problem:** HTTPS redirect loop
**Fix:** Check Coolify SSL settings. Ensure `NODE_ENV=production` is set.
The app sets `Secure` on cookies only in production — if NODE_ENV is wrong, cookies won't work.

**Problem:** `INTERNAL_SYNC_KEY` not set → autosync fails silently
**Fix:** Run `node scripts/seed-admin.js` — it auto-generates and appends the key.

---

## Sharing Error Info Without Exposing Secrets

When asking for help (developer forum, colleague, support):

✅ **Safe to share:**
- The `requestId` from the error toast or log entry
- The `action`, `module`, `message` fields from logs
- The error `message` (NOT the full stack trace)
- The HTTP status code and route path

❌ **Never share:**
- `DATABASE_URL` (contains DB credentials)
- `SHOPIFY_ACCESS_TOKEN` (full API access to Shopify store)
- `INTERNAL_SYNC_KEY` (bypasses auth on sync route)
- Full `.env.local` file
- Any log line containing `[REDACTED]` fields
- Stack traces from production (may expose file paths)

**How to share a specific error for debugging:**
```
Route:     POST /api/sync
RequestId: a1b2c3d4
Action:    sync_failed
Message:   Shopify full sync failed
Error msg: [Shopify] 429 Too Many Requests
Time:      2026-05-24T12:34:56Z
```

That is everything needed to diagnose — no secrets exposed.

---

## Enabling Debug Logs

Debug logs (`logger.debug(...)`) are only printed in development by default.

To enable in production temporarily for deep tracing:

```bash
# In Coolify — add env var:
LOG_DEBUG=true

# Restart the app — debug logs will appear in Coolify logs
# IMPORTANT: Remove LOG_DEBUG when done — it generates a lot of output
```

---

## Future — Multi-Tenant Logging

When multi-tenancy is added:
- `req.user.tenantId` will be set during session validation
- `logger.fromReq(req)` will automatically include `tenantId` in every log entry
- Filter all logs for a specific client: `jq 'select(.tenantId == "client_abc")'`
- No code changes needed in individual routes — the logger handles it centrally

---

## Logger API Reference

```javascript
import logger from '../lib/logger'

// Signatures
logger.info(module, action, message, meta)
logger.warn(module, action, message, meta)
logger.error(module, action, message, meta)
logger.debug(module, action, message, meta)

// Extract standard context from req (call once per handler, spread everywhere)
const ctx = logger.fromReq(req)
// Returns: { requestId, userId, username, role, tenantId, ip }

// Generate standalone requestId (when no req object available)
const id = logger.requestId()

// Manually sanitise an object before logging
const safe = logger.safe({ someObj: { password: 'x', name: 'y' } })
// Returns: { someObj: { password: '[REDACTED]', name: 'y' } }
```

**Pattern for API handlers:**

```javascript
async function handler(req, res) {
  const ctx = logger.fromReq(req)  // once at top

  try {
    // ... do work ...
    logger.info('api/my-route', 'action_done', 'Short description', {
      ...ctx,              // always spread ctx
      extraField: value,   // any additional safe metadata
    })
    return res.status(200).json({ ok: true })
  } catch (err) {
    logger.error('api/my-route', 'action_failed', 'Operation failed', {
      ...ctx,
      error: err,          // pass Error object directly — logger serialises it safely
    })
    return res.status(500).json({
      error: 'Something went wrong — please try again',
      requestId: ctx.requestId,  // safe to expose — lets user report the right log entry
    })
  }
}
```

**Security reminders:**
- Never pass `req.body` directly to meta — it may contain passwords
- Never pass `process.env` to meta
- Never log `token`, `cookie`, or `passwordHash` values
- The logger auto-redacts these even if accidentally passed
