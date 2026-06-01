import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Login from './pages/Login'
import Board from './pages/Board'
import Deadlines from './pages/Deadlines'
import Users from './pages/Users'
import Settings from './pages/Settings'
import Sidebar from './components/Sidebar'

function Layout({ session, children }) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar session={session} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
      <Route path="/" element={session
        ? <Layout session={session}><Board session={session} /></Layout>
        : <Navigate to="/login" />}
      />
      <Route path="/deadlines" element={session
        ? <Layout session={session}><Deadlines /></Layout>
        : <Navigate to="/login" />}
      />
      <Route path="/users" element={session
        ? <Layout session={session}><Users session={session} /></Layout>
        : <Navigate to="/login" />}
      />
      <Route path="/settings" element={session
        ? <Layout session={session}><Settings session={session} /></Layout>
        : <Navigate to="/login" />}
      />
    </Routes>
  )
}
