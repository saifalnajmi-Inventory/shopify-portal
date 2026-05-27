# Windows Laptop & Cross-Device Testing Checklist — CONFIDENTIAL
## Run this before giving any client their login credentials

**Rule: Do NOT hand over the client URL until this checklist passes on Windows.**

---

## Pre-Test Requirements

Before starting any device test, confirm the following:

- [ ] Server is deployed and running (not localhost)
- [ ] URL is HTTPS — e.g. `https://portal.yourdomain.com`
- [ ] Admin password has been changed from `admin123`
- [ ] Client user account has been created with the correct role
- [ ] Client's temporary password is ready
- [ ] Shopify sync has been run at least once (dashboard has data)
- [ ] DNS has fully propagated (test: `nslookup portal.yourdomain.com` from a different network)

---

## Device 1: Mac Development Machine (Baseline)

*Complete this first to confirm the server is healthy before testing other devices.*

### Basic flow
- [ ] Open `https://portal.yourdomain.com` in Chrome
- [ ] Page loads (no certificate warning)
- [ ] Redirects to `/login` automatically
- [ ] Login form appears with correct styling
- [ ] Login with admin credentials → redirects to dashboard
- [ ] Dashboard shows product data and sync status
- [ ] Sidebar shows correct role badge (Super Admin)
- [ ] Logout button works → redirects to `/login`

### Session persistence
- [ ] Log in → close tab → reopen URL → already logged in (no re-login required)
- [ ] Log in → refresh page → still logged in

### Role restrictions (test as viewer)
- [ ] Create viewer account in `/users`
- [ ] Log in as viewer in a different browser / incognito window
- [ ] Sync button is NOT visible in sidebar
- [ ] `/users` page redirects to `/`
- [ ] Direct `fetch('/api/sync', {method:'POST'})` in console returns 403
- [ ] Direct `fetch('/api/quickpush', {method:'POST'})` in console returns 403

### Security checks
- [ ] View source → no API tokens, no passwords, no `.env` values visible
- [ ] DevTools Network tab → no `Authorization` headers with secrets
- [ ] `https://portal.yourdomain.com/api/dashboard` without login → returns 401
- [ ] `https://portal.yourdomain.com/.env.local` → 404 (not accessible)

---

## Device 2: Windows Laptop — REQUIRED BEFORE CLIENT HANDOVER

*Use Chrome on Windows. This is the most common client environment.*

### Setup
- [ ] Connected to a **different network** than your Mac (mobile hotspot, different WiFi, or VPN off)
- [ ] Using a fresh Chrome window (not your development profile)
- [ ] No browser extensions that might interfere

### Basic flow
- [ ] Navigate to `https://portal.yourdomain.com` in Chrome
- [ ] No certificate warning (SSL working)
- [ ] Login page loads with correct styling and fonts
- [ ] Login with **client credentials** (not admin) works
- [ ] Dashboard loads with product data
- [ ] All sidebar links work (Dashboard, Products, Notifications, etc.)
- [ ] Logout → back to `/login`

### Session persistence on Windows
- [ ] Log in → close all Chrome tabs → reopen `https://portal.yourdomain.com` → still logged in
- [ ] Log in → press F5 (refresh) → still logged in
- [ ] Log in → restart Chrome → still logged in (30-day session)

### Role-appropriate restrictions (as client)
- [ ] Viewer client: Sync button NOT visible
- [ ] Viewer client: Cannot reach `/users`
- [ ] Viewer client: Cannot push changes
- [ ] Manager client: Sync button IS visible
- [ ] Manager client: Can trigger sync
- [ ] Manager client: Cannot reach `/users`

### Network & cross-device checks
- [ ] URL opens from a mobile browser (test: scan QR code of the URL)
- [ ] No `localhost` references in Network tab requests
- [ ] No CORS errors in DevTools Console
- [ ] All API requests go to `https://portal.yourdomain.com/api/*` (not localhost)

### Edge browser (if client uses Edge)
- [ ] Repeat login test in Microsoft Edge on Windows
- [ ] Session works in Edge
- [ ] Logout works in Edge
- [ ] Edge Cookies are set (DevTools → Application → Cookies → check `inv_session`)

---

## Device 3: Mobile Browser (Optional but Recommended)

*Tests that the layout is usable on mobile — clients may check from their phone.*

- [ ] Open URL on iPhone/Android in Safari or Chrome
- [ ] Login page is readable and usable
- [ ] Mobile sidebar opens via hamburger menu
- [ ] Dashboard data is visible
- [ ] Logout works
- [ ] Session persists on mobile after closing and reopening browser

---

## Security Verification (From Any External Device)

*Confirm the client cannot accidentally access anything they should not.*

### Source code
- [ ] View source of dashboard page → no backend code, no tokens, no DB queries
- [ ] Only HTML, CSS, and JavaScript visible — no server-side logic

### Direct file access (all should return 404 or 401)
- [ ] `https://portal.yourdomain.com/.env.local` → 404
- [ ] `https://portal.yourdomain.com/.env` → 404
- [ ] `https://portal.yourdomain.com/prisma/schema.prisma` → 404
- [ ] `https://portal.yourdomain.com/lib/auth.js` → 404
- [ ] `https://portal.yourdomain.com/scripts/seed-admin.js` → 404

### API protection (unauthenticated)
- [ ] `https://portal.yourdomain.com/api/sync` (POST without login) → 401
- [ ] `https://portal.yourdomain.com/api/users` (GET without login) → 401
- [ ] `https://portal.yourdomain.com/api/settings` (PUT without login) → 401
- [ ] `https://portal.yourdomain.com/api/dashboard` (GET without login) → 401

### Cookie inspection (logged in as client)
- [ ] DevTools → Application → Cookies → `inv_session` exists
- [ ] `inv_session` has `HttpOnly` flag (cannot be read by JavaScript)
- [ ] `inv_session` has `Secure` flag (HTTPS only)
- [ ] `inv_session` has `SameSite=Lax`
- [ ] No Shopify token in any cookie

---

## Performance Checks

- [ ] Login page loads in under 2 seconds (from different network)
- [ ] Dashboard loads in under 3 seconds after sync
- [ ] Products page loads in under 3 seconds

---

## Final Handover Checklist

Complete before sending login credentials to client:

- [ ] ✅ All Device 2 (Windows) checks passed
- [ ] ✅ Client user account created with correct role (viewer / manager / client_admin)
- [ ] ✅ Temporary password set (client must change on first login — remind them)
- [ ] ✅ At least one Shopify sync completed — dashboard has real data
- [ ] ✅ HTTPS works — no certificate warning
- [ ] ✅ Session persists across refresh
- [ ] ✅ Client cannot access source code, tokens, or API without login
- [ ] ✅ Admin password is NOT the default `admin123`
- [ ] ✅ Monitoring is active (BetterStack / UptimeRobot — free tier is fine)
- [ ] ✅ You have a support channel with the client (WhatsApp / email)

---

## What to Send to the Client

Send ONLY these three things:

```
Portal URL:       https://portal.yourdomain.com
Username:         their_username
Temporary Password: TemporaryPass123!
```

Include this note:
> "Please log in and change your password on first login. Keep your password private.
> If you have any issues accessing the portal, contact me directly."

**Do NOT send:**
- Source code
- GitHub link
- Any API tokens
- Server IP address
- Any environment variables
- Instructions for logging into the server

---

## If the Client Reports an Issue

1. Ask them for: the **URL** they visited, the **browser and OS**, and what they see
2. Check server logs in Coolify for `login_failed` or `session_invalid` around that time
3. Check their user account in `/users` — is it Active?
4. If they're locked out: log in as admin → reset their password in `/users`
5. Never ask the client to share their password — reset it yourself and send them a new one

---

## Common Windows-Specific Issues

| Issue | Cause | Fix |
|---|---|---|
| Certificate warning on HTTPS | SSL cert not issued or domain not pointed | Check Coolify SSL settings, wait for DNS |
| Login works but redirects to `/login` again | Cookies blocked | Tell client to allow cookies for your domain (Chrome: Settings → Privacy → Cookies) |
| Page loads but no data | Sync hasn't run yet | Log in as admin and trigger a manual sync |
| "Network Error" toast | API call failed | Check server is running in Coolify |
| Session lost after browser restart | Client cleared cookies | Normal if they clear browsing data — just log in again |
| Login page looks broken (no CSS) | CDN / caching issue | Hard refresh: Ctrl+Shift+R on Windows |
| Edge shows different behaviour than Chrome | Edge default tracking protection | Test both — if only Edge fails, advise client to use Chrome |
