/**
 * GET /api/pos/duplicates
 * Finds Shopify products in the local DB that share the same title.
 * These are typically created by running SPF Wizard import twice, or
 * importing a product that was already pushed before.
 *
 * Returns:
 *   { ok, totalGroups, totalProducts, groups: [{ title, products: [...] }] }
 *
 * Auth: manage_settings
 */

import db           from '../../../lib/db'
import { withAuth } from '../../../lib/auth'

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Load all products with full variant data for scoring
    const all = await db.product.findMany({
      select: {
        id:            true,
        title:         true,
        handle:        true,
        status:        true,
        firstImageSrc: true,
        createdAtShopify: true,
        variants: {
          select: {
            id: true, sku: true, barcode: true,
            inventoryQuantity: true, price: true,
            totalSold: true, sold30Days: true,
          },
        },
      },
      orderBy: { title: 'asc' },
    })

    // Collect all variant IDs to batch-fetch POS match status
    const allVariantIds = all.flatMap(p => p.variants.map(v => v.id))
    const posMatches = allVariantIds.length > 0
      ? await db.posMatch.findMany({
          where: { shopifyVariantId: { in: allVariantIds } },
          select: { shopifyVariantId: true, status: true },
        })
      : []
    const variantPosStatus = new Map(posMatches.map(m => [m.shopifyVariantId, m.status]))

    // Group by normalised title (lowercase + collapse whitespace)
    const groups = new Map()
    for (const p of all) {
      const key = (p.title || '').toLowerCase().replace(/\s+/g, ' ').trim()
      if (!key) continue
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(p)
    }

    const storeSlug = (process.env.SHOPIFY_STORE_URL || '')
      .replace('.myshopify.com', '').replace('https://', '').replace(/\/$/, '')

    // Only return groups with 2+ products (the actual duplicates)
    const duplicates = []
    for (const [, products] of groups) {
      if (products.length < 2) continue

      // Score each product — highest score = recommend to keep
      const scored = products.map(p => {
        const totalQty  = p.variants.reduce((s, v) => s + (v.inventoryQuantity || 0), 0)
        const totalSold = p.variants.reduce((s, v) => s + (v.totalSold || 0), 0)
        const sold30    = p.variants.reduce((s, v) => s + (v.sold30Days || 0), 0)
        const posStatus = p.variants.reduce((best, v) => {
          const s = variantPosStatus.get(v.id)
          if (s === 'confirmed') return 'confirmed'
          if (s === 'pending' && best !== 'confirmed') return 'pending'
          return best
        }, null)

        // Scoring: higher = keep
        let score = 0
        if (posStatus === 'confirmed') score += 1000  // POS confirmed = strongest signal
        if (posStatus === 'pending')   score += 200
        if (totalSold > 0)             score += 500   // has sales history
        if (p.status === 'active')     score += 300
        if (totalQty > 0)              score += 100
        score += Math.min(sold30, 50) * 2             // recent sales bonus (capped)
        score += Math.min(totalQty, 20) * 1           // stock bonus (capped)
        // Newer product gets tiny boost as tiebreaker
        score += (new Date(p.createdAtShopify).getTime() / 1e12)

        return {
          id:            p.id,
          title:         p.title,
          handle:        p.handle,
          status:        p.status,
          firstImageSrc: p.firstImageSrc,
          createdAt:     p.createdAtShopify,
          totalQty,
          totalSold,
          sold30Days:    sold30,
          posStatus,                               // 'confirmed' | 'pending' | null
          firstVariant:  p.variants[0] || null,
          shopifyUrl:    `https://admin.shopify.com/store/${storeSlug}/products/${p.id}`,
          score,
          keepReason: posStatus === 'confirmed' ? 'POS linked'
            : posStatus === 'pending'            ? 'POS pending'
            : totalSold > 0                      ? 'Has sales'
            : p.status === 'active'              ? 'Is active'
            : totalQty > 0                       ? 'Has stock'
            : 'Most recent',
        }
      })

      // Sort by score descending — index 0 = keep, rest = delete
      scored.sort((a, b) => b.score - a.score)

      duplicates.push({
        title:    scored[0].title,
        count:    scored.length,
        products: scored,
      })
    }

    // Sort groups: most duplicates first
    duplicates.sort((a, b) => b.count - a.count)

    const totalProducts = duplicates.reduce((s, g) => s + g.count, 0)

    res.setHeader('Cache-Control', 'no-store')
    return res.json({
      ok:            true,
      totalGroups:   duplicates.length,
      totalProducts,
      wasted:        totalProducts - duplicates.length,
      groups:        duplicates,
    })
  } catch (err) {
    console.error('[DUPLICATES]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'manage_settings')
