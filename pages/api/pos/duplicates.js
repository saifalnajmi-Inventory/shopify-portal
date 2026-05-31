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
    // Load all products — only fields needed for the UI
    const all = await db.product.findMany({
      select: {
        id:            true,
        title:         true,
        handle:        true,
        status:        true,
        firstImageSrc: true,
        createdAtShopify: true,
        variants: {
          select: { id: true, sku: true, barcode: true, inventoryQuantity: true, price: true },
          take: 1,
        },
      },
      orderBy: { title: 'asc' },
    })

    // Group by normalised title (lowercase + collapse whitespace)
    const groups = new Map()
    for (const p of all) {
      const key = (p.title || '').toLowerCase().replace(/\s+/g, ' ').trim()
      if (!key) continue
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(p)
    }

    // Only return groups with 2+ products (the actual duplicates)
    const duplicates = []
    for (const [title, products] of groups) {
      if (products.length > 1) {
        // Sort: keep newest first (most recent Shopify push = last one created)
        products.sort((a, b) => new Date(b.createdAtShopify) - new Date(a.createdAtShopify))
        duplicates.push({
          title:    products[0].title,
          count:    products.length,
          products: products.map(p => ({
            id:            p.id,
            title:         p.title,
            handle:        p.handle,
            status:        p.status,
            firstImageSrc: p.firstImageSrc,
            createdAt:     p.createdAtShopify,
            variant:       p.variants?.[0] || null,
            shopifyUrl:    `https://admin.shopify.com/store/${process.env.SHOPIFY_STORE_URL?.replace('.myshopify.com','').replace('https://','')}/products/${p.id}`,
          })),
        })
      }
    }

    // Sort groups: most duplicates first
    duplicates.sort((a, b) => b.count - a.count)

    const totalProducts = duplicates.reduce((s, g) => s + g.count, 0)

    res.setHeader('Cache-Control', 'no-store')
    return res.json({
      ok:            true,
      totalGroups:   duplicates.length,
      totalProducts,
      wasted:        totalProducts - duplicates.length, // extra copies to delete
      groups:        duplicates,
    })
  } catch (err) {
    console.error('[DUPLICATES]', err)
    return res.status(500).json({ error: err.message })
  }
}

export default withAuth(handler, 'manage_settings')
