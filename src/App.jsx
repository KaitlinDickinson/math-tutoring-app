import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './firebase'
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

function AdminLayout({ children }) {
  const user = useAuthUser()
  const navigate = useNavigate()
  const [navOpen, setNavOpen] = useState(false)

  if (user === undefined) return <div className="empty-state">Loading…</div>
  if (!user) return <Navigate to="/admin/login" replace />

  const links = [
    { to: '/admin/students', label: 'Students' },
    { to: '/admin/calendar', label: 'Calendar' },
    { to: '/admin/attendance', label: 'Attendance' },
    { to: '/admin/invoices', label: 'Invoices' },
    { to: '/admin/settings', label: 'Settings' }
  ]

  const handleLogout = async () => {
    await signOut(auth)
    navigate('/admin/login')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">The Ledger<span>Tutoring admin</span></div>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label}
            </NavLink>
          ))}
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
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setNavOpen(false)}>
              {l.label}
            </NavLink>
          ))}
          <a href="#" onClick={handleLogout}>Log out</a>
        </div>
        <main className="main-content">{children}</main>
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
        <Route path="/admin/calendar" element={<AdminLayout><CalendarPage /></AdminLayout>} />
        <Route path="/admin/attendance" element={<AdminLayout><Attendance /></AdminLayout>} />
        <Route path="/admin/invoices" element={<AdminLayout><Invoices /></AdminLayout>} />
        <Route path="/admin/settings" element={<AdminLayout><Settings /></AdminLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
