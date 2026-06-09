/**
 * GET /api/export-card?card=oos30&threshold=5&title=Out%20of%20Stock%2030%2B%20Days
 *
 * Exports a dashboard drill-down list (the same data shown in the modal) as a
 * real .xlsx file. Uses the SHARED buildCardQuery() so the export filter is
 * always identical to what the modal renders — no drift.
 *
 * Auth: view_all (anyone who can open the modal can export it).
 */

import db from '../../lib/db'
import { withAuth } from '../../lib/auth'
import { differenceInDays } from 'date-fns'
import * as XLSX from 'xlsx'
import { buildCardQuery } from '../../lib/cardQueries'

const MAX_EXPORT = 5000   // hard cap so a huge card can't blow up memory

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { card, threshold = '5', title = '' } = req.query
  const thresh = parseInt(threshold, 10) || 5

  const def = buildCardQuery(card, thresh)
  if (!def) return res.status(400).json({ error: `Unknown card: ${card}` })

  try {
    const variants = await db.variant.findMany({
      where:   def.where,
      orderBy: def.orderBy,
      take:    MAX_EXPORT,
      include: {
        product: { select: { id: true, title: true, status: true, vendor: true } },
      },
    })

    const now = new Date()
    const rows = variants.map((v, i) => ({
      '#':                  i + 1,
      'Product Title':      v.product?.title || 'Unknown',
      'Variant':            v.title && v.title !== 'Default Title' ? v.title : '',
      'SKU':                v.sku || '',
      'Status':             v.product?.status || '',
      'Stock Qty':          v.inventoryQuantity,
      'Total Sold':         v.totalSold,
      'Sold 30 Days':       v.sold30Days,
      'Sold 7 Days':        v.sold7Days,
      'Days Out of Stock':  v.firstOutOfStockAt ? differenceInDays(now, new Date(v.firstOutOfStockAt)) : '',
      'Out of Stock Since': v.firstOutOfStockAt ? new Date(v.firstOutOfStockAt).toISOString().slice(0, 10) : '',
      'Price (KD)':         v.price,
      'Vendor':             v.product?.vendor || '',
      'Product ID':         v.product?.id || '',
      'Variant ID':         v.id,
    }))

    // Build the workbook (header row even when empty so the file is valid)
    const ws = XLSX.utils.json_to_sheet(
      rows.length ? rows : [{ 'Product Title': 'No items found for this list' }]
    )
    ws['!cols'] = [
      { wch: 4 }, { wch: 46 }, { wch: 18 }, { wch: 18 }, { wch: 9 },
      { wch: 9 }, { wch: 10 }, { wch: 12 }, { wch: 11 }, { wch: 16 },
      { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 16 },
    ]

    const labelRaw  = (title || card || 'export').toString()
    const sheetName = (labelRaw.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31)) || 'Export'

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const slug = labelRaw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'export'
    const date = now.toISOString().slice(0, 10)

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${slug}_${date}.xlsx"`)
    res.setHeader('Content-Length', buf.length)
    return res.status(200).send(buf)
  } catch (err) {
    console.error('[export-card]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'view_all')
