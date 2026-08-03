/**
 * Auto-Restock Engine
 *
 * Called after every variant inventory update (during sync or manual push).
 * - Checks if any RestockRule is triggered for this variant
 * - If autoRestock=true: pushes new qty to Shopify + logs notification
 * - If autoRestock=false: creates a low-stock/OOS notification only
 */

import db from './db'
import { setInventoryLevel, fetchLocationForInventoryItem } from './shopify'

/**
 * Create a notification record.
 */
export async function createNotification(data) {
  try {
    return await db.notification.create({ data })
  } catch (e) {
    console.error('[restockEngine] notification create failed:', e.message)
  }
}

/**
 * Run the restock engine for a single variant after its qty changed.
 * @param {object} variant  - { id, inventoryItemId, inventoryQuantity, productId, ... }
 * @param {number} prevQty  - previous quantity (before this sync)
 * @param {object} product  - { title }
 * @param {object} globalSettings - { restock_threshold, restock_target, auto_push_enabled }
 */
export async function checkRestockRule(variant, prevQty, product, globalSettings = {}) {
  const currentQty = variant.inventoryQuantity
  const productTitle = product?.title || 'Unknown'

  // ── OOS notification: variant just hit 0 ──────────────────────────────────────
  if (prevQty > 0 && currentQty <= 0) {
    await createNotification({
      type:        'oos',
      severity:    'critical',
      productId:   variant.productId,
      productName: productTitle,
      variantName: variant.title !== 'Default Title' ? variant.title : null,
      sku:         variant.sku,
      message:     `${productTitle}${variant.title && variant.title !== 'Default Title' ? ` (${variant.title})` : ''} is now OUT OF STOCK`,
      oldValue:    String(prevQty),
      newValue:    '0',
      actionType:  'push_inventory',
      actionData:  JSON.stringify({ variantId: variant.id, productId: variant.productId }),
    })
    return  // Already notified OOS — don't also fall through to the low-stock/OOS check below
  }

  // ── Back in stock notification ────────────────────────────────────────────────
  if (prevQty <= 0 && currentQty > 0) {
    await createNotification({
      type:        'back_in_stock',
      severity:    'info',
      productId:   variant.productId,
      productName: productTitle,
      variantName: variant.title !== 'Default Title' ? variant.title : null,
      sku:         variant.sku,
      message:     `${productTitle} is back in stock (${currentQty} units)`,
      oldValue:    '0',
      newValue:    String(currentQty),
    })
    return  // Back in stock — no restock rule needed
  }

  // ── Check RestockRule ─────────────────────────────────────────────────────────
  const rule = await db.restockRule.findFirst({
    where: {
      variantId: variant.id,
      enabled: true,
    },
  })

  const globalThreshold  = parseInt(globalSettings.restock_threshold || '10', 10)
  const globalTarget     = parseInt(globalSettings.restock_target    || '10', 10)
  const globalAutoPush   = globalSettings.auto_push_enabled === 'true'

  const threshold  = rule?.threshold  ?? globalThreshold
  const restockTo  = rule?.restockTo  ?? globalTarget
  const autoRestock = rule ? rule.autoRestock : globalAutoPush

  // Not below threshold — nothing to do
  if (currentQty >= threshold) return
  // Stock didn't change or already triggered for this level
  if (prevQty !== null && prevQty < threshold && currentQty < threshold && prevQty <= currentQty) return

  // ── Low stock notification (always) ──────────────────────────────────────────
  const variantLabel = variant.title && variant.title !== 'Default Title' ? ` (${variant.title})` : ''
  const notifBase = {
    productId:   variant.productId,
    productName: productTitle,
    variantName: variant.title !== 'Default Title' ? variant.title : null,
    sku:         variant.sku,
    oldValue:    String(prevQty ?? currentQty),
    newValue:    String(currentQty),
    actionType:  'push_inventory',
    actionData:  JSON.stringify({ variantId: variant.id, productId: variant.productId }),
  }

  // ── AUTO RESTOCK: push to Shopify immediately ─────────────────────────────────
  if (autoRestock && currentQty < threshold) {
    try {
      // Get location
      let locationId = null
      const level = await db.inventoryLevel.findFirst({ where: { variantId: variant.id }, select: { locationId: true } })
      locationId = level?.locationId || await fetchLocationForInventoryItem(variant.inventoryItemId)

      // Push to Shopify
      await setInventoryLevel({
        inventoryItemId: variant.inventoryItemId,
        locationId,
        available: restockTo,
      })

      // Update DB
      await db.variant.update({
        where: { id: variant.id },
        data:  { inventoryQuantity: restockTo, firstOutOfStockAt: null },
      })

      // Update rule stats
      if (rule) {
        await db.restockRule.update({
          where: { id: rule.id },
          data: {
            lastTriggeredAt: new Date(),
            lastPushStatus:  'success',
            lastPushError:   null,
            triggerCount:    { increment: 1 },
          },
        })
      }

      // Notification: auto-restock success
      await createNotification({
        type:     'auto_restock',
        severity: 'info',
        message:  `Auto-restocked ${productTitle}${variantLabel}: ${currentQty} → ${restockTo} units (pushed to Shopify)`,
        oldValue: String(currentQty),
        newValue: String(restockTo),
        ...notifBase,
      })

      // Notification: push success
      await createNotification({
        type:     'push_success',
        severity: 'info',
        message:  `Shopify push successful: ${productTitle}${variantLabel} set to ${restockTo} units`,
        oldValue: String(currentQty),
        newValue: String(restockTo),
        ...notifBase,
      })

      console.log(`[restockEngine] ✅ auto-restocked ${productTitle}${variantLabel}: ${currentQty} → ${restockTo}`)

    } catch (e) {
      console.error(`[restockEngine] ❌ auto-restock push failed for ${productTitle}:`, e.message)

      if (rule) {
        await db.restockRule.update({
          where: { id: rule.id },
          data:  { lastTriggeredAt: new Date(), lastPushStatus: 'failed', lastPushError: e.message },
        })
      }

      await createNotification({
        type:     'push_failed',
        severity: 'critical',
        message:  `Auto-restock FAILED for ${productTitle}${variantLabel}: ${e.message}`,
        oldValue: String(currentQty),
        newValue: String(restockTo),
        ...notifBase,
      })
    }

  } else {
    // No auto-push — alert only
    await createNotification({
      type:     currentQty <= 0 ? 'oos' : 'low_stock',
      severity: currentQty <= 0 ? 'critical' : 'warning',
      message:  currentQty <= 0
        ? `${productTitle}${variantLabel} is OUT OF STOCK`
        : `Low stock: ${productTitle}${variantLabel} has only ${currentQty} unit${currentQty !== 1 ? 's' : ''} left (threshold: ${threshold})`,
      ...notifBase,
    })
  }
}

/**
 * Run checks for ALL variants — called at end of sync.
 * Compares current qty to a snapshot taken before sync.
 */
export async function runRestockChecksForAll(prevQtyMap, globalSettings) {
  const allVariants = await db.variant.findMany({
    include: { product: { select: { title: true } } },
  })

  let triggered = 0
  for (const v of allVariants) {
    const prevQty = prevQtyMap[v.id] ?? v.inventoryQuantity
    try {
      await checkRestockRule(v, prevQty, v.product, globalSettings)
    } catch (e) {
      console.error(`[restockEngine] error for variant ${v.id}:`, e.message)
    }
    triggered++
  }
  return triggered
}
