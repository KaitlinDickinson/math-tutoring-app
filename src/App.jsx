import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './firebase'
import { ensureAdminAccess } from './lib/db'
import Kiosk from './pages/Kiosk'
import AdminLogin from './pages/AdminLogin'
import Students from './pages/Students'
import CalendarPage from './pages/CalendarPage'
import Attendance from './pages/Attendance'
import Invoices from './pages/Invoices'
import Settings from './pages/Settings'

function useAuthUser() {
  const [user, setUser] = useState(undefined) // undefined = loading
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  return user
}

// undefined = still checking, true/false = whether this login is on the
// Settings > Users list (firestore.rules enforces the same thing).
function useAdminAccess(user) {
  const [access, setAccess] = useState(undefined)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ensureAdminAccess(user.email || '')
      .then((ok) => { if (!cancelled) setAccess(ok) })
      .catch(() => { if (!cancelled) setAccess(false) })
    return () => { cancelled = true }
  }, [user])
  return access
}

function AdminLayout({ children }) {
  const user = useAuthUser()
  const access = useAdminAccess(user)
  const navigate = useNavigate()
  const [navOpen, setNavOpen] = useState(false)

  if (user === undefined) return <div className="empty-state">Loading…</div>
  if (!user) return <Navigate to="/admin/login" replace />
  if (access === undefined) return <div className="empty-state">Loading…</div>
  if (!access) return <NoAccess email={user.email} />

  const links = [
    {
      to: '/admin/students',
      label: 'Students',
      children: [
        { to: '/admin/students', label: 'Students', end: true },
        { to: '/admin/students/groups', label: 'Groups' }
      ]
    },
    { to: '/admin/calendar', label: 'Calendar' },
    { to: '/admin/attendance', label: 'Attendance' },
    { to: '/admin/invoices', label: 'Invoices' },
    { to: '/admin/settings', label: 'Settings' }
  ]

  // Leave the admin pages before signing out, so the "not logged in" guard
  // above doesn't bounce us to /admin/login on the way to the kiosk.
  const handleLogout = async (e) => {
    e.preventDefault()
    navigate('/', { replace: true })
    await signOut(auth)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">The Ledger<span>Tutoring admin</span></div>
        <nav>
          <NavItems links={links} />
        </nav>
        <div className="sidebar-footer">
          <button className="btn btn-outline btn-block" style={{ color: '#dbe1ee', borderColor: 'rgba(255,255,255,0.25)' }} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mobile-bar">
          <div className="brand">The Ledger</div>
          <button onClick={() => setNavOpen((v) => !v)}>Menu</button>
        </div>
        <div className={`mobile-nav ${navOpen ? 'open' : ''}`}>
          <NavItems links={links} onNavigate={() => setNavOpen(false)} />
          <a href="#" onClick={handleLogout}>Log out</a>
        </div>
        <main className="main-content">{children}</main>
      </div>
    </div>
  )
}

// Menu links; a section with sub-pages shows them indented underneath.
// The section heading stays lit while you're on any of its sub-pages, and the
// sub-page you're on gets the full highlight.
function NavItems({ links, onNavigate }) {
  return links.map((l) => (
    l.children ? (
      <div key={l.to} className="nav-section">
        <NavLink to={l.children[0].to} end={false} className={({ isActive }) => (isActive ? 'section-active' : '')} onClick={onNavigate}>
          {l.label}
        </NavLink>
        <div className="nav-sub">
          {l.children.map((c) => (
            <NavLink key={c.to} to={c.to} end={c.end} className={({ isActive }) => (isActive ? 'active' : '')} onClick={onNavigate}>
              {c.label}
            </NavLink>
          ))}
        </div>
      </div>
    ) : (
      <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')} onClick={onNavigate}>
        {l.label}
      </NavLink>
    )
  ))
}

function NoAccess({ email }) {
  const navigate = useNavigate()
  const handleLogout = async () => {
    navigate('/', { replace: true })
    await signOut(auth)
  }
  return (
    <div className="kiosk">
      <div className="kiosk-body" style={{ maxWidth: 420 }}>
        <div className="kiosk-header">
          <h1>No admin access</h1>
          <p>{email} isn't on the list of people allowed into the admin side. Ask an existing admin to add you under Settings &gt; Users.</p>
        </div>
        <button className="btn btn-accent btn-block" onClick={handleLogout}>Log out</button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Kiosk />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<Navigate to="/admin/students" replace />} />
        <Route path="/admin/students" element={<AdminLayout><Students /></AdminLayout>} />
        <Route path="/admin/students/groups" element={<AdminLayout><Students /></AdminLayout>} />
        <Route path="/admin/calendar" element={<AdminLayout><CalendarPage /></AdminLayout>} />
        <Route path="/admin/attendance" element={<AdminLayout><Attendance /></AdminLayout>} />
        <Route path="/admin/invoices" element={<AdminLayout><Invoices /></AdminLayout>} />
        <Route path="/admin/settings" element={<AdminLayout><Settings /></AdminLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
