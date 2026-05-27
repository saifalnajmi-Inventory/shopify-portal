/**
 * Shopify Admin REST API client
 * All credentials come from server-side env vars — never exposed to the browser.
 */

const API_VERSION = '2024-04'

function getBase() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token  = process.env.SHOPIFY_ACCESS_TOKEN
  if (!domain || !token) {
    throw new Error('SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN not set in .env.local')
  }
  return { domain, token }
}

function baseUrl() {
  const { domain } = getBase()
  return `https://${domain}/admin/api/${API_VERSION}`
}

function headers() {
  const { token } = getBase()
  return {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Parse the "next" URL from Shopify's Link response header */
function parseNextLink(linkHeader) {
  if (!linkHeader) return null
  const parts = linkHeader.split(',')
  for (const part of parts) {
    const [urlPart, relPart] = part.trim().split(';')
    if (relPart && relPart.includes('rel="next"')) {
      return urlPart.trim().slice(1, -1) // strip < >
    }
  }
  return null
}

/** Raw fetch wrapper with basic error handling */
async function shopifyFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: headers(),
    ...options,
  })

  if (res.status === 429) {
    // Rate limited — wait and retry once
    const retryAfter = res.headers.get('Retry-After') || '2'
    await sleep(parseFloat(retryAfter) * 1000 + 200)
    return shopifyFetch(url, options)
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Shopify ${res.status}: ${body}`)
  }

  return res
}

// ─── READ OPERATIONS ───────────────────────────────────────────────────────────

/** Fetch ALL products (paginated, up to Shopify's maximum) */
export async function fetchAllProducts() {
  const products = []
  // Request SEO fields explicitly — Shopify does NOT return them by default
  const fields = [
    'id','title','handle','status','product_type','vendor','tags','body_html',
    'images','variants','options','published_at','created_at','updated_at',
    'metafields_global_title_tag','metafields_global_description_tag',
  ].join(',')
  let url = `${baseUrl()}/products.json?limit=250&fields=${fields}`

  while (url) {
    const res  = await shopifyFetch(url)
    const data = await res.json()
    products.push(...(data.products || []))

    const next = parseNextLink(res.headers.get('Link'))
    url = next
    if (next) await sleep(300)
  }

  return products
}

/** Fetch all orders (paginated) — optionally filter by created_at_min */
export async function fetchAllOrders(createdAtMin) {
  const orders = []
  const since  = createdAtMin
    ? `&created_at_min=${createdAtMin}`
    : '&created_at_min=' + new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()

  let url = `${baseUrl()}/orders.json?status=any&limit=250${since}&fields=id,order_number,email,total_price,financial_status,fulfillment_status,created_at,processed_at,cancelled_at,line_items`

  while (url) {
    const res  = await shopifyFetch(url)
    const data = await res.json()
    orders.push(...(data.orders || []))

    const next = parseNextLink(res.headers.get('Link'))
    url = next
    if (next) await sleep(300)
  }

  return orders
}

/** Fetch active locations */
export async function fetchLocations() {
  const res  = await shopifyFetch(`${baseUrl()}/locations.json`)
  const data = await res.json()
  return data.locations || []
}

/** Fetch inventory levels for a batch of inventory_item_ids (max 100) */
export async function fetchInventoryLevelsBatch(inventoryItemIds, locationIds) {
  if (!inventoryItemIds.length) return []

  const idStr  = inventoryItemIds.join(',')
  const locStr = locationIds.join(',')
  const url    = `${baseUrl()}/inventory_levels.json?inventory_item_ids=${idStr}&location_ids=${locStr}&limit=250`

  const res  = await shopifyFetch(url)
  const data = await res.json()
  return data.inventory_levels || []
}

/** Fetch all inventory levels across all products (in batches of 100) */
export async function fetchAllInventoryLevels(inventoryItemIds, locationIds) {
  const results  = []
  const batchSize = 100

  for (let i = 0; i < inventoryItemIds.length; i += batchSize) {
    const batch = inventoryItemIds.slice(i, i + batchSize)
    const levels = await fetchInventoryLevelsBatch(batch, locationIds)
    results.push(...levels)
    if (i + batchSize < inventoryItemIds.length) await sleep(400)
  }

  return results
}

/** Fetch all custom + smart collections */
export async function fetchAllCollections() {
  const collections = []

  for (const type of ['custom_collections', 'smart_collections']) {
    let url = `${baseUrl()}/${type}.json?limit=250&fields=id,title,handle`
    while (url) {
      const res  = await shopifyFetch(url)
      const data = await res.json()
      const key  = type === 'custom_collections' ? 'custom_collections' : 'smart_collections'
      collections.push(...(data[key] || []))
      const next = parseNextLink(res.headers.get('Link'))
      url = next
      if (next) await sleep(300)
    }
  }

  return collections
}

/** Fetch all collects (product → collection membership) */
export async function fetchAllCollects() {
  const collects = []
  let url = `${baseUrl()}/collects.json?limit=250&fields=product_id,collection_id`

  while (url) {
    const res  = await shopifyFetch(url)
    const data = await res.json()
    collects.push(...(data.collects || []))
    const next = parseNextLink(res.headers.get('Link'))
    url = next
    if (next) await sleep(300)
  }

  return collects
}

/**
 * Fetch the first location_id for a single inventory item.
 * Uses read_inventory scope (NOT read_locations) so it works without extra approval.
 */
export async function fetchLocationForInventoryItem(inventoryItemId) {
  const res  = await shopifyFetch(
    `${baseUrl()}/inventory_levels.json?inventory_item_ids=${inventoryItemId}&limit=1`
  )
  const data = await res.json()
  const level = data.inventory_levels?.[0]
  if (!level) throw new Error(`No inventory level found for item ${inventoryItemId}. Make sure read_inventory scope is enabled.`)
  return String(level.location_id)
}

// ─── WRITE OPERATIONS ──────────────────────────────────────────────────────────

/** Set inventory level for a specific variant at a location */
export async function setInventoryLevel({ inventoryItemId, locationId, available }) {
  const res = await shopifyFetch(`${baseUrl()}/inventory_levels/set.json`, {
    method: 'POST',
    body: JSON.stringify({ inventory_item_id: inventoryItemId, location_id: locationId, available }),
  })
  return res.json()
}

/** Update a product (title, status, vendor, type, tags, SEO, description) */
export async function updateProduct(productId, fields) {
  const res = await shopifyFetch(`${baseUrl()}/products/${productId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ product: { id: productId, ...fields } }),
  })
  return res.json()
}

/** Update a variant (price, compare_at_price, sku, barcode, option values) */
export async function updateVariant(variantId, fields) {
  const res = await shopifyFetch(`${baseUrl()}/variants/${variantId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ variant: { id: variantId, ...fields } }),
  })
  return res.json()
}

/** Map a field name used in DraftChange to the correct Shopify API call */
export async function pushChange(change) {
  const { fieldName, afterValue, productId, variantId } = change

  const productFields = ['title', 'status', 'vendor', 'product_type', 'tags', 'body_html',
    'metafields_global_title_tag', 'metafields_global_description_tag']
  const variantFields = ['price', 'compare_at_price', 'sku', 'barcode']

  if (fieldName === 'inventory_quantity') {
    // Inventory needs inventoryItemId + locationId (fetched from our DB)
    return { needsInventoryFetch: true }
  }

  if (productFields.includes(fieldName)) {
    return updateProduct(productId, { [fieldName]: afterValue })
  }

  if (variantFields.includes(fieldName)) {
    return updateVariant(variantId, { [fieldName]: afterValue })
  }

  throw new Error(`Unknown field: ${fieldName}`)
}
