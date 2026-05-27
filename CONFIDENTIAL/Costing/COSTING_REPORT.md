# COSTING REPORT — CONFIDENTIAL
## SAIF AL NAJMI AI GROWTH OPERATING SYSTEM

---

## 1. Infrastructure — Recommended Stack (Hetzner + Coolify)

| Component | Monthly Cost | Notes |
|---|---|---|
| Hetzner CX32 (4 vCPU, 8GB, 80GB) | €7.20 | App + PostgreSQL + Redis |
| Domain (.com) | €1.00 | ~€12/year |
| SSL Certificate | €0.00 | Let's Encrypt via Coolify |
| CDN (Cloudflare Free) | €0.00 | SSL, DDoS, caching |
| Backups (Hetzner snapshots) | €0.80 | Weekly, ~40GB |
| Email (Resend Free 3k/mo) | €0.00 | Alerts, password reset |
| Monitoring (BetterStack Free) | €0.00 | Uptime checks |
| **Base Infrastructure Total** | **€9.00/month** | |

## 2. API Costs

| API | Cost Model | Estimated/month |
|---|---|---|
| Shopify Admin API | Free | €0 |
| Meta Marketing API | Free | €0 |
| Google Ads API | Free (developer token) | €0 |
| Claude AI (AI agents) | ~$0.003/1k tokens | $1-10 per client |
| **API Total (10 clients)** | | **~$10-50** |

## 3. Cost Per Client at Scale

| # Clients | Server | AI APIs | Total/mo | Cost/client |
|---|---|---|---|---|
| 1 | €9 | $1 | €10 | €10 |
| 5 | €9 | $5 | €14 | €2.80 |
| 10 | €9 | $10 | €19 | €1.90 |
| 20 | €9 | $20 | €29 | €1.45 |
| 50 | €16* | $50 | €65 | €1.30 |
| 100 | €46** | $100 | €145 | €1.45 |

*Upgrade to CX42 (8 vCPU, 16GB) = €16/mo
**2× CX52 or CX62 = €46/mo

## 4. Gross Margin (charging KWD 100/client ≈ €295)

| Clients | Revenue KWD | Revenue € | Cost € | Margin |
|---|---|---|---|---|
| 5 | 500 | 1,475 | 14 | 99% |
| 10 | 1,000 | 2,950 | 19 | 99.4% |
| 50 | 5,000 | 14,750 | 65 | 99.6% |

## 5. What Gets Expensive (Watch List)

| Risk | Trigger | Fix |
|---|---|---|
| AI API costs | >1,000 AI runs/day | Cache results, batch overnight |
| DB size | >10GB | Migrate to managed PG (€14/mo) |
| RAM pressure | >80% sustained | Upgrade to CX42 |
| Bandwidth | >10TB/mo | Cloudflare caching is already free |
| Support burden | >20 clients | Build client self-service portal |

## 6. Maintenance Time Budget

| Task | Frequency | Hours |
|---|---|---|
| npm/OS security patches | Monthly | 1h |
| Shopify API version bump | Quarterly | 2h |
| Meta/Google API changes | Bi-annual | 3h |
| Client customizations | Per request | 2-8h |
| DB health checks | Monthly | 0.5h |
| Monitoring review | Weekly | 0.5h |
| **Total** | | **~8-15h/month** |

## 7. Deployment Option Comparison

| Option | Monthly | BullMQ | SSH | Verdict |
|---|---|---|---|---|
| Vercel | $20+ | ❌ NO | ❌ | ELIMINATED (no background jobs) |
| Railway | $20-30 | ✓ | ❌ | Good for MVP, pricier at scale |
| Render | $25-35 | ✓ | ❌ | Solid but expensive |
| DigitalOcean | $45-55 | ✓ | ✓ | Good but costly |
| **Hetzner + Coolify** | **€8-15** | **✓** | **✓** | **RECOMMENDED** |

## 8. RECOMMENDED DEPLOYMENT PATH

### Stage 1 — Development (now)
- localhost:3001
- SQLite (existing)
- Cost: €0

### Stage 2 — MVP Production (1-5 clients)
- Hetzner CX22 (€3.85/mo) + Coolify
- PostgreSQL + Redis self-hosted
- Cost: ~€6/month

### Stage 3 — Growth (5-50 clients)
- Hetzner CX32 (€7.20/mo)
- Same stack, just more RAM
- Cost: ~€9/month

### Stage 4 — Scale (50-200 clients)
- Hetzner CX52 (€23/mo) OR 2× CX32
- Managed PostgreSQL backup (Hetzner DBaaS €20/mo)
- Cost: ~€45/month
