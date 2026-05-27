import { differenceInDays } from 'date-fns'

/**
 * Restock Priority Score  (0–100)
 *
 * High score = needs restocking URGENTLY
 *
 * Factors:
 *  - Sales velocity (sold30Days)         → max 35 pts
 *  - Days out of stock                   → max 30 pts
 *  - Current stock critically low        → max 20 pts
 *  - Accelerating demand (sold7d trend)  → max 15 pts
 */
export function calcRestockScore(variant) {
  const { sold30Days = 0, sold7Days = 0, inventoryQuantity = 0, firstOutOfStockAt } = variant

  // 1. Sales velocity — normalised to 10 units/month = max score
  const velocityScore = Math.min(sold30Days / 10, 1) * 35

  // 2. Days out of stock (only applies if currently 0)
  let oosScore = 0
  if (inventoryQuantity === 0 && firstOutOfStockAt) {
    const daysOos = differenceInDays(new Date(), new Date(firstOutOfStockAt))
    oosScore = Math.min(daysOos / 14, 1) * 30
  }

  // 3. Critical stock level
  let criticalScore = 0
  if      (inventoryQuantity === 0)  criticalScore = 20
  else if (inventoryQuantity < 3)    criticalScore = 15
  else if (inventoryQuantity < 5)    criticalScore = 10
  else if (inventoryQuantity < 10)   criticalScore =  5

  // 4. Accelerating demand — are last-7-day sales ahead of 30-day daily average?
  const daily30 = sold30Days / 30
  const daily7  = sold7Days  / 7
  const trendScore = daily7 > daily30 * 1.5 ? 15 : daily7 > daily30 ? 8 : 0

  return Math.round(Math.min(velocityScore + oosScore + criticalScore + trendScore, 100))
}

/**
 * Marketing Push Score  (0–100)
 *
 * High score = ready to sell but needs promotion
 *
 * Factors:
 *  - Has stock available                 → 30 pts
 *  - Low / no sales                      → max 25 pts
 *  - SEO completeness                    → max 20 pts
 *  - Has product images                  → 10 pts
 *  - Recently added                      → max 10 pts
 *  - Has vendor set                      →  5 pts
 */
export function calcMarketingScore(product, variant) {
  const { imageCount = 0, seoTitle, seoDescription, vendor, createdAtShopify } = product
  const { inventoryQuantity = 0, sold30Days = 0 } = variant

  // 1. Stock available (can sell)
  const stockScore = inventoryQuantity > 0 ? 30 : 0

  // 2. Low sales (opportunity to push)
  let salesScore = 0
  if      (sold30Days === 0) salesScore = 25
  else if (sold30Days < 3)  salesScore = 15
  else if (sold30Days < 8)  salesScore =  5

  // 3. SEO completeness
  const seoScore = (seoTitle ? 10 : 0) + (seoDescription ? 10 : 0)

  // 4. Images
  const imageScore = imageCount > 0 ? 10 : 0

  // 5. Recency
  let recencyScore = 0
  if (createdAtShopify) {
    const days = differenceInDays(new Date(), new Date(createdAtShopify))
    if      (days < 30)  recencyScore = 10
    else if (days < 90)  recencyScore =  5
  }

  // 6. Vendor set
  const vendorScore = vendor ? 5 : 0

  return Math.round(Math.min(stockScore + salesScore + seoScore + imageScore + recencyScore + vendorScore, 100))
}

/** Dead stock: in stock but zero sales in the window */
export function isDeadStock(variant, salesWindowDays = 90) {
  return variant.inventoryQuantity > 0 && variant.sold30Days === 0
}

/** Fast-moving risk: high recent sales + low inventory */
export function isFastMovingRisk(variant) {
  return variant.sold7Days >= 3 && variant.inventoryQuantity <= 5
}

/** Restock score label */
export function restockLabel(score) {
  if (score >= 80) return { label: 'CRITICAL', color: 'text-red-600 bg-red-50' }
  if (score >= 60) return { label: 'HIGH',     color: 'text-orange-600 bg-orange-50' }
  if (score >= 40) return { label: 'MEDIUM',   color: 'text-yellow-600 bg-yellow-50' }
  return                  { label: 'LOW',       color: 'text-green-600 bg-green-50' }
}

/** Marketing score label */
export function marketingLabel(score) {
  if (score >= 75) return { label: 'PUSH NOW',  color: 'text-purple-600 bg-purple-50' }
  if (score >= 50) return { label: 'PROMOTE',   color: 'text-blue-600 bg-blue-50' }
  if (score >= 25) return { label: 'MONITOR',   color: 'text-sky-600 bg-sky-50' }
  return                  { label: 'OK',         color: 'text-slate-500 bg-slate-50' }
}
