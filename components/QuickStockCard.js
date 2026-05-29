import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, Send, Package } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

/**
 * Interactive dashboard card — shows a list of products and lets the user
 * edit stock inline and push directly to Shopify in one click.
 */
export default function QuickStockCard({ title, icon: Icon, iconColor, badge, items, emptyText, onRefresh }) {
  return (
    <div className="card flex flex-col gap-0 p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
          <Icon size={17} className={iconColor} />
          {title}
        </h3>
        {badge && (
          <span className={clsx('badge text-xs', badge.className)}>{badge.label}</span>
        )}
      </div>

      {/* List */}
      <div className="divide-y divide-slate-100">
        {!items?.length ? (
          <p className="px-5 py-8 text-sm text-slate-400 text-center">{emptyText}</p>
        ) : (
          items.map((item, i) => (
            <QuickStockRow key={item.variantId || item.id} rank={i + 1} item={item} onRefresh={onRefresh} />
          ))
        )}
      </div>
    </div>
  )
}

function QuickStockRow({ rank, item, onRefresh }) {
  const [editing,  setEditing]  = useState(false)
  const [newQty,   setNewQty]   = useState('')
  const [status,   setStatus]   = useState('idle') // idle | pushing | success | failed
  const [errMsg,   setErrMsg]   = useState('')

  async function push() {
    const qty = parseInt(newQty, 10)
    if (isNaN(qty) || qty < 0) { toast.error('Enter a valid quantity (0 or more)'); return }

    setStatus('pushing')
    setErrMsg('')

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
        setStatus('success')
        toast.success(`✅ Stock updated → ${qty} units pushed to Shopify`)
        setTimeout(() => { setStatus('idle'); setEditing(false); setNewQty(''); onRefresh?.() }, 2000)
      } else {
        setStatus('failed')
        setErrMsg(data.error || 'Push failed')
        toast.error(data.error || 'Push failed')
      }
    } catch (e) {
      setStatus('failed')
      setErrMsg(e.message)
      toast.error(e.message)
    }
  }

  const stockColor = item.currentQty === 0 ? 'text-red-600 bg-red-50' :
                     item.currentQty <  5  ? 'text-amber-600 bg-amber-50' :
                                             'text-emerald-600 bg-emerald-50'

  return (
    <div className="px-5 py-3">
      <div className="flex items-center gap-3">
        {/* Rank */}
        <span className="text-xs font-bold text-slate-300 w-5 text-center shrink-0">{rank}</span>

        {/* Image */}
        {item.image
          ? <img src={item.image} alt="" className="w-9 h-9 rounded object-cover border border-slate-200 shrink-0" onError={e => e.target.style.display='none'} />
          : <div className="w-9 h-9 rounded bg-slate-100 flex items-center justify-center shrink-0"><Package size={14} className="text-slate-300" /></div>
        }

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate">{item.productTitle}</div>
          <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
            {item.variantTitle && item.variantTitle !== 'Default Title' && (
              <span>{item.variantTitle}</span>
            )}
            {item.sku && <span className="font-mono">SKU: {item.sku}</span>}
            <span className="text-indigo-500">{item.sold30Days} sold/30d</span>
            {item.sold7Days > 0 && <span className="text-purple-500">{item.sold7Days} sold/7d</span>}
          </div>
        </div>

        {/* Current stock badge */}
        <span className={clsx('badge shrink-0 font-bold', stockColor)}>
          {item.currentQty === 0 ? '0 OOS' : `${item.currentQty} left`}
        </span>

        {/* Edit toggle */}
        {status === 'idle' && !editing && (
          <button
            className="btn-primary py-1.5 px-3 text-xs shrink-0"
            onClick={() => { setEditing(true); setNewQty(String(item.currentQty)) }}
          >
            Update Stock
          </button>
        )}
      </div>

      {/* Inline edit row */}
      {editing && status === 'idle' && (
        <div className="mt-2 ml-0 sm:ml-14 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <span className="text-xs text-slate-400 font-medium">New qty:</span>
            <input
              autoFocus
              type="number"
              min="0"
              className="w-20 bg-transparent text-sm font-bold text-slate-800 focus:outline-none text-center"
              value={newQty}
              onChange={e => setNewQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') push(); if (e.key === 'Escape') { setEditing(false); setNewQty('') } }}
              placeholder="0"
            />
          </div>
          <button
            className="btn-success py-1.5 px-3 text-xs flex items-center gap-1.5"
            onClick={push}
          >
            <Send size={12} /> Push to Shopify
          </button>
          <button
            className="btn-secondary py-1.5 px-3 text-xs"
            onClick={() => { setEditing(false); setNewQty('') }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Pushing state */}
      {status === 'pushing' && (
        <div className="mt-2 ml-0 sm:ml-14 flex items-center gap-2 text-sm text-indigo-600">
          <Loader2 size={14} className="animate-spin" />
          Pushing to Shopify…
        </div>
      )}

      {/* Success state */}
      {status === 'success' && (
        <div className="mt-2 ml-0 sm:ml-14 flex items-center gap-2 text-sm text-emerald-600 font-medium">
          <CheckCircle2 size={14} />
          Updated to {newQty} units — live on Shopify ✓
        </div>
      )}

      {/* Failed state */}
      {status === 'failed' && (
        <div className="mt-2 ml-0 sm:ml-14 space-y-1">
          <div className="flex items-center gap-2 text-sm text-red-600">
            <XCircle size={14} /> Push failed
          </div>
          <div className="text-xs text-red-500 font-mono">{errMsg}</div>
          <button className="text-xs text-indigo-600 underline" onClick={() => { setStatus('idle'); setEditing(true) }}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
