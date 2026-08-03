/**
 * Out of Stock Manager
 *
 * Live view of everything currently out of stock, read straight from the
 * Variant table (not the notification log) so it's always accurate as of
 * the last sync and self-corrects — a product drops off this list the
 * moment a sync sees its stock above 0. No stale/duplicate cards possible.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  PackageX, Search, Send, RefreshCw, ExternalLink, Clock, ArrowUpDown,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

function daysSince(date) {
  if (!date) return null
  return Math.floor((Date.now() - new Date(date)) / 86_400_000)
}

export default function OutOfStockPage() {
  const [items,       setItems]       = useState([])
  const [storeDomain, setStoreDomain] = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [q,           setQ]           = useState('')
  const [sort,        setSort]        = useState('recent') // recent | oldest
  const [drafts,      setDrafts]      = useState({}) // { [variantId]: qty string }
  const [pushing,     setPushing]     = useState({}) // { [variantId]: bool }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/oos/list')
      const data = await res.json()
      setItems(data.items || [])
      setStoreDomain(data.storeDomain || null)
    } catch (err) {
      toast.error('Failed to load out-of-stock list')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function syncNow() {
    const t = toast.loading('Syncing from Shopify…')
    try {
      const res  = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      toast.dismiss(t)
      if (data.ok) { toast.success('Synced'); load() }
      else         toast.error(data.error || 'Sync failed')
    } catch (err) {
      toast.dismiss(t)
      toast.error(err.message)
    }
  }

  async function pushStock(item) {
    const raw = drafts[item.variantId]
    const qty = parseInt(raw, 10)
    if (isNaN(qty) || qty < 0) { toast.error('Enter a valid quantity (0 or more)'); return }

    setPushing(prev => ({ ...prev, [item.variantId]: true }))
    try {
      const res  = await fetch('/api/quickpush', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId:   item.productId,
          variantId:   item.variantId,
          entityName:  item.productTitle,
          variantName: item.variantTitle,
          sku:         item.sku,
          fieldName:   'inventory_quantity',
          beforeValue: String(item.inventoryQuantity),
          afterValue:  String(qty),
          changeType:  'inventory',
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(qty > 0 ? `Restocked to ${qty} — product activated` : 'Stock updated')
        setItems(prev => prev.filter(i => i.variantId !== item.variantId))
        setDrafts(prev => { const n = { ...prev }; delete n[item.variantId]; return n })
      } else {
        toast.error(data.error || 'Push failed')
      }
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPushing(prev => ({ ...prev, [item.variantId]: false }))
    }
  }

  const filtered = useMemo(() => {
    let list = items
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter(i =>
        i.productTitle?.toLowerCase().includes(term) ||
        i.variantTitle?.toLowerCase().includes(term) ||
        i.sku?.toLowerCase().includes(term) ||
        i.vendor?.toLowerCase().includes(term)
      )
    }
    const sorted = [...list].sort((a, b) => {
      const at = a.firstOutOfStockAt ? new Date(a.firstOutOfStockAt).getTime() : 0
      const bt = b.firstOutOfStockAt ? new Date(b.firstOutOfStockAt).getTime() : 0
      return sort === 'recent' ? bt - at : at - bt
    })
    return sorted
  }, [items, q, sort])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <PackageX size={22} />
            Out of Stock
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {loading ? 'Loading…' : (
              <span className="text-red-600 font-semibold">{filtered.length} of {items.length} product{items.length !== 1 ? 's' : ''} out of stock</span>
            )}
            <span className="ml-2">— live from last sync, not a notification log</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary text-xs py-1.5 px-3" onClick={load}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn-secondary text-xs py-1.5 px-3" onClick={syncNow}>
            <RefreshCw size={13} /> Sync from Shopify
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input py-1.5 text-sm pl-8 w-full"
            placeholder="Search product, SKU, vendor…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <button
          className="btn-secondary text-xs py-1.5 px-3"
          onClick={() => setSort(s => s === 'recent' ? 'oldest' : 'recent')}
        >
          <ArrowUpDown size={13} />
          {sort === 'recent' ? 'Most recent first' : 'Longest overdue first'}
        </button>
      </div>

      {loading ? (
        <div className="card flex items-center justify-center py-20 text-slate-400 gap-3">
          <RefreshCw size={20} className="animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-20 text-slate-400">
          <PackageX size={32} className="mx-auto mb-3 opacity-30" />
          <p>{items.length === 0 ? 'Nothing out of stock. All caught up.' : 'No matches for your search.'}</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="py-3 pl-4 pr-2 font-semibold">Product</th>
                <th className="py-3 px-2 font-semibold">SKU</th>
                <th className="py-3 px-2 font-semibold">Vendor</th>
                <th className="py-3 px-2 font-semibold">Status</th>
                <th className="py-3 px-2 font-semibold">Out of stock</th>
                <th className="py-3 px-2 font-semibold">Restock</th>
                <th className="py-3 pl-2 pr-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const days = daysSince(item.firstOutOfStockAt)
                const isPushing = !!pushing[item.variantId]
                return (
                  <tr key={item.variantId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="py-2.5 pl-4 pr-2">
                      <div className="flex items-center gap-2.5">
                        {item.image && (
                          <img src={item.image} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate max-w-[240px]" title={item.productTitle}>
                            {item.productTitle}
                          </p>
                          {item.variantTitle && <p className="text-[10px] text-slate-400">{item.variantTitle}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-xs text-slate-500 font-mono">{item.sku || '—'}</td>
                    <td className="py-2.5 px-2 text-xs text-slate-500">{item.vendor || '—'}</td>
                    <td className="py-2.5 px-2">
                      <span className={
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded border ' +
                        (item.productStatus === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200')
                      }>
                        {item.productStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />
                        {item.firstOutOfStockAt
                          ? `${days}d — ${formatDistanceToNow(new Date(item.firstOutOfStockAt), { addSuffix: true })}`
                          : 'unknown'}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          placeholder="qty"
                          value={drafts[item.variantId] ?? ''}
                          onChange={e => setDrafts(prev => ({ ...prev, [item.variantId]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') pushStock(item) }}
                          className="w-16 text-xs font-bold text-center rounded-lg border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <button
                          onClick={() => pushStock(item)}
                          disabled={isPushing || !drafts[item.variantId]}
                          className="flex items-center gap-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {isPushing ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-right">
                      {storeDomain && (
                        <a
                          href={`https://${storeDomain}/admin/products/${item.productId}`}
                          target="_blank" rel="noreferrer"
                          className="text-slate-400 hover:text-indigo-600 inline-flex"
                          title="Open in Shopify"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
