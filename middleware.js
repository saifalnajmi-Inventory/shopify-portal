/**
 * Next.js Edge Middleware — route protection.
 * Runs before every request. Edge-compatible: no Prisma, no Node.js APIs.
 *
 * Public routes (no auth required):
 *   /login, /api/auth/*, /_next/*, /favicon.ico
 *
 * Everything else:
 *   - No inv_session cookie + page  → redirect to /login?from=PATH
 *   - No inv_session cookie + /api/ → 401 JSON
 *   - Cookie present                → pass through (API routes do full validation)
 */

import { NextResponse } from 'next/server'

const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/',
  '/api/pos/sync',   // POS agent uses x-sync-key header auth, no session cookie
  '/_next/',
  '/favicon',
]

export function middleware(request) {
  const { pathname } = request.nextUrl

  // Allow public paths without any auth check
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = request.cookies.get('inv_session')?.value

  if (!token) {
    // API requests → 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Page requests → redirect to login
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') {
      loginUrl.searchParams.set('from', pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Run on all routes except static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
