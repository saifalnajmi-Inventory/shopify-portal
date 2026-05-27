/**
 * User Management page — visible to super_admin and client_admin only.
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter }                         from 'next/router'
import {
  Users, Plus, Trash2, RefreshCw, ShieldCheck,
  Shield, Eye, User, KeyRound, ToggleLeft, ToggleRight,
  CheckCircle2, XCircle, Clock,
} from 'lucide-react'
import clsx            from 'clsx'
import toast           from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { useAuth }     from './_app'

// Role badge colours
const ROLE_STYLE = {
  super_admin:  'bg-indigo-100 text-indigo-700 border-indigo-300',
  client_admin: 'bg-purple-100 text-purple-700 border-purple-300',
  manager:      'bg-blue-100   text-blue-700   border-blue-300',
  viewer:       'bg-slate-100  text-slate-600  border-slate-300',
}
const ROLE_LABELS = {
  super_admin:  'Super Admin',
  client_admin: 'Client Admin',
  manager:      'Manager',
  viewer:       'Viewer',
}
const ROLE_ICONS = {
  super_admin:  ShieldCheck,
  client_admin: Shield,
  manager:      User,
  viewer:       Eye,
}

function RoleBadge({ role }) {
  const Icon = ROLE_ICONS[role] || User
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border', ROLE_STYLE[role])}>
      <Icon size={11} /> {ROLE_LABELS[role] || role}
    </span>
  )
}

export default function UsersPage() {
  const router         = useRouter()
  const { user: me }   = useAuth()
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editUser, setEditUser] = useState(null)

  // Block viewer/manager from accessing this page
  useEffect(() => {
    if (me && !['super_admin', 'client_admin'].includes(me.role)) {
      router.replace('/')
    }
  }, [me])  // eslint-disable-line

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/users')
    const data = await res.json()
    setUsers(data.users || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleActive(user) {
    const res  = await fetch('/api/users', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: user.id, active: !user.active }),
    })
    const data = await res.json()
    if (data.ok) {
      toast.success(`${user.username} ${user.active ? 'deactivated' : 'activated'}`)
      load()
    } else {
      toast.error(data.error)
    }
  }

  async function deleteUser(user) {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return
    const res  = await fetch(`/api/users?id=${user.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.ok) {
      toast.success(`User ${user.username} deleted`)
      load()
    } else {
      toast.error(data.error)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users size={22} /> User Management
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Manage who can access this portal and what they can do.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm" onClick={load}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn-primary text-sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add User
          </button>
        </div>
      </div>

      {/* Role legend */}
      <div className="card py-3 px-4">
        <div className="flex flex-wrap gap-4 items-center">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Roles:</span>
          {Object.entries(ROLE_LABELS).map(([role, label]) => (
            <div key={role} className="flex items-center gap-2 text-xs text-slate-600">
              <RoleBadge role={role} />
              <span>
                {role === 'super_admin'  && '— Full access, manage everything'}
                {role === 'client_admin' && '— Manage users & settings, no sync/push'}
                {role === 'manager'      && '— Sync + push inventory + reports'}
                {role === 'viewer'       && '— Read-only dashboards'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Users table */}
      <div className="card p-0 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
            <RefreshCw size={20} className="animate-spin" /> Loading users…
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th className="text-center">Status</th>
                <th>Last Login</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={!u.active ? 'opacity-50' : ''}>
                  <td>
                    <div className="font-semibold text-slate-800 text-sm">{u.name || u.username}</div>
                    <div className="text-xs text-slate-400 font-mono">@{u.username}</div>
                  </td>
                  <td><RoleBadge role={u.role} /></td>
                  <td className="text-center">
                    {u.active
                      ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle2 size={12} /> Active</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium"><XCircle size={12} /> Inactive</span>
                    }
                  </td>
                  <td className="text-xs text-slate-500">
                    {u.lastLoginAt
                      ? <span className="flex items-center gap-1"><Clock size={11} />{formatDistanceToNow(new Date(u.lastLoginAt), { addSuffix: true })}</span>
                      : <span className="text-slate-300">Never</span>}
                  </td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      {/* Edit */}
                      <button
                        className="btn-secondary py-1 px-2 text-xs"
                        onClick={() => setEditUser(u)}
                        title="Edit user"
                      >
                        <KeyRound size={12} /> Edit
                      </button>
                      {/* Toggle active */}
                      {u.id !== me?.id && (
                        <button
                          className={clsx('py-1 px-2 text-xs rounded-lg border transition-all inline-flex items-center gap-1',
                            u.active
                              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          )}
                          onClick={() => toggleActive(u)}
                          title={u.active ? 'Deactivate' : 'Activate'}
                        >
                          {u.active ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                      {/* Delete */}
                      {u.id !== me?.id && (
                        <button
                          className="text-slate-400 hover:text-red-500 transition-colors p-1"
                          onClick={() => deleteUser(u)}
                          title="Delete user"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      {u.id === me?.id && (
                        <span className="text-xs text-slate-300 italic">you</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showAdd  && <UserModal mode="add"  onClose={() => { setShowAdd(false);   load() }} me={me} />}
      {editUser && <UserModal mode="edit" onClose={() => { setEditUser(null);   load() }} me={me} initial={editUser} />}
    </div>
  )
}

// ── Add / Edit modal ───────────────────────────────────────────────────────────
function UserModal({ mode, onClose, me, initial = {} }) {
  const [form, setForm] = useState({
    username: initial.username || '',
    name:     initial.name     || '',
    role:     initial.role     || 'viewer',
    password: '',
    active:   initial.active   !== undefined ? initial.active : true,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const availableRoles = me?.role === 'super_admin'
    ? ['viewer', 'manager', 'client_admin', 'super_admin']
    : ['viewer', 'manager', 'client_admin']

  async function save() {
    setError('')
    if (mode === 'add' && !form.username.trim()) { setError('Username is required'); return }
    if (mode === 'add' && !form.password)         { setError('Password is required'); return }
    if (form.password && form.password.length < 8){ setError('Password must be at least 8 characters'); return }

    setSaving(true)
    const url    = '/api/users'
    const method = mode === 'add' ? 'POST' : 'PUT'
    const body   = mode === 'add'
      ? { username: form.username.trim().toLowerCase(), name: form.name, role: form.role, password: form.password }
      : { id: initial.id, name: form.name, role: form.role, active: form.active, ...(form.password ? { password: form.password } : {}) }

    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const data = await res.json()

    if (data.ok) {
      toast.success(mode === 'add' ? `User ${form.username} created` : 'User updated')
      onClose()
    } else {
      setError(data.error || 'Failed')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
          <Users size={18} />
          {mode === 'add' ? 'Add New User' : `Edit — @${initial.username}`}
        </h2>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        )}

        {/* Username (add only) */}
        {mode === 'add' && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Username *</label>
            <input
              className="input w-full"
              placeholder="e.g. john"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            />
            <p className="text-xs text-slate-400 mt-1">Lowercase, no spaces. Used to log in.</p>
          </div>
        )}

        {/* Display name */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Display Name</label>
          <input
            className="input w-full"
            placeholder="e.g. John Smith"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>

        {/* Role */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Role *</label>
          <select className="input w-full" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            {availableRoles.map(r => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            {form.role === 'viewer'       && 'Read-only access. Cannot sync, push, or change settings.'}
            {form.role === 'manager'      && 'Can sync Shopify data and push inventory changes.'}
            {form.role === 'client_admin' && 'Can manage users and settings. Cannot sync or push.'}
            {form.role === 'super_admin'  && '⚠️ Full access. Can manage all users, settings, and data.'}
          </p>
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            {mode === 'add' ? 'Password *' : 'New Password (leave blank to keep current)'}
          </label>
          <input
            type="password"
            className="input w-full"
            placeholder={mode === 'add' ? 'Min 8 characters' : 'Leave blank to keep unchanged'}
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          />
        </div>

        {/* Active toggle (edit only) */}
        {mode === 'edit' && initial.id !== me?.id && (
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
            <span className="text-sm font-medium text-slate-700">Account Active</span>
            <button
              className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all', form.active
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-slate-100 text-slate-500 border-slate-200'
              )}
              onClick={() => setForm(f => ({ ...f, active: !f.active }))}
            >
              {form.active
                ? <><ToggleRight size={16} className="text-emerald-500" /> Active</>
                : <><ToggleLeft  size={16} /> Inactive</>}
            </button>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" onClick={save} disabled={saving}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : null}
            {mode === 'add' ? 'Create User' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
