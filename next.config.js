/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Prevents your site from being embedded in an iframe (clickjacking protection)
  { key: 'X-Frame-Options',        value: 'DENY' },
  // Stops browsers from guessing the file type (MIME sniffing protection)
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Enables browser's built-in XSS filter
  { key: 'X-XSS-Protection',       value: '1; mode=block' },
  // Controls how much referrer info is sent when clicking links
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  // Disables camera, mic, and location access from the browser
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        // Apply security headers to ALL routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.shopify.com' },
      { protocol: 'https', hostname: '**.myshopify.com' },
    ],
  },

  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
}

module.exports = nextConfig
