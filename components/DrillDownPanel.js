import { useState, useEffect } from 'react'
import { X, RefreshCw, Package, Send, Loader2, CheckCircle2, XCircle, Eye, EyeOff, Archive, Zap } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

// Cards where the primary action is status toggle (not stock update)
const STATUS_CARDS = new Set(['draftProducts', 'activeProducts', 'archivedProducts'])

const PAGE_SIZE = 50

export default function DrillDownPanel({ card, title, onClose, onRefreshDashboard }) {
  const [items,      setItems]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [loadingMore,setLoadingMore]= useState(false)
  const [error,      setError]      = useState(null)
  const [page,       setPage]       = useState(1)
  const [total,      setTotal]      = useState(0)
  const [hasMore,    setHasMore]    = useState(false)

  async function load(resetPage = true) {
    if (!card) return
    setLoading(true)
    setError(null)
    if (resetPage) { setPage(1); setItems([]) }
    try {
      const res  = await fetch(`/api/cardproducts?card=${card}&page=1&limit=${PAGE_SIZE}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setItems(data.items || [])
      setTotal(data.total || 0)
      setHasMore(data.hasMore || false)
      setPage(1)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const nextPage = page + 1
    try {
      const res  = await fetch(`/api/cardproducts?card=${card}&page=${nextPage}&limit=${PAGE_SIZE}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setItems(prev => [...prev, ...(data.items || [])])
      setHasMore(data.hasMore || false)
      setPage(nextPage)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingMore(false)
    }
  }

  async function loadAll() {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const res  = await fetch(`/api/cardproducts?card=${card}&page=1&limit=500`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setItems(data.items || [])
      setTotal(data.total || 0)
      setHasMore(data.hasMore || false)
      setPage(1)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => { load() }, [card])

  const showing = items.length

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">{title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {loading
                ? 'Loading…'
                : total > 0
                  ? `Showing ${showing} of ${total} · Click "Update Stock" to push directly to Shopify`
                  : 'No products found'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary py-1.5 px-3 text-xs" onClick={() => load()}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button className="btn-secondary py-1.5 px-3 text-xs" onClick={onClose}>
              <X size={15} /> Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loading && (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
              <RefreshCw size={20} className="animate-spin" /> Loading products…
            </div>
          )}

          {error && (
            <div className="p-6 text-red-600 text-sm">{error}</div>
          )}

          {!loading && !error && !items.length && (
            <div className="flex items-center justify-center py-16 text-slate-400">
              No products found for this filter.
            </div>
          )}

          {!loading && items.map((item, i) => (
            <DrillDownRow
              key={item.variantId}
              rank={i + 1}
              item={item}
              card={card}
              onSuccess={() => { load(); onRefreshDashboard?.() }}
            />
          ))}

          {/* ── Load More / Load All footer ──────────────────────────────── */}
          {!loading && !error && hasMore && (
            <div className="px-6 py-4 flex items-center justify-between bg-slate-50 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                Showing <span className="font-semibold text-slate-700">{showing}</span> of{' '}
                <span className="font-semibold text-slate-700">{total}</span> products
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-secondary py-1.5 px-4 text-xs flex items-center gap-1.5"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? <><RefreshCw size={12} className="animate-spin" /> Loading…</>
                    : `Load next ${Math.min(PAGE_SIZE, total - showing)}`}
                </button>
                {total <= 500 && (
                  <button
                    className="btn-primary py-1.5 px-4 text-xs"
                    onClick={loadAll}
                    disabled={loadingMore}
                  >
                    Load all {total}
                  </button>
                )}
              </div>
            </div>
          )}

          {!loading && !error && !hasMore && total > PAGE_SIZE && (
            <div className="px-6 py-3 text-center text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
              All {total} products loaded ✓
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Status badge helper ────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    active:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    draft:    'bg-amber-50   text-amber-700   border-amber-200',
    archived: 'bg-slate-100  text-slate-500   border-slate-200',
  }
  return (
    <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-md border capitalize', map[status] || map.draft)}>
      {status}
    </span>
  )
}

function DrillDownRow({ rank, item, card, onSuccess }) {
  const [editing,      setEditing]      = useState(false)
  const [newQty,       setNewQty]       = useState('')
  const [pushStatus,   setPushStatus]   = useState('idle')   // idle | pushing | success | failed
  const [statusAction, setStatusAction] = useState(null)     // 'active' | 'draft' | null (being pushed)
  const [errMsg,       setErrMsg]       = useState('')

  const isStatusCard = STATUS_CARDS.has(card)

  // ── Push inventory quantity ──────────────────────────────────────────────────
  async function pushStock() {
    const qty = parseInt(newQty, 10)
    if (isNaN(qty) || qty < 0) { toast.error('Enter a valid quantity'); return }

    setPushStatus('pushing')
    try {
      const res  = await fetch('/api/quickpush', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          productId:   item.productId,
          variantId:   item.variantId,
          entityName:  item.productTitle,
          variantName: item.variantTitle,
          sku:         item.sku,
          fieldName:   'inventory_quantity',
          beforeValue: item.currentQty,
          afterValue:  qty,
          changeType:  'inventory',
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setPushStatus('success')
        toast.success(`✅ ${item.productTitle} → ${qty} units pushed`)
        setTimeout(() => { setPushStatus('idle'); setEditing(false); onSuccess?.() }, 1800)
      } else {
        setPushStatus('failed')
        setErrMsg(data.error || 'Failed')
        toast.error(data.error || 'Push failed')
      }
    } catch (e) {
      setPushStatus('failed')
      setErrMsg(e.message)
    }
  }

  // ── Push status change (draft ↔ active ↔ archived) ──────────────────────────
  async function changeProductStatus(newStatus) {
    setStatusAction(newStatus)
    try {
      const res  = await fetch('/api/quickpush', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          productId:   item.productId,
          entityName:  item.productTitle,
          fieldName:   'status',
          beforeValue: item.status,
          afterValue:  newStatus,
          changeType:  'status',
        }),
      })
      const data = await res.json()
      if (data.ok) {
        const label = newStatus === 'active' ? '✅ Published' : newStatus === 'draft' ? '📋 Set to Draft' : '🗃 Archived'
        toast.success(`${label}: ${item.productTitle}`)
        setTimeout(() => { setStatusAction(null); onSuccess?.() }, 1200)
      } else {
        toast.error(data.error || 'Status change failed')
        setStatusAction(null)
      }
    } catch (e) {
      toast.error(e.message)
      setStatusAction(null)
    }
  }

  const stockColor =
    item.currentQty <= 0 ? 'bg-red-50 text-red-600 border-red-200' :
    item.currentQty <  5 ? 'bg-amber-50 text-amber-600 border-amber-200' :
                           'bg-emerald-50 text-emerald-600 border-emerald-200'

  const isPushingStatus = statusAction !== null

  return (
    <div className="px-5 py-3.5 hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-3">
        {/* Rank */}
        <span className="text-xs font-bold text-slate-300 w-6 text-center shrink-0">{rank}</span>

        {/* Image */}
        {item.image
          ? <img src={item.image} alt="" className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0" onError={e => e.target.style.display='none'} />
          : <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <Package size={16} className="text-slate-300" />
            </div>
        }

        {/* Product info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 truncate leading-snug">
              {item.productTitle}
            </span>
            {item.status && <StatusBadge status={item.status} />}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            {item.variantTitle && item.variantTitle !== 'Default Title' && (
              <span className="text-xs text-slate-400">{item.variantTitle}</span>
            )}
            {item.sku && (
              <span className="text-xs text-slate-400 font-mono">SKU: {item.sku}</span>
            )}
            {item.sold30Days > 0 && (
              <span className="text-xs text-indigo-500 font-medium">{item.sold30Days} sold/30d</span>
            )}
            {item.sold7Days > 0 && (
              <span className="text-xs text-purple-500 font-medium">{item.sold7Days} sold/7d</span>
            )}
            {item.totalSold === 0 && (
              <span className="text-xs text-slate-300 italic">No sales</span>
            )}
            {/* ── Restock rule badge ──────────────────────────────────────── */}
            {item.hasRestockRule && item.restockRule && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded font-bold leading-none">
                <Zap size={8} />
                {'<'}{item.restockRule.threshold} → {item.restockRule.restockTo}
                {item.restockRule.autoRestock && (
                  <span className="text-emerald-600 ml-0.5">auto</span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Stock badge (hide on pure status cards to save space) */}
        {!isStatusCard && (
          <div className={clsx('shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg border', stockColor)}>
            {item.currentQty <= 0 ? '0 · OOS' : `${item.currentQty} left`}
          </div>
        )}

        {/* ── Action buttons ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Status toggle buttons */}
          {isPushingStatus ? (
            <span className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
              <Loader2 size={13} className="animate-spin" />
              Updating…
            </span>
          ) : (
            <>
              {item.status === 'draft' && (
                <button
                  className="btn-success py-1.5 px-3 text-xs flex items-center gap-1.5"
                  onClick={() => changeProductStatus('active')}
                  title="Publish to store"
                >
                  <Eye size={13} /> Publish
                </button>
              )}
              {item.status === 'active' && (
                <button
                  className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                  onClick={() => changeProductStatus('draft')}
                  title="Move to draft"
                >
                  <EyeOff size={13} /> Set Draft
                </button>
              )}
              {item.status === 'archived' && (
                <button
                  className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                  onClick={() => changeProductStatus('draft')}
                  title="Unarchive to draft"
                >
                  <Archive size={13} /> Unarchive
                </button>
              )}
            </>
          )}

          {/* Auto-restock rule shortcut */}
          {pushStatus === 'idle' && !editing && !isPushingStatus && (
            <RestockRuleButton item={item} />
          )}

          {/* Stock update button (always shown for non-status-card cards, or as secondary on status cards) */}
          {pushStatus === 'idle' && !editing && (
            <button
              className={clsx(
                'py-1.5 px-3 text-xs shrink-0',
                isStatusCard ? 'btn-secondary' : 'btn-primary'
              )}
              onClick={() => { setEditing(true); setNewQty(String(Math.max(0, item.currentQty))) }}
            >
              {isStatusCard ? `${item.currentQty} stock` : 'Update Stock'}
            </button>
          )}
        </div>
      </div>

      {/* Inline stock edit */}
      {editing && pushStatus === 'idle' && (
        <div className="mt-2 ml-16 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-white border-2 border-indigo-300 rounded-xl px-3 py-2 shadow-sm">
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap">New stock:</span>
            <input
              autoFocus
              type="number"
              min="0"
              className="w-20 text-base font-bold text-slate-800 focus:outline-none text-center"
              value={newQty}
              onChange={e => setNewQty(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  pushStock()
                if (e.key === 'Escape') { setEditing(false); setNewQty('') }
              }}
            />
            <span className="text-xs text-slate-400">units</span>
          </div>
          <button className="btn-success py-2 px-4 text-sm font-semibold flex items-center gap-2" onClick={pushStock}>
            <Send size={14} /> Push to Shopify
          </button>
          <button className="btn-secondary py-2 px-3 text-sm" onClick={() => { setEditing(false); setNewQty('') }}>
            Cancel
          </button>
        </div>
      )}

      {/* Pushing stock */}
      {pushStatus === 'pushing' && (
        <div className="mt-2 ml-16 flex items-center gap-2 text-sm text-indigo-600 font-medium">
          <Loader2 size={15} className="animate-spin" /> Pushing to Shopify…
        </div>
      )}

      {/* Stock success */}
      {pushStatus === 'success' && (
        <div className="mt-2 ml-16 flex items-center gap-2 text-sm text-emerald-600 font-semibold">
          <CheckCircle2 size={15} /> Updated to {newQty} units — live on Shopify ✓
        </div>
      )}

      {/* Stock failed */}
      {pushStatus === 'failed' && (
        <div className="mt-2 ml-16 space-y-1">
          <div className="flex items-center gap-2 text-sm text-red-600">
            <XCircle size={14} /> Push failed: {errMsg}
          </div>
          <button className="text-xs text-indigo-600 underline" onClick={() => { setPushStatus('idle'); setEditing(true) }}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

// ── Restock Rule inline button ─────────────────────────────────────────────────
function RestockRuleButton({ item }) {
  const [open,      setOpen]      = useState(false)
  const [saving,    setSaving]    = useState(false)
  // Track rule state locally so it updates immediately after save without a full list reload
  const [hasRule,   setHasRule]   = useState(!!item.hasRestockRule)
  const [savedRule, setSavedRule] = useState(item.restockRule || null)
  const [form,      setForm]      = useState({
    threshold:   String(item.restockRule?.threshold  ?? 10),
    restockTo:   String(item.restockRule?.restockTo  ?? 10),
    autoRestock: item.restockRule?.autoRestock || false,
  })

  async function save() {
    setSaving(true)
    const res = await fetch('/api/restock-rules', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        productId:    item.productId,
        variantId:    item.variantId,
        productTitle: item.productTitle,
        variantTitle: item.variantTitle,
        sku:          item.sku,
        threshold:    form.threshold,
        restockTo:    form.restockTo,
        autoRestock:  form.autoRestock,
      }),
    })
    const data = await res.json()
    if (data.ok) {
      const verb = hasRule ? 'updated' : 'saved'
      toast.success(`Rule ${verb} for ${item.productTitle}`)
      const updated = {
        threshold:   parseInt(form.threshold,  10),
        restockTo:   parseInt(form.restockTo,  10),
        autoRestock: form.autoRestock,
        enabled:     true,
      }
      setHasRule(true)
      setSavedRule(updated)
      setOpen(false)
    } else {
      toast.error(data.error || 'Failed')
    }
    setSaving(false)
  }

  // ── Expanded edit panel ──────────────────────────────────────────────────────
  if (open) return (
    <div className={clsx(
      'flex items-center gap-2 rounded-xl px-3 py-2 border',
      hasRule
        ? 'bg-amber-50 border-amber-300'
        : 'bg-amber-50 border-amber-200'
    )}>
      <Zap size={13} className="text-amber-500 shrink-0" />
      <span className="text-xs text-slate-600 font-medium whitespace-nowrap">Alert below</span>
      <input
        type="number" min="1"
        className="w-14 text-xs text-center input py-1"
        value={form.threshold}
        onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
      />
      <span className="text-xs text-slate-500">→ restore to</span>
      <input
        type="number" min="1"
        className="w-14 text-xs text-center input py-1"
        value={form.restockTo}
        onChange={e => setForm(f => ({ ...f, restockTo: e.target.value }))}
      />
      <button
        className={clsx('text-xs px-2 py-1 rounded-lg font-semibold border transition-all', form.autoRestock
          ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
          : 'bg-white text-slate-500 border-slate-200'
        )}
        onClick={() => setForm(f => ({ ...f, autoRestock: !f.autoRestock }))}
        title="Toggle auto-push to Shopify"
      >
        {form.autoRestock ? '⚡ Auto' : '🔔 Alert'}
      </button>
      <button className="btn-success py-1 px-2 text-xs" onClick={save} disabled={saving}>
        {saving ? <Loader2 size={11} className="animate-spin" /> : '✓ Save'}
      </button>
      <button className="text-slate-400 hover:text-slate-600 text-xs px-1" onClick={() => setOpen(false)}>✕</button>
    </div>
  )

  // ── Trigger button — filled amber when rule exists, outlined when not ────────
  if (hasRule) {
    return (
      <button
        className="text-xs flex items-center gap-1 shrink-0 border px-2 py-1 rounded-lg transition-colors bg-amber-500 text-white border-amber-600 hover:bg-amber-600"
        onClick={() => setOpen(true)}
        title={`Edit rule: alert < ${savedRule?.threshold}, restore to ${savedRule?.restockTo}`}
      >
        <Zap size={11} /> Rule ✓
      </button>
    )
  }

  return (
    <button
      className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1 shrink-0 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors"
      onClick={() => setOpen(true)}
      title="Set auto-restock rule for this variant"
    >
      <Zap size={11} /> Rule
    </button>
  )
}
