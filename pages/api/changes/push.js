/**
 * POST /api/changes/push
 *
 * Pushes approved DraftChanges to Shopify one-by-one.
 * - Never touches pending changes — only approved ones.
 * - If one item fails, continues with the rest.
 * - Writes a ChangeLog entry for every attempt (success or fail).
 * - For inventory updates: fetches the location automatically using
 *   read_inventory scope (no read_locations needed).
 *
 * Body: { ids?: string[] }   omit ids to push ALL approved changes
 */

import db from '../../../lib/db'
import { withAuth } from '../../../lib/auth'
import {
  updateProduct,
  updateVariant,
  setInventoryLevel,
  fetchLocationForInventoryItem,
} from '../../../lib/shopify'

// Fields that live on the Shopify product resource
const PRODUCT_FIELDS = new Set([
  'title', 'status', 'vendor', 'product_type', 'tags',
  'body_html', 'metafields_global_title_tag', 'metafields_global_description_tag',
])

// Fields that live on the Shopify variant resource
const VARIANT_FIELDS = new Set([
  'price', 'compare_at_price', 'sku', 'barcode',
])

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { ids } = req.body || {}

  const where = {
    status: { in: ['pending', 'approved'] },
    ...(ids?.length ? { id: { in: ids } } : {}),
  }

  const changes = await db.draftChange.findMany({
    where,
    include: {
      variant: {
        select: {
          inventoryItemId: true,
          inventoryLevels: { take: 1, select: { locationId: true } },
        },
      },
    },
  })

  if (!changes.length) {
    return res.status(200).json({ pushed: 0, failed: 0, results: [] })
  }

  const results = []

  for (const change of changes) {
    let status         = 'success'
    let errorMessage   = null
    let shopifyResponse = null

    try {
      // ── Inventory quantity ─────────────────────────────────────────────────
      if (change.fieldName === 'inventory_quantity') {
        const inventoryItemId = change.variant?.inventoryItemId
        if (!inventoryItemId) throw new Error('Variant has no inventoryItemId — re-sync from Shopify first.')

        // Try stored location first, then fetch live from Shopify
        let locationId = change.variant?.inventoryLevels?.[0]?.locationId
        if (!locationId) {
          locationId = await fetchLocationForInventoryItem(inventoryItemId)
        }

        const newQty = parseInt(change.afterValue, 10)
        if (isNaN(newQty)) throw new Error(`Invalid quantity: "${change.afterValue}"`)

        const resp = await setInventoryLevel({ inventoryItemId, locationId, available: newQty })
        shopifyResponse = JSON.stringify(resp)

        // Reflect locally
        if (change.variantId) {
          await db.variant.update({
            where: { id: change.variantId },
            data:  {
              inventoryQuantity: newQty,
              firstOutOfStockAt: newQty === 0 ? new Date() : null,
            },
          })
          // Also store the resolved location in inventory levels table
          await db.inventoryLevel.upsert({
            where:  { variantId_locationId: { variantId: change.variantId, locationId } },
            update: { available: newQty },
            create: { variantId: change.variantId, locationId, available: newQty },
          })
        }

      // ── Product field ──────────────────────────────────────────────────────
      } else if (PRODUCT_FIELDS.has(change.fieldName)) {
        if (!change.productId) throw new Error('productId missing on this change.')
        const resp = await updateProduct(change.productId, { [change.fieldName]: change.afterValue })
        shopifyResponse = JSON.stringify(resp)

        const dbField = fieldToDb(change.fieldName)
        if (dbField) {
          await db.product.update({ where: { id: change.productId }, data: { [dbField]: change.afterValue } })
        }

      // ── Variant field ──────────────────────────────────────────────────────
      } else if (VARIANT_FIELDS.has(change.fieldName)) {
        if (!change.variantId) throw new Error('variantId missing on this change.')
        const value = ['price', 'compare_at_price'].includes(change.fieldName)
          ? parseFloat(change.afterValue)
          : change.afterValue
        const resp = await updateVariant(change.variantId, { [change.fieldName]: value })
        shopifyResponse = JSON.stringify(resp)

        const dbField = fieldToDb(change.fieldName)
        if (dbField) {
          await db.variant.update({ where: { id: change.variantId }, data: { [dbField]: value } })
        }

      } else {
        throw new Error(`Unknown field "${change.fieldName}" — cannot push.`)
      }

    } catch (err) {
      status       = 'failed'
      errorMessage = err.message
      console.error(`[push] change ${change.id} (${change.fieldName}) failed:`, err.message)
    }

    // Update draft change record
    await db.draftChange.update({
      where: { id: change.id },
      data: {
        status:       status === 'success' ? 'pushed' : 'failed',
        pushedAt:     new Date(),
        errorMessage: errorMessage || null,
      },
    })

    // Write to change log
    await db.changeLog.create({
      data: {
        draftChangeId:   change.id,
        entityType:      change.entityType,
        entityId:        change.productId || change.variantId || '',
        entityName:      change.entityName,
        fieldName:       change.fieldName,
        beforeValue:     change.beforeValue,
        afterValue:      change.afterValue,
        changeType:      change.changeType,
        status,
        errorMessage:    errorMessage || null,
        pushedBy:        change.createdBy || 'admin',
        shopifyResponse: shopifyResponse ? shopifyResponse.substring(0, 2000) : null,
      },
    })

    results.push({
      id:          change.id,
      entityName:  change.entityName,
      fieldName:   change.fieldName,
      status,
      errorMessage,
    })
  }

  const pushed = results.filter(r => r.status === 'success').length
  const failed = results.filter(r => r.status === 'failed').length

  return res.status(200).json({ pushed, failed, results })
}

export default withAuth(handler, 'push_inventory')

/** Shopify API field name → Prisma DB column name */
function fieldToDb(fieldName) {
  return {
    title:                              'title',
    status:                             'status',
    vendor:                             'vendor',
    product_type:                       'productType',
    tags:                               'tags',
    body_html:                          'bodyHtml',
    metafields_global_title_tag:        'seoTitle',
    metafields_global_description_tag:  'seoDescription',
    price:                              'price',
    compare_at_price:                   'compareAtPrice',
    sku:                                'sku',
    barcode:                            'barcode',
  }[fieldName] || null
}
