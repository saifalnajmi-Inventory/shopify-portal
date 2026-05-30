/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs')

const securityHeaders = [
  { key: 'X-Frame-Options',        value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection',       value: '1; mode=block' },
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
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

module.exports = withSentryConfig(nextConfig, {
  // Your Sentry org and project (from saif-al-najmi.sentry.io)
  org:     'saif-al-najmi',
  project: 'shopify-portal',

  // Suppress noisy build output
  silent: true,

  // Don't upload source maps — keeps build fast and free tier safe
  // Enable later when debugging minified production errors becomes important
  widenClientFileUpload: false,
  hideSourceMaps: true,
  disableLogger: true,

  // Automatically instrument Next.js API routes and pages
  autoInstrumentServerFunctions: true,
  autoInstrumentMiddleware: true,
})
