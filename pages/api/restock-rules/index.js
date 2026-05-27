/**
 * GET    /api/restock-rules           — list all rules
 * POST   /api/restock-rules           — create or update a rule
 * PATCH  /api/restock-rules           — toggle enabled / autoRestock
 * DELETE /api/restock-rules?id=...    — delete a rule
 */
import { withAuth } from '../../../lib/auth'
import db from '../../../lib/db'
import logger from '../../../lib/logger'

async function handler(req, res) {
  const ctx = logger.fromReq(req)

  // ── LIST ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const rules = await db.restockRule.findMany({
      orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
    })
    return res.status(200).json({ rules })
  }

  // ── CREATE / UPDATE ───────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const {
      productId, variantId, productTitle, variantTitle, sku,
      threshold, restockTo, autoRestock, enabled,
    } = req.body

    if (!productId) return res.status(400).json({ error: 'productId required' })

    // Upsert by variantId (or productId if no variant)
    const where  = variantId ? { variantId } : undefined
    const data   = {
      productId,
      variantId:    variantId   || null,
      productTitle: productTitle || 'Unknown',
      variantTitle: variantTitle || null,
      sku:          sku         || null,
      threshold:    parseInt(threshold, 10) || 10,
      restockTo:    parseInt(restockTo, 10) || 10,
      autoRestock:  Boolean(autoRestock),
      enabled:      enabled !== false,
    }

    let rule
    if (variantId) {
      rule = await db.restockRule.upsert({
        where:  { variantId },
        update: data,
        create: data,
      })
    } else {
      // Product-level rule (no variant) — find existing or create
      const existing = await db.restockRule.findFirst({
        where: { productId, variantId: null },
      })
      if (existing) {
        rule = await db.restockRule.update({ where: { id: existing.id }, data })
      } else {
        rule = await db.restockRule.create({ data })
      }
    }

    logger.info('api/restock-rules', 'rule_saved', rule ? 'Restock rule upserted' : 'Restock rule created', {
      ...ctx,
      ruleId:       rule.id,
      variantId:    rule.variantId || undefined,
      productTitle: rule.productTitle,
      threshold:    rule.threshold,
      restockTo:    rule.restockTo,
      autoRestock:  rule.autoRestock,
    })
    return res.status(200).json({ ok: true, rule })
  }

  // ── TOGGLE ─────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id, enabled, autoRestock, threshold, restockTo } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })

    const updateData = {}
    if (enabled      !== undefined) updateData.enabled      = Boolean(enabled)
    if (autoRestock  !== undefined) updateData.autoRestock  = Boolean(autoRestock)
    if (threshold    !== undefined) updateData.threshold    = parseInt(threshold, 10)
    if (restockTo    !== undefined) updateData.restockTo    = parseInt(restockTo, 10)

    const rule = await db.restockRule.update({ where: { id }, data: updateData })
    logger.info('api/restock-rules', 'rule_toggled', 'Restock rule settings patched', {
      ...ctx,
      ruleId: id,
      changes: updateData,
    })
    return res.status(200).json({ ok: true, rule })
  }

  // ── DELETE ────────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id required' })
    await db.restockRule.delete({ where: { id } })
    logger.info('api/restock-rules', 'rule_deleted', 'Restock rule deleted', { ...ctx, ruleId: id })
    return res.status(200).json({ ok: true })
  }

  res.status(405).end()
}

export default withAuth(handler, 'view_all')
