import { useState } from 'react'
import { CheckCircle2, XCircle, AlertCircle, Loader2, Package, Clock, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

const CHANGE_TYPE_COLORS = {
  inventory:    'badge-blue',
  status:       'badge-purple',
  price:        'badge-green',
  vendor:       'badge-gray',
  title:        'badge-yellow',
  description:  'badge-yellow',
  sku:          'badge-gray',
  barcode:      'badge-gray',
  seo_title:    'badge-blue',
  seo_description: 'badge-blue',
  compare_at_price: 'badge-green',
  tags:         'badge-gray',
  type:         'badge-gray',
}

const STATUS_ICONS = {
  pending:   <AlertCircle size={15} className="text-amber-500" />,
  approved:  <CheckCircle2 size={15} className="text-indigo-500" />,
  pushed:    <CheckCircle2 size={15} className="text-emerald-500" />,
  failed:    <XCircle size={15} className="text-red-500" />,
  discarded: <XCircle size={15} className="text-slate-400" />,
}

export default function ReviewChanges({ changes, onRefresh }) {
  const [selected,    setSelected]    = useState(new Set())
  const [pushing,     setPushing]     = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Actionable = pending or previously-approved (retry)
  const actionable = changes.filter(c => ['pending', 'approved'].includes(c.status))
  const pushed     = changes.filter(c => c.status === 'pushed')
  const failed     = changes.filter(c => c.status === 'failed')

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll(ids) {
    if (ids.every(id => selected.has(id))) {
      setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n })
    }
  }

  async function discardSelected() {
    if (!selected.size) return
    const res = await fetch('/api/changes', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids: [...selected] }),
    })
    if (res.ok) {
      toast.success('Changes discarded')
      setSelected(new Set())
      onRefresh()
    }
  }

  // IDs to push: selected ones if any, otherwise all actionable
  const pushIds = selected.size > 0
    ? [...selected].filter(id => actionable.some(c => c.id === id))
    : actionable.map(c => c.id)

  async function pushToShopify() {
    setShowConfirm(false)
    setPushing(true)
    const tid = toast.loading(`Pushing ${pushIds.length} change(s) to Shopify…`)

    try {
      const res  = await fetch('/api/changes/push', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids: pushIds }),
      })
      const data = await res.json()

      toast.dismiss(tid)
      if (data.failed > 0) {
        toast.error(`${data.pushed} pushed · ${data.failed} failed — check Change Log`)
      } else {
        toast.success(`All ${data.pushed} change(s) pushed to Shopify!`)
      }
      setSelected(new Set())
      onRefresh()
    } catch (e) {
      toast.error(e.message, { id: tid })
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Summary strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending',  count: actionable.length, color: 'bg-amber-50   text-amber-700'   },
          { label: 'Pushed',   count: pushed.length,     color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Failed',   count: failed.length,     color: 'bg-red-50     text-red-700'     },
        ].map(({ label, count, color }) => (
          <div key={label} className={clsx('card text-center', color)}>
            <div className="text-2xl font-bold">{count}</div>
            <div className="text-xs font-medium mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Action toolbar ─────────────────────────────────────────────────── */}
      {actionable.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 card py-3">
          {selected.size > 0 && (
            <>
              <span className="text-sm text-slate-500">{selected.size} selected</span>
              <button className="btn-danger" onClick={discardSelected}>
                <XCircle size={15} /> Discard Selected
              </button>
            </>
          )}

          <button
            className="btn-success ml-auto"
            onClick={() => setShowConfirm(true)}
            disabled={pushing || pushIds.length === 0}
          >
            {pushing
              ? <><Loader2 size={15} className="animate-spin" /> Pushing…</>
              : <><CheckCircle2 size={15} /> Push {pushIds.length} Change{pushIds.length !== 1 ? 's' : ''} → Shopify</>
            }
          </button>
        </div>
      )}

      {/* ── Confirm popup ──────────────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 modal-scroll">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertCircle size={28} className="text-amber-500" />
              </div>
              <h3 className="font-bold text-slate-800 text-lg">Push to Shopify?</h3>
              <p className="text-slate-500 text-sm mt-1">
                You are about to push <strong>{pushIds.length} change{pushIds.length !== 1 ? 's' : ''}</strong> to your live Shopify store.
                This action cannot be automatically undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button className="btn-success flex-1" onClick={pushToShopify}>
                Yes, Push Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change cards ───────────────────────────────────────────────────── */}
      {changes.filter(c => ['pending', 'approved', 'failed'].includes(c.status)).length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          No pending changes. Edit products in the Products table to create draft changes.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Select-all header */}
          <div className="flex items-center gap-3 px-1">
            <input
              type="checkbox"
              onChange={() => toggleAll(actionable.map(c => c.id))}
              checked={actionable.length > 0 && actionable.every(c => selected.has(c.id))}
            />
            <span className="text-xs text-slate-400 font-medium">Select all · deselect to push all</span>
          </div>

          {changes.map(c => (
            <ChangeCard
              key={c.id}
              change={c}
              selected={selected.has(c.id)}
              onSelect={() => toggleSelect(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ChangeCard({ change: c, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false)
  const isActionable = ['pending', 'approved'].includes(c.status)

  const isInventory = c.changeType === 'inventory'
  const beforeNum   = isInventory ? parseInt(c.beforeValue, 10) : null
  const afterNum    = isInventory ? parseInt(c.afterValue,  10) : null
  const qtyDelta    = isInventory && !isNaN(beforeNum) && !isNaN(afterNum) ? afterNum - beforeNum : null

  return (
    <div className={clsx(
      'card p-0 overflow-hidden transition-all',
      selected && 'ring-2 ring-indigo-400',
      c.status === 'discarded' && 'opacity-50',
      c.status === 'pushed'    && 'bg-emerald-50/40',
      c.status === 'failed'    && 'bg-red-50/40',
    )}>
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Checkbox */}
        <div className="pt-0.5 shrink-0">
          {isActionable
            ? <input type="checkbox" checked={selected} onChange={onSelect} />
            : <div className="w-4 h-4" />
          }
        </div>

        {/* Product image */}
        {c.product?.firstImageSrc
          ? <img src={c.product.firstImageSrc} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0" onError={e => e.target.style.display='none'} />
          : <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <Package size={18} className="text-slate-300" />
            </div>
        }

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: product name + badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800 text-sm truncate max-w-xs">
              {c.entityName}
            </span>
            <span className={clsx('badge text-xs', CHANGE_TYPE_COLORS[c.changeType] || 'badge-gray')}>
              {c.changeType}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              {STATUS_ICONS[c.status]}
              <span className="font-medium">{c.status}</span>
            </span>
          </div>

          {/* Row 2: variant + SKU */}
          {(c.variantName || c.sku) && (
            <div className="flex items-center gap-3 mt-0.5">
              {c.variantName && c.variantName !== 'Default Title' && (
                <span className="text-xs text-slate-400">{c.variantName}</span>
              )}
              {c.sku && (
                <span className="text-xs text-slate-400 font-mono">SKU: {c.sku}</span>
              )}
            </div>
          )}

          {/* Row 3: Before → After diff */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">{c.fieldName}</span>
            <div className="flex items-center gap-2">
              <span className={clsx(
                'text-sm px-2.5 py-0.5 rounded-lg font-mono',
                c.status !== 'pending' ? 'bg-red-50 text-red-600 line-through' : 'bg-slate-100 text-slate-600'
              )}>
                {c.beforeValue || '—'}
              </span>
              <span className="text-slate-300 text-xs">→</span>
              <span className="text-sm px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-mono font-semibold">
                {c.afterValue || '—'}
              </span>
              {/* Inventory delta */}
              {qtyDelta !== null && (
                <span className={clsx(
                  'text-xs font-bold px-2 py-0.5 rounded-full',
                  qtyDelta > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                )}>
                  {qtyDelta > 0 ? `+${qtyDelta}` : qtyDelta} units
                </span>
              )}
            </div>
          </div>

          {/* Error message */}
          {c.status === 'failed' && c.errorMessage && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
              <XCircle size={13} className="shrink-0 mt-0.5" />
              {c.errorMessage}
            </div>
          )}

          {/* Notes */}
          {c.notes && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-500 italic">
              <MessageSquare size={12} className="shrink-0 mt-0.5" />
              {c.notes}
            </div>
          )}
        </div>

        {/* Timestamps (right side) */}
        <div className="shrink-0 text-right space-y-1 min-w-[130px]">
          {c.createdAt && (
            <div className="flex items-center justify-end gap-1 text-xs text-slate-400">
              <Clock size={11} />
              Created {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
            </div>
          )}
          {c.approvedAt && (
            <div className="flex items-center justify-end gap-1 text-xs text-indigo-400">
              <CheckCircle2 size={11} />
              Approved {formatDistanceToNow(new Date(c.approvedAt), { addSuffix: true })}
            </div>
          )}
          {c.pushedAt && (
            <div className="flex items-center justify-end gap-1 text-xs text-emerald-500">
              <CheckCircle2 size={11} />
              Pushed {formatDistanceToNow(new Date(c.pushedAt), { addSuffix: true })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
