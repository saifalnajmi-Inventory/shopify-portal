/**
 * Orders — synced from Shopify with tabs for All / Unfulfilled / Unpaid / Cancelled
 * Cancelled tab shows the products that were ordered + their current live stock,
 * so you can immediately see which items need to be zeroed or set to draft.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  ShoppingBag, RefreshCw, Search, X, Package,
  AlertTriangle, XCircle,
} from 'lucide-react'
import clsx            from 'clsx'
import { formatDistanceToNow, format } from 'date-fns'

// ── Badge maps ─────────────────────────────────────────────────────────────────
const FINANCIAL = {
  paid:               { label: 'Paid',           color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending:            { label: 'Payment Pending', color: 'bg-amber-50   text-amber-700   border-amber-200'  },
  authorized:         { label: 'Authorized',     color: 'bg-blue-50    text-blue-700    border-blue-200'   },
  partially_paid:     { label: 'Part. Paid',     color: 'bg-amber-50   text-amber-700   border-amber-200'  },
  refunded:           { label: 'Refunded',       color: 'bg-slate-100  text-slate-600   border-slate-200'  },
  voided:             { label: 'Voided',         color: 'bg-slate-100  text-slate-500   border-slate-200'  },
  partially_refunded: { label: 'Part. Refund',   color: 'bg-slate-100  text-slate-500   border-slate-200'  },
}
const FULFILLMENT = {
  fulfilled: { label: 'Fulfilled',      color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial:   { label: 'Part. Fulfilled',color: 'bg-amber-50   text-amber-700   border-amber-200'  },
}
const UNFULFILLED  = { label: 'Unfulfilled', color: 'bg-slate-100 text-slate-500 border-slate-200' }

const CANCEL_REASON = {
  customer:  'Customer request',
  fraud:     'Fraudulent',
  inventory: 'Out of stock',
  declined:  'Payment declined',
  other:     'Other',
}

function Badge({ label, color }) {
  return (
    <span className={clsx(
      'inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap',
      color,
    )}>
      {label}
    </span>
  )
}

/** Stock pill — coloured by quantity */
function StockPill({ qty }) {
  if (qty == null) return null
  const color = qty <= 0  ? 'bg-red-500 text-white'
              : qty <= 3  ? 'bg-red-100 text-red-700 border border-red-300'
              : qty <= 9  ? 'bg-amber-100 text-amber-700 border border-amber-300'
              :              'bg-emerald-100 text-emerald-700 border border-emerald-300'
  return (
    <span className={clsx('text-[11px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap', color)}>
      {qty <= 0 ? '0 — OOS' : `${qty} left`}
    </span>
  )
}

const TABS = [
  { key: 'all',         label: 'All' },
  { key: 'unfulfilled', label: 'Unfulfilled' },
  { key: 'unpaid',      label: 'Unpaid' },
  { key: 'cancelled',   label: 'Cancelled' },
]

export default function OrdersPage() {
  const [tab,                setTab]                = useState('all')
  const [orders,             setOrders]             = useState([])
  const [total,              setTotal]              = useState(0)
  const [page,               setPage]               = useState(1)
  const [loading,            setLoading]            = useState(true)
  const [search,             setSearch]             = useState('')
  const [tabCounts,          setTabCounts]          = useState({})
  const [cancelledTotalValue, setCancelledTotalValue] = useState(0)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    const params = new URLSearchParams({ tab, page: p, limit: 50 })
    if (search.trim()) params.set('search', search.trim())
    const res  = await fetch(`/api/orders?${params}`)
    const data = await res.json()
    setOrders(data.orders   || [])
    setTotal(data.total     || 0)
    setTabCounts(data.tabs  || {})
    if (data.cancelledTotalValue != null) setCancelledTotalValue(data.cancelledTotalValue)
    setLoading(false)
  }, [tab, search])

  useEffect(() => { setPage(1); load(1) }, [tab, search]) // eslint-disable-line
  useEffect(() => { load(page) }, [page])                 // eslint-disable-line

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ShoppingBag size={22} /> Orders
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Synced from Shopify — run a sync to get the latest.
          </p>
        </div>
        <button className="btn-secondary text-sm" onClick={() => load(page)}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1) }}
              className={clsx(
                'px-5 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-2',
                tab === t.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
              )}
            >
              {t.label}
              {tabCounts[t.key] != null && (
                <span className={clsx(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[20px] text-center',
                  tab === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500',
                )}>
                  {tabCounts[t.key].toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cancelled total value summary ─────────────────────────────────── */}
      {tab === 'cancelled' && (
        <div className="flex items-center justify-between gap-4 px-5 py-4 rounded-xl bg-slate-800 text-white">
          <div className="flex items-center gap-2.5">
            <XCircle size={18} className="text-red-400 shrink-0" />
            <div>
              <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Cancelled Orders</div>
              <div className="text-lg font-bold text-white leading-tight">
                {(tabCounts.cancelled || 0).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Cancelled Value</div>
            <div className="text-2xl font-bold text-red-300 leading-tight">
              KWD {cancelledTotalValue.toLocaleString('en', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
            </div>
          </div>
        </div>
      )}

      {/* ── Cancelled tab hint ─────────────────────────────────────────────── */}
      {tab === 'cancelled' && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-500" />
          <span>
            Products with <strong>0 OOS</strong> stock are still active — customers can re-order them.
            Use <strong>Set 0</strong>, <strong>Set Draft</strong>, <strong>Update Stock</strong>, or <strong>Zero + Draft</strong> on each product below to fix them directly.
          </span>
        </div>
      )}

      {/* ── Search ────────────────────────────────────────────────────────── */}
      <div className="relative w-full sm:w-80">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9 pr-8 w-full text-sm"
          placeholder="Search order # or customer…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
        {search && (
          <button
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            onClick={() => { setSearch(''); setPage(1) }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="card p-0 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
            <RefreshCw size={20} className="animate-spin" /> Loading orders…
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <ShoppingBag size={32} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">
              No {tab !== 'all' ? tab : ''} orders found{search ? ` matching "${search}"` : ''}.
            </p>
            {tab === 'cancelled' && !search && (
              <p className="text-xs mt-1 max-w-xs mx-auto">
                Run a sync to pull cancelled orders from Shopify.
              </p>
            )}
          </div>
        ) : tab === 'cancelled' ? (
          // ── Cancelled tab — shows products + live stock ──────────────────
          <CancelledTable orders={orders} page={page} />
        ) : (
          // ── Standard table for All / Unfulfilled / Unpaid ────────────────
          <StandardTable orders={orders} page={page} tab={tab} />
        )}
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {total > 50 && (
        <div className="flex items-center justify-center gap-3">
          <button className="btn-secondary text-sm" disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span className="text-sm text-slate-500">
            Page <span className="font-semibold text-slate-700">{page}</span> of{' '}
            <span className="font-semibold text-slate-700">{totalPages}</span>
            <span className="ml-2 text-slate-400">({total.toLocaleString()} total)</span>
          </span>
          <button className="btn-secondary text-sm" disabled={orders.length < 50}
            onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  )
}

// ── Cancelled orders table — product + live stock + action buttons ────────────
function CancelledTable({ orders, page }) {
  // Per-line-item UI state: { [liId]: { status, mode, msg, showInput, inputVal } }
  const [actionState,    setActionState]    = useState({})
  // Local stock overrides after a successful push so the pill updates instantly
  const [stockOverrides, setStockOverrides] = useState({})

  function getS(id) {
    return actionState[id] || { status: 'idle', mode: null, msg: '', showInput: false, inputVal: '' }
  }
  function patchS(id, patch) {
    setActionState(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }))
  }

  async function pushAction(li, mode, inputVal) {
    const currentStock = stockOverrides[li.id] ?? li.variant?.inventoryQuantity ?? 0
    patchS(li.id, { status: 'pushing', mode, msg: '' })

    try {
      // ── Zero stock ──────────────────────────────────────────────────────────
      if (mode === 'zero' || mode === 'both') {
        const res  = await fetch('/api/quickpush', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: li.productId, variantId: li.variantId,
            entityName: li.title, variantName: li.variantTitle, sku: li.sku,
            fieldName: 'inventory_quantity', beforeValue: currentStock, afterValue: 0,
            changeType: 'inventory',
          }),
        })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error || 'Stock push failed')
        setStockOverrides(prev => ({ ...prev, [li.id]: 0 }))
      }

      // ── Set Draft ───────────────────────────────────────────────────────────
      if (mode === 'draft' || mode === 'both') {
        const res  = await fetch('/api/quickpush', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: li.productId,
            entityName: li.title,
            fieldName: 'status', beforeValue: 'active', afterValue: 'draft',
            changeType: 'status',
          }),
        })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error || 'Draft push failed')
      }

      // ── Update to custom stock ──────────────────────────────────────────────
      if (mode === 'stock') {
        const newQty = parseInt(inputVal, 10)
        if (isNaN(newQty) || newQty < 0) throw new Error('Enter a valid number')
        const res  = await fetch('/api/quickpush', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: li.productId, variantId: li.variantId,
            entityName: li.title, variantName: li.variantTitle, sku: li.sku,
            fieldName: 'inventory_quantity', beforeValue: currentStock, afterValue: newQty,
            changeType: 'inventory',
          }),
        })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error || 'Stock push failed')
        setStockOverrides(prev => ({ ...prev, [li.id]: newQty }))
      }

      patchS(li.id, { status: 'success', showInput: false })
      setTimeout(() => patchS(li.id, { status: 'idle', mode: null, msg: '' }), 2200)
    } catch (e) {
      patchS(li.id, { status: 'failed', msg: e.message })
      setTimeout(() => patchS(li.id, { status: 'idle', mode: null, msg: '' }), 3500)
    }
  }

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th className="text-center w-8 hidden sm:table-cell">#</th>
          <th>Order</th>
          <th>Products Ordered + Current Stock</th>
          <th className="hidden md:table-cell">Cancelled</th>
          <th className="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o, idx) => {
          const srNo    = (page - 1) * 50 + idx + 1
          const dateStr = format(new Date(o.createdAt), 'dd MMM · h:mm a')
          const hasOOS  = o.lineItems?.some(li => {
            const stock = stockOverrides[li.id] ?? li.variant?.inventoryQuantity
            return stock != null && stock <= 0
          })

          return (
            <tr key={o.id} className="align-top">
              <td className="text-center text-xs text-slate-400 font-mono hidden sm:table-cell pt-4">{srNo}</td>

              {/* Order # + date + customer */}
              <td className="pt-4 min-w-[100px]">
                <div className="font-bold text-slate-800">#{o.orderNumber}</div>
                <div className="text-xs text-slate-400 mt-0.5">{dateStr}</div>
                {(o.customerName || o.email) && (
                  <div className="text-xs text-slate-500 mt-0.5 max-w-[120px] truncate">
                    {o.customerName || o.email}
                  </div>
                )}
                {o.cancelReason && (
                  <div className="mt-1 text-[11px] text-red-500 font-medium">
                    {CANCEL_REASON[o.cancelReason] || o.cancelReason}
                  </div>
                )}
              </td>

              {/* Products + stock + action buttons — the main column */}
              <td className="py-3 min-w-[320px]">
                {o.lineItems?.length > 0 ? (
                  <div className="space-y-2.5">
                    {o.lineItems.map(li => {
                      const stock     = stockOverrides[li.id] ?? li.variant?.inventoryQuantity
                      const img       = li.variant?.product?.firstImageSrc
                      const s         = getS(li.id)
                      const canStock  = !!li.variantId
                      const canDraft  = !!li.productId
                      const isPushing = s.status === 'pushing'

                      return (
                        <div key={li.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                          {/* Product info row */}
                          <div className="flex items-center gap-2.5">
                            {img
                              ? <img src={img} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0" onError={e => e.target.style.display='none'} />
                              : <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Package size={13} className="text-slate-300" /></div>
                            }
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-800 leading-snug truncate max-w-[220px]">
                                {li.title}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                {li.variantTitle && li.variantTitle !== 'Default Title' && (
                                  <span className="text-[11px] text-slate-400">{li.variantTitle}</span>
                                )}
                                {li.sku && <span className="text-[10px] font-mono text-slate-400">SKU: {li.sku}</span>}
                                <span className="text-[11px] text-slate-400">×{li.quantity}</span>
                              </div>
                            </div>
                            <div className="shrink-0">
                              {stock != null
                                ? <StockPill qty={stock} />
                                : <span className="text-[10px] text-slate-300 italic">no stock data</span>
                              }
                            </div>
                          </div>

                          {/* ── Action buttons ────────────────────────────── */}
                          {(canStock || canDraft) && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">

                              {/* 1. Set 0 */}
                              {canStock && (
                                <button
                                  disabled={isPushing}
                                  onClick={() => pushAction(li, 'zero')}
                                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 disabled:opacity-40 transition-colors whitespace-nowrap"
                                >
                                  Set 0
                                </button>
                              )}

                              {/* 2. Set Draft */}
                              {canDraft && (
                                <button
                                  disabled={isPushing}
                                  onClick={() => pushAction(li, 'draft')}
                                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200 disabled:opacity-40 transition-colors whitespace-nowrap"
                                >
                                  Set Draft
                                </button>
                              )}

                              {/* 3. Update Stock — shows inline input when active */}
                              {canStock && (
                                s.showInput ? (
                                  <span className="flex items-center gap-1">
                                    <input
                                      type="number" min="0"
                                      className="w-16 text-[11px] border border-blue-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                      placeholder="qty"
                                      value={s.inputVal}
                                      onChange={e => patchS(li.id, { inputVal: e.target.value })}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter')  pushAction(li, 'stock', s.inputVal)
                                        if (e.key === 'Escape') patchS(li.id, { showInput: false, inputVal: '' })
                                      }}
                                      autoFocus
                                    />
                                    <button
                                      disabled={isPushing}
                                      onClick={() => pushAction(li, 'stock', s.inputVal)}
                                      className="text-[11px] font-bold px-2 py-1 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 transition-colors"
                                    >✓</button>
                                    <button
                                      onClick={() => patchS(li.id, { showInput: false, inputVal: '' })}
                                      className="text-[11px] px-1.5 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                                    >✕</button>
                                  </span>
                                ) : (
                                  <button
                                    disabled={isPushing}
                                    onClick={() => patchS(li.id, { showInput: true, inputVal: String(stock ?? 0) })}
                                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 disabled:opacity-40 transition-colors whitespace-nowrap"
                                  >
                                    Update Stock
                                  </button>
                                )
                              )}

                              {/* 4. Zero + Draft */}
                              {canStock && canDraft && (
                                <button
                                  disabled={isPushing}
                                  onClick={() => pushAction(li, 'both')}
                                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-red-50 text-red-700 border-red-200 hover:bg-red-100 disabled:opacity-40 transition-colors whitespace-nowrap"
                                >
                                  Zero + Draft
                                </button>
                              )}

                              {/* Status feedback */}
                              {isPushing && (
                                <span className="text-[11px] text-slate-400 italic animate-pulse ml-1">
                                  Pushing to Shopify…
                                </span>
                              )}
                              {s.status === 'success' && (
                                <span className="text-[11px] text-emerald-600 font-bold ml-1">✓ Done!</span>
                              )}
                              {s.status === 'failed' && (
                                <span className="text-[11px] text-red-500 ml-1">{s.msg || 'Failed'}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {o._count?.lineItems > o.lineItems.length && (
                      <div className="text-[11px] text-slate-400 pl-2">
                        +{o._count.lineItems - o.lineItems.length} more item{o._count.lineItems - o.lineItems.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-slate-300 italic">Run a sync to load items</span>
                )}
                {/* Mobile: show cancelled info inline */}
                {o.cancelledAt && (
                  <div className="md:hidden mt-2 text-[11px] text-red-500">
                    Cancelled {formatDistanceToNow(new Date(o.cancelledAt), { addSuffix: true })}
                  </div>
                )}
              </td>

              {/* Cancelled when */}
              <td className="hidden md:table-cell text-xs pt-4 min-w-[110px]">
                {o.cancelledAt && (
                  <div className="text-red-600 font-medium">
                    {formatDistanceToNow(new Date(o.cancelledAt), { addSuffix: true })}
                  </div>
                )}
              </td>

              {/* Total */}
              <td className="text-right pt-4 font-bold text-slate-800">
                KWD {parseFloat(o.totalPrice).toFixed(3)}
                {hasOOS && (
                  <div className="text-[10px] font-normal text-red-500 mt-0.5">has OOS items</div>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Standard table for All / Unfulfilled / Unpaid ─────────────────────────────
function StandardTable({ orders, page, tab }) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th className="text-center w-8 hidden sm:table-cell">#</th>
          <th>Order</th>
          <th className="hidden sm:table-cell">Customer</th>
          <th className="hidden md:table-cell text-center">Items</th>
          <th className="hidden lg:table-cell">Date</th>
          <th>Status</th>
          <th className="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o, idx) => {
          const srNo        = (page - 1) * 50 + idx + 1
          const isCancelled = !!o.cancelledAt
          const orderDate   = new Date(o.createdAt)
          const dateStr     = format(orderDate, 'dd MMM yyyy')
          const timeStr     = format(orderDate, 'h:mm a')
          const financial   = FINANCIAL[o.financialStatus]     || { label: o.financialStatus || '—', color: 'bg-slate-100 text-slate-500 border-slate-200' }
          const fulfillment = isCancelled ? null : (FULFILLMENT[o.fulfillmentStatus] || UNFULFILLED)

          return (
            <tr key={o.id} className={clsx(isCancelled && 'opacity-60')}>
              <td className="text-center text-xs text-slate-400 font-mono hidden sm:table-cell">{srNo}</td>

              <td>
                <div className="font-bold text-slate-800 text-sm">#{o.orderNumber}</div>
                <div className="sm:hidden text-xs text-slate-500 mt-0.5">
                  {o.customerName || o.email || <span className="italic text-slate-300">Guest</span>}
                </div>
                <div className="sm:hidden text-xs text-slate-400">{dateStr} · {timeStr}</div>
              </td>

              <td className="hidden sm:table-cell">
                <div className="text-sm font-medium text-slate-700 leading-snug">
                  {o.customerName || <span className="text-slate-400 italic text-xs">Guest</span>}
                </div>
                {o.email && <div className="text-xs text-slate-400 font-mono truncate max-w-[200px]">{o.email}</div>}
              </td>

              <td className="hidden md:table-cell text-center">
                <span className="inline-flex items-center gap-1 text-xs text-slate-600 font-medium">
                  <Package size={11} className="text-slate-400" />
                  {o._count?.lineItems ?? o.lineItems?.length ?? 0}
                </span>
                {o.lineItems?.[0] && (
                  <div className="text-[10px] text-slate-400 max-w-[130px] truncate mt-0.5">
                    {o.lineItems[0].title}
                    {o._count?.lineItems > 1 && ` +${o._count.lineItems - 1}`}
                  </div>
                )}
              </td>

              <td className="hidden lg:table-cell text-xs">
                <div className="font-medium text-slate-700">{dateStr}</div>
                <div className="text-slate-400">{timeStr}</div>
              </td>

              <td>
                <div className="flex flex-col gap-1 items-start">
                  {isCancelled ? (
                    <Badge label="Cancelled" color="bg-red-50 text-red-700 border-red-200" />
                  ) : (
                    <>
                      {fulfillment && <Badge label={fulfillment.label} color={fulfillment.color} />}
                      <Badge label={financial.label} color={financial.color} />
                    </>
                  )}
                </div>
              </td>

              <td className="text-right">
                <span className="font-bold text-slate-800 text-sm">
                  KWD {parseFloat(o.totalPrice).toFixed(3)}
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
