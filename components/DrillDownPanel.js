import { useState, useEffect } from 'react'
import { X, RefreshCw, Package, Send, Loader2, CheckCircle2, XCircle,
         Eye, EyeOff, Archive, Zap } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

// Cards where the primary action is status toggle (not stock update)
const STATUS_CARDS = new Set(['draftProducts', 'activeProducts', 'archivedProducts'])

const PAGE_SIZE = 50

export default function DrillDownPanel({ card, title, onClose, onRefreshDashboard }) {
  const [items,       setItems]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error,       setError]       = useState(null)
  const [page,        setPage]        = useState(1)
  const [total,       setTotal]       = useState(0)
  const [hasMore,     setHasMore]     = useState(false)

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
      setHasMore(false)
      setPage(1)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => { load() }, [card])  // eslint-disable-line

  const showing = items.length

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="font-bold text-slate-800 text-lg leading-tight">{title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {loading ? 'Loading…' : total > 0 ? `Showing ${showing} of ${total}` : 'No items found'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" onClick={() => load()}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" onClick={onClose}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {loading && (
            <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
              <RefreshCw size={20} className="animate-spin" /> Loading…
            </div>
          )}

          {error && (
            <div className="p-6 text-red-600 text-sm">{error}</div>
          )}

          {!loading && !error && !items.length && (
            <div className="flex items-center justify-center py-20 text-slate-400">
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

          {/* ── Load More footer ──────────────────────────────────────────── */}
          {!loading && !error && hasMore && (
            <div className="px-5 py-4 flex items-center justify-between bg-slate-50 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{showing}</span> of{' '}
                <span className="font-semibold text-slate-700">{total}</span>
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-secondary py-1.5 px-4 text-xs"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? <><RefreshCw size={12} className="animate-spin mr-1" />Loading…</> : `Next ${Math.min(PAGE_SIZE, total - showing)}`}
                </button>
                {total <= 500 && (
                  <button className="btn-primary py-1.5 px-4 text-xs" onClick={loadAll} disabled={loadingMore}>
                    Load all {total}
                  </button>
                )}
              </div>
            </div>
          )}

          {!loading && !error && !hasMore && total > PAGE_SIZE && (
            <div className="px-5 py-3 text-center text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
              All {total} loaded ✓
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    active:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    draft:    'bg-amber-50   text-amber-700   border-amber-200',
    archived: 'bg-slate-100  text-slate-500   border-slate-200',
  }
  return (
    <span className={clsx('inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-md border capitalize', map[status] || map.draft)}>
      {status}
    </span>
  )
}

// ── Individual card row ────────────────────────────────────────────────────────
function DrillDownRow({ rank, item, card, onSuccess }) {
  const [editing,       setEditing]       = useState(false)
  const [newQty,        setNewQty]        = useState('')
  const [pushStatus,    setPushStatus]    = useState('idle')
  const [statusAction,  setStatusAction]  = useState(null)
  const [errMsg,        setErrMsg]        = useState('')
  const [ruleOpen,      setRuleOpen]      = useState(false)
  const [hasRule,       setHasRule]       = useState(!!item.hasRestockRule)
  const [ruleData,      setRuleData]      = useState(item.restockRule || null)
  const [awaitActivate, setAwaitActivate] = useState(false)  // "also activate?" prompt

  const isStatusCard    = STATUS_CARDS.has(card)
  const isPushingStatus = statusAction !== null

  // ── Step 1: Push button pressed — ask if non-active product should be activated ──
  function triggerPush() {
    const qty = parseInt(newQty, 10)
    if (isNaN(qty) || qty < 0) { toast.error('Enter a valid quantity'); return }

    // If product is draft or archived, ask before pushing
    if (item.status && item.status !== 'active') {
      setAwaitActivate(true)
    } else {
      executePush(false)
    }
  }

  // ── Step 2: Do the actual push (with optional status change) ─────────────────
  async function executePush(alsoActivate) {
    const qty = parseInt(newQty, 10)
    setAwaitActivate(false)
    setPushStatus('pushing')

    try {
      // Always push the stock update
      const stockRes  = await fetch('/api/quickpush', {
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
      const stockData = await stockRes.json()
      if (!stockData.ok) throw new Error(stockData.error || 'Stock push failed')

      // Optionally also activate the product
      if (alsoActivate && item.status !== 'active') {
        await fetch('/api/quickpush', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            productId:   item.productId,
            entityName:  item.productTitle,
            fieldName:   'status',
            beforeValue: item.status,
            afterValue:  'active',
            changeType:  'status',
          }),
        })
      }

      setPushStatus('success')
      toast.success(alsoActivate
        ? `✅ Stock set to ${qty} & product published!`
        : `✅ ${item.productTitle} → ${qty} units`
      )
      setTimeout(() => { setPushStatus('idle'); setEditing(false); onSuccess?.() }, 1800)
    } catch (e) {
      setPushStatus('failed')
      setErrMsg(e.message)
      toast.error(e.message || 'Push failed')
    }
  }

  // ── Status change ────────────────────────────────────────────────────────────
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
        const label = newStatus === 'active' ? '✅ Published' : newStatus === 'draft' ? '📋 Draft' : '🗃 Archived'
        toast.success(`${label}: ${item.productTitle}`)
        setTimeout(() => { setStatusAction(null); onSuccess?.() }, 1200)
      } else {
        toast.error(data.error || 'Failed')
        setStatusAction(null)
      }
    } catch (e) {
      toast.error(e.message)
      setStatusAction(null)
    }
  }

  // Stock colour pill
  const qty = item.currentQty
  const stockPill =
    qty <= 0 ? 'bg-red-500 text-white'   :
    qty <  5 ? 'bg-amber-400 text-white' :
               'bg-emerald-500 text-white'

  return (
    <>
      <div className="px-4 py-4 border-b border-slate-100 active:bg-slate-50 transition-colors">

        {/* ── Top: image + title + stock pill ─────────────────────────────── */}
        <div className="flex gap-3 items-start">

          {/* Image */}
          {item.image
            ? <img src={item.image} alt="" className="w-12 h-12 rounded-xl object-cover border border-slate-100 shrink-0"
                onError={e => { e.target.style.display = 'none' }} />
            : <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Package size={18} className="text-slate-300" />
              </div>
          }

          {/* Info */}
          <div className="flex-1" style={{ minWidth: 0 }}>
            {/* Product name — always visible, never clipped */}
            <p className="text-sm font-bold text-slate-800 leading-snug"
               style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {rank}. {item.productTitle}
            </p>

            {/* Variant + SKU on one compact line */}
            {(item.variantTitle && item.variantTitle !== 'Default Title') || item.sku ? (
              <p className="text-xs text-slate-400 mt-0.5">
                {[
                  item.variantTitle !== 'Default Title' ? item.variantTitle : null,
                  item.sku ? `SKU: ${item.sku}` : null,
                ].filter(Boolean).join(' · ')}
              </p>
            ) : null}

            {/* Status badge */}
            {item.status && <div className="mt-1"><StatusBadge status={item.status} /></div>}
          </div>

          {/* Stock count pill — top right, always visible */}
          {!isStatusCard && (
            <span className={clsx('shrink-0 text-xs font-bold px-2.5 py-1 rounded-full self-start', stockPill)}>
              {qty <= 0 ? 'OOS' : qty}
            </span>
          )}
        </div>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className="mt-3">

          {/* Normal state: buttons */}
          {!editing && pushStatus === 'idle' && (
            <div className="flex gap-2">

              {/* Status toggle button */}
              {isPushingStatus ? (
                <span className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
                  <Loader2 size={12} className="animate-spin" /> Updating…
                </span>
              ) : (
                <>
                  {item.status === 'draft' && (
                    <button
                      className="btn-success flex-1 py-2.5 text-xs"
                      onClick={() => changeProductStatus('active')}
                    >
                      <Eye size={13} /> Publish
                    </button>
                  )}
                  {item.status === 'active' && (
                    <button
                      className="btn-secondary flex-1 py-2.5 text-xs"
                      onClick={() => changeProductStatus('draft')}
                    >
                      <EyeOff size={13} /> Set Draft
                    </button>
                  )}
                  {item.status === 'archived' && (
                    <button
                      className="btn-secondary flex-1 py-2.5 text-xs"
                      onClick={() => changeProductStatus('draft')}
                    >
                      <Archive size={13} /> Unarchive
                    </button>
                  )}
                </>
              )}

              {/* Rule button */}
              {!isPushingStatus && (
                <button
                  className={clsx(
                    'py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center gap-1 shrink-0 transition-colors',
                    hasRule
                      ? 'bg-amber-500 text-white border-amber-600'
                      : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'
                  )}
                  onClick={() => setRuleOpen(true)}
                  title="Auto-restock rule"
                >
                  <Zap size={12} />
                  {hasRule ? '✓' : 'Rule'}
                </button>
              )}

              {/* Update stock / stock count */}
              {!isPushingStatus && (
                <button
                  className={clsx('flex-1 py-2.5 text-xs font-semibold rounded-xl', isStatusCard ? 'btn-secondary' : 'btn-primary')}
                  onClick={() => { setEditing(true); setNewQty(String(Math.max(0, item.currentQty))) }}
                >
                  {isStatusCard ? `${item.currentQty} in stock` : 'Update Stock'}
                </button>
              )}
            </div>
          )}

          {/* Editing stock — quantity input */}
          {editing && pushStatus === 'idle' && !awaitActivate && (
            <div className="flex gap-2 items-center">
              <input
                autoFocus
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="0"
                className="flex-1 text-center text-2xl font-bold border-2 border-indigo-400 rounded-xl py-2.5 focus:outline-none focus:border-indigo-500"
                value={newQty}
                onChange={e => setNewQty(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  triggerPush()
                  if (e.key === 'Escape') { setEditing(false); setNewQty(''); setAwaitActivate(false) }
                }}
              />
              <button
                className="btn-success py-2.5 px-5 text-sm font-semibold shrink-0 flex items-center gap-1.5"
                onClick={triggerPush}
              >
                <Send size={14} /> Push
              </button>
              <button
                className="btn-secondary py-2.5 px-3 text-sm shrink-0"
                onClick={() => { setEditing(false); setNewQty(''); setAwaitActivate(false) }}
              >
                ✕
              </button>
            </div>
          )}

          {/* ── "Also activate?" confirm prompt ─────────────────────────── */}
          {awaitActivate && pushStatus === 'idle' && (
            <div className="mt-2 rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-indigo-500 shrink-0" />
                <p className="text-sm font-bold text-slate-800">
                  Also publish this product?
                </p>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Set stock to <span className="font-bold text-slate-700">{newQty} units</span> and also
                change status from{' '}
                <span className="font-semibold text-amber-600 capitalize">{item.status}</span>
                {' '}→{' '}
                <span className="font-semibold text-emerald-600">Active</span> on Shopify?
              </p>
              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  className="flex-1 py-3 rounded-xl text-sm font-bold bg-indigo-600 text-white active:bg-indigo-700 flex items-center justify-center gap-1.5"
                  onClick={() => executePush(true)}
                >
                  <Eye size={14} /> Yes — Stock + Publish
                </button>
                <button
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-white text-slate-600 border border-slate-200 active:bg-slate-50"
                  onClick={() => executePush(false)}
                >
                  Stock only
                </button>
              </div>
              <button
                className="w-full text-xs text-slate-400 text-center py-1"
                onClick={() => { setAwaitActivate(false); setEditing(true) }}
              >
                ← Back to edit quantity
              </button>
            </div>
          )}

          {/* Push status states */}
          {pushStatus === 'pushing' && (
            <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium py-1">
              <Loader2 size={15} className="animate-spin" /> Pushing to Shopify…
            </div>
          )}
          {pushStatus === 'success' && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 font-semibold py-1">
              <CheckCircle2 size={15} /> Updated to {newQty} units ✓
            </div>
          )}
          {pushStatus === 'failed' && (
            <div className="space-y-1 py-1">
              <div className="flex items-center gap-2 text-sm text-red-600">
                <XCircle size={14} /> Failed: {errMsg}
              </div>
              <button
                className="text-xs text-indigo-600 underline"
                onClick={() => { setPushStatus('idle'); setEditing(true) }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Rule bottom sheet ──────────────────────────────────────────────── */}
      {ruleOpen && (
        <RuleSheet
          item={item}
          hasRule={hasRule}
          ruleData={ruleData}
          onClose={() => setRuleOpen(false)}
          onSaved={(rule) => {
            setHasRule(true)
            setRuleData(rule)
            setRuleOpen(false)
          }}
        />
      )}
    </>
  )
}

// ── Rule bottom sheet — slides up from bottom ─────────────────────────────────
function RuleSheet({ item, hasRule, ruleData, onClose, onSaved }) {
  const [form, setForm] = useState({
    threshold:   String(ruleData?.threshold  ?? 10),
    restockTo:   String(ruleData?.restockTo  ?? 10),
    autoRestock: ruleData?.autoRestock || false,
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res  = await fetch('/api/restock-rules', {
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
        toast.success(`Rule ${hasRule ? 'updated' : 'saved'} ✓`)
        onSaved({
          threshold:   parseInt(form.threshold, 10),
          restockTo:   parseInt(form.restockTo, 10),
          autoRestock: form.autoRestock,
        })
      } else {
        toast.error(data.error || 'Failed to save rule')
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-3xl w-full p-6 space-y-5 shadow-2xl max-w-2xl mx-auto">
        {/* Handle bar */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-slate-200 rounded-full" />

        {/* Title */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Zap size={16} className="text-amber-500" />
              Auto-Restock Rule
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 max-w-[260px] truncate">{item.productTitle}</p>
          </div>
          <button className="text-slate-400 hover:text-slate-600 p-1" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Threshold + Restock inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
              Alert when stock ↓ below
            </label>
            <input
              type="number"
              min="1"
              inputMode="numeric"
              className="input w-full text-center text-2xl font-bold py-3"
              value={form.threshold}
              onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
              Restore quantity to
            </label>
            <input
              type="number"
              min="1"
              inputMode="numeric"
              className="input w-full text-center text-2xl font-bold py-3"
              value={form.restockTo}
              onChange={e => setForm(f => ({ ...f, restockTo: e.target.value }))}
            />
          </div>
        </div>

        {/* Auto-push toggle */}
        <button
          className={clsx(
            'w-full py-3.5 rounded-2xl font-semibold text-sm border-2 transition-all',
            form.autoRestock
              ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200'
          )}
          onClick={() => setForm(f => ({ ...f, autoRestock: !f.autoRestock }))}
        >
          {form.autoRestock
            ? '⚡ Auto-push to Shopify when triggered'
            : '🔔 Alert only — tap to enable auto-push'}
        </button>

        {/* Buttons */}
        <div className="flex gap-3 pb-2">
          <button className="btn-secondary flex-1 py-3" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1 py-3" onClick={save} disabled={saving}>
            {saving
              ? <><RefreshCw size={14} className="animate-spin" /> Saving…</>
              : <><Zap size={14} /> {hasRule ? 'Update Rule' : 'Save Rule'}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
