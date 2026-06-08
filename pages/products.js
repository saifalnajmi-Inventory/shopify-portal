/**
 * Products page — full product table with filters, sorting, pagination,
 * inline editing that creates draft changes, and CSV export.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Download, RefreshCw, DownloadCloud } from 'lucide-react'
import FilterPanel  from '../components/FilterPanel'
import ProductTable from '../components/ProductTable'

const DEFAULT_FILTERS = {
  search: '', status: '', vendor: '', productType: '',
  collectionId: '', stockLevel: '', hasSales: '', hasImages: '',
  hasSeo: '', hasVendor: '', posLink: '',
}

export default function ProductsPage() {
  const [products,   setProducts]   = useState([])
  const [total,      setTotal]      = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page,       setPage]       = useState(1)
  const [sort,       setSort]       = useState('title')
  const [order,      setOrder]      = useState('asc')
  const [filters,    setFilters]    = useState(DEFAULT_FILTERS)
  const [filterOpts, setFilterOpts] = useState({ vendors: [], productTypes: [], collections: [] })
  const [loading,    setLoading]    = useState(true)
  const [fetchingNew, setFetchingNew] = useState(false)
  const [fetchMsg,    setFetchMsg]    = useState('')

  const debounceRef = useRef(null)

  const load = useCallback(async (f = filters, s = sort, o = order, p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        ...f, sort: s, order: o, page: p, limit: '50',
      })
      const res  = await fetch(`/api/products?${params}`)
      const data = await res.json()
      setProducts(data.products || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 1)
      setFilterOpts(data.filters || { vendors: [], productTypes: [], collections: [] })
    } catch (e) {
      console.error('Products load error:', e)
    } finally {
      setLoading(false)
    }
  }, [filters, sort, order, page])

  // Debounce filter changes to avoid hammering on every keystroke
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      load(filters, sort, order, 1)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [filters, sort, order])

  useEffect(() => { load() }, [page])

  function handleSort(field) {
    const newOrder = sort === field && order === 'asc' ? 'desc' : 'asc'
    setSort(field)
    setOrder(newOrder)
  }

  function handleExport() {
    const params = new URLSearchParams(filters)
    window.open(`/api/export?${params}`, '_blank')
  }

  // Pull just-uploaded products from Shopify (incremental, not the full 6h sync),
  // then sort newest-first so they appear at the top of the list.
  async function handleFetchNew() {
    setFetchingNew(true)
    setFetchMsg('')
    try {
      const res  = await fetch('/api/fetch-new-uploads', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fetch failed')
      setFetchMsg(
        data.newCount
          ? `✓ ${data.newCount} new upload${data.newCount !== 1 ? 's' : ''} fetched`
          : '✓ Up to date — no new uploads'
      )
      // Surface newest uploads on top (triggers a reload via the sort effect)
      setPage(1)
      setSort('created')
      setOrder('desc')
    } catch (e) {
      console.error('Fetch new uploads error:', e)
      setFetchMsg('⚠ Fetch failed — try again')
    } finally {
      setFetchingNew(false)
      setTimeout(() => setFetchMsg(''), 6000)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Products</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {total.toLocaleString()} product{total !== 1 ? 's' : ''} · Click a row to expand variants · Edit inline to create draft changes
          </p>
        </div>

        <div className="flex items-center gap-3">
          {fetchMsg && (
            <span className="text-xs text-slate-500 whitespace-nowrap">{fetchMsg}</span>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" onClick={handleFetchNew} disabled={fetchingNew}>
              <DownloadCloud size={15} className={fetchingNew ? 'animate-spin' : ''} />
              {fetchingNew ? 'Fetching…' : 'Fetch new uploads'}
            </button>
            <button className="btn-secondary" onClick={handleExport}>
              <Download size={15} /> Export CSV
            </button>
            <button className="btn-secondary" onClick={() => load()}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Filter panel */}
      <FilterPanel
        filters={filters}
        options={filterOpts}
        onChange={f => { setFilters(f); setPage(1) }}
      />

      {/* POS origin quick-filter chips */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">POS:</span>
        {[
          { value: '',          label: 'All',         cls: 'bg-slate-100 text-slate-600 hover:bg-slate-200' },
          { value: 'confirmed', label: '🔗 Linked',   cls: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
          { value: 'pending',   label: '⏳ Pending',  cls: 'bg-amber-50  text-amber-700  hover:bg-amber-100'  },
          { value: 'none',      label: '— No POS',    cls: 'bg-slate-50  text-slate-500  hover:bg-slate-100'  },
        ].map(chip => (
          <button
            key={chip.value}
            onClick={() => { setFilters(f => ({ ...f, posLink: chip.value })); setPage(1) }}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${chip.cls} ${
              filters.posLink === chip.value
                ? 'ring-2 ring-offset-1 ring-indigo-400 border-transparent'
                : 'border-transparent'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading && !products.length ? (
        <div className="card flex items-center justify-center py-20 text-slate-400 gap-3">
          <RefreshCw size={20} className="animate-spin" />
          Loading products…
        </div>
      ) : (
        <ProductTable
          products={products}
          sort={sort}
          order={order}
          onSort={handleSort}
          onRefresh={() => load()}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Page {page} of {totalPages} ({total} products)</span>
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            {/* Page number chips */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={p === page ? 'btn-primary' : 'btn-secondary'}
                >
                  {p}
                </button>
              )
            })}
            <button
              className="btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
