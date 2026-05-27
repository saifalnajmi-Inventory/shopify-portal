# Shopify Inventory Portal — Setup Guide

## Required Shopify API Permissions

In your Shopify Admin: **Settings → Apps and sales channels → Develop apps → Create app**

Enable these scopes:

| Scope | Purpose |
|---|---|
| `read_products` | Fetch product + variant data |
| `write_products` | Update title, status, vendor, SEO, tags |
| `read_inventory` | Read inventory levels |
| `write_inventory` | Update inventory quantities |
| `read_orders` | Fetch order + sales history |
| `read_locations` | Get warehouse/location IDs |
| `read_product_listings` | (optional, for collections) |

---

## Step-by-Step Setup in VS Code

### 1. Prerequisites
```bash
node -v   # Must be 18+
npm -v    # Must be 9+
```
Install Node 18+ from https://nodejs.org if needed.

### 2. Open project in VS Code
```
File → Open Folder → Desktop/shopify-portal
```

### 3. Install dependencies
Open the VS Code terminal (Ctrl+`) and run:
```bash
npm install
```

### 4. Configure environment
Edit `.env.local` and fill in your values:
```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DATABASE_URL="file:./dev.db"
```

**Never commit `.env.local` to git.**

### 5. Set up the database
```bash
npm run db:push
```
This creates `prisma/dev.db` (SQLite file) with all tables.

### 6. Start the portal
```bash
npm run dev
```
Open http://localhost:3001 in your browser.

### 7. First sync
Click **"Sync from Shopify"** in the sidebar.  
This fetches all products, variants, inventory levels, orders, and collections.  
Large stores (1000+ products) may take 1–3 minutes.

---

## Folder Structure

```
shopify-portal/
├── .env.local              ← Your secret keys (DO NOT commit)
├── .env.example            ← Template (safe to commit)
├── prisma/
│   ├── schema.prisma       ← Database schema
│   └── dev.db              ← SQLite database (created after db:push)
├── lib/
│   ├── shopify.js          ← Shopify API read/write client
│   ├── db.js               ← Prisma database client
│   └── scoring.js          ← Restock + marketing score formulas
├── pages/
│   ├── index.js            ← Dashboard (20 cards)
│   ├── products.js         ← Products table with filters
│   ├── changes.js          ← Review + push changes
│   ├── change-log.js       ← Push history
│   └── api/
│       ├── sync.js         ← POST: sync all Shopify data
│       ├── dashboard.js    ← GET: dashboard stats
│       ├── products.js     ← GET: filtered product list
│       ├── export.js       ← GET: CSV download
│       ├── changelog.js    ← GET: change log
│       └── changes/
│           ├── index.js    ← GET/POST/PATCH/DELETE: draft changes
│           └── push.js     ← POST: push to Shopify
├── components/
│   ├── Layout.js           ← Sidebar + nav + sync button
│   ├── DashboardCard.js    ← Stat card component
│   ├── FilterPanel.js      ← Product filter UI
│   ├── ProductTable.js     ← Sortable product table
│   └── ReviewChanges.js    ← Before/after diff + push UI
└── styles/
    └── globals.css         ← Tailwind + custom classes
```

---

## Safe Push Workflow

```
Edit in Products page
        ↓
Draft Change saved locally
        ↓
Go to Review Changes
        ↓
Check Before vs After columns
        ↓
Select changes → Approve Selected
        ↓
Click "Push Approved → Shopify"
        ↓
Confirm popup
        ↓
Shopify API called for each change
        ↓
Result logged in Change Log
```

---

## Rollback Strategy

Every pushed change stores `beforeValue` in the `ChangeLog` table.  
To roll back: go to Change Log, note the `Before` value, go to Products,  
edit the field back to the old value, and push again.

A future enhancement could automate this with a "Rollback" button.

---

## Upgrading to PostgreSQL

1. Install PostgreSQL locally or use Supabase / Railway
2. Change in `.env.local`:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/shopify_portal"
   ```
3. Change in `prisma/schema.prisma`:
   ```
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. Run `npm run db:push` to create the tables

---

## Deployment Options

### Option A: Vercel (Recommended for Next.js)
- Needs PostgreSQL (use Vercel Postgres or Supabase)
- Add env vars in Vercel dashboard
- `vercel deploy`

### Option B: Railway
- Supports SQLite for simple deploys
- Connect your GitHub repo

### Option C: Self-hosted (VPS)
- Use PM2 to run `npm run start`
- Nginx as reverse proxy
- Keep SQLite or add PostgreSQL

---

## Score Formulas

### Restock Priority Score (0–100)
| Factor | Weight |
|---|---|
| Sales velocity (sold30Days ÷ 10) | 35 pts |
| Days out of stock (÷ 14 days) | 30 pts |
| Critical stock level (0→20, <3→15, <5→10) | 20 pts |
| Accelerating demand (7d vs 30d trend) | 15 pts |

### Marketing Push Score (0–100)
| Factor | Weight |
|---|---|
| Has stock available | 30 pts |
| No / low sales | 25 pts |
| SEO completeness | 20 pts |
| Has product images | 10 pts |
| Recently added | 10 pts |
| Has vendor set | 5 pts |

---

## Token Safety Rules

- `SHOPIFY_ACCESS_TOKEN` lives only in `.env.local`
- It is NEVER imported in any `pages/*.js` file (only in `pages/api/`)
- Next.js never sends server-only env vars to the browser
- Add `.env.local` to `.gitignore` (it's already excluded by default)
- Rotate the token in Shopify Admin if you suspect it was leaked
