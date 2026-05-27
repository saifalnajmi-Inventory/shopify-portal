/**
 * GET    /api/changes  — list draft changes
 * POST   /api/changes  — create a draft change
 * PATCH  /api/changes  — approve / discard by ids
 * DELETE /api/changes  — discard by ids
 */

import { withAuth } from '../../../lib/auth'
import db from '../../../lib/db'

async function handler(req, res) {
  if (req.method === 'GET') {
    const { status = '', productId = '' } = req.query
    const where = {}
    if (status) where.status = status
    if (productId) where.productId = productId

    const changes = await db.draftChange.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, title: true, firstImageSrc: true } },
        variant: { select: { id: true, title: true, sku: true } },
      },
    })

    return res.status(200).json({ changes })
  }

  if (req.method === 'POST') {
    const body = req.body
    const {
      productId, variantId, entityType, entityName, variantName,
      sku, fieldName, beforeValue, afterValue, changeType, notes, createdBy,
    } = body

    // Guard: don't duplicate pending change for same entity+field
    const existing = await db.draftChange.findFirst({
      where: {
        productId: productId || undefined,
        variantId: variantId || undefined,
        fieldName,
        status: 'pending',
      },
    })

    if (existing) {
      // Update the pending change instead
      const updated = await db.draftChange.update({
        where: { id: existing.id },
        data: { afterValue, notes, createdBy },
      })
      return res.status(200).json({ change: updated, updated: true })
    }

    const change = await db.draftChange.create({
      data: {
        productId:   productId   || null,
        variantId:   variantId   || null,
        entityType:  entityType  || 'product',
        entityName,
        variantName: variantName || null,
        sku:         sku         || null,
        fieldName,
        beforeValue: String(beforeValue ?? ''),
        afterValue:  String(afterValue  ?? ''),
        changeType,
        notes:       notes     || null,
        createdBy:   createdBy || 'admin',
      },
    })

    return res.status(201).json({ change })
  }

  if (req.method === 'PATCH') {
    // Approve or discard a list of change ids
    const { ids, action } = req.body // action: 'approve' | 'discard'
    if (!ids?.length) return res.status(400).json({ error: 'ids required' })
    if (!['approve', 'discard'].includes(action)) return res.status(400).json({ error: 'invalid action' })

    const status     = action === 'approve' ? 'approved' : 'discarded'
    const approvedAt = action === 'approve' ? new Date() : undefined

    await db.draftChange.updateMany({
      where: { id: { in: ids } },
      data:  { status, approvedAt: approvedAt || null },
    })

    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const { ids } = req.body
    if (!ids?.length) return res.status(400).json({ error: 'ids required' })

    await db.draftChange.updateMany({
      where: { id: { in: ids } },
      data:  { status: 'discarded' },
    })

    return res.status(200).json({ ok: true })
  }

  res.status(405).end()
}

export default withAuth(handler, 'view_all')
