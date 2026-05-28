import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Package, GitPullRequest, History,
  RefreshCw, Store, Menu, X, Bell, Zap, Settings,
  CheckCircle2, Clock, AlertCircle, Wifi, Users,
  LogOut, ShieldCheck, Shield, User, Eye, KeyRound, Crown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import { useAuth } from '../pages/_app'

// All nav items — adminOnly ones are filtered by role below
const NAV_ALL = [
  { href: '/',              label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/products',      label: 'Products',       icon: Package          },
  { href: '/changes',       label: 'Review Changes', icon: GitPullRequest   },
  { href: '/change-log',    label: 'Change Log',     icon: History          },
  { href: '/notifications', label: 'Notifications',  icon: Bell, badgeKey: 'unread' },
  { href: '/restock-rules', label: 'Auto-Restock',   icon: Zap              },
  { href: '/settings',      label: 'Settings',       icon: Settings         },
  { href: '/users',         label: 'Users',          icon: Users, adminOnly: true },
]

const ROLE_ICON  = { super_admin: ShieldCheck, client_admin: Shield, owner: Crown, operator: Settings, manager: User, viewer: Eye }
const ROLE_COLOR = {
  super_admin:  'bg-indigo-100 text-indigo-700',
  client_admin: 'bg-purple-100 text-purple-700',
  owner:        'bg-amber-100  text-amber-700',
  operator:     'bg-teal-100   text-teal-700',
  manager:      'bg-blue-100   text-blue-700',
  viewer:       'bg-slate-100  text-slate-600',
}
const ROLE_LABEL = {
  super_admin: 'Super Admin', client_admin: 'Client Admin',
  owner: 'Owner', operator: 'Operator',
  manager: 'Manager', viewer: 'Viewer',
}

export default function Layout({ children }) {
  const router = useRouter()
  const { user, authLoading } = useAuth()

  const [syncing,        setSyncing]        = useState(false)
  const [sidebarOpen,    setSidebarOpen]    = useState(false)
  const [syncInfo,       setSyncInfo]       = useState(null)
  const [unreadCount,    setUnreadCount]    = useState(0)
  const [showChangePw,   setShowChangePw]   = useState(false)
  const pollRef = useRef(null)

  const isAdminOrCA = user?.role === 'super_admin' || user?.role === 'client_admin'
  const canSync     = user?.role === 'super_admin' || user?.role === 'manager' || user?.role === 'operator' || user?.role === 'owner'
  const NAV         = NAV_ALL.filter(n => !n.adminOnly || isAdminOrCA)

  // ── On mount: autosync + unread count (only when authenticated) ──────────────
  useEffect(() => {
    if (authLoading || !user) return
    checkAutoSync()
    fetchUnread()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [authLoading, user])  // eslint-disable-line

  async function fetchUnread() {
    try {
      const res  = await fetch('/api/notifications?status=unread&limit=1')
      const data = await res.json()
      setUnreadCount(data.unreadCount || 0)
    } catch { /* silent */ }
  }

  async function checkAutoSync() {
    try {
      const res  = await fetch('/api/autosync')
      if (!res.ok) return
      const data = await res.json()
      setSyncInfo(data)
      if (data.needsSync || data.syncRunning) startPolling()
    } catch { /* silent */ }
  }

  function startPolling() {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch('/api/autosync')
        const data = await res.json()
        setSyncInfo(data)
        if (!data.syncRunning && data.status === 'fresh') {
          clearInterval(pollRef.current)
          pollRef.current = null
          router.replace(router.asPath)
          toast.success(`Auto-sync complete — ${data.productCount?.toLocaleString()} products loaded`, { duration: 4000 })
        }
      } catch { /* silent */ }
    }, 8000)
  }

  async function handleSync() {
    if (syncing || !canSync) return
    setSyncing(true)
    setSyncInfo(prev => prev ? { ...prev, syncRunning: true } : null)
    const tid = toast.loading('Syncing from Shopify…')
    try {
      const res  = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        if (data.warnings?.length) {
          toast(`Synced ${data.products} products · ${data.orders} orders\n⚠️ ${data.warnings[0]}`,
            { id: tid, duration: 8000, icon: '⚠️' })
        } else {
          toast.success(`Synced ${data.products?.toLocaleString()} products · ${data.orders?.toLocaleString()} orders`, { id: tid })
        }
        router.replace(router.asPath)
        await checkAutoSync()
      } else {
        toast.error(data.error || 'Sync failed', { id: tid })
      }
    } catch (e) {
      toast.error(e.message, { id: tid })
    } finally {
      setSyncing(false)
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    router.push('/login')
  }

  // ── Sidebar component ────────────────────────────────────────────────────────
  const Sidebar = () => (
    <aside className="flex flex-col w-64 h-screen sticky top-0 bg-white border-r border-slate-200 shrink-0 overflow-hidden">

      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
          <Store size={16} className="text-white" />
        </div>
        <div>
          <div className="font-bold text-slate-800 text-sm leading-tight">Inventory Portal</div>
          <div className="text-xs text-slate-400">Shopify Admin</div>
        </div>
      </div>

      {/* Navigation — scrollable middle section */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon, badgeKey }) => {
          const active     = router.pathname === href
          const badgeCount = badgeKey === 'unread' ? unreadCount : 0
          return (
            <Link
              key={href}
              href={href}
              onClick={badgeKey === 'unread' ? fetchUnread : undefined}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                active ? 'nav-active' : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              <div className="relative">
                <Icon size={17} />
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </div>
              {label}
              {badgeCount > 0 && (
                <span className="ml-auto bg-red-100 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {badgeCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Sync status panel */}
      <div className="mx-3 mb-3 rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Local Database</span>
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <Wifi size={11} /> Live
          </span>
        </div>
        {syncInfo && (
          <div className="text-xs text-slate-600">
            <span className="font-bold text-slate-800 text-sm">{syncInfo.productCount?.toLocaleString()}</span>
            {' '}products in local DB
          </div>
        )}
        {syncInfo?.lastSync ? (
          <div className="flex items-start gap-1.5 text-xs text-slate-500">
            <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />
            <span>Synced{' '}
              <span className="font-medium text-slate-700">
                {formatDistanceToNow(new Date(syncInfo.lastSync), { addSuffix: true })}
              </span>
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-1.5 text-xs text-amber-600">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            <span>Not synced yet</span>
          </div>
        )}
        {(syncInfo?.syncRunning || syncing) ? (
          <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
            <RefreshCw size={11} className="animate-spin" /> Syncing in background…
          </div>
        ) : syncInfo?.nextSyncIn > 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock size={11} /> Next auto-sync in {syncInfo.nextSyncIn}m
          </div>
        ) : null}
      </div>

      {/* Sync button — hidden from viewers */}
      {canSync && (
        <div className="px-3 pb-2">
          <button
            onClick={handleSync}
            disabled={syncing || syncInfo?.syncRunning}
            className="btn-primary w-full justify-center"
          >
            <RefreshCw size={15} className={(syncing || syncInfo?.syncRunning) ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : syncInfo?.syncRunning ? 'Auto-syncing…' : 'Sync from Shopify'}
          </button>
          <p className="text-center text-xs text-slate-400 mt-1.5">
            Auto-syncs every 6 h · data persists ✓
          </p>
        </div>
      )}

      {/* Logged-in user footer */}
      {user && (
        <div className="mx-3 mb-4 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800 truncate">
                {user.name || user.username}
              </div>
              <div className="mt-0.5">
                {(() => {
                  const Icon = ROLE_ICON[user.role] || User
                  return (
                    <span className={clsx(
                      'inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded',
                      ROLE_COLOR[user.role]
                    )}>
                      <Icon size={9} /> {ROLE_LABEL[user.role] || user.role}
                    </span>
                  )
                })()}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setShowChangePw(true)}
                className="shrink-0 text-slate-400 hover:text-indigo-600 transition-colors p-1.5 rounded-lg hover:bg-indigo-50"
                title="Change password"
              >
                <KeyRound size={15} />
              </button>
              <button
                onClick={handleLogout}
                className="shrink-0 text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )

  // ── Change Password modal ────────────────────────────────────────────────────
  function ChangePasswordModal({ user, onClose }) {
    const [current,  setCurrent]  = useState('')
    const [next,     setNext]     = useState('')
    const [confirm,  setConfirm]  = useState('')
    const [saving,   setSaving]   = useState(false)
    const [error,    setError]    = useState('')

    async function save() {
      setError('')
      if (!current)            { setError('Enter your current password'); return }
      if (next.length < 8)     { setError('New password must be at least 8 characters'); return }
      if (next !== confirm)    { setError('New passwords do not match'); return }
      setSaving(true)
      try {
        const res  = await fetch('/api/auth/change-password', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ currentPassword: current, newPassword: next }),
        })
        const data = await res.json()
        if (data.ok) {
          toast.success('Password changed successfully')
          onClose()
        } else {
          setError(data.error || 'Failed to change password')
        }
      } catch {
        setError('Network error')
      }
      setSaving(false)
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 modal-scroll">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <KeyRound size={18} /> Change Password
          </h2>
          <p className="text-xs text-slate-400">Changing password for <span className="font-semibold text-slate-600">@{user?.username}</span></p>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Current Password</label>
            <input type="password" className="input w-full" placeholder="Your current password"
              value={current} onChange={e => setCurrent(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">New Password</label>
            <input type="password" className="input w-full" placeholder="Min 8 characters"
              value={next} onChange={e => setNext(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Confirm New Password</label>
            <input type="password" className="input w-full" placeholder="Repeat new password"
              value={confirm} onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()} />
          </div>

          <div className="flex gap-3 pt-1">
            <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
            <button className="btn-primary flex-1" onClick={save} disabled={saving}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : null}
              Save Password
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0">
            <Sidebar />
          </div>
          <button
            className="absolute top-4 left-[268px] z-50 bg-white rounded-full p-1 shadow"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Change Password modal */}
      {showChangePw && (
        <ChangePasswordModal user={user} onClose={() => setShowChangePw(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <span className="font-semibold text-slate-800">Inventory Portal</span>
          {user && (
            <span className={clsx('ml-auto text-[10px] font-bold px-2 py-1 rounded', ROLE_COLOR[user.role])}>
              {ROLE_LABEL[user.role]}
            </span>
          )}
        </div>

        <main className="flex-1 p-4 lg:p-6 max-w-screen-2xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
