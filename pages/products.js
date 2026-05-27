/**
 * Products page — full product table with filters, sorting, pagination,
 * inline editing that creates draft changes, and CSV export.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import FilterPanel  from '../components/FilterPanel'
import ProductTable from '../components/ProductTable'

const DEFAULT_FILTERS = {
  search: '', status: '', vendor: '', productType: '',
  collectionId: '', stockLevel: '', hasSales: '', hasImages: '',
  hasSeo: '', hasVendor: '',
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

        <div className="flex gap-2">
          <button className="btn-secondary" onClick={handleExport}>
            <Download size={15} /> Export CSV
          </button>
          <button className="btn-secondary" onClick={() => load()}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter panel */}
      <FilterPanel
        filters={filters}
        options={filterOpts}
        onChange={f => { setFilters(f); setPage(1) }}
      />

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
