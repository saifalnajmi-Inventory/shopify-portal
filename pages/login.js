/**
 * Login page — standalone, no Layout wrapper.
 */

import { useState, useEffect } from 'react'
import { useRouter }           from 'next/router'
import { Store, Eye, EyeOff, RefreshCw, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [username,    setUsername]    = useState('')
  const [password,    setPassword]    = useState('')
  const [showPwd,     setShowPwd]     = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)

  // If already logged in, redirect to dashboard immediately
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => {
        if (r.ok) router.replace(router.query.from || '/')
        else      setCheckingAuth(false)
      })
      .catch(() => setCheckingAuth(false))
  }, [])  // eslint-disable-line

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Enter your username and password')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        router.replace(router.query.from || '/')
      } else {
        setError(data.error || 'Login failed')
        setLoading(false)
      }
    } catch {
      setError('Network error — please try again')
      setLoading(false)
    }
  }

  // Show nothing while checking existing session (prevents flash)
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw size={22} className="animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo card */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl shadow-lg mb-4">
            <Store size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Portal</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to continue</p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Username */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                Username
              </label>
              <input
                type="text"
                autoFocus
                autoCapitalize="none"
                autoComplete="username"
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="Enter your username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPwd(v => !v)}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading
                ? <><RefreshCw size={15} className="animate-spin" /> Signing in…</>
                : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Secure access — contact your administrator for credentials
        </p>
      </div>
    </div>
  )
}

// Skip the Layout wrapper for the login page
LoginPage.noLayout = true
