/**
 * POS Sync — PROACT GEN Integration Hub
 *
 * Visible to super_admin only.
 * This page is the control centre for the PROACT GEN ↔ Portal ↔ Shopify bridge.
 *
 * Current status: Setup phase — agent not yet installed on client server.
 */

import Head from 'next/head'
import Layout from '../components/Layout'
import { useAuth } from './_app'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import {
  Cable, Server, Database, ShoppingBag, ArrowRight,
  CheckCircle2, Circle, Clock, AlertCircle, RefreshCw,
  Wifi, WifiOff, Package, ShoppingCart, Activity,
  Info, ChevronRight,
} from 'lucide-react'

// ── Setup steps — filled in progressively as we build ───────────────────────
const SETUP_STEPS = [
  {
    id: 1,
    title: 'Identify PROACT GEN database',
    description: 'Connect via TeamViewer to client server, confirm SQL Server instance and database name.',
    status: 'pending', // pending | in_progress | done
  },
  {
    id: 2,
    title: 'Install Node.js on client server',
    description: 'Install Node.js runtime on the Toshiba / server machine.',
    status: 'pending',
  },
  {
    id: 3,
    title: 'Deploy sync agent on client server',
    description: 'Place agent script on server. Reads PROACT GEN DB every 30 min, pushes to portal.',
    status: 'pending',
  },
  {
    id: 4,
    title: 'Build portal API endpoint',
    description: '/api/pos/sync — receives agent data, stores in PosProduct table in Railway PostgreSQL.',
    status: 'pending',
  },
  {
    id: 5,
    title: 'Match POS products to Shopify products',
    description: 'Match by barcode. Flag products in POS but not in Shopify.',
    status: 'pending',
  },
  {
    id: 6,
    title: 'Live sync dashboard active',
    description: 'View POS stock vs Shopify stock side by side. One-click push to Shopify.',
    status: 'pending',
  },
]

const STATUS_CONFIG = {
  done:        { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-200', label: 'Done' },
  in_progress: { icon: RefreshCw,    color: 'text-indigo-500',  bg: 'bg-indigo-50 border-indigo-200',   label: 'In Progress' },
  pending:     { icon: Circle,       color: 'text-slate-300',   bg: 'bg-white border-slate-200',        label: 'Pending' },
}

export default function PosSyncPage() {
  const { user, authLoading } = useAuth()
  const router = useRouter()
  const [connectionStatus] = useState('not_connected') // not_connected | connecting | connected

  // Guard — super_admin only
  useEffect(() => {
    if (!authLoading && user && user.role !== 'super_admin') {
      router.replace('/')
    }
  }, [user, authLoading, router])

  if (authLoading || !user) return null
  if (user.role !== 'super_admin') return null

  const doneCount = SETUP_STEPS.filter(s => s.status === 'done').length

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
            PROACT GEN ↔ Portal ↔ Shopify integration hub — super admin only
          </p>
        </div>

        {/* Connection status badge */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
          connectionStatus === 'connected'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-slate-100 border-slate-200 text-slate-500'
        }`}>
          {connectionStatus === 'connected'
            ? <><Wifi size={12} /> Agent Connected</>
            : <><WifiOff size={12} /> Agent Not Connected</>
          }
        </div>
      </div>

      {/* ── Architecture diagram ─────────────────────────────────────────────── */}
      <div className="bg-slate-900 rounded-2xl p-5 mb-6 text-white">
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-4">Data Flow</p>
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
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center">
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
          A small agent script runs silently on the client's server. It reads PROACT GEN's database locally
          and pushes changes to this portal via outbound HTTPS — no firewall changes required.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Setup progress ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-800 text-sm">Setup Progress</h2>
            <span className="text-xs text-slate-500 font-medium">
              {doneCount} / {SETUP_STEPS.length} steps complete
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 rounded-full h-1.5 mb-5">
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all"
              style={{ width: `${(doneCount / SETUP_STEPS.length) * 100}%` }}
            />
          </div>

          <div className="space-y-3">
            {SETUP_STEPS.map((step) => {
              const { icon: Icon, color, bg, label } = STATUS_CONFIG[step.status]
              return (
                <div key={step.id} className={`flex items-start gap-3 p-3 rounded-xl border ${bg}`}>
                  <Icon size={18} className={`${color} shrink-0 mt-0.5 ${step.status === 'in_progress' ? 'animate-spin' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">Step {step.id}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${color}`}>{label}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 mt-0.5">{step.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right panel ────────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* POS info card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-bold text-slate-800 text-sm mb-3">POS System</h2>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 text-xs">Software</span>
                <span className="font-semibold text-slate-800">PROACT GEN</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 text-xs">Hardware</span>
                <span className="font-semibold text-slate-800">Toshiba (Windows)</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 text-xs">Network</span>
                <span className="font-semibold text-emerald-600 flex items-center gap-1"><Wifi size={11} /> Connected</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 text-xs">Support status</span>
                <span className="font-semibold text-amber-600">End of support</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 text-xs">DB type</span>
                <span className="font-semibold text-slate-800">SQL Server (TBC)</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 text-xs">Branches</span>
                <span className="font-semibold text-slate-800">OUHAD SHOP · STORE</span>
              </div>
            </div>
          </div>

          {/* Sync stats — placeholder */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-bold text-slate-800 text-sm mb-3">Sync Statistics</h2>
            <div className="space-y-3">
              {[
                { label: 'POS Products',     value: '—',  icon: Package,       note: 'not yet synced' },
                { label: 'Matched to Shopify', value: '—', icon: CheckCircle2, note: 'not yet synced' },
                { label: 'POS Only (not on Shopify)', value: '—', icon: AlertCircle, note: 'not yet synced' },
                { label: 'Last Sync',        value: '—',  icon: Clock,         note: 'agent not installed' },
              ].map(({ label, value, icon: Icon, note }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                    <Icon size={13} className="text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="text-sm font-bold text-slate-800">{value}
                      <span className="text-[10px] font-normal text-slate-400 ml-1">{note}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info note */}
          <div className="flex gap-2.5 p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl">
            <Info size={14} className="text-indigo-500 shrink-0 mt-0.5" />
            <p className="text-xs text-indigo-700 leading-relaxed">
              No existing features are affected. POS data lives in a separate table and only pushes to Shopify when you explicitly trigger it.
            </p>
          </div>

        </div>
      </div>
    </Layout>
  )
}
