/**
 * Inventory Manager — Portal as master POS for all Shopify-linked products.
 *
 * Shows all confirmed POS↔Shopify products with:
 *   - POS physical stock (from last PROACT sync)
 *   - Shopify online stock (last value portal set)
 *   - Estimated online orders consumed
 *   - Manual stock override from portal
 *   - Low stock / out of stock alerts
 */

import Head from 'next/head'
import { useAuth } from './_app'
import { useRouter } from 'next/router'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Package, Search, X, RefreshCw, AlertTriangle,
  ChevronLeft, ChevronRight, Edit3, Check, ShoppingBag,
  TrendingDown, ExternalLink, Warehouse, Store,
} from 'lucide-react'

function fmtAgo(date) {
  if (!date) return '—'
  const h = (Date.now() - new Date(date)) / 3600000
  if (h < 1)  return `${Math.round(h * 60)}m ago`
  if (h < 24) return `${Math.round(h)}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function StockBadge({ stock }) {
  if (stock === null || stock === undefined) return <span className="text-slate-300 text-xs">—</span>
  if (stock === 0)   return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">Out of stock</span>
  if (stock <= 5)    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Low: {stock}</span>
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">{stock} units</span>
}

function StatusDot({ status }) {
  const cls = status === 'active' ? 'bg-emerald-400' : status === 'draft' ? 'bg-amber-400' : 'bg-slate-300'
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls}`} />
}

// ── Inline stock editor ───────────────────────────────────────────────────────
function StockEditor({ matchId, current, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(String(current ?? ''))
  const [saving,  setSaving]  = useState(false)
  const inputRef = useRef(null)

  function open() { setValue(String(current ?? '')); setEditing(true); setTimeout(() => inputRef.current?.select(), 50) }

  async function save() {
    const n = parseInt(value)
    if (isNaN(n) || n < 0) { setEditing(false); return }
    setSaving(true)
    try {
      const r = await fetch('/api/inventory/set-stock', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ matchId, newStock: n }),
      })
      const d = await r.json()
      if (d.ok) { onSaved(n); setEditing(false) }
      else alert(d.error || 'Failed to update stock')
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  if (!editing) {
    return (
      <button
        onClick={open}
        className="group flex items-center gap-1.5 text-left hover:bg-slate-50 rounded-lg px-1.5 py-1 -mx-1.5 transition-colors"
        title="Click to override Shopify stock"
      >
        <StockBadge stock={current} />
        <Edit3 size={10} className="text-slate-300 group-hover:text-slate-500 shrink-0" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="number"
        min="0"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        className="w-16 px-2 py-1 text-xs border-2 border-indigo-300 rounded-lg focus:outline-none focus:border-indigo-500"
        disabled={saving}
      />
      <button onClick={save} disabled={saving} className="p-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
        <Check size={10} />
      </button>
      <button onClick={() => setEditing(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
        <X size={10} />
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InventoryManager() {
  const { user, authLoading } = useAuth()
  const router = useRouter()

  const [rows,    setRows]    = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [total,   setTotal]   = useState(0)
  const [pages,   setPages]   = useState(1)
  const [page,    setPage]    = useState(1)
  const [search,  setSearch]  = useState('')
  const [debQ,    setDebQ]    = useState('')
  const [alert,   setAlert]   = useState('')   // '' | 'low' | 'out'
  const [sort,    setSort]    = useState('updated')
  const searchTimer = useRef(null)

  useEffect(() => {
    if (!authLoading && user && user.role !== 'super_admin' && user.role !== 'owner')
      router.replace('/')
  }, [user, authLoading, router])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setDebQ(search); setPage(1) }, 350)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        q: debQ, alert, sort, page, limit: 50,
      })
      const r = await fetch(`/api/inventory/linked?${params}`)
      if (!r.ok) throw new Error(await r.text())
      const d = await r.json()
      setRows(d.rows || [])
      setTotal(d.total || 0)
      setPages(d.pages || 1)
      setSummary(d.summary || null)
    } catch (e) {
      console.error('Inventory load error:', e)
    }
    setLoading(false)
  }, [debQ, alert, sort, page])

  useEffect(() => { load() }, [load])

  function updateRowStock(matchId, newStock) {
    setRows(prev => prev.map(r => r.matchId === matchId
      ? { ...r, shopifyStock: newStock, shopifyLiveStock: newStock }
      : r
    ))
  }

  return (
    <>
      <Head><title>Inventory Manager — Portal</title></Head>

      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <Warehouse size={22} className="text-indigo-500" />
              Inventory Manager
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Central inventory control for all POS × Shopify linked products.
              POS syncs every 2 hours — Shopify stock auto-decrements on online orders.
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* ── Summary cards ───────────────────────────────────────────────── */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Linked Products', value: summary.totalLinked,  color: 'indigo',  icon: Package },
              { label: 'Healthy Stock',   value: summary.healthy,      color: 'emerald', icon: Store   },
              { label: 'Low Stock (≤5)',  value: summary.lowStock,     color: 'amber',   icon: TrendingDown },
              { label: 'Out of Stock',    value: summary.outOfStock,   color: 'red',     icon: AlertTriangle },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className={`bg-white rounded-2xl border p-4 ${
                color === 'red'    ? 'border-red-100'    :
                color === 'amber'  ? 'border-amber-100'  :
                color === 'emerald'? 'border-emerald-100':
                                     'border-slate-200'
              }`}>
                <div className={`text-2xl font-bold ${
                  color === 'red'    ? 'text-red-600'    :
                  color === 'amber'  ? 'text-amber-600'  :
                  color === 'emerald'? 'text-emerald-600':
                                       'text-slate-800'
                }`}>{value ?? '—'}</div>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <Icon size={11} /> {label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── How stock works info box ─────────────────────────────────────── */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-700 flex gap-3">
          <ShoppingBag size={14} className="shrink-0 mt-0.5 text-indigo-400" />
          <div className="space-y-1">
            <div className="font-semibold">How inventory works for linked products</div>
            <div>
              <strong>POS Stock</strong> — physical store count, updated every 2h by the PROACT agent.
              When it changes, the portal applies the <em>delta</em> to Shopify (not an overwrite) so online order decrements are preserved.
            </div>
            <div>
              <strong>Shopify Stock</strong> — what the online store shows. Auto-decrements when an order is placed.
              Click the pencil icon to manually override from this portal (e.g. after a stock count correction).
            </div>
          </div>
        </div>

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search product, barcode, SKU…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-8 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 w-64"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Alert filter */}
          {[
            { key: '',    label: 'All'       },
            { key: 'low', label: '⚠ Low Stock' },
            { key: 'out', label: '🔴 Out of Stock' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setAlert(key); setPage(1) }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                alert === key
                  ? key === 'out' ? 'bg-red-600 text-white border-red-600'
                  : key === 'low' ? 'bg-amber-500 text-white border-amber-500'
                  :                 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {label}
            </button>
          ))}

          {/* Sort */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="ml-auto px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white text-slate-600"
          >
            <option value="updated">Sort: Last updated</option>
            <option value="stock">Sort: POS stock</option>
            <option value="name">Sort: Name</option>
          </select>

          <span className="text-xs text-slate-400">{total} products</span>
        </div>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-64">Product</th>
                  <th className="px-4 py-3 text-left w-32">POS Barcode</th>
                  <th className="px-4 py-3 text-center w-28">
                    <span className="flex items-center justify-center gap-1"><Warehouse size={10}/> POS Stock</span>
                  </th>
                  <th className="px-4 py-3 text-center w-28">
                    <span className="flex items-center justify-center gap-1"><ShoppingBag size={10}/> Shopify Stock</span>
                    <span className="text-[9px] font-normal normal-case text-slate-300 block">click to edit</span>
                  </th>
                  <th className="px-4 py-3 text-center w-24">Online Sold</th>
                  <th className="px-4 py-3 text-left w-32">POS Synced</th>
                  <th className="px-4 py-3 text-left w-24">Status</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3"><div className="h-8 bg-slate-100 rounded-lg" /></td>
                      <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-24" /></td>
                      <td className="px-4 py-3"><div className="h-5 bg-slate-100 rounded w-16 mx-auto" /></td>
                      <td className="px-4 py-3"><div className="h-5 bg-slate-100 rounded w-16 mx-auto" /></td>
                      <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-10 mx-auto" /></td>
                      <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                      <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-14" /></td>
                      <td></td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <div className="text-3xl mb-3">📦</div>
                      <div className="font-semibold text-slate-700">No linked products yet</div>
                      <div className="text-xs text-slate-400 mt-1">
                        Confirm products in POS Sync to link them here
                      </div>
                    </td>
                  </tr>
                ) : rows.map(row => (
                  <tr
                    key={row.matchId}
                    className={`hover:bg-slate-50/60 transition-colors ${
                      row.isOutOfStock ? 'bg-red-50/30'  :
                      row.isLowStock  ? 'bg-amber-50/30' : ''
                    }`}
                  >
                    {/* Product */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {row.shopifyImage ? (
                          <img src={row.shopifyImage} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                            <Package size={14} className="text-slate-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate max-w-[200px]" title={row.shopifyTitle}>
                            {row.shopifyTitle || row.posName}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[200px]" title={row.posName}>
                            POS: {row.posName}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Barcode */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-[10px] text-slate-500">{row.posBarcode}</span>
                    </td>

                    {/* POS Stock */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <StockBadge stock={row.posStock} />
                        {row.posStockMain > 0 && row.posStockStore > 0 && (
                          <div className="text-[9px] text-slate-400">
                            Main: {row.posStockMain} · Store: {row.posStockStore}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Shopify Stock — editable */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <StockEditor
                          matchId={row.matchId}
                          current={row.shopifyStock}
                          onSaved={n => updateRowStock(row.matchId, n)}
                        />
                      </div>
                    </td>

                    {/* Online Sold (estimated) */}
                    <td className="px-4 py-3 text-center">
                      {row.onlineConsumed > 0 ? (
                        <span className="text-xs font-semibold text-indigo-600">−{row.onlineConsumed}</span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>

                    {/* POS Last Sync */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-400">{fmtAgo(row.posLastSync)}</span>
                    </td>

                    {/* Shopify status */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={row.shopifyStatus} />
                        <span className="text-[10px] text-slate-500 capitalize">{row.shopifyStatus || '—'}</span>
                      </div>
                    </td>

                    {/* Shopify admin link */}
                    <td className="px-3 py-3">
                      {row.shopifyAdminUrl && (
                        <a href={row.shopifyAdminUrl} target="_blank" rel="noreferrer"
                          className="text-slate-300 hover:text-indigo-500 transition-colors">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-3 text-xs text-slate-500">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
                <ChevronLeft size={12} />
              </button>
              <span>Page {page} of {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>

      </div>
    </>
  )
}
