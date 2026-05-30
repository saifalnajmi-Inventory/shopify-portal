/**
 * POS Sync — PROACT GEN ↔ Shopify comparison hub
 * Super admin only.
 *
 * Shows matched / pending / unmatched products.
 * Everything auto-syncs in the background — nothing here is manual.
 */

import Head from 'next/head'
import { useAuth } from './_app'
import { useRouter } from 'next/router'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Cable, CheckCircle2, Clock, AlertCircle,
  RefreshCw, Wifi, WifiOff, Package, Search, X,
  ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus,
  ShoppingBag, Server, Link2,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n)    { if (n == null) return '—'; return Number(n).toLocaleString() }
function fmtPrice(n) { if (n == null) return '—'; return `KD ${Number(n).toFixed(3)}` }
function ago(d) {
  if (!d) return null
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_TABS = [
  { key: 'all',       label: 'All',       color: 'slate'   },
  { key: 'pending',   label: 'Pending',   color: 'indigo'  },
  { key: 'confirmed', label: 'Confirmed', color: 'emerald' },
  { key: 'unmatched', label: 'Unmatched', color: 'amber'   },
  { key: 'rejected',  label: 'Rejected',  color: 'rose'    },
]

const TAB_COLORS = {
  slate:   { active: 'bg-slate-800 text-white',   dot: '' },
  indigo:  { active: 'bg-indigo-600 text-white',  dot: 'bg-indigo-400' },
  emerald: { active: 'bg-emerald-600 text-white', dot: 'bg-emerald-400' },
  amber:   { active: 'bg-amber-500 text-white',   dot: 'bg-amber-400' },
  rose:    { active: 'bg-rose-500 text-white',     dot: 'bg-rose-400' },
}

function StatPill({ label, value, color = 'slate', loading }) {
  const cls = {
    slate:   'bg-slate-100 text-slate-700',
    indigo:  'bg-indigo-50 text-indigo-700 border border-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    amber:   'bg-amber-50 text-amber-700 border border-amber-200',
    rose:    'bg-rose-50 text-rose-700 border border-rose-200',
  }
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${cls[color]}`}>
      <span className="text-[10px] font-medium opacity-70">{label}</span>
      <span className="font-bold">{loading ? '…' : fmt(value)}</span>
    </div>
  )
}

function StockDiff({ pos, shopify }) {
  if (shopify == null) return <span className="text-slate-300 text-xs">—</span>
  const diff = pos - shopify
  if (diff === 0) return (
    <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
      <Minus size={11} /> Same
    </span>
  )
  if (diff > 0) return (
    <span className="flex items-center gap-1 text-indigo-600 text-xs font-semibold">
      <ArrowUp size={11} /> POS +{diff}
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-amber-600 text-xs font-semibold">
      <ArrowDown size={11} /> Shopify +{Math.abs(diff)}
    </span>
  )
}

function StatusBadge({ status }) {
  const cfg = {
    pending:   { cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',  label: 'Pending review' },
    confirmed: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Confirmed' },
    rejected:  { cls: 'bg-rose-50 text-rose-700 border-rose-200',        label: 'Rejected' },
    unmatched: { cls: 'bg-amber-50 text-amber-700 border-amber-200',     label: 'No Shopify match' },
  }
  const { cls, label } = cfg[status] || cfg.unmatched
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  )
}

// ── Margin cell ───────────────────────────────────────────────────────────────
function MarginCell({ cost, shopifyPrice }) {
  if (!shopifyPrice || !cost || shopifyPrice <= 0 || cost <= 0)
    return <span className="text-slate-300 text-xs">—</span>

  const pct = ((shopifyPrice - cost) / shopifyPrice * 100).toFixed(1)
  const color = parseFloat(pct) >= 30 ? 'text-emerald-600'
              : parseFloat(pct) >= 15 ? 'text-amber-600'
              : 'text-rose-500'

  return <span className={`text-[11px] font-bold ${color}`}>{pct}%</span>
}

// ── Manual Link Modal ─────────────────────────────────────────────────────────
function LinkModal({ row, onClose, onLinked }) {
  const [q,        setQ]        = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [linking,  setLinking]  = useState(null)  // variantId being linked
  const timer = useRef(null)

  useEffect(() => {
    clearTimeout(timer.current)
    if (!q.trim() || q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pos/search-variants?q=${encodeURIComponent(q.trim())}`)
        const d = await r.json()
        setResults(d.variants || [])
      } catch {}
      setLoading(false)
    }, 350)
    return () => clearTimeout(timer.current)
  }, [q])

  async function handleLink(shopifyVariantId) {
    setLinking(shopifyVariantId)
    try {
      const r = await fetch('/api/pos/manual-link', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ posMatchId: row.id, shopifyVariantId }),
      })
      const d = await r.json()
      if (d.ok) { onLinked(); onClose() }
      else alert(d.error || 'Link failed')
    } catch (e) { alert(e.message) }
    setLinking(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Link2 size={16} className="text-indigo-500" /> Link to Shopify Product
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              POS: <span className="font-semibold text-slate-600">{row.posProduct?.name}</span>
              <span className="ml-2 font-mono text-slate-400">{row.posProduct?.barcode}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            type="text"
            placeholder="Search Shopify by name, SKU or barcode…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl w-full focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        {/* Results */}
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-slate-400 text-center py-4">Searching…</p>
          ) : results.length === 0 && q.length >= 2 ? (
            <p className="text-xs text-slate-400 text-center py-4">No results for "{q}"</p>
          ) : results.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Type at least 2 characters to search</p>
          ) : results.map(v => (
            <div key={v.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors group">
              {v.product?.firstImageSrc ? (
                <img src={v.product.firstImageSrc} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                  <ShoppingBag size={14} className="text-emerald-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800 leading-snug truncate">{v.product?.title}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  {v.sku     && <span className="text-[10px] text-slate-400 font-mono">SKU: {v.sku}</span>}
                  {v.barcode && <span className="text-[10px] text-slate-400 font-mono">·  {v.barcode}</span>}
                  <span className={`text-[10px] font-bold ${v.product?.status === 'active' ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {v.product?.status}
                  </span>
                </div>
              </div>
              <button
                disabled={!!linking}
                onClick={() => handleLink(v.id)}
                className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {linking === v.id ? '…' : 'Link & Confirm'}
              </button>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-slate-400">
          Confirming will write the POS barcode to Shopify and set Shopify stock = POS stock.
        </p>
      </div>
    </div>
  )
}

// ── Row component ─────────────────────────────────────────────────────────────
function ComparisonRow({ row, srNo, showCostAndMargin, onStatusChange, onLinkClick, updating }) {
  const pos   = row.posProduct
  const match = row.variant

  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors group">

      {/* Sr# */}
      <td className="px-3 py-3 text-center text-[11px] font-semibold text-slate-400">{srNo}</td>

      {/* POS product */}
      <td className="px-4 py-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0 mt-0.5">
            <Server size={13} className="text-orange-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 leading-snug" title={pos.name}>
              {pos.name || '—'}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-slate-400 font-mono">{pos.barcode}</span>
              {pos.sku && <span className="text-[10px] text-indigo-400 font-mono">· {pos.sku}</span>}
            </div>
          </div>
        </div>
      </td>

      {/* POS stock */}
      <td className="px-4 py-3 text-center">
        <div className="text-sm font-bold text-slate-700">{fmt(pos.stockMain + pos.stockStore)}</div>
        <div className="text-[10px] text-slate-400">{fmt(pos.stockMain)} + {fmt(pos.stockStore)}</div>
      </td>

      {/* Cost price (shown as POS Price) — super_admin only */}
      {showCostAndMargin && (
        <td className="px-4 py-3 text-center">
          <span className="text-sm font-semibold text-slate-700">{fmtPrice(pos.costPrice)}</span>
        </td>
      )}

      {/* Stock diff */}
      <td className="px-4 py-3 text-center">
        <StockDiff pos={pos.stockMain + pos.stockStore} shopify={row.shopifyStock} />
      </td>

      {/* Shopify product */}
      <td className="px-4 py-3">
        {match ? (
          <div className="flex items-start gap-2.5">
            {match.product?.firstImageSrc ? (
              <img
                src={match.product.firstImageSrc}
                alt=""
                className="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-200"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                <ShoppingBag size={14} className="text-emerald-500" />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800 leading-snug" title={match.product?.title}>
                {match.product?.title || '—'}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {match.sku && <span className="text-[10px] text-slate-400 font-mono">{match.sku}</span>}
                <span className={`text-[10px] font-bold ${
                  match.product?.status === 'active'   ? 'text-emerald-500' :
                  match.product?.status === 'draft'    ? 'text-slate-400' :
                  'text-rose-400'
                }`}>{match.product?.status}</span>
              </div>
            </div>
          </div>
        ) : (
          <span className="text-xs text-slate-300 italic">Not on Shopify</span>
        )}
      </td>

      {/* Shopify stock */}
      <td className="px-4 py-3 text-center">
        {row.shopifyStock != null
          ? <span className="text-sm font-bold text-slate-700">{fmt(row.shopifyStock)}</span>
          : <span className="text-slate-300 text-sm">—</span>
        }
      </td>

      {/* Shopify price */}
      <td className="px-4 py-3 text-center">
        {row.shopifyPrice != null
          ? <span className="text-sm font-semibold text-slate-700">{fmtPrice(row.shopifyPrice)}</span>
          : <span className="text-slate-300 text-sm">—</span>
        }
      </td>

      {/* Margin — super_admin only */}
      {showCostAndMargin && (
        <td className="px-4 py-3 text-center">
          <MarginCell cost={pos.costPrice} shopifyPrice={row.shopifyPrice} />
        </td>
      )}

      {/* Match type + status */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1 items-start">
          <StatusBadge status={row.status} />
          {row.matchType && (
            <span className="text-[10px] text-slate-400 font-medium">via {row.matchType}</span>
          )}
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Confirm — only for auto-matched pending rows */}
          {row.status !== 'confirmed' && row.variant && (
            <button
              disabled={updating}
              onClick={() => onStatusChange(row.id, 'confirmed')}
              className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              Confirm
            </button>
          )}
          {/* Link — for unmatched rows with no Shopify variant */}
          {row.status === 'unmatched' && !row.variant && (
            <button
              disabled={updating}
              onClick={() => onLinkClick(row)}
              className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              <Link2 size={10} /> Link
            </button>
          )}
          {row.status !== 'rejected' && row.status !== 'unmatched' && (
            <button
              disabled={updating}
              onClick={() => onStatusChange(row.id, 'rejected')}
              className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 transition-colors"
            >
              Reject
            </button>
          )}
          {(row.status === 'confirmed' || row.status === 'rejected') && (
            <button
              disabled={updating}
              onClick={() => onStatusChange(row.id, 'pending')}
              className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PosSyncPage() {
  const { user, authLoading } = useAuth()
  const router = useRouter()

  const [stats,       setStats]       = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [rows,        setRows]        = useState([])
  const [total,       setTotal]       = useState(0)
  const [pages,       setPages]       = useState(1)
  const [tableLoading, setTableLoading] = useState(true)
  const [activeTab,   setActiveTab]   = useState('all')
  const [page,        setPage]        = useState(1)
  const [search,      setSearch]      = useState('')
  const [debouncedQ,  setDebouncedQ]  = useState('')
  const [updating,    setUpdating]    = useState(false)
  const [linkRow,     setLinkRow]     = useState(null)  // row for the manual-link modal
  const searchTimer = useRef(null)

  // Guard — super_admin + owner can access POS Sync
  useEffect(() => {
    if (!authLoading && user && user.role !== 'super_admin' && user.role !== 'owner') router.replace('/')
  }, [user, authLoading, router])

  // Debounce search
  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setDebouncedQ(search); setPage(1) }, 350)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  // Load stats
  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const r = await fetch('/api/pos/stats')
      if (r.ok) setStats(await r.json())
    } catch { /* ignore */ }
    setStatsLoading(false)
  }, [])

  // Load table
  const loadTable = useCallback(async () => {
    setTableLoading(true)
    try {
      const params = new URLSearchParams({
        status: activeTab,
        page:   String(page),
        limit:  '50',
        q:      debouncedQ,
      })
      const r = await fetch(`/api/pos/comparison?${params}`)
      if (r.ok) {
        const d = await r.json()
        setRows(d.rows || [])
        setTotal(d.total || 0)
        setPages(d.pages || 1)
      }
    } catch { /* ignore */ }
    setTableLoading(false)
  }, [activeTab, page, debouncedQ])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadTable() }, [loadTable])

  // Switch tab
  function switchTab(key) {
    setActiveTab(key)
    setPage(1)
  }

  // Update row status
  async function handleStatusChange(matchId, newStatus) {
    setUpdating(true)
    try {
      await fetch('/api/pos/update-match', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ matchId, status: newStatus }),
      })
      await Promise.all([loadTable(), loadStats()])
    } catch { /* ignore */ }
    setUpdating(false)
  }

  if (authLoading || !user) return null
  if (user.role !== 'super_admin' && user.role !== 'owner') return null

  // Super admin sees cost price + margin; owner sees everything else
  const showCostAndMargin = user.role === 'super_admin'
  // Total visible columns for colspan / skeleton
  const colCount = showCostAndMargin ? 11 : 9

  const agentConnected = stats?.lastSyncedAt
  const syncAgo        = ago(stats?.lastSyncedAt)

  return (
    <>
      <Head><title>POS Sync — Inventory Portal</title></Head>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Cable size={20} className="text-slate-700" />
            <h1 className="text-2xl font-bold text-slate-800">POS Sync</h1>
          </div>
          <p className="text-sm text-slate-400">
            PROACT GEN ↔ Shopify · auto-synced every 30 min
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadStats(); loadTable() }}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            agentConnected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-slate-100 border-slate-200 text-slate-500'
          }`}>
            {agentConnected
              ? <><Wifi size={11} /> Agent active · {syncAgo}</>
              : <><WifiOff size={11} /> Agent not connected</>
            }
          </div>
        </div>
      </div>

      {/* ── Stat pills ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-5">
        <StatPill label="POS products"  value={stats?.totalPos}   color="slate"   loading={statsLoading} />
        <StatPill label="Matched"       value={stats?.matched}    color="indigo"  loading={statsLoading} />
        <StatPill label="Pending review" value={stats?.pending}   color="indigo"  loading={statsLoading} />
        <StatPill label="Confirmed"     value={stats?.confirmed}  color="emerald" loading={statsLoading} />
        <StatPill label="No Shopify match" value={stats?.unmatched} color="amber" loading={statsLoading} />
        {stats?.lastSyncStats && (
          <StatPill label="Last sync errors" value={stats.lastSyncStats.errors} color={stats.lastSyncStats.errors > 0 ? 'rose' : 'slate'} />
        )}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {STATUS_TABS.map(tab => {
          const isActive = activeTab === tab.key
          const c        = TAB_COLORS[tab.color]
          return (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isActive ? c.active : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {!isActive && tab.color !== 'slate' && (
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
              )}
              {tab.label}
            </button>
          )
        })}

        {/* Search */}
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, barcode, SKU…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-8 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 w-52"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">

        {/* Agent not connected notice */}
        {!agentConnected && !statsLoading && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border-b border-amber-100">
            <WifiOff size={15} className="text-amber-500 shrink-0" />
            <div className="text-xs text-amber-700">
              <span className="font-bold">Agent not connected.</span>
              {' '}Send <code className="bg-amber-100 px-1 rounded">proact-sync.ps1</code> to the Toshiba via WhatsApp, save it to{' '}
              <code className="bg-amber-100 px-1 rounded">C:\Users\user\Documents\</code> and run it.
              The table below will populate automatically.
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-center px-3 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wide w-10">Sr#</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">POS Product</th>
                <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">POS Stock</th>
                {showCostAndMargin && <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">POS Price</th>}
                <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Diff</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Shopify Product</th>
                <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Shopify Stock</th>
                <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Shopify Price</th>
                {showCostAndMargin && <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Margin</th>}
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Match</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {Array.from({ length: colCount }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="text-center py-16 text-slate-400">
                    <Package size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">
                      {search ? `No results for "${search}"` : 'No products yet — run the agent on Toshiba to populate this table'}
                    </p>
                  </td>
                </tr>
              ) : rows.map((row, idx) => (
                <ComparisonRow
                  key={row.id}
                  row={row}
                  srNo={(page - 1) * 50 + idx + 1}
                  showCostAndMargin={showCostAndMargin}
                  onStatusChange={handleStatusChange}
                  onLinkClick={setLinkRow}
                  updating={updating}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-400">{fmt(total)} total · page {page} of {pages}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Link Modal */}
      {linkRow && (
        <LinkModal
          row={linkRow}
          onClose={() => setLinkRow(null)}
          onLinked={() => { loadTable(); loadStats() }}
        />
      )}
    </>
  )
}
