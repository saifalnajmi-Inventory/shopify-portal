import { withAuth } from '../../lib/auth'
/**
 * GET /api/export
 * Streams a CSV of the current product/variant inventory report.
 * Respects the same filter params as /api/products.
 * Optionally: ?format=changelog to export the change log instead.
 */

import db from '../../lib/db'
import { differenceInDays } from 'date-fns'

function toCSV(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape  = (v) => {
    if (v == null) return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n')
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const format = req.query.format || 'inventory'

  if (format === 'changelog') {
    const logs = await db.changeLog.findMany({
      orderBy: { pushedAt: 'desc' },
    })

    const rows = logs.map(l => ({
      Date:         l.pushedAt?.toISOString(),
      Entity:       l.entityName,
      Field:        l.fieldName,
      Before:       l.beforeValue,
      After:        l.afterValue,
      Type:         l.changeType,
      Status:       l.status,
      Error:        l.errorMessage || '',
      PushedBy:     l.pushedBy,
    }))

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="change_log.csv"')
    return res.status(200).send(toCSV(rows))
  }

  // Inventory export
  const products = await db.product.findMany({
    include: {
      variants: true,
      collections: { include: { collection: { select: { title: true } } } },
    },
    orderBy: { title: 'asc' },
  })

  const rows = []
  const now  = new Date()

  for (const p of products) {
    const collections = p.collections.map(c => c.collection.title).join(' | ')

    for (const v of p.variants) {
      const daysOos = v.firstOutOfStockAt
        ? differenceInDays(now, new Date(v.firstOutOfStockAt))
        : null

      rows.push({
        'Product ID':        p.id,
        'Product Title':     p.title,
        'Status':            p.status,
        'Vendor':            p.vendor || '',
        'Product Type':      p.productType || '',
        'Collections':       collections,
        'Tags':              p.tags || '',
        'SEO Title':         p.seoTitle ? '✓' : '✗',
        'SEO Description':   p.seoDescription ? '✓' : '✗',
        'Images':            p.imageCount,
        'Variant ID':        v.id,
        'Variant':           v.title,
        'SKU':               v.sku || '',
        'Barcode':           v.barcode || '',
        'Price':             v.price,
        'Compare At Price':  v.compareAtPrice || '',
        'Stock Qty':         v.inventoryQuantity,
        'Total Sold':        v.totalSold,
        'Sold 30 Days':      v.sold30Days,
        'Sold 7 Days':       v.sold7Days,
        'Last Sold At':      v.lastSoldAt ? new Date(v.lastSoldAt).toISOString() : '',
        'Out of Stock Since': v.firstOutOfStockAt ? new Date(v.firstOutOfStockAt).toISOString() : '',
        'Days OOS':          daysOos ?? '',
        'Restock Score':     v.restockScore ?? '',
        'Marketing Score':   v.marketingScore ?? '',
        'Created At':        p.createdAtShopify ? new Date(p.createdAtShopify).toISOString() : '',
      })
    }
  }

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="inventory_report.csv"')
  res.status(200).send(toCSV(rows))
}

export default withAuth(handler, 'export_reports')
