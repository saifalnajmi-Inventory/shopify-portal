/**
 * Sentry — Browser / Client-side configuration
 * Captures errors that happen in the user's browser.
 */
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of sessions for performance monitoring (free tier safe)
  tracesSampleRate: 0.1,

  // Only send errors in production — not during local dev
  enabled: process.env.NODE_ENV === 'production',

  // Ignore common browser noise that isn't real errors
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
    /^Network Error$/,
    /^Failed to fetch$/,
    /^Load failed$/,
  ],
})
