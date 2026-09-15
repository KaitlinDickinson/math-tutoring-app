import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../firebase'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate('/admin/students')
    } catch (err) {
      setError('Incorrect email or password.')
    }
    setLoading(false)
  }

  return (
    <div className="kiosk">
      <div className="kiosk-body" style={{ maxWidth: 380 }}>
        <div className="kiosk-header">
          <h1>Tutor login</h1>
          <p>Sign in to manage students, invoices and the calendar.</p>
        </div>
        <form className="panel" onSubmit={handleSubmit}>
          <div className="panel-body">
            <div className="field">
              <label>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
            <button className="btn btn-accent btn-block" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
