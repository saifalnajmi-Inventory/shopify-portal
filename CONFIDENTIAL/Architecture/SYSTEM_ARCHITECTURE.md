# SAIF AL NAJMI AI GROWTH OPERATING SYSTEM
## System Architecture Manual — CONFIDENTIAL

---

## Overview

A secure, multi-tenant, AI-powered Shopify growth intelligence portal built as SaaS.
Clients receive: URL + Username + Password only.
You retain: code, infrastructure, API keys, deployment control.

---

## Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Next.js 14 (Pages Router) | Already built, stable |
| Styling | Tailwind CSS | Fast, consistent |
| Language | JavaScript (Node.js 20) | Existing codebase |
| ORM | Prisma | Type-safe DB access |
| Database | PostgreSQL 16 | Multi-tenant, production-grade |
| Jobs | BullMQ + Redis | Background sync, AI agents |
| Auth | Custom JWT sessions (bcryptjs) | No vendor lock-in |
| Hosting | Hetzner CX32 + Coolify | Cheapest serious production |
| CDN | Cloudflare Free | SSL, DDoS, caching |
| Email | Resend | Transactional emails |
| Monitoring | BetterStack Free | Uptime + logs |

---

## Application Layers

```
Browser (HTTPS only)
    │
    ▼
Cloudflare (CDN + DDoS + SSL termination)
    │
    ▼
Hetzner VPS (Coolify-managed)
    │
    ├── Next.js App (port 3001)
    │       ├── Pages Router (UI)
    │       ├── API Routes (backend)
    │       └── Middleware (auth gate)
    │
    ├── PostgreSQL (port 5432, internal only)
    │
    └── Redis (port 6379, internal only)
            └── BullMQ Workers
                    ├── Shopify Sync Worker
                    ├── Meta Sync Worker
                    ├── Google Sync Worker
                    └── AI Analysis Worker
```

---

## Multi-Tenant Isolation

Every major table has `tenantId` column.
Prisma middleware automatically injects `WHERE tenantId = req.user.tenantId` on all queries.
A tenant can NEVER access another tenant's data — enforced at ORM layer, not just UI.

```
Tenant A (Store X)
  ├── Products (tenantId = A)
  ├── Orders   (tenantId = A)
  ├── Users    (tenantId = A)
  └── Settings (tenantId = A)

Tenant B (Store Y)
  ├── Products (tenantId = B)   ← completely isolated
  ├── Orders   (tenantId = B)
  └── ...

Super Admin (tenantId = NULL → sees ALL)
```

---

## Request Lifecycle

```
1. Browser → HTTPS request to yourdomain.com
2. Cloudflare → proxies to Hetzner VPS
3. Next.js Middleware → checks session cookie
   a. No cookie → redirect to /login
   b. Has cookie → validate token in DB
   c. Valid + correct role → allow request
   d. Insufficient role → 403
4. API Route → withAuth() wrapper validates again
5. Prisma query → automatically scoped by tenantId
6. Response → back to browser
```

---

## Security Layers

1. HTTPS everywhere (Cloudflare)
2. HTTP-only session cookies (no JS access)
3. SameSite=Lax cookies (CSRF protection)
4. bcryptjs password hashing (cost factor 12)
5. Session stored in DB (can be revoked server-side)
6. Rate limiting on /api/auth/login (5 attempts/minute)
7. tenantId isolation in all DB queries
8. Environment variables never exposed to frontend
9. Shopify tokens AES-256-GCM encrypted in DB
10. Input validation on all API routes

---

## Phase Roadmap

- Phase 0: Auth + RBAC (current)
- Phase 1: Multi-tenancy + Tenant management
- Phase 2: PostgreSQL + Hetzner deployment
- Phase 3: Meta + Google integration
- Phase 4: Attribution engine + AI agents
- Phase 5: Kuwait market intelligence
