/**
 * POS Sync — PROACT GEN Integration Hub
 * Super admin only.
 *
 * Shows live sync stats, match results, and unmatched product table.
 * Agent script (proact-sync.ps1) must be running on client's Toshiba.
 */

import Head from 'next/head'
import Layout from '../components/Layout'
import { useAuth } from './_app'
import { useRouter } from 'next/router'
import { useEffect, useState, useCallback } from 'react'
import {
  Cable, Server, Database, ShoppingBag, ArrowRight,
  CheckCircle2, Circle, Clock, AlertCircle, RefreshCw,
  Wifi, WifiOff, Package, Activity, Info, Play,
  ChevronDown, ChevronUp, Search, X,
} from 'lucide-react'

// ── Setup steps ──────────────────────────────────────────────────────────────
const SETUP_STEPS = [
  {
    id: 1,
    title: 'Identify PROACT GEN database',
    description: 'Explored PROACT SQL Server at 192.168.8.50 via PowerShell. Found M_Item + M_Item_Stock tables with correct column names.',
    status: 'done',
  },
  {
    id: 2,
    title: 'Build zero-install sync agent',
    description: 'PowerShell script (proact-sync.ps1) — no Node.js required. Reads PROACT every 30 min, batches 200 products per POST.',
    status: 'done',
  },
  {
    id: 3,
    title: 'Deploy agent on client server',
    description: 'Transfer proact-sync.ps1 to Toshiba via WhatsApp → run first sync → schedule via Task Scheduler.',
    status: 'pending',
  },
  {
    id: 4,
    title: 'Portal receives POS data',
    description: '/api/pos/sync live on Railway. PosProduct + PosSync tables ready in PostgreSQL.',
    status: 'done',
  },
  {
    id: 5,
    title: 'Match POS products to Shopify',
    description: 'Run Match below — matches by barcode (priority 1) then SKU (priority 2). Unmatched flagged for manual review.',
    status: 'pending',
  },
  {
    id: 6,
    title: 'Live sync dashboard active',
    description: 'View POS stock vs Shopify stock side by side. One-click inventory push to Shopify.',
    status: 'pending',
  },
]

const STATUS_CONFIG = {
  done:        { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-200', label: 'Done' },
  in_progress: { icon: RefreshCw,    color: 'text-indigo-500',  bg: 'bg-indigo-50 border-indigo-200',   label: 'In Progress' },
  pending:     { icon: Circle,       color: 'text-slate-300',   bg: 'bg-white border-slate-200',        label: 'Pending' },
}

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString()
}

function fmtDate(d) {
  if (!d) return 'Never'
  const dt = new Date(d)
  return dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function ago(d) {
  if (!d) return null
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = 'indigo', loading }) {
  const colors = {
    indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-500',  val: 'text-indigo-700' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-500', val: 'text-emerald-700' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-500',   val: 'text-amber-700' },
    rose:    { bg: 'bg-rose-50',    icon: 'text-rose-500',    val: 'text-rose-700' },
    slate:   { bg: 'bg-slate-50',   icon: 'text-slate-500',   val: 'text-slate-700' },
  }
  const c = colors[color] || colors.indigo
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
          <Icon size={16} className={c.icon} />
        </div>
      </div>
      <div className={`text-2xl font-bold ${c.val} mb-0.5`}>
        {loading ? <span className="text-slate-300 animate-pulse">…</span> : (value ?? '—')}
      </div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PosSyncPage() {
  const { user, authLoading } = useAuth()
  const router = useRouter()

  const [stats, setStats]           = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const [matching, setMatching]         = useState(false)
  const [matchResult, setMatchResult]   = useState(null) // last match response
  const [matchError, setMatchError]     = useState(null)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [search, setSearch]             = useState('')

  // Guard — super_admin only
  useEffect(() => {
    if (!authLoading && user && user.role !== 'super_admin') router.replace('/')
  }, [user, authLoading, router])

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      setStatsLoading(true)
      const r = await fetch('/api/pos/stats')
      if (r.ok) setStats(await r.json())
    } catch { /* ignore */ } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  // Run match
  async function runMatch() {
    setMatching(true)
    setMatchError(null)
    setMatchResult(null)
    try {
      const r = await fetch('/api/pos/match', { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Match failed')
      setMatchResult(data)
      setShowUnmatched(data.unmatched > 0)
      await loadStats() // refresh counts
    } catch (e) {
      setMatchError(e.message)
    } finally {
      setMatching(false)
    }
  }

  if (authLoading || !user) return null
  if (user.role !== 'super_admin') return null

  const doneCount      = SETUP_STEPS.filter(s => s.status === 'done').length
  const agentConnected = stats && stats.lastSyncedAt
  const syncAgo        = stats ? ago(stats.lastSyncedAt) : null

  const filteredUnmatched = (matchResult?.unmatchedSample || []).filter(p => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (p.name    || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q) ||
      (p.sku     || '').toLowerCase().includes(q)
    )
  })

  return (
    <Layout>
      <Head><title>POS Sync — Inventory Portal</title></Head>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Cable size={22} className="text-slate-700" />
            <h1 className="text-2xl font-bold text-slate-800">POS Sync</h1>
          </div>
          <p className="text-sm text-slate-500">
            PROACT GEN ↔ Portal ↔ Shopify — super admin only
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadStats}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Refresh stats"
          >
            <RefreshCw size={15} />
          </button>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            agentConnected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-slate-100 border-slate-200 text-slate-500'
          }`}>
            {agentConnected
              ? <><Wifi size={12} /> Agent Active · {syncAgo}</>
              : <><WifiOff size={12} /> Agent Not Connected</>
            }
          </div>
        </div>
      </div>

      {/* ── Stats row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="POS Products"
          value={fmt(stats?.totalPos)}
          sub={stats?.lastSyncedAt ? `Last sync ${fmtDate(stats.lastSyncedAt)}` : 'Not synced yet'}
          icon={Package}
          color="indigo"
          loading={statsLoading}
        />
        <StatCard
          label="Matched to Shopify"
          value={fmt(stats?.matched)}
          sub={stats?.totalPos ? `${Math.round((stats.matched / stats.totalPos) * 100) || 0}% of POS catalog` : null}
          icon={CheckCircle2}
          color="emerald"
          loading={statsLoading}
        />
        <StatCard
          label="POS Only (unmatched)"
          value={fmt(stats?.unmatched)}
          sub="Not on Shopify yet"
          icon={AlertCircle}
          color={stats?.unmatched > 0 ? 'amber' : 'slate'}
          loading={statsLoading}
        />
        <StatCard
          label="Last Sync"
          value={stats?.lastSyncedAt ? syncAgo : '—'}
          sub={stats?.lastSyncStats ? `${fmt(stats.lastSyncStats.upserted)} upserted · ${fmt(stats.lastSyncStats.errors)} errors` : 'Run agent on Toshiba'}
          icon={Activity}
          color="slate"
          loading={statsLoading}
        />
      </div>

      {/* ── Architecture ────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 rounded-2xl p-5 mb-6 text-white">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-4">Data Flow</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center">
              <Server size={22} className="text-orange-400" />
            </div>
            <span className="text-[10px] text-slate-400 font-medium text-center leading-tight">PROACT GEN<br/>SQL Server</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ArrowRight size={16} className="text-slate-500" />
            <span className="text-[9px] text-slate-600">agent · 30 min</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className={`w-12 h-12 rounded-xl ${agentConnected ? 'bg-indigo-600' : 'bg-slate-700'} flex items-center justify-center transition-colors`}>
              <Database size={22} className="text-white" />
            </div>
            <span className="text-[10px] text-slate-400 font-medium text-center leading-tight">Portal<br/>Railway DB</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ArrowRight size={16} className="text-slate-500" />
            <span className="text-[9px] text-slate-600">on demand</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-700 flex items-center justify-center">
              <ShoppingBag size={22} className="text-white" />
            </div>
            <span className="text-[10px] text-slate-400 font-medium text-center leading-tight">Shopify<br/>Store</span>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-4">
          The PowerShell agent runs silently on the client's Toshiba. It reads PROACT GEN's SQL Server
          locally and pushes to this portal via outbound HTTPS — no firewall changes required.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left: Setup + Match ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Setup progress */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-800 text-sm">Setup Progress</h2>
              <span className="text-xs text-slate-500 font-medium">{doneCount} / {SETUP_STEPS.length} complete</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mb-5">
              <div
                className="bg-indigo-500 h-1.5 rounded-full transition-all"
                style={{ width: `${(doneCount / SETUP_STEPS.length) * 100}%` }}
              />
            </div>
            <div className="space-y-2.5">
              {SETUP_STEPS.map(step => {
                const { icon: Icon, color, bg, label } = STATUS_CONFIG[step.status]
                return (
                  <div key={step.id} className={`flex items-start gap-3 p-3 rounded-xl border ${bg}`}>
                    <Icon size={17} className={`${color} shrink-0 mt-0.5 ${step.status === 'in_progress' ? 'animate-spin' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold text-slate-400">STEP {step.id}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wide ${color}`}>{label}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{step.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Match panel */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-slate-800 text-sm">Product Matching</h2>
              {matchResult && (
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Last run: {matchResult.matchedByBarcode + matchResult.matchedBySku} newly matched
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Matches POS products to Shopify variants — first by barcode, then by SKU (Alt_Code_2).
              Run this after every POS sync to keep the match table current.
            </p>

            <button
              onClick={runMatch}
              disabled={matching || statsLoading}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                matching
                  ? 'bg-indigo-100 text-indigo-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow'
              }`}
            >
              {matching
                ? <><RefreshCw size={14} className="animate-spin" /> Matching…</>
                : <><Play size={14} /> Run Match Now</>
              }
            </button>

            {matchError && (
              <div className="mt-3 flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                {matchError}
              </div>
            )}

            {matchResult && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Already matched', value: matchResult.alreadyMatched, color: 'text-slate-600' },
                  { label: 'Matched by barcode', value: matchResult.matchedByBarcode, color: 'text-emerald-600' },
                  { label: 'Matched by SKU', value: matchResult.matchedBySku, color: 'text-indigo-600' },
                  { label: 'Unmatched', value: matchResult.unmatched, color: matchResult.unmatched > 0 ? 'text-amber-600' : 'text-slate-600' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <div className={`text-xl font-bold ${color}`}>{fmt(value)}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unmatched products table */}
          {matchResult && matchResult.unmatched > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 p-5">
              <button
                onClick={() => setShowUnmatched(v => !v)}
                className="w-full flex items-center justify-between mb-0"
              >
                <div>
                  <h2 className="font-bold text-slate-800 text-sm text-left">
                    Unmatched Products
                    <span className="ml-2 text-amber-600 bg-amber-50 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {matchResult.unmatched}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 text-left mt-0.5">
                    {matchResult.unmatchedSample?.length < matchResult.unmatched
                      ? `Showing first ${matchResult.unmatchedSample.length} of ${matchResult.unmatched}`
                      : 'All unmatched products shown below'}
                  </p>
                </div>
                {showUnmatched ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </button>

              {showUnmatched && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="relative flex-1">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search by name, barcode, or SKU…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                      {search && (
                        <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Name</th>
                          <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Barcode</th>
                          <th className="text-left px-3 py-2.5 font-semibold text-slate-500">SKU</th>
                          <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUnmatched.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="text-center py-8 text-slate-400">No results for &quot;{search}&quot;</td>
                          </tr>
                        ) : filteredUnmatched.map((p, i) => (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2.5 font-medium text-slate-700 max-w-[200px] truncate">{p.name || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-500 font-mono">{p.barcode || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-500 font-mono">{p.sku || <span className="text-rose-400">missing</span>}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{fmt(p.stock)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <Info size={13} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      These products exist in PROACT but have no matching Shopify variant.
                      Add SKU codes (Alt_Code_2 in PROACT) matching Shopify variant SKUs to improve auto-matching,
                      or create these products in Shopify first and re-run the match.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── Right: POS info + agent instructions ────────────────────────────── */}
        <div className="space-y-4">

          {/* POS system info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-bold text-slate-800 text-sm mb-3">POS System</h2>
            <div className="space-y-2.5">
              {[
                { label: 'Software',       value: 'PROACT GEN' },
                { label: 'Hardware',       value: 'Toshiba (Windows)' },
                { label: 'DB Server',      value: '192.168.8.50' },
                { label: 'Database',       value: 'PROACT' },
                { label: 'DB Type',        value: 'SQL Server' },
                { label: 'Branches',       value: 'OUHAD SHOP · STORE' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 text-xs">{label}</span>
                  <span className="font-semibold text-slate-800 text-xs text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Agent setup instructions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-bold text-slate-800 text-sm mb-3">Agent Setup</h2>
            <ol className="space-y-2.5">
              {[
                'Send proact-sync.ps1 to Toshiba via WhatsApp',
                'Save to: C:\\Users\\user\\Documents\\',
                'Right-click → Run with PowerShell',
                'Check log: proact-sync-log.txt',
                'Schedule via Task Scheduler (every 30 min)',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-slate-600">
                  <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Info note */}
          <div className="flex gap-2.5 p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl">
            <Info size={13} className="text-indigo-500 shrink-0 mt-0.5" />
            <p className="text-xs text-indigo-700 leading-relaxed">
              No existing features are affected. POS data lives in a separate table and
              only syncs to Shopify when you explicitly trigger it.
            </p>
          </div>

        </div>
      </div>
    </Layout>
  )
}
