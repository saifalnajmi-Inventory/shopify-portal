/**
 * InsightsPanel — Store Health Score + Smart Insights
 * Uses data already returned by /api/dashboard — no extra API calls.
 */
import { useMemo } from 'react'
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts'
import {
  PackageX, AlertTriangle, Clock, Eye, FileImage,
  FileSearch, Tag, TrendingDown, CheckCircle2,
  Zap, ShieldAlert, Sparkles, Package,
} from 'lucide-react'
import clsx from 'clsx'

// ── Health score formula ────────────────────────────────────────────────────────
function calcHealth(cards) {
  const tv = Math.max(cards.totalVariants, 1)
  const tp = Math.max(cards.totalProducts, 1)

  const stockRate    = Math.round((cards.inStockVariants / tv) * 100)
  const rawCatalog   = 100 - ((cards.missingImages + cards.missingSeo + cards.missingVendor) / (tp * 3)) * 100
  const catalogScore = Math.round(Math.max(0, Math.min(100, rawCatalog)))
  const activeRate   = Math.round((cards.activeProducts  / tp) * 100)
  const salesHealth  = Math.round(Math.max(0, 100 - (cards.noSalesProducts / tv) * 100))

  const total = Math.round(
    stockRate * 0.40 + catalogScore * 0.25 + activeRate * 0.20 + salesHealth * 0.15
  )

  return { total, stockRate, catalogScore, activeRate, salesHealth }
}

// ── Insight definitions ─────────────────────────────────────────────────────────
function genInsights(cards) {
  const items = []

  if (cards.outOfStockVariants > 0) items.push({
    priority: 'critical',
    icon:     PackageX,
    title:    `${cards.outOfStockVariants.toLocaleString()} variants are out of stock`,
    detail:   'Customers cannot purchase these products right now.',
    cardKey:  'outOfStock',
    action:   'Restock now',
  })

  if (cards.oos30Days > 0) items.push({
    priority: 'critical',
    icon:     Clock,
    title:    `${cards.oos30Days} products have been OOS for 30+ days`,
    detail:   'Long stockouts cause permanent customer loss.',
    cardKey:  'oos30',
    action:   'Review urgently',
  })

  if (cards.neverRestocked > 0) items.push({
    priority: 'critical',
    icon:     ShieldAlert,
    title:    `${cards.neverRestocked} products sold but were never restocked`,
    detail:   'These had real demand — restocking them recovers lost revenue.',
    cardKey:  'neverRestocked',
    action:   'Restock',
  })

  if (cards.lowStockVariants > 0) items.push({
    priority: 'warning',
    icon:     AlertTriangle,
    title:    `${cards.lowStockVariants} variants critically low (under 3 units)`,
    detail:   'Will go OOS soon without action.',
    cardKey:  'lowStock',
    action:   'Top up stock',
  })

  if (cards.belowThresholdVariants > cards.lowStockVariants) items.push({
    priority: 'warning',
    icon:     Package,
    title:    `${cards.belowThresholdVariants - cards.lowStockVariants} variants low (under 5 units)`,
    detail:   'Getting close to the danger zone.',
    cardKey:  'belowThreshold',
    action:   'Review',
  })

  if (cards.draftProducts > 0) items.push({
    priority: 'warning',
    icon:     Eye,
    title:    `${cards.draftProducts} products are unpublished (Draft)`,
    detail:   'Hidden from all customers — consider publishing.',
    cardKey:  'draftProducts',
    action:   'Publish',
  })

  if (cards.missingImages > 0) items.push({
    priority: 'warning',
    icon:     FileImage,
    title:    `${cards.missingImages} products have no product images`,
    detail:   'Products without images convert significantly worse.',
    cardKey:  'missingImages',
    action:   'Add images',
  })

  if (cards.missingVendor > 0) items.push({
    priority: 'info',
    icon:     Tag,
    title:    `${cards.missingVendor} products have no vendor/brand set`,
    detail:   'Brand data improves filtering and catalog organization.',
    cardKey:  'missingVendor',
    action:   'Update brand',
  })

  if (cards.noSalesProducts > 0) items.push({
    priority: 'info',
    icon:     TrendingDown,
    title:    `${cards.noSalesProducts} variants have never sold`,
    detail:   'Consider promotions, repricing, or removing dead inventory.',
    cardKey:  'noSales',
    action:   'Review',
  })

  // Sort: critical → warning → info
  const order = { critical: 0, warning: 1, info: 2 }
  return items.sort((a, b) => order[a.priority] - order[b.priority])
}

// ── Severity styles ─────────────────────────────────────────────────────────────
const SEV = {
  critical: {
    wrap:   'border-red-200 bg-red-50/80',
    dot:    'bg-red-500',
    badge:  'bg-red-500 text-white',
    label:  'Critical',
    btn:    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
    icon:   'text-red-400',
  },
  warning: {
    wrap:   'border-amber-200 bg-amber-50/60',
    dot:    'bg-amber-400',
    badge:  'bg-amber-400 text-white',
    label:  'Warning',
    btn:    'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700',
    icon:   'text-amber-400',
  },
  info: {
    wrap:   'border-slate-200 bg-white',
    dot:    'bg-slate-400',
    badge:  'bg-slate-500 text-white',
    label:  'Tip',
    btn:    'bg-slate-700 text-white hover:bg-slate-800 active:bg-slate-900',
    icon:   'text-slate-400',
  },
}

// ── Health ring (pure SVG, no recharts needed for the ring) ─────────────────────
function HealthRing({ score }) {
  const r   = 40
  const circ = 2 * Math.PI * r
  const fill = (Math.max(0, Math.min(100, score)) / 100) * circ
  const clr = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  const lbl = score >= 75 ? 'Healthy'  : score >= 50 ? 'Fair'    : 'Needs work'

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle
            cx="50" cy="50" r={r}
            fill="none" stroke={clr} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${fill} ${circ}`}
            style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-black leading-none" style={{ color: clr }}>{score}</span>
          <span className="text-[9px] text-slate-400 font-semibold tracking-widest uppercase">/100</span>
        </div>
      </div>
      <span className="text-xs font-bold" style={{ color: clr }}>{lbl}</span>
      <span className="text-[10px] text-slate-400">Store health</span>
    </div>
  )
}

// ── Mini horizontal metric bar ──────────────────────────────────────────────────
function MetricBar({ label, value, color }) {
  const pct = Math.max(0, Math.min(100, value))
  const trackColor = pct >= 75 ? color : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-500 font-medium">{label}</span>
        <span className="text-xs font-bold text-slate-700">{pct}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-1000', trackColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Single insight card ─────────────────────────────────────────────────────────
function InsightCard({ insight, onAction }) {
  const s    = SEV[insight.priority]
  const Icon = insight.icon

  return (
    <div className={clsx('rounded-2xl border px-4 py-3 flex items-start gap-3', s.wrap)}>
      {/* Dot */}
      <div className="mt-[5px] shrink-0">
        <div className={clsx('w-2 h-2 rounded-full shrink-0', s.dot)} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide', s.badge)}>
            {s.label}
          </span>
          <Icon size={12} className={clsx('shrink-0', s.icon)} />
          <span className="text-sm font-semibold text-slate-800 leading-snug">{insight.title}</span>
        </div>
        {insight.detail && (
          <p className="text-xs text-slate-500 leading-relaxed">{insight.detail}</p>
        )}
      </div>

      {/* Action button */}
      <button
        className={clsx(
          'shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap',
          s.btn
        )}
        onClick={onAction}
      >
        {insight.action} →
      </button>
    </div>
  )
}

// ── Radial chart for health breakdown ──────────────────────────────────────────
function HealthRadial({ health }) {
  const data = [
    { name: 'Stock',   value: health.stockRate,    fill: '#10b981' },
    { name: 'Catalog', value: health.catalogScore, fill: '#6366f1' },
    { name: 'Active',  value: health.activeRate,   fill: '#3b82f6' },
    { name: 'Sales',   value: health.salesHealth,  fill: '#a855f7' },
  ]
  return (
    <ResponsiveContainer width="100%" height={90}>
      <RadialBarChart
        cx="50%" cy="115%"
        innerRadius="50%" outerRadius="100%"
        startAngle={180} endAngle={0}
        data={data}
        barSize={9}
      >
        <RadialBar dataKey="value" cornerRadius={6} background={{ fill: '#f1f5f9' }} />
      </RadialBarChart>
    </ResponsiveContainer>
  )
}

// ── Main export ─────────────────────────────────────────────────────────────────
export default function InsightsPanel({ cards, onOpenCard }) {
  const health   = useMemo(() => calcHealth(cards),   [cards])  // eslint-disable-line
  const insights = useMemo(() => genInsights(cards),  [cards])  // eslint-disable-line

  const critCount = insights.filter(i => i.priority === 'critical').length
  const warnCount = insights.filter(i => i.priority === 'warning').length
  const infoCount = insights.filter(i => i.priority === 'info').length

  return (
    <div className="space-y-5">

      {/* ── Health score card ───────────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">

          {/* Ring */}
          <div className="shrink-0">
            <HealthRing score={health.total} />
          </div>

          {/* Metric bars */}
          <div className="flex-1 w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <Sparkles size={14} className="text-indigo-400" />
                Inventory Health Breakdown
              </h3>
              <div className="flex gap-2 text-xs">
                {critCount > 0 && (
                  <span className="bg-red-100 text-red-600 font-bold px-2.5 py-1 rounded-full">
                    {critCount} critical
                  </span>
                )}
                {warnCount > 0 && (
                  <span className="bg-amber-100 text-amber-600 font-bold px-2.5 py-1 rounded-full">
                    {warnCount} warnings
                  </span>
                )}
                {critCount === 0 && warnCount === 0 && (
                  <span className="bg-emerald-100 text-emerald-600 font-bold px-2.5 py-1 rounded-full">
                    All clear ✓
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <MetricBar label="Stock Health"    value={health.stockRate}    color="bg-emerald-400" />
              <MetricBar label="Catalog Quality" value={health.catalogScore} color="bg-indigo-400"  />
              <MetricBar label="Active Rate"     value={health.activeRate}   color="bg-blue-400"    />
              <MetricBar label="Sales Coverage"  value={health.salesHealth}  color="bg-purple-400"  />
            </div>
          </div>
        </div>
      </div>

      {/* ── Smart Insights list ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <Zap size={12} className="text-amber-400" />
            Smart Insights
          </h3>
          <span className="text-xs text-slate-400">
            {[
              critCount > 0 && `${critCount} critical`,
              warnCount > 0 && `${warnCount} warnings`,
              infoCount > 0 && `${infoCount} tips`,
            ].filter(Boolean).join(' · ')}
          </span>
        </div>

        {insights.length === 0 ? (
          <div className="card text-center py-10">
            <CheckCircle2 size={36} className="text-emerald-400 mx-auto mb-3" />
            <p className="font-bold text-slate-700">Everything looks great!</p>
            <p className="text-xs text-slate-400 mt-1">No issues detected in your inventory.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <InsightCard
                key={i}
                insight={insight}
                onAction={() => onOpenCard(insight.cardKey)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
