/**
 * Sentry — Edge Middleware configuration
 * Captures errors in Next.js Edge Middleware (middleware.js).
 */
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === 'production',
})
