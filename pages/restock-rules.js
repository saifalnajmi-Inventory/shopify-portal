/**
 * Auto-Restock Rules management page
 */
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Plus, Trash2, ToggleLeft, ToggleRight, Zap, Settings2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

export default function RestockRulesPage() {
  const [rules,    setRules]    = useState([])
  const [settings, setSettings] = useState({})
  const [loading,  setLoading]  = useState(true)
  const [showAdd,  setShowAdd]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [rulesRes, settingsRes] = await Promise.all([
      fetch('/api/restock-rules'),
      fetch('/api/settings'),
    ])
    const rulesData    = await rulesRes.json()
    const settingsData = await settingsRes.json()
    setRules(rulesData.rules || [])
    setSettings(settingsData.settings || {})
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveSettings(key, value) {
    const res  = await fetch('/api/settings', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ key, value: String(value) }),
    })
    const data = await res.json()
    setSettings(data.settings)
    toast.success('Settings saved')
  }

  async function toggleRule(id, field, value) {
    await fetch('/api/restock-rules', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, [field]: value }),
    })
    load()
  }

  async function deleteRule(id) {
    await fetch(`/api/restock-rules?id=${id}`, { method: 'DELETE' })
    toast.success('Rule deleted')
    load()
  }

  const pushStatus = { success: 'text-emerald-600', failed: 'text-red-600', pending: 'text-amber-600' }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Zap size={22} className="text-amber-500" />
            Auto-Restock Rules
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Rules fire automatically during sync when stock drops below the threshold.
            Set per-variant rules, or rely on global defaults below.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm" onClick={load}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn-primary text-sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Rule
          </button>
        </div>
      </div>

      {/* ── Global Defaults ──────────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <Settings2 size={16} /> Global Default Settings
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          These apply to all products/variants that do NOT have a custom rule set above.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Default Low Stock Threshold</label>
            <input
              type="number" min="1" max="999"
              className="input w-full"
              defaultValue={settings.restock_threshold || '10'}
              onBlur={e => saveSettings('restock_threshold', e.target.value)}
            />
            <p className="text-xs text-slate-400 mt-1">Alert fires when stock drops below this</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Default Restock Target</label>
            <input
              type="number" min="1" max="9999"
              className="input w-full"
              defaultValue={settings.restock_target || '10'}
              onBlur={e => saveSettings('restock_target', e.target.value)}
            />
            <p className="text-xs text-slate-400 mt-1">Auto-restock will set quantity to this</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Auto-Push to Shopify (Global)</label>
            <button
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all',
                settings.auto_push_enabled === 'true'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-slate-100  text-slate-600  border-slate-200'
              )}
              onClick={() => saveSettings('auto_push_enabled', settings.auto_push_enabled === 'true' ? 'false' : 'true')}
            >
              {settings.auto_push_enabled === 'true'
                ? <><ToggleRight size={18} className="text-emerald-500" /> Auto-push ON</>
                : <><ToggleLeft  size={18} /> Auto-push OFF</>
              }
            </button>
            <p className="text-xs text-slate-400 mt-1">
              {settings.auto_push_enabled === 'true'
                ? '✅ Stock will be pushed to Shopify automatically'
                : '⚠️ Alert only — no automatic push'}
            </p>
          </div>
        </div>
      </section>

      {/* ── Rules Table ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
          Per-Variant Rules ({rules.length})
        </h2>

        {loading ? (
          <div className="card flex items-center justify-center py-16 text-slate-400 gap-3">
            <RefreshCw size={20} className="animate-spin" /> Loading rules…
          </div>
        ) : rules.length === 0 ? (
          <div className="card text-center py-16 text-slate-400">
            <Zap size={32} className="mx-auto mb-3 opacity-30" />
            <p className="mb-2">No per-variant rules yet.</p>
            <p className="text-xs">Rules can be added here, or directly from the product drill-down panel on the dashboard.</p>
          </div>
        ) : (
          <div className="card p-0 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Product / Variant</th>
                  <th>SKU</th>
                  <th className="text-center">Threshold</th>
                  <th className="text-center">Restock To</th>
                  <th className="text-center">Auto-Push</th>
                  <th className="text-center">Enabled</th>
                  <th>Last Triggered</th>
                  <th>Push Status</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id}>
                    <td className="max-w-[200px]">
                      <div className="font-medium text-slate-800 truncate text-sm">{rule.productTitle}</div>
                      {rule.variantTitle && rule.variantTitle !== 'Default Title' && (
                        <div className="text-xs text-slate-400">{rule.variantTitle}</div>
                      )}
                    </td>
                    <td className="font-mono text-xs text-slate-400">{rule.sku || '—'}</td>

                    {/* Threshold — inline editable */}
                    <td className="text-center">
                      <input
                        type="number" min="1" className="input w-16 text-center text-sm py-1"
                        defaultValue={rule.threshold}
                        onBlur={e => toggleRule(rule.id, 'threshold', e.target.value)}
                      />
                    </td>

                    {/* Restock to — inline editable */}
                    <td className="text-center">
                      <input
                        type="number" min="1" className="input w-16 text-center text-sm py-1"
                        defaultValue={rule.restockTo}
                        onBlur={e => toggleRule(rule.id, 'restockTo', e.target.value)}
                      />
                    </td>

                    {/* Auto-push toggle */}
                    <td className="text-center">
                      <button onClick={() => toggleRule(rule.id, 'autoRestock', !rule.autoRestock)}>
                        {rule.autoRestock
                          ? <ToggleRight size={22} className="text-emerald-500" />
                          : <ToggleLeft  size={22} className="text-slate-300" />}
                      </button>
                    </td>

                    {/* Enabled toggle */}
                    <td className="text-center">
                      <button onClick={() => toggleRule(rule.id, 'enabled', !rule.enabled)}>
                        {rule.enabled
                          ? <ToggleRight size={22} className="text-indigo-500" />
                          : <ToggleLeft  size={22} className="text-slate-300" />}
                      </button>
                    </td>

                    {/* Last triggered */}
                    <td className="text-xs text-slate-500">
                      {rule.lastTriggeredAt ? (
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {formatDistanceToNow(new Date(rule.lastTriggeredAt), { addSuffix: true })}
                          {rule.triggerCount > 0 && <span className="text-slate-400">({rule.triggerCount}×)</span>}
                        </span>
                      ) : '—'}
                    </td>

                    {/* Push status */}
                    <td>
                      {rule.lastPushStatus ? (
                        <span className={clsx('flex items-center gap-1 text-xs font-medium', pushStatus[rule.lastPushStatus])}>
                          {rule.lastPushStatus === 'success' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                          {rule.lastPushStatus}
                        </span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                      {rule.lastPushError && (
                        <div className="text-xs text-red-500 mt-0.5 max-w-[180px] truncate" title={rule.lastPushError}>
                          {rule.lastPushError}
                        </div>
                      )}
                    </td>

                    {/* Delete */}
                    <td className="text-center">
                      <button
                        className="text-slate-400 hover:text-red-500 transition-colors"
                        onClick={() => { if (confirm('Delete this rule?')) deleteRule(rule.id) }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Add Rule Modal ────────────────────────────────────────────────────── */}
      {showAdd && <AddRuleModal onClose={() => { setShowAdd(false); load() }} />}
    </div>
  )
}

function AddRuleModal({ onClose }) {
  const [form, setForm] = useState({
    productId: '', variantId: '', productTitle: '', variantTitle: '', sku: '',
    threshold: '10', restockTo: '10', autoRestock: false,
  })
  const [products, setProducts] = useState([])
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    fetch('/api/products?limit=500')
      .then(r => r.json())
      .then(d => setProducts(d.products || []))
  }, [])

  function selectProduct(e) {
    const p = products.find(p => p.id === e.target.value)
    if (!p) return
    setForm(f => ({ ...f, productId: p.id, productTitle: p.title, variantId: '', variantTitle: '', sku: '' }))
  }

  function selectVariant(e) {
    const product = products.find(p => p.id === form.productId)
    const v = product?.variants?.find(v => v.id === e.target.value)
    if (!v) return
    setForm(f => ({ ...f, variantId: v.id, variantTitle: v.title, sku: v.sku || '' }))
  }

  async function save() {
    if (!form.productId) { toast.error('Select a product'); return }
    setSaving(true)
    const res  = await fetch('/api/restock-rules', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    })
    const data = await res.json()
    if (data.ok) {
      toast.success('Restock rule saved')
      onClose()
    } else {
      toast.error(data.error || 'Failed to save')
    }
    setSaving(false)
  }

  const selectedProduct = products.find(p => p.id === form.productId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <h2 className="font-bold text-slate-800 text-lg">Add Auto-Restock Rule</h2>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Product</label>
          <select className="input w-full" onChange={selectProduct} value={form.productId}>
            <option value="">Select a product…</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>

        {selectedProduct?.variants?.length > 1 && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Variant (optional)</label>
            <select className="input w-full" onChange={selectVariant} value={form.variantId}>
              <option value="">All variants (product-level)</option>
              {selectedProduct.variants.map(v => (
                <option key={v.id} value={v.id}>{v.title} — {v.inventoryQuantity} in stock {v.sku ? `(${v.sku})` : ''}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Trigger when stock below</label>
            <input type="number" min="1" className="input w-full" value={form.threshold}
              onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Restock quantity (target)</label>
            <input type="number" min="1" className="input w-full" value={form.restockTo}
              onChange={e => setForm(f => ({ ...f, restockTo: e.target.value }))} />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
          <div>
            <div className="font-semibold text-sm text-slate-700">Auto-push to Shopify?</div>
            <div className="text-xs text-slate-400 mt-0.5">
              YES = stock pushed instantly when triggered<br/>
              NO = alert only, no automatic push
            </div>
          </div>
          <button
            className={clsx('px-5 py-2 rounded-lg text-sm font-bold border transition-all', form.autoRestock
              ? 'bg-emerald-500 text-white border-emerald-600'
              : 'bg-white text-slate-600 border-slate-300'
            )}
            onClick={() => setForm(f => ({ ...f, autoRestock: !f.autoRestock }))}
          >
            {form.autoRestock ? '✅ YES — Auto Push' : '⚠️ NO — Alert Only'}
          </button>
        </div>

        <div className="flex gap-3 pt-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" onClick={save} disabled={saving}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : null}
            Save Rule
          </button>
        </div>
      </div>
    </div>
  )
}
