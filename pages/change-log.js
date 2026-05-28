/**
 * Change Log — full history of every push attempt to Shopify
 */
import { useState, useEffect } from 'react'
import { History, Download, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import clsx from 'clsx'

/** Format: "Thursday, 28th May · 2:51 PM" */
function formatDate(raw) {
  const d = new Date(raw)
  const day   = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const date  = d.getDate()
  const month = d.toLocaleDateString('en-GB', { month: 'long' })
  const time  = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()
  const suffix = date === 1 || date === 21 || date === 31 ? 'st'
               : date === 2 || date === 22             ? 'nd'
               : date === 3 || date === 23             ? 'rd' : 'th'
  return { top: `${day}, ${date}${suffix} ${month}`, bottom: time }
}

export default function ChangeLogPage() {
  const [logs,   setLogs]   = useState([])
  const [total,  setTotal]  = useState(0)
  const [page,   setPage]   = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  async function load(p = 1) {
    setLoading(true)
    const params = new URLSearchParams({ page: p, limit: 50, ...(status && { status }), ...(search && { entityName: search }) })
    const res  = await fetch(`/api/changelog?${params}`)
    const data = await res.json()
    setLogs(data.logs || [])
    setTotal(data.total || 0)
    setLoading(false)
  }

  useEffect(() => { setPage(1); load(1) }, [status, search])
  useEffect(() => { load(page) }, [page])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Change Log</h1>
          <p className="text-sm text-slate-400">Every push attempt to Shopify is recorded here, including failures.</p>
        </div>
        <div className="flex gap-2">
          <a href="/api/export?format=changelog" target="_blank" className="btn-secondary">
            <Download size={15} /> Export CSV
          </a>
          <button className="btn-secondary" onClick={() => load(page)}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap gap-3 py-3">
        <input
          className="input w-56"
          placeholder="Search product name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="select w-40" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
        <span className="ml-auto text-sm text-slate-400 self-center">{total} records</span>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="text-center w-10">#</th>
              <th>Date / Time</th>
              <th>Product</th>
              <th>Field</th>
              <th>Before</th>
              <th>After</th>
              <th>Type</th>
              <th>Status</th>
              <th>Error</th>
              <th>Pushed By</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l, idx) => {
              const { top, bottom } = formatDate(l.pushedAt)
              const srNo = (page - 1) * 50 + idx + 1
              return (
              <tr key={l.id}>
                <td className="text-center text-xs text-slate-400 font-mono">{srNo}</td>
                <td className="text-xs whitespace-nowrap">
                  <div className="font-medium text-slate-700">{top}</div>
                  <div className="text-slate-400">{bottom}</div>
                </td>
                <td className="font-medium max-w-[180px] truncate">{l.entityName}</td>
                <td className="font-mono text-xs">{l.fieldName}</td>
                <td>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600 line-through">
                    {l.beforeValue ?? '—'}
                  </span>
                </td>
                <td>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                    {l.afterValue ?? '—'}
                  </span>
                </td>
                <td><span className="badge badge-blue">{l.changeType}</span></td>
                <td>
                  {l.status === 'success'
                    ? <span className="flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 size={13} /> success</span>
                    : <span className="flex items-center gap-1 text-red-600 text-xs"><XCircle size={13} /> failed</span>
                  }
                </td>
                <td className="text-xs text-red-500 max-w-[200px] truncate">{l.errorMessage || '—'}</td>
                <td className="text-xs text-slate-400">{l.pushedBy || 'admin'}</td>
              </tr>
            )})}
            {!loading && !logs.length && (
              <tr>
                <td colSpan={10} className="text-center py-12 text-slate-400">
                  No push history yet. Push some approved changes to see them here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex justify-center gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span className="self-center text-sm text-slate-500">Page {page}</span>
          <button className="btn-secondary" disabled={logs.length < 50} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  )
}
