import { useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'

const STOCK_LEVELS = [
  { value: '',        label: 'All stock levels' },
  { value: 'instock', label: 'In stock only'    },
  { value: '0',       label: 'Out of stock'     },
  { value: 'lt3',     label: 'Below 3 units'    },
  { value: 'lt5',     label: 'Below 5 units'    },
  { value: 'lt10',    label: 'Below 10 units'   },
  { value: 'custom',  label: 'Custom threshold' },
]

export default function FilterPanel({ filters, options, onChange }) {
  const [customThreshold, setCustomThreshold] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  function set(key, value) {
    onChange({ ...filters, [key]: value })
  }

  function setStockLevel(value) {
    if (value === 'custom') {
      // keep showing the custom input
      onChange({ ...filters, stockLevel: `custom:${customThreshold || 1}` })
    } else {
      onChange({ ...filters, stockLevel: value })
    }
  }

  function clearAll() {
    onChange({
      search: '', status: '', vendor: '', productType: '',
      collectionId: '', stockLevel: '', hasSales: '', hasImages: '',
      hasSeo: '', hasVendor: '', posLink: '',
    })
    setCustomThreshold('')
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Search by name, SKU, barcode, vendor, tag…"
            value={filters.search}
            onChange={e => set('search', e.target.value)}
          />
          {filters.search && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={() => set('search', '')}>
              <X size={14} />
            </button>
          )}
        </div>

        <button
          className="btn-secondary relative"
          onClick={() => setShowFilters(v => !v)}
        >
          <SlidersHorizontal size={15} />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 w-5 h-5 bg-indigo-600 text-white rounded-full text-xs flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button className="btn-secondary text-red-500" onClick={clearAll}>
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="card grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Status */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Status</label>
            <select className="select w-full" value={filters.status} onChange={e => set('status', e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Vendor */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Vendor / Brand</label>
            <select className="select w-full" value={filters.vendor} onChange={e => set('vendor', e.target.value)}>
              <option value="">All vendors</option>
              {options.vendors?.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* Product type */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Product Type</label>
            <select className="select w-full" value={filters.productType} onChange={e => set('productType', e.target.value)}>
              <option value="">All types</option>
              {options.productTypes?.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Collection */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Collection</label>
            <select className="select w-full" value={filters.collectionId} onChange={e => set('collectionId', e.target.value)}>
              <option value="">All collections</option>
              {options.collections?.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>

          {/* Stock level */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Stock Level</label>
            <select
              className="select w-full"
              value={filters.stockLevel.startsWith('custom:') ? 'custom' : filters.stockLevel}
              onChange={e => setStockLevel(e.target.value)}
            >
              {STOCK_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {filters.stockLevel.startsWith('custom:') && (
              <input
                type="number"
                min="1"
                className="input mt-2"
                placeholder="Max qty"
                value={customThreshold}
                onChange={e => {
                  setCustomThreshold(e.target.value)
                  onChange({ ...filters, stockLevel: `custom:${e.target.value}` })
                }}
              />
            )}
          </div>

          {/* Boolean flags */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Sales</label>
            <select className="select w-full" value={filters.hasSales} onChange={e => set('hasSales', e.target.value)}>
              <option value="">Any</option>
              <option value="true">Has sales</option>
              <option value="false">No sales</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Images</label>
            <select className="select w-full" value={filters.hasImages} onChange={e => set('hasImages', e.target.value)}>
              <option value="">Any</option>
              <option value="true">Has images</option>
              <option value="false">Missing images</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">SEO</label>
            <select className="select w-full" value={filters.hasSeo} onChange={e => set('hasSeo', e.target.value)}>
              <option value="">Any</option>
              <option value="false">Missing SEO</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Vendor</label>
            <select className="select w-full" value={filters.hasVendor} onChange={e => set('hasVendor', e.target.value)}>
              <option value="">Any</option>
              <option value="false">Missing vendor</option>
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
