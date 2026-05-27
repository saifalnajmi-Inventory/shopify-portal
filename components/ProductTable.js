import { useState } from 'react'
import { differenceInDays } from 'date-fns'
import { ChevronDown, ChevronUp, ChevronRight, Edit2, ExternalLink, Plus, Copy, Check } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const STATUS_BADGES = {
  active:   'badge-green',
  draft:    'badge-yellow',
  archived: 'badge-gray',
}

function ProductTitle({ title, sub }) {
  const [copied, setCopied] = useState(false)

  function copy(e) {
    e.stopPropagation()
    navigator.clipboard.writeText(title || '').then(() => {
      setCopied(true)
      toast.success('Copied!', { duration: 1500 })
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="group/title flex flex-col gap-0.5">
      {/* Name row: truncated text + copy button */}
      <div className="flex items-center gap-1.5">
        <span
          className="font-medium text-slate-800 truncate max-w-[180px] cursor-default"
          title={title}   /* native browser tooltip on hover */
        >
          {title}
        </span>
        <button
          onClick={copy}
          className="shrink-0 opacity-0 group-hover/title:opacity-100 transition-opacity text-slate-300 hover:text-indigo-500 p-0.5 rounded"
          title="Copy full name"
        >
          {copied
            ? <Check size={12} className="text-emerald-500" />
            : <Copy size={12} />}
        </button>
      </div>
      <span className="text-xs text-slate-400 truncate max-w-[190px]">{sub}</span>
    </div>
  )
}

function ScoreBar({ score, color = '#4f46e5' }) {
  return (
    <div className="flex items-center gap-2">
      <div className="score-bar flex-1" style={{ minWidth: 60 }}>
        <div className="score-fill" style={{ width: `${score || 0}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold text-slate-600 w-6">{score ?? '—'}</span>
    </div>
  )
}

function StockBadge({ qty }) {
  if (qty <= 0)  return <span className="badge-red  badge">0 — OOS</span>
  if (qty < 3)   return <span className="badge-red  badge">{qty} — Critical</span>
  if (qty < 10)  return <span className="badge-yellow badge">{qty} — Low</span>
  return               <span className="badge-green badge">{qty}</span>
}

function EditableField({ label, value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value ?? '')

  function save() {
    if (String(val) !== String(value ?? '')) onSave(val)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        className="flex items-center gap-1 text-left hover:text-indigo-600 group"
        onClick={() => setEditing(true)}
      >
        <span>{value ?? <span className="text-slate-300 italic">—</span>}</span>
        <Edit2 size={11} className="opacity-0 group-hover:opacity-100 text-slate-400" />
      </button>
    )
  }

  return (
    <div className="flex gap-1">
      <input
        autoFocus
        className="input py-1 px-2 text-xs w-24"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
      />
      <button className="btn-primary py-1 px-2 text-xs" onClick={save}>✓</button>
      <button className="btn-secondary py-1 px-2 text-xs" onClick={() => setEditing(false)}>✕</button>
    </div>
  )
}

export default function ProductTable({ products, onSort, sort, order, onRefresh }) {
  const [expanded, setExpanded] = useState({})

  function toggleRow(id) {
    setExpanded(p => ({ ...p, [id]: !p[id] }))
  }

  function SortHeader({ field, children }) {
    const active = sort === field
    return (
      <th
        className="tbl-th cursor-pointer select-none hover:bg-slate-100"
        onClick={() => onSort(field)}
      >
        <span className="flex items-center gap-1">
          {children}
          {active
            ? (order === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)
            : <span className="w-[13px]" />}
        </span>
      </th>
    )
  }

  async function saveDraftChange({ productId, variantId, product, variant, fieldName, beforeValue, afterValue, changeType }) {
    try {
      const res = await fetch('/api/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          variantId: variantId || null,
          entityType:  variantId ? 'variant' : 'product',
          entityName:  product.title,
          variantName: variant?.title || null,
          sku:         variant?.sku   || null,
          fieldName,
          beforeValue,
          afterValue,
          changeType,
        }),
      })
      const data = await res.json()
      toast.success(data.updated ? 'Draft change updated' : 'Draft change saved')
      onRefresh?.()
    } catch {
      toast.error('Failed to save change')
    }
  }

  if (!products?.length) {
    return (
      <div className="card text-center py-16 text-slate-400">
        No products match the current filters.
      </div>
    )
  }

  return (
    <div className="card overflow-x-auto p-0">
      <table className="tbl">
        <thead>
          <tr>
            <th className="w-8 px-3 py-3 bg-slate-50 border-b border-slate-200" />
            <th className="tbl th">Image</th>
            <SortHeader field="title">Product</SortHeader>
            <SortHeader field="vendor">Vendor</SortHeader>
            <SortHeader field="status">Status</SortHeader>
            <th className="tbl th">Variants</th>
            <th className="tbl th">Stock</th>
            <th className="tbl th">Sold 30d</th>
            <th className="tbl th">Sold 7d</th>
            <th className="tbl th">Restock ↑</th>
            <th className="tbl th">Marketing ↑</th>
            <th className="tbl th sticky right-0 bg-slate-50 border-l border-slate-200 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.06)] z-10">Edit</th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => {
            const isOpen = !!expanded[p.id]
            const daysOos = p.firstOutOfStockAt
              ? differenceInDays(new Date(), new Date(p.firstOutOfStockAt))
              : null

            return (
              <>
                {/* ── Product row ─────────────────────────────────────────── */}
                <tr key={p.id} className={clsx('group', isOpen && 'bg-indigo-50/30')}>
                  <td className="px-2 text-center">
                    <button
                      onClick={() => toggleRow(p.id)}
                      className="text-slate-400 hover:text-indigo-600"
                    >
                      {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  </td>

                  {/* Image */}
                  <td>
                    {p.firstImageSrc
                      ? <img src={p.firstImageSrc} alt="" className="w-10 h-10 rounded object-cover border border-slate-200" />
                      : <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-slate-300 text-xs">?</div>
                    }
                  </td>

                  {/* Title */}
                  <td className="max-w-[220px]">
                    <ProductTitle title={p.title} sub={p.productType || p.handle} />
                  </td>

                  {/* Vendor */}
                  <td>
                    <EditableField
                      value={p.vendor}
                      onSave={val => saveDraftChange({
                        productId: p.id, product: p,
                        fieldName: 'vendor', beforeValue: p.vendor, afterValue: val, changeType: 'vendor',
                      })}
                    />
                  </td>

                  {/* Status */}
                  <td>
                    <select
                      className={clsx('badge border-0 cursor-pointer', STATUS_BADGES[p.status] || 'badge-gray')}
                      value={p.status}
                      onChange={e => {
                        if (e.target.value !== p.status) {
                          saveDraftChange({
                            productId: p.id, product: p,
                            fieldName: 'status', beforeValue: p.status, afterValue: e.target.value, changeType: 'status',
                          })
                        }
                      }}
                    >
                      <option value="active">active</option>
                      <option value="draft">draft</option>
                      <option value="archived">archived</option>
                    </select>
                  </td>

                  {/* Variants count */}
                  <td className="text-center text-sm">{p.variantCount}</td>

                  {/* Stock */}
                  <td><StockBadge qty={p.totalQty} /></td>

                  {/* Sales */}
                  <td className="text-center font-medium">{p.sold30Days}</td>
                  <td className="text-center font-medium">{p.sold7Days}</td>

                  {/* Scores */}
                  <td className="min-w-[100px]">
                    <ScoreBar score={p.maxRestockScore} color={
                      p.maxRestockScore >= 80 ? '#dc2626' :
                      p.maxRestockScore >= 60 ? '#ea580c' :
                      p.maxRestockScore >= 40 ? '#d97706' : '#10b981'
                    } />
                  </td>
                  <td className="min-w-[100px]">
                    <ScoreBar score={p.maxMarketingScore} color="#7c3aed" />
                  </td>

                  {/* Actions — sticky right */}
                  <td className="sticky right-0 bg-white border-l border-slate-100 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.06)]">
                    <button
                      className={clsx(
                        'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap',
                        isOpen
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                      )}
                      onClick={() => toggleRow(p.id)}
                      title="Edit variants"
                    >
                      <Edit2 size={12} />
                      {isOpen ? 'Close' : 'Edit'}
                    </button>
                  </td>
                </tr>

                {/* ── Expanded variant rows ──────────────────────────────── */}
                {isOpen && p.variants.map(v => (
                  <tr key={v.id} className="bg-slate-50 text-sm border-l-4 border-indigo-300">
                    <td colSpan={2} />
                    <td className="pl-4">
                      <div className="text-slate-600 font-medium">{v.title}</div>
                      <div className="text-xs text-slate-400">
                        SKU: <EditableField
                          value={v.sku}
                          onSave={val => saveDraftChange({
                            productId: p.id, variantId: v.id, product: p, variant: v,
                            fieldName: 'sku', beforeValue: v.sku, afterValue: val, changeType: 'sku',
                          })}
                        />
                      </div>
                    </td>
                    <td />
                    <td />
                    <td />

                    {/* Inventory qty — editable */}
                    <td>
                      <EditableField
                        value={v.inventoryQuantity}
                        onSave={val => saveDraftChange({
                          productId: p.id, variantId: v.id, product: p, variant: v,
                          fieldName: 'inventory_quantity',
                          beforeValue: v.inventoryQuantity,
                          afterValue:  val,
                          changeType:  'inventory',
                        })}
                      />
                    </td>

                    <td className="text-center">{v.sold30Days}</td>
                    <td className="text-center">{v.sold7Days}</td>

                    {/* Price — editable */}
                    <td colSpan={2}>
                      <div className="flex gap-2 items-center text-xs text-slate-500">
                        <span>Price:</span>
                        <EditableField
                          value={v.price?.toFixed(2)}
                          onSave={val => saveDraftChange({
                            productId: p.id, variantId: v.id, product: p, variant: v,
                            fieldName: 'price', beforeValue: v.price, afterValue: val, changeType: 'price',
                          })}
                        />
                        {daysOos !== null && (
                          <span className="badge-red badge ml-2">{daysOos}d OOS</span>
                        )}
                      </div>
                    </td>
                    {/* Sticky placeholder for variant rows */}
                    <td className="sticky right-0 bg-slate-50 border-l border-slate-100 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.06)]" />
                  </tr>
                ))}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
