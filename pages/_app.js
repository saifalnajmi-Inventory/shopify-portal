import '../styles/globals.css'
import { Toaster }                          from 'react-hot-toast'
import { createContext, useContext,
         useState, useEffect, useCallback } from 'react'
import Layout                               from '../components/Layout'

// ── Auth context — available to all pages and components ──────────────────────
export const AuthContext = createContext({ user: null, authLoading: true, setUser: () => {} })
export function useAuth() { return useContext(AuthContext) }

export default function App({ Component, pageProps }) {
  const [user,        setUser]        = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const refreshAuth = useCallback(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setUser(d?.user || null); setAuthLoading(false) })
      .catch(() => { setUser(null); setAuthLoading(false) })
  }, [])

  useEffect(() => { refreshAuth() }, [refreshAuth])

  const noLayout = Component.noLayout

  return (
    <AuthContext.Provider value={{ user, authLoading, setUser, refreshAuth }}>
      {noLayout ? (
        <>
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
          <Component {...pageProps} />
        </>
      ) : (
        <Layout>
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
          <Component {...pageProps} />
        </Layout>
      )}
    </AuthContext.Provider>
  )
}
