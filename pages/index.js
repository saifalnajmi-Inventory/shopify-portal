/**
 * Dashboard — 20 inventory intelligence cards, all clickable.
 * Clicking any card opens a DrillDownPanel with the matching product list
 * and inline "Update Stock → Push to Shopify" on every row.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Package, PackageCheck, PackageX, PackageMinus,
  TrendingDown, AlertTriangle, Clock,
  Star, Zap, BarChart2, FileImage,
  FileSearch, Tag, RefreshCw, Calendar, Layers,
  BadgeAlert, Archive, ShieldOff, Activity
} from 'lucide-react'
import DashboardCard    from '../components/DashboardCard'
import QuickStockCard   from '../components/QuickStockCard'
import DrillDownPanel   from '../components/DrillDownPanel'
import InsightsPanel    from '../components/InsightsPanel'
import { formatDistanceToNow } from 'date-fns'

// Map card key → DrillDownPanel title
const CARD_TITLES = {
  outOfStock:      'Out of Stock Products',
  lowStock:        'Below 3 Units (Critical Low Stock)',
  belowThreshold:  'Below 5 Units (Low Stock)',
  inStock:         'In Stock Products',
  oos7:            'Out of Stock 7+ Days',
  oos14:           'Out of Stock 14+ Days',
  oos30:           'Out of Stock 30+ Days',
  neverRestocked:  'Never Restocked After Going OOS',
  noSales:         'Products With No Sales',
  recent:          'Recently Added Products',
  missingImages:   'Products Missing Images',
  missingSeo:      'Products Missing SEO',
  missingVendor:   'Products Missing Vendor / Brand',
  draftProducts:    'Draft Products — Publish to Shopify',
  activeProducts:   'Active Products — Set to Draft',
  archivedProducts: 'Archived Products',
  wentOosLast30:    'Went Out of Stock — Last 30 Days',
  wentOos31to60:    'Went Out of Stock — 31 to 60 Days Ago',
  wentOos61to90:    'Went Out of Stock — 61 to 90 Days Ago',
}

export default function Dashboard() {
  const [data,       setData]       = useState(null)
  const [error,      setError]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [activeCard, setActiveCard] = useState(null) // key of open drill-down

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/dashboard', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `API error ${res.status}`)
      setData(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Auto-refresh when a Shopify sync completes (triggered by Layout)
    window.addEventListener('shopify-sync-done', load)
    return () => window.removeEventListener('shopify-sync-done', load)
  }, [load])

  function openCard(key) { setActiveCard(key) }
  function closeCard()   { setActiveCard(null) }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <RefreshCw size={24} className="animate-spin mr-3" /> Loading dashboard…
      </div>
    )
  }

  if (error) {
    return (
      <div className="card border-red-200 bg-red-50 text-red-700 p-8">
        <h2 className="font-bold text-lg mb-2">Dashboard error</h2>
        <p className="font-mono text-sm mb-4">{error}</p>
        <button className="btn-primary" onClick={load}>Retry</button>
      </div>
    )
  }

  if (!data) return null
  const { cards, lists, lastSync } = data

  return (
    <div className="space-y-8">

      {/* DrillDown modal */}
      {activeCard && (
        <DrillDownPanel
          card={activeCard}
          title={CARD_TITLES[activeCard] || activeCard}
          onClose={closeCard}
          onRefreshDashboard={load}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {lastSync
              ? `Last synced ${formatDistanceToNow(new Date(lastSync), { addSuffix: true })}`
              : 'Not synced yet — click Sync from Shopify in the sidebar'}
            <span className="ml-3 text-indigo-400 text-xs hidden sm:inline">· Click any card to see the product list</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={load}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Insights Intelligence Panel ─────────────────────────────────── */}
      <InsightsPanel cards={cards} onOpenCard={openCard} />

      {/* ── Mobile health bar (hidden on desktop) ───────────────────────── */}
      <div className="sm:hidden -mx-4 px-4 overflow-x-auto">
        <div className="flex gap-3 pb-1" style={{ width: 'max-content' }}>
          {/* Active products */}
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5 shrink-0">
            <PackageCheck size={16} className="text-emerald-500" />
            <div>
              <div className="text-xs text-emerald-500 font-semibold leading-none">Active</div>
              <div className="text-lg font-bold text-emerald-700 leading-none mt-0.5">{cards.activeProducts}</div>
            </div>
          </div>
          {/* In stock */}
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5 shrink-0">
            <PackageCheck size={16} className="text-emerald-500" />
            <div>
              <div className="text-xs text-emerald-500 font-semibold leading-none">In Stock</div>
              <div className="text-lg font-bold text-emerald-700 leading-none mt-0.5">{cards.inStockVariants}</div>
            </div>
          </div>
          {/* OOS - alert */}
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-2.5 shrink-0">
            <PackageX size={16} className="text-red-500" />
            <div>
              <div className="text-xs text-red-500 font-semibold leading-none">Out of Stock</div>
              <div className="text-lg font-bold text-red-700 leading-none mt-0.5">{cards.outOfStockVariants}</div>
            </div>
          </div>
          {/* Critical low */}
          {cards.lowStockVariants > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 shrink-0">
              <AlertTriangle size={16} className="text-amber-500" />
              <div>
                <div className="text-xs text-amber-500 font-semibold leading-none">Critical (&lt;3)</div>
                <div className="text-lg font-bold text-amber-700 leading-none mt-0.5">{cards.lowStockVariants}</div>
              </div>
            </div>
          )}
          {/* Total variants */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 shrink-0">
            <Layers size={16} className="text-slate-500" />
            <div>
              <div className="text-xs text-slate-500 font-semibold leading-none">Variants</div>
              <div className="text-lg font-bold text-slate-700 leading-none mt-0.5">{cards.totalVariants}</div>
            </div>
          </div>
          {/* Last sync */}
          {lastSync && (
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-2.5 shrink-0">
              <RefreshCw size={16} className="text-indigo-400" />
              <div>
                <div className="text-xs text-indigo-500 font-semibold leading-none">Last Sync</div>
                <div className="text-xs font-bold text-indigo-700 leading-none mt-0.5">
                  {formatDistanceToNow(new Date(lastSync), { addSuffix: true })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 1: Product Overview ─────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Product Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <DashboardCard title="Total Products"  value={cards.totalProducts}    icon={Package}      color="indigo" />
          <DashboardCard
            title="Active"
            value={cards.activeProducts}
            icon={PackageCheck} color="emerald"
            subtitle="Click to manage active products"
            onClick={() => openCard('activeProducts')}
          />
          <DashboardCard
            title="Draft"
            value={cards.draftProducts}
            icon={PackageMinus} color="amber"
            subtitle="Click to publish drafts"
            badge={cards.draftProducts > 0 ? { label: 'Unpublished', className: 'badge-yellow' } : null}
            onClick={() => openCard('draftProducts')}
          />
          <DashboardCard
            title="Archived"
            value={cards.archivedProducts}
            icon={Archive} color="slate"
            subtitle="Click to view archived"
            onClick={() => openCard('archivedProducts')}
          />
          <DashboardCard title="Total Variants"  value={cards.totalVariants}    icon={Layers}       color="blue" />
        </div>
      </section>

      {/* ── Section 2: Stock Status — all clickable ─────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
          Stock Status <span className="normal-case text-indigo-400 ml-1">— click any card to update stock</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardCard
            title="In Stock"
            value={cards.inStockVariants}
            icon={PackageCheck} color="emerald"
            subtitle="Click to see all in-stock products"
            onClick={() => openCard('inStock')}
          />
          <DashboardCard
            title="Out of Stock"
            value={cards.outOfStockVariants}
            icon={PackageX} color="red"
            subtitle="Click to update stock + push to Shopify"
            badge={cards.outOfStockVariants > 0 ? { label: 'Action needed', className: 'badge-red' } : null}
            onClick={() => openCard('outOfStock')}
          />
          <DashboardCard
            title="Below 3 Units"
            value={cards.lowStockVariants}
            icon={AlertTriangle} color="amber"
            subtitle="Critical — almost out of stock"
            badge={cards.lowStockVariants > 0 ? { label: 'Critical', className: 'badge-yellow' } : null}
            onClick={() => openCard('lowStock')}
          />
          <DashboardCard
            title="Below 5 Units"
            value={cards.belowThresholdVariants}
            icon={BarChart2} color="orange"
            subtitle="Low stock — restock soon"
            onClick={() => openCard('belowThreshold')}
          />
        </div>
      </section>

      {/* ── Section 3: Out-of-Stock Duration — all clickable ────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Out-of-Stock Duration</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <DashboardCard
            title="OOS for 7+ Days"
            value={cards.oos7Days}
            icon={Clock} color="amber"
            subtitle="Click to restock"
            onClick={() => openCard('oos7')}
          />
          <DashboardCard
            title="OOS for 14+ Days"
            value={cards.oos14Days}
            icon={Clock} color="orange"
            subtitle="Click to restock"
            badge={cards.oos14Days > 0 ? { label: 'Restock soon', className: 'badge-yellow' } : null}
            onClick={() => openCard('oos14')}
          />
          <DashboardCard
            title="OOS for 30+ Days"
            value={cards.oos30Days}
            icon={Clock} color="red"
            subtitle="Click to restock urgently"
            badge={cards.oos30Days > 0 ? { label: 'URGENT', className: 'badge-red' } : null}
            onClick={() => openCard('oos30')}
          />
          <DashboardCard
            title="Never Restocked"
            value={cards.neverRestocked}
            icon={ShieldOff} color="red"
            subtitle="Had sales, went OOS, never restocked"
            badge={cards.neverRestocked > 0 ? { label: 'Lost revenue', className: 'badge-red' } : null}
            onClick={() => openCard('neverRestocked')}
          />
        </div>
      </section>

      {/* ── Section 4: Went Out of Stock Timeline ──────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">
          Went Out of Stock
        </h2>
        <p className="text-xs text-slate-400 mb-4">Products that became out of stock within each time window — click to restock</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <DashboardCard
            title="Last 30 Days"
            value={cards.wentOosLast30}
            icon={Activity} color="red"
            subtitle="Most recent stockouts"
            badge={cards.wentOosLast30 > 0 ? { label: 'Recent', className: 'badge-red' } : null}
            onClick={() => openCard('wentOosLast30')}
          />
          <DashboardCard
            title="31 – 60 Days Ago"
            value={cards.wentOos31to60}
            icon={Activity} color="orange"
            subtitle="Stockouts from last month"
            badge={cards.wentOos31to60 > 0 ? { label: 'Aging', className: 'badge-yellow' } : null}
            onClick={() => openCard('wentOos31to60')}
          />
          <DashboardCard
            title="61 – 90 Days Ago"
            value={cards.wentOos61to90}
            icon={Activity} color="amber"
            subtitle="Stockouts from 2 months ago"
            badge={cards.wentOos61to90 > 0 ? { label: 'Old', className: 'badge-yellow' } : null}
            onClick={() => openCard('wentOos61to90')}
          />
        </div>
      </section>

      {/* ── Section 5: Sales Intelligence — all clickable ───────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Sales Intelligence</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <DashboardCard
            title="No Sales Products"
            value={cards.noSalesProducts}
            icon={TrendingDown} color="slate"
            subtitle="Never sold — click to review"
            onClick={() => openCard('noSales')}
          />
          <DashboardCard
            title="Recently Added"
            value={cards.recentProducts}
            icon={Calendar} color="blue"
            subtitle="Added in last 30 days"
            onClick={() => openCard('recent')}
          />
          <DashboardCard
            title="Missing Images"
            value={cards.missingImages}
            icon={FileImage} color="red"
            subtitle="No product photos"
            badge={cards.missingImages > 0 ? { label: 'Fix needed', className: 'badge-red' } : null}
            onClick={() => openCard('missingImages')}
          />
          <DashboardCard
            title="Missing SEO"
            value={cards.missingSeo}
            icon={FileSearch} color="purple"
            subtitle="No SEO title or description"
            onClick={() => openCard('missingSeo')}
          />
          <DashboardCard
            title="Missing Vendor"
            value={cards.missingVendor}
            icon={Tag} color="slate"
            subtitle="No brand/vendor set"
            onClick={() => openCard('missingVendor')}
          />
        </div>
      </section>

      {/* ── Section 6: Quick Stock Update lists ─────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Quick Stock Update — Edit & Push to Shopify
          </h2>
          <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
            Click "Update Stock" → type qty → Push to Shopify
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <QuickStockCard
            title="Best Selling Products"
            icon={Star} iconColor="text-amber-500"
            items={lists.bestSelling}
            emptyText="No sales data yet — sync orders first."
            onRefresh={load}
          />
          <QuickStockCard
            title="Fast Moving + Low Stock"
            icon={Zap} iconColor="text-red-500"
            badge={{ label: 'Restock now', className: 'badge-red' }}
            items={lists.fastMovingLowStock}
            emptyText="No fast-moving low-stock items detected."
            onRefresh={load}
          />
          <QuickStockCard
            title="High Sales — Currently OOS"
            icon={BadgeAlert} iconColor="text-orange-500"
            badge={{ label: 'Lost revenue', className: 'badge-yellow' }}
            items={lists.highSalesOos}
            emptyText="No high-demand out-of-stock products."
            onRefresh={load}
          />
        </div>
      </section>

    </div>
  )
}
