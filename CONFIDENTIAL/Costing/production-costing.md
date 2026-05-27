# Production Costing Report — CONFIDENTIAL
## Shopify Inventory Portal — First SaaS Client Deployment

---

## Deployment Options Comparison

### 1. Vercel + Neon/Supabase PostgreSQL

| Item | Cost |
|---|---|
| Vercel Pro | $20/month |
| Neon PostgreSQL (free tier) | $0 (limited to 0.5GB) |
| Neon Pro (if needed) | $19/month |
| Domain | ~$1/month |
| **Total** | **$21–$40/month** |

**Pros:** Zero devops, automatic deploys, global CDN  
**Cons:** ❌ BullMQ/background jobs do NOT work (60s timeout limit, serverless). Autosync scheduler will break. Cannot run persistent background processes.  
**Verdict:** ❌ NOT suitable for this app. The 6-hour autosync and restock engine require a persistent Node.js process.

---

### 2. Railway

| Item | Cost |
|---|---|
| App service (Hobby) | $5/month + usage (~$5–15) |
| PostgreSQL add-on | $5/month |
| Redis (if needed later) | $5/month |
| Domain (bring your own) | ~$1/month |
| **Total** | **~$20–30/month** |

**Pros:** Very easy deploy, Git push deploys, PostgreSQL included, persistent processes work  
**Cons:** Costs grow unpredictably with usage, limited SSH access, harder to debug  
**Verdict:** ✅ Good for MVP with 1–3 clients. Easy setup. Gets expensive at scale.

---

### 3. Render

| Item | Cost |
|---|---|
| Web Service (Starter) | $7/month |
| PostgreSQL (Starter) | $7/month |
| Domain | ~$1/month |
| **Total** | **~$15–20/month** |

**Pros:** Predictable pricing, auto-deploys from Git, persistent processes  
**Cons:** Spins down after inactivity on free tier (Starter tier doesn't spin down), limited regions  
**Verdict:** ✅ Solid choice for MVP. Slightly better pricing than Railway.

---

### 4. DigitalOcean VPS (Droplet)

| Item | Cost |
|---|---|
| Basic Droplet 2GB RAM | $12/month |
| Managed PostgreSQL (1GB) | $15/month |
| Domain | ~$1/month |
| Backups (20% of droplet) | $2.40/month |
| **Total** | **~$30–35/month** |

**Pros:** Full SSH access, reliable, good documentation  
**Cons:** More setup than Railway/Render, managed PG is expensive  
**Verdict:** ✅ Good for 5–20 clients. Self-managed PG (on same droplet) reduces cost to ~$15/month.

---

### 5. Hetzner VPS + Docker ⭐ RECOMMENDED

| Item | Cost |
|---|---|
| CX22 (2 vCPU, 4GB RAM) | €3.85/month |
| CX32 (4 vCPU, 8GB RAM) | €7.20/month |
| PostgreSQL (self-hosted on VPS) | €0 |
| Redis (self-hosted on VPS) | €0 |
| SSL (Let's Encrypt) | €0 |
| Domain | ~€1/month |
| Weekly backups (Hetzner snapshot) | €0.50–1/month |
| **Total CX22** | **~€6/month** |
| **Total CX32** | **~€10/month** |

**Pros:** Cheapest serious production setup, full SSH, persistent processes, PostgreSQL + Redis included at no extra cost, EU data centers  
**Cons:** Requires Linux/Docker knowledge, you manage security updates  
**Verdict:** ✅✅ BEST VALUE. Handles 30–50 clients on one CX32 box.

---

### 6. Coolify on Hetzner VPS ⭐⭐ BEST RECOMMENDATION

Same pricing as option 5, but with Coolify (free self-hosted PaaS) on top:

| Item | Cost |
|---|---|
| Hetzner CX32 | €7.20/month |
| Coolify (open-source PaaS) | €0 |
| Auto-SSL via Coolify | €0 |
| Git-based deployments | €0 |
| PostgreSQL via Coolify | €0 |
| Redis via Coolify | €0 |
| Domain | ~€1/month |
| Backups | ~€0.80/month |
| **Total** | **~€9–10/month** |

**Pros:**
- One-click PostgreSQL, Redis, SSL setup
- Push-to-deploy from GitHub
- Beautiful dashboard for managing services
- Full server control
- Handles 20–50 clients on one box
- Upgrade path is simple (just resize the VPS)

**Cons:** Initial setup takes ~2 hours  
**Verdict:** ✅✅✅ RECOMMENDED for first client and beyond.

---

## Cost Per Client at Scale (Hetzner + Coolify)

| Clients | VPS | AI APIs | Total/month | Per Client |
|---|---|---|---|---|
| 1 | €9 | ~$1 | ~€10 | ~€10 |
| 5 | €9 | ~$5 | ~€14 | ~€2.80 |
| 10 | €9 | ~$10 | ~€19 | ~€1.90 |
| 20 | €9 | ~$20 | ~€29 | ~€1.45 |
| 50 | €16* | ~$50 | ~€65 | ~€1.30 |
| 100 | €46** | ~$100 | ~€145 | ~€1.45 |

*Upgrade to CX42 (8 vCPU, 16GB RAM = €16/month)  
**Two CX52 servers or one larger instance

---

## What Is Free (Zero Cost)

- SSL certificate (Let's Encrypt via Coolify)
- CDN (Cloudflare Free)
- Monitoring (BetterStack free tier — 50 monitors)
- Email (Resend free — 3,000 emails/month)
- Shopify Admin API (included in client's Shopify plan)
- Meta Marketing API (free with rate limits)
- Google Ads API (free developer token)
- Domain is the only real non-negotiable cost

---

## What Becomes Paid Later

| Item | When It Matters | Cost |
|---|---|---|
| Larger VPS | >20 active clients | +€8/month |
| Managed PostgreSQL | >10GB data OR need point-in-time recovery | €14–30/month |
| Redis (Upstash) | If you separate Redis from VPS | $0.2/100k commands |
| AI API costs | AI analysis features used heavily | $10–50/month |
| Email (Resend Pro) | >3,000 emails/month | $20/month |
| Cloudflare Pro | Only if DDoS attacks or advanced WAF needed | $20/month |

---

## Infrastructure Cost vs. Maintenance Cost

| Item | Monthly Estimate |
|---|---|
| Server (Hetzner CX32) | €9 |
| Your time — patching/maintenance | ~4–6h/month |
| Your time — client support | ~2–4h/client/month |
| Your time — customizations | ~2–8h/request |

---

## Profit Formula

```
Monthly Profit = (Client Price × Number of Clients) − Infrastructure Cost − Support Time Cost

Example at 5 clients:
  Infrastructure = €14/month
  Support time   = 10h × your hourly rate
  
  If client price = KWD 100/month ≈ €295:
  Revenue = €1,475
  Infra   = €14
  Gross   = €1,461 (99% gross margin on infrastructure)
```

**Note:** Selling price is your decision. This report only shows infrastructure costs.  
Recommended formula: Price must cover infra + support time + desired profit margin.

---

## Recommended First Client Setup

1. **Register domain** — ~€10/year (~€1/month)
2. **Create Hetzner CX32** — €7.20/month
3. **Install Coolify** — free, takes 30 minutes
4. **Deploy app via Coolify** — connect GitHub, set env vars, done
5. **Add PostgreSQL via Coolify** — one click
6. **Point domain to server IP** — via Cloudflare (free proxy + SSL)
7. **Run seed script** — creates admin user
8. **Give client URL + username + password** — that's it

**Total first month cost: ~€10**  
**Time to set up: ~2–4 hours**
