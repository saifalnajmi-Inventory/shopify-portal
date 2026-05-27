/**
 * Global Settings page
 */
import { useState, useEffect } from 'react'
import { Settings, Save, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const SETTING_GROUPS = [
  {
    title: 'Auto-Restock Defaults',
    subtitle: 'Applied to all products without a specific rule',
    settings: [
      { key: 'restock_threshold',  label: 'Low Stock Threshold',     type: 'number', help: 'Alert fires when stock drops below this number' },
      { key: 'restock_target',     label: 'Default Restock Quantity', type: 'number', help: 'Auto-restock will set inventory to this quantity' },
      { key: 'auto_push_enabled',  label: 'Auto-Push to Shopify',     type: 'toggle', help: 'When ON, restock pushes instantly. When OFF, alert only.' },
    ],
  },
  {
    title: 'Notification Preferences',
    subtitle: 'Choose which events generate notifications',
    settings: [
      { key: 'notify_low_stock',     label: 'Low Stock Alerts',     type: 'toggle' },
      { key: 'notify_oos',           label: 'Out of Stock Alerts',  type: 'toggle' },
      { key: 'notify_back_in_stock', label: 'Back in Stock Alerts', type: 'toggle' },
      { key: 'notify_sync_fail',     label: 'Sync Failure Alerts',  type: 'toggle' },
    ],
  },
]

export default function SettingsPage() {
  const [settings, setSettings] = useState({})
  const [dirty,    setDirty]    = useState({})
  const [saving,   setSaving]   = useState(false)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      setSettings(d.settings || {})
      setLoading(false)
    })
  }, [])

  function change(key, value) {
    setSettings(s => ({ ...s, [key]: String(value) }))
    setDirty(d => ({ ...d, [key]: true }))
  }

  async function saveAll() {
    setSaving(true)
    const pairs = Object.entries(dirty).map(([key]) => ({ key, value: settings[key] }))
    if (!pairs.length) { toast('Nothing changed'); setSaving(false); return }
    const res  = await fetch('/api/settings', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(pairs),
    })
    const data = await res.json()
    setSettings(data.settings)
    setDirty({})
    toast.success('Settings saved')
    setSaving(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400 gap-3">
      <RefreshCw size={20} className="animate-spin" /> Loading settings…
    </div>
  )

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Settings size={22} /> Settings
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Global configuration for auto-restock and notifications</p>
        </div>
        <button className="btn-primary" onClick={saveAll} disabled={saving || !Object.keys(dirty).length}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          Save Changes
          {Object.keys(dirty).length > 0 && <span className="ml-1 bg-white/30 rounded-full px-1.5 text-xs">{Object.keys(dirty).length}</span>}
        </button>
      </div>

      {SETTING_GROUPS.map(group => (
        <section key={group.title} className="card space-y-5">
          <div>
            <h2 className="font-semibold text-slate-700">{group.title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{group.subtitle}</p>
          </div>
          {group.settings.map(({ key, label, type, help }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <div className={clsx('text-sm font-medium', dirty[key] ? 'text-indigo-700' : 'text-slate-700')}>
                  {label}
                  {dirty[key] && <span className="ml-2 text-xs text-indigo-500">unsaved</span>}
                </div>
                {help && <div className="text-xs text-slate-400 mt-0.5">{help}</div>}
              </div>
              {type === 'toggle' ? (
                <button
                  className={clsx(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all shrink-0',
                    settings[key] === 'true'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-slate-100  text-slate-500  border-slate-200'
                  )}
                  onClick={() => change(key, settings[key] === 'true' ? 'false' : 'true')}
                >
                  {settings[key] === 'true'
                    ? <><ToggleRight size={16} className="text-emerald-500" /> ON</>
                    : <><ToggleLeft  size={16} /> OFF</>}
                </button>
              ) : (
                <input
                  type="number" min="1" max="9999"
                  className={clsx('input w-24 text-center', dirty[key] && 'border-indigo-400 ring-1 ring-indigo-300')}
                  value={settings[key] || ''}
                  onChange={e => change(key, e.target.value)}
                />
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
