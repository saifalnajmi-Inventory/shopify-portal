/**
 * POST /api/quickpush
 *
 * One-shot: creates an approved draft change and pushes it immediately.
 * Used by the dashboard quick-edit cards — no separate Review step needed.
 *
 * Body: { productId, variantId, entityName, variantName, sku,
 *         fieldName, beforeValue, afterValue, changeType }
 */

import db from '../../lib/db'
import { withAuth } from '../../lib/auth'
import logger from '../../lib/logger'
import {
  updateProduct, updateVariant,
  setInventoryLevel, fetchLocationForInventoryItem,
} from '../../lib/shopify'

const PRODUCT_FIELDS = new Set([
  'title','status','vendor','product_type','tags',
  'body_html','metafields_global_title_tag','metafields_global_description_tag',
])
const VARIANT_FIELDS = new Set(['price','compare_at_price','sku','barcode'])

const fieldToDb = f => ({
  title:'title', status:'status', vendor:'vendor',
  product_type:'productType', tags:'tags', body_html:'bodyHtml',
  metafields_global_title_tag:'seoTitle',
  metafields_global_description_tag:'seoDescription',
  price:'price', compare_at_price:'compareAtPrice', sku:'sku', barcode:'barcode',
}[f] || null)

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const ctx = logger.fromReq(req)
  const {
    productId, variantId, entityName, variantName, sku,
    fieldName, beforeValue, afterValue, changeType,
  } = req.body

  // 1. Save as approved draft change (skip review)
  const change = await db.draftChange.create({
    data: {
      productId:   productId  || null,
      variantId:   variantId  || null,
      entityType:  variantId  ? 'variant' : 'product',
      entityName:  entityName || 'Unknown',
      variantName: variantName || null,
      sku:         sku        || null,
      fieldName,
      beforeValue: String(beforeValue ?? ''),
      afterValue:  String(afterValue  ?? ''),
      changeType,
      status:     'approved',
      approvedAt: new Date(),
      createdBy:  'dashboard-quick-push',
    },
  })

  // 2. Push immediately
  let status         = 'success'
  let errorMessage   = null
  let shopifyResponse = null

  try {
    if (fieldName === 'inventory_quantity') {
      const variant = await db.variant.findUnique({
        where:   { id: variantId },
        include: { inventoryLevels: { take: 1 } },
      })
      if (!variant?.inventoryItemId) throw new Error('Variant not found — sync first.')

      let locationId = variant.inventoryLevels?.[0]?.locationId
      if (!locationId) locationId = await fetchLocationForInventoryItem(variant.inventoryItemId)

      const newQty = parseInt(afterValue, 10)
      if (isNaN(newQty) || newQty < 0) throw new Error(`Invalid quantity: "${afterValue}"`)

      const resp = await setInventoryLevel({ inventoryItemId: variant.inventoryItemId, locationId, available: newQty })
      shopifyResponse = JSON.stringify(resp)

      await db.variant.update({
        where: { id: variantId },
        data: { inventoryQuantity: newQty, firstOutOfStockAt: newQty === 0 ? new Date() : null },
      })
      await db.inventoryLevel.upsert({
        where:  { variantId_locationId: { variantId, locationId } },
        update: { available: newQty },
        create: { variantId, locationId, available: newQty },
      })

    } else if (PRODUCT_FIELDS.has(fieldName)) {
      const resp = await updateProduct(productId, { [fieldName]: afterValue })
      shopifyResponse = JSON.stringify(resp)
      const col = fieldToDb(fieldName)
      if (col) await db.product.update({ where: { id: productId }, data: { [col]: afterValue } })

    } else if (VARIANT_FIELDS.has(fieldName)) {
      const val  = ['price','compare_at_price'].includes(fieldName) ? parseFloat(afterValue) : afterValue
      const resp = await updateVariant(variantId, { [fieldName]: val })
      shopifyResponse = JSON.stringify(resp)
      const col = fieldToDb(fieldName)
      if (col) await db.variant.update({ where: { id: variantId }, data: { [col]: val } })

    } else {
      throw new Error(`Unknown field: ${fieldName}`)
    }
  } catch (err) {
    status       = 'failed'
    errorMessage = err.message
    logger.error('api/quickpush', 'push_failed', 'Quick push to Shopify failed', {
      ...ctx,
      fieldName,
      variantId,
      productId,
      error: err,
    })
  }

  // 3. Update draft change + write log
  await db.draftChange.update({
    where: { id: change.id },
    data: { status: status === 'success' ? 'pushed' : 'failed', pushedAt: new Date(), errorMessage: errorMessage || null },
  })
  await db.changeLog.create({
    data: {
      draftChangeId: change.id,
      entityType:    change.entityType,
      entityId:      productId || variantId || '',
      entityName:    entityName || '',
      fieldName, beforeValue: String(beforeValue ?? ''), afterValue: String(afterValue ?? ''),
      changeType, status, errorMessage: errorMessage || null,
      pushedBy: 'dashboard-quick-push',
      shopifyResponse: shopifyResponse?.substring(0, 2000) || null,
    },
  })

  if (status === 'success') {
    logger.info('api/quickpush', 'push_success', 'Quick push completed', {
      ...ctx,
      fieldName,
      variantId: variantId || undefined,
      productId: productId || undefined,
      beforeValue: String(beforeValue ?? ''),
      afterValue:  String(afterValue  ?? ''),
    })
  }

  return res.status(status === 'success' ? 200 : 400).json({ ok: status === 'success', error: errorMessage })
}

export default withAuth(handler, 'push_inventory')
