import clsx from 'clsx'

export default function DashboardCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'indigo',
  onClick,
  badge,
  trend,
}) {
  const colors = {
    indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-600',  val: 'text-indigo-700'  },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', val: 'text-emerald-700' },
    red:     { bg: 'bg-red-50',     icon: 'text-red-600',     val: 'text-red-700'     },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   val: 'text-amber-700'   },
    slate:   { bg: 'bg-slate-100',  icon: 'text-slate-500',   val: 'text-slate-700'   },
    purple:  { bg: 'bg-purple-50',  icon: 'text-purple-600',  val: 'text-purple-700'  },
    blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600',    val: 'text-blue-700'    },
    orange:  { bg: 'bg-orange-50',  icon: 'text-orange-600',  val: 'text-orange-700'  },
  }
  const c = colors[color] || colors.indigo

  return (
    <div
      className={clsx('card flex flex-col gap-3', onClick && 'cursor-pointer hover:shadow-md transition-shadow')}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', c.bg)}>
          {Icon && <Icon size={20} className={c.icon} />}
        </div>
        {badge && (
          <span className={clsx('badge text-xs', badge.className)}>
            {badge.label}
          </span>
        )}
      </div>

      <div>
        <div className={clsx('text-3xl font-bold', c.val)}>
          {value ?? '—'}
        </div>
        <div className="text-sm font-medium text-slate-700 mt-0.5">{title}</div>
        {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
      </div>

      {trend !== undefined && (
        <div className="text-xs text-slate-400 flex items-center gap-1">
          <span>{trend}</span>
        </div>
      )}
    </div>
  )
}

/** Small list item inside a card (for best sellers etc.) */
export function CardListItem({ rank, title, value, sub, image }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-bold text-slate-400 w-5 text-center">{rank}</span>
      {image && (
        <img
          src={image}
          alt={title}
          className="w-8 h-8 rounded object-cover border border-slate-200"
          onError={e => { e.target.style.display = 'none' }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">{title}</div>
        {sub && <div className="text-xs text-slate-400">{sub}</div>}
      </div>
      <span className="text-sm font-semibold text-indigo-600 shrink-0">{value}</span>
    </div>
  )
}
