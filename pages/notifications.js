/**
 * Notification / Alert Center
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bell, CheckCircle2, XCircle, AlertTriangle, Info,
  RefreshCw, Trash2, MailOpen, Filter, Download,
  PackagePlus, Send,
} from 'lucide-react'
import clsx from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

// ── Config ────────────────────────────────────────────────────────────────────
const TYPE_META = {
  low_stock:       { label: 'Low Stock',         icon: AlertTriangle, color: 'text-amber-500',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  auto_restock:    { label: 'Auto Restock',       icon: RefreshCw,    color: 'text-indigo-500',  bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  push_success:    { label: 'Push Successful',    icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  push_failed:     { label: 'Push Failed',        icon: XCircle,      color: 'text-red-500',     bg: 'bg-red-50',     border: 'border-red-200' },
  oos:             { label: 'Out of Stock',        icon: XCircle,      color: 'text-red-500',     bg: 'bg-red-50',     border: 'border-red-200' },
  back_in_stock:   { label: 'Back in Stock',      icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  missing_image:   { label: 'Missing Image',      icon: AlertTriangle,color: 'text-orange-500',  bg: 'bg-orange-50',  border: 'border-orange-200' },
  missing_seo:     { label: 'Missing SEO',        icon: AlertTriangle,color: 'text-purple-500',  bg: 'bg-purple-50',  border: 'border-purple-200' },
  sync_failed:     { label: 'Sync Failed',        icon: XCircle,      color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200' },
  manual_review:   { label: 'Manual Review',      icon: Info,         color: 'text-blue-500',    bg: 'bg-blue-50',    border: 'border-blue-200' },
  custom_request:  { label: 'Custom Request',     icon: Info,         color: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200' },
  update_available:{ label: 'Update Available',   icon: Info,         color: 'text-indigo-500',  bg: 'bg-indigo-50',  border: 'border-indigo-200' },
}

const SEVERITY_BADGE = {
  info:     'bg-blue-50   text-blue-600   border-blue-200',
  warning:  'bg-amber-50  text-amber-700  border-amber-200',
  critical: 'bg-red-50    text-red-700    border-red-200',
}

const STATUS_BADGE = {
  unread:   'bg-indigo-500 text-white',
  read:     'bg-slate-100  text-slate-500',
  resolved: 'bg-emerald-100 text-emerald-700',
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount,   setUnreadCount]   = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [selected,      setSelected]      = useState(new Set())
  const [filterStatus,  setFilterStatus]  = useState('')
  const [filterType,    setFilterType]    = useState('')
  const [filterSeverity,setFilterSeverity]= useState('')
  // Stock update state: { [notifId]: { qty: string, pushing: bool, open: bool } }
  const [stockUpdates,  setStockUpdates]  = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus)   params.set('status',   filterStatus)
    if (filterType)     params.set('type',     filterType)
    if (filterSeverity) params.set('severity', filterSeverity)
    params.set('limit', '200')
    const res  = await fetch(`/api/notifications?${params}`)
    const data = await res.json()
    setNotifications(data.notifications || [])
    setUnreadCount(data.unreadCount  || 0)
    setLoading(false)
  }, [filterStatus, filterType, filterSeverity])

  useEffect(() => { load() }, [load])

  function toggleSelect(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    if (selected.size === notifications.length) setSelected(new Set())
    else setSelected(new Set(notifications.map(n => n.id)))
  }

  async function bulkAction(action) {
    const ids = [...selected]
    if (!ids.length) return
    await fetch('/api/notifications', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids, action }),
    })
    toast.success(`${ids.length} notification${ids.length > 1 ? 's' : ''} marked as ${action}`)
    setSelected(new Set())
    load()
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'read_all' }),
    })
    toast.success('All notifications marked as read')
    load()
  }

  async function deleteResolved() {
    await fetch('/api/notifications', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    })
    toast.success('Resolved notifications cleared')
    load()
  }

  async function singleAction(id, action) {
    await fetch('/api/notifications', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, action }),
    })
    load()
  }

  function openStockUpdate(id, currentQty) {
    setStockUpdates(prev => ({
      ...prev,
      [id]: { qty: String(currentQty ?? ''), pushing: false, open: true },
    }))
  }

  function closeStockUpdate(id) {
    setStockUpdates(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  async function pushStockUpdate(notification) {
    const s = stockUpdates[notification.id]
    if (!s) return
    const newQty = parseInt(s.qty, 10)
    if (isNaN(newQty) || newQty < 0) { toast.error('Enter a valid quantity (0 or more)'); return }

    let actionData = {}
    try { actionData = JSON.parse(notification.actionData || '{}') } catch {}
    const { variantId, productId } = actionData

    if (!variantId) { toast.error('No variant ID — sync first'); return }

    setStockUpdates(prev => ({ ...prev, [notification.id]: { ...prev[notification.id], pushing: true } }))

    try {
      const res  = await fetch('/api/quickpush', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId:   productId  || null,
          variantId,
          entityName:  notification.productName  || 'Unknown',
          variantName: notification.variantName  || null,
          sku:         notification.sku          || null,
          fieldName:   'inventory_quantity',
          beforeValue: notification.newValue     || '0',
          afterValue:  String(newQty),
          changeType:  'inventory',
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(`Stock updated to ${newQty} units`)
        closeStockUpdate(notification.id)
        // Auto-resolve the notification
        await singleAction(notification.id, 'resolved')
      } else {
        toast.error(data.error || 'Push failed')
        setStockUpdates(prev => ({ ...prev, [notification.id]: { ...prev[notification.id], pushing: false } }))
      }
    } catch (err) {
      toast.error(err.message)
      setStockUpdates(prev => ({ ...prev, [notification.id]: { ...prev[notification.id], pushing: false } }))
    }
  }

  function exportCSV() {
    const rows = [
      ['ID','Type','Severity','Product','SKU','Message','Old Value','New Value','Status','Created'],
      ...notifications.map(n => [
        n.id, n.type, n.severity, n.productName || '', n.sku || '',
        `"${n.message}"`, n.oldValue || '', n.newValue || '', n.status,
        new Date(n.createdAt).toLocaleString(),
      ]),
    ]
    const csv  = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'notifications.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const unread   = notifications.filter(n => n.status === 'unread').length
  const critical = notifications.filter(n => n.severity === 'critical' && n.status !== 'resolved').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Bell size={22} />
            Notification Center
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {unreadCount > 0
              ? <span className="text-indigo-600 font-semibold">{unreadCount} unread</span>
              : 'All caught up'}
            {critical > 0 && <span className="ml-3 text-red-600 font-semibold">· {critical} critical</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary text-xs py-1.5 px-3" onClick={load}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {unreadCount > 0 && (
            <button className="btn-secondary text-xs py-1.5 px-3" onClick={markAllRead}>
              <MailOpen size={13} /> Mark all read
            </button>
          )}
          <button className="btn-secondary text-xs py-1.5 px-3" onClick={deleteResolved}>
            <Trash2 size={13} /> Clear resolved
          </button>
          <button className="btn-secondary text-xs py-1.5 px-3" onClick={exportCSV}>
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Unread',   count: notifications.filter(n => n.status === 'unread').length,   color: 'bg-indigo-50 text-indigo-700' },
          { label: 'Critical', count: critical,                                                     color: 'bg-red-50    text-red-700'    },
          { label: 'Warning',  count: notifications.filter(n => n.severity === 'warning').length,   color: 'bg-amber-50  text-amber-700'  },
          { label: 'Resolved', count: notifications.filter(n => n.status === 'resolved').length,    color: 'bg-emerald-50 text-emerald-700' },
        ].map(({ label, count, color }) => (
          <div key={label} className={clsx('card text-center py-3', color)}>
            <div className="text-2xl font-bold">{count}</div>
            <div className="text-xs font-medium mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter size={14} className="text-slate-400 shrink-0" />
        <select className="input py-1.5 text-sm flex-1 min-w-[120px] sm:flex-none sm:w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
          <option value="resolved">Resolved</option>
        </select>
        <select className="input py-1.5 text-sm flex-1 min-w-[130px] sm:flex-none sm:w-44" value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select className="input py-1.5 text-sm flex-1 min-w-[140px] sm:flex-none sm:w-48" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(TYPE_META).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        {(filterStatus || filterType || filterSeverity) && (
          <button className="text-xs text-indigo-600 underline" onClick={() => { setFilterStatus(''); setFilterType(''); setFilterSeverity('') }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="card py-2.5 px-4 flex items-center gap-3 bg-indigo-50 border-indigo-200">
          <span className="text-sm text-indigo-700 font-medium">{selected.size} selected</span>
          <button className="btn-secondary text-xs py-1 px-3" onClick={() => bulkAction('read')}>
            <MailOpen size={12} /> Mark read
          </button>
          <button className="btn-secondary text-xs py-1 px-3" onClick={() => bulkAction('resolved')}>
            <CheckCircle2 size={12} /> Mark resolved
          </button>
          <button className="btn-danger text-xs py-1 px-3" onClick={async () => {
            await fetch('/api/notifications', {
              method: 'DELETE', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: [...selected] }),
            })
            setSelected(new Set()); load()
          }}>
            <Trash2 size={12} /> Delete
          </button>
          <button className="text-xs text-slate-400 underline ml-auto" onClick={() => setSelected(new Set())}>
            Cancel
          </button>
        </div>
      )}

      {/* Notification list */}
      {loading ? (
        <div className="card flex items-center justify-center py-20 text-slate-400 gap-3">
          <RefreshCw size={20} className="animate-spin" /> Loading notifications…
        </div>
      ) : notifications.length === 0 ? (
        <div className="card text-center py-20 text-slate-400">
          <Bell size={32} className="mx-auto mb-3 opacity-30" />
          <p>No notifications yet. They appear automatically when stock changes or pushes occur.</p>
        </div>
      ) : (
        <div>
          {/* Select all row */}
          <div className="flex items-center gap-2 px-1 pb-3">
            <input type="checkbox" checked={selected.size === notifications.length && notifications.length > 0}
              onChange={toggleAll} />
            <span className="text-xs text-slate-400">Select all ({notifications.length})</span>
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {notifications.map(n => {
              const meta     = TYPE_META[n.type] || TYPE_META.manual_review
              const Icon     = meta.icon
              const isUnread = n.status === 'unread'

              // Severity → top border colour
              const topBar = {
                critical: 'border-t-red-500',
                warning:  'border-t-amber-400',
                info:     'border-t-blue-400',
              }[n.severity] || 'border-t-slate-300'

              return (
                <div
                  key={n.id}
                  className={clsx(
                    'relative flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm',
                    'border-t-4 transition-all',
                    topBar,
                    isUnread && 'bg-indigo-50/20',
                    selected.has(n.id) && 'ring-2 ring-indigo-400 ring-offset-1',
                  )}
                >
                  {/* Card top row: checkbox + icon + status badge */}
                  <div className="flex items-start justify-between px-4 pt-4 pb-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(n.id)}
                        onChange={() => toggleSelect(n.id)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', meta.bg)}>
                        <Icon size={17} className={meta.color} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-700">{meta.label}</div>
                        <div className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded border w-fit mt-0.5', SEVERITY_BADGE[n.severity])}>
                          {n.severity}
                        </div>
                      </div>
                    </div>

                    <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0', STATUS_BADGE[n.status])}>
                      {n.status}
                    </span>
                  </div>

                  {/* Product image + name + message */}
                  <div className="px-4 pb-2 flex-1 flex gap-3 items-start">
                    {n.firstImageSrc && (
                      <img
                        src={n.firstImageSrc}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover shrink-0 border border-slate-200 mt-0.5"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      {n.productName && (
                        <div className="pb-1">
                          <p className="text-[11px] font-semibold text-slate-700 truncate leading-snug" title={n.productName}>
                            {n.productName}
                          </p>
                          {n.sku && <p className="text-[10px] text-slate-400 font-mono mt-0.5">SKU: {n.sku}</p>}
                        </div>
                      )}
                      <p className={clsx('text-[11px] leading-snug', isUnread ? 'font-semibold text-slate-800' : 'text-slate-600')}>
                        {n.message}
                      </p>
                    </div>
                  </div>

                  {/* Stock change pill */}
                  {(n.oldValue || n.newValue) && (
                    <div className="px-4 pb-3 flex items-center gap-2">
                      {n.oldValue && (
                        <span className="text-xs px-2 py-0.5 rounded-lg bg-red-50 text-red-600 font-mono font-bold line-through">
                          {n.oldValue}
                        </span>
                      )}
                      <span className="text-slate-400 text-xs font-bold">→</span>
                      {n.newValue && (
                        <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-mono font-bold">
                          {n.newValue}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Inline stock update panel */}
                  {(() => {
                    let actionData = {}
                    try { actionData = JSON.parse(n.actionData || '{}') } catch {}
                    const canUpdate = !!actionData.variantId && ['low_stock','oos'].includes(n.type) && n.status !== 'resolved'
                    const su = stockUpdates[n.id]

                    if (!canUpdate) return null
                    return (
                      <div className="px-4 pb-3">
                        {su?.open ? (
                          <div className="flex flex-wrap items-center gap-2 p-2 bg-indigo-50 rounded-xl border border-indigo-200">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <PackagePlus size={14} className="text-indigo-500 shrink-0" />
                              <span className="text-xs text-indigo-700 font-medium shrink-0">Set stock to</span>
                              <input
                                type="number"
                                min="0"
                                value={su.qty}
                                onChange={e => setStockUpdates(prev => ({ ...prev, [n.id]: { ...prev[n.id], qty: e.target.value } }))}
                                onKeyDown={e => { if (e.key === 'Enter') pushStockUpdate(n); if (e.key === 'Escape') closeStockUpdate(n.id) }}
                                className="w-20 text-sm font-bold text-center rounded-lg border border-indigo-300 bg-white px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                autoFocus
                              />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => pushStockUpdate(n)}
                                disabled={su.pushing}
                                className="flex items-center gap-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                              >
                                {su.pushing
                                  ? <RefreshCw size={11} className="animate-spin" />
                                  : <Send size={11} />}
                                {su.pushing ? 'Pushing…' : 'Push'}
                              </button>
                              <button onClick={() => closeStockUpdate(n.id)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => openStockUpdate(n.id, n.newValue)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-xl transition-colors w-full justify-center"
                          >
                            <PackagePlus size={13} /> Update Stock
                          </button>
                        )}
                      </div>
                    )
                  })()}

                  {/* Footer: time + actions */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 rounded-b-xl">
                    <span className="text-[10px] text-slate-400">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </span>
                    <div className="flex gap-2">
                      {n.status === 'unread' && (
                        <button
                          className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                          onClick={() => singleAction(n.id, 'read')}
                        >
                          Mark read
                        </button>
                      )}
                      {n.status !== 'resolved' && (
                        <button
                          className="text-[11px] font-medium text-emerald-600 hover:text-emerald-800 transition-colors"
                          onClick={() => singleAction(n.id, 'resolved')}
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
