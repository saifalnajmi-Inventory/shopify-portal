/**
 * Review Changes — before/after diff table with approve, discard, push.
 */
import { useState, useEffect } from 'react'
import { RefreshCw, GitPullRequest } from 'lucide-react'
import ReviewChanges from '../components/ReviewChanges'

export default function ChangesPage() {
  const [changes, setChanges] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState('active') // active | all

  async function load() {
    setLoading(true)
    const res  = await fetch('/api/changes')
    const data = await res.json()
    setChanges(data.changes || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const active = changes.filter(c => ['pending', 'approved', 'failed'].includes(c.status))
  const all    = changes

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Review Changes</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            All edits made in the Products page are saved here as drafts. Review before/after, then push to Shopify.
          </p>
        </div>

        <button className="btn-secondary" onClick={load}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Safety notice */}
      <div className="flex gap-3 items-start p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <GitPullRequest size={18} className="shrink-0 mt-0.5 text-amber-600" />
        <div>
          <strong>Safe Push Workflow:</strong> Changes are never sent to Shopify automatically.
          Review the Before / After columns carefully, approve the ones you want, then click
          <strong> Push to Shopify</strong>. Failed pushes keep the "failed" status so you can retry.
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        {[
          { key: 'active', label: `Active (${active.length})` },
          { key: 'all',    label: `All changes (${all.length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card flex items-center justify-center py-20 text-slate-400 gap-3">
          <RefreshCw size={20} className="animate-spin" />
          Loading changes…
        </div>
      ) : (
        <ReviewChanges
          changes={tab === 'active' ? active : all}
          onRefresh={load}
        />
      )}
    </div>
  )
}
