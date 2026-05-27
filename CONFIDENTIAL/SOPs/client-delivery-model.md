# Client Delivery Model — CONFIDENTIAL
## How This SaaS Is Sold and Delivered

---

## The Model in One Sentence

You develop on localhost, deploy to your own server, and give the client only a URL + username + password. The client accesses the portal from any browser. You keep everything else.

---

## What the Client Gets

| Item | Client Receives |
|---|---|
| Web URL | ✅ Yes — e.g. `https://portal.yourdomain.com` |
| Username | ✅ Yes |
| Password | ✅ Yes (must change on first login) |
| Source code | ❌ Never |
| GitHub access | ❌ Never |
| Server/SSH access | ❌ Never |
| Database access | ❌ Never |
| Shopify API token | ❌ Never |
| Environment variables | ❌ Never |
| Backend logic | ❌ Never |

---

## Development Flow

```
Your machine (localhost:3001)
   ↓  develop + test
GitHub (private repo — YOUR account)
   ↓  git push
Hetzner VPS + Coolify
   ↓  auto-deploy
Client browser (HTTPS)
```

1. You develop and test on `localhost:3001`
2. When ready, push to your private GitHub repo
3. Coolify auto-deploys to your server
4. Client opens `https://yourportal.com` in browser
5. Client logs in with their credentials
6. Client uses the dashboard — they never touch code or server

---

## Update Process

All updates are pushed by you:

1. Make changes locally on your machine
2. Test on localhost
3. `git push` to GitHub
4. Coolify auto-deploys (or you trigger deploy)
5. Zero downtime for the client
6. Client sees the update instantly on next page refresh

**The client is NEVER involved in updates.**

---

## Customization Policy

All customization requests must be documented as paid or free:

| Type | Default |
|---|---|
| Bug fix (broken feature) | Free |
| New feature request | **PAID** |
| UI change | **PAID** |
| New report/dashboard | **PAID** |
| Data integration | **PAID** |
| Emergency fix | Free (first occurrence) |

Customizations are **always paid** unless explicitly marked as free.

**Pricing formula:**
```
Customization Price = (Estimated Hours × Your Hourly Rate) + Risk Buffer
```

---

## Data Isolation (Multi-Tenant Future)

When you have multiple clients, each client's data is isolated:
- Each client has their own Shopify credentials stored encrypted in the DB
- A `tenantId` column on every data table ensures client A cannot see client B's data
- This is enforced at the database query level (Prisma middleware), not just in the UI

---

## Security Guarantees You Provide

1. **HTTPS only** — no HTTP access
2. **Credentials never stored in plain text** — bcrypt hashed passwords
3. **Session tokens expire** — 30-day automatic expiry
4. **RBAC enforced** — API routes check permissions server-side
5. **Shopify token encrypted** — never exposed to browser
6. **Audit log** — all logins, pushes, and user changes are logged

---

## What Happens If Client Leaves

1. Deactivate their user account in the Users panel
2. Delete their Shopify credentials from your database
3. Their data can be exported as CSV before deletion if they request it
4. You retain the platform — other clients are unaffected

---

## Recurring Revenue Model

```
Monthly Revenue = Number of Clients × Client Monthly Price
Monthly Cost    = Infrastructure (~€10–50) + Your Support Time
Monthly Profit  = Revenue − Cost
```

As you add more clients, infrastructure cost grows slowly (almost flat) while revenue grows linearly. This is the SaaS margin advantage.

---

## Client Onboarding Steps

1. Client pays first month
2. You create their Shopify private app and get the access token
3. You add the token to your server's environment variables (or per-tenant DB storage)
4. You create their user account via `/users` page
5. You send them: URL + username + temporary password
6. They log in and change their password
7. You trigger the first sync from your admin account
8. Client starts using the dashboard

**Total onboarding time: ~30–60 minutes per client**
