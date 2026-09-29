import { useEffect, useState } from 'react'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  initializeAuth, inMemoryPersistence, createUserWithEmailAndPassword, sendPasswordResetEmail
} from 'firebase/auth'
import { auth, firebaseConfig } from '../firebase'
import { listenAdminUsers, saveAdminUsers } from '../lib/db'

const sameEmail = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

// Creating an account with the normal auth instance would sign the new user
// in and log the current tutor out, so we use a throwaway app instance that
// keeps its session in memory only.
async function createLogin(email, password) {
  const secondary = initializeApp(firebaseConfig, `user-creator-${Date.now()}`)
  try {
    const secondaryAuth = initializeAuth(secondary, { persistence: inMemoryPersistence })
    await createUserWithEmailAndPassword(secondaryAuth, email, password)
  } finally {
    await deleteApp(secondary)
  }
}

const EMPTY_NEW_USER = { name: '', email: '', password: '' }

export default function UserManagement() {
  const [users, setUsers] = useState(null) // null = loading
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER)
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'ok' | 'error', text }

  const myEmail = auth.currentUser?.email || ''

  useEffect(() => listenAdminUsers(setUsers), [])

  // Make sure whoever is logged in always appears on the list, e.g. the
  // original tutor account that was created in the Firebase console.
  useEffect(() => {
    if (users && myEmail && !users.some((u) => sameEmail(u.email, myEmail))) {
      saveAdminUsers([...users, { name: '', email: myEmail }])
    }
  }, [users, myEmail])

  const flash = (type, text) => setMessage({ type, text })

  const handleAdd = async (e) => {
    e.preventDefault()
    const email = newUser.email.trim()
    if (users.some((u) => sameEmail(u.email, email))) {
      flash('error', `${email} is already on the list.`)
      return
    }
    setAdding(true)
    setMessage(null)
    try {
      await createLogin(email, newUser.password)
      flash('ok', `Added ${email}. They can now log in with the password you set.`)
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        // The login already exists (e.g. made in the Firebase console) — just list it.
        flash('ok', `${email} already had a login, so it's been added to the list. Their existing password still works.`)
      } else {
        flash('error', friendlyError(err))
        setAdding(false)
        return
      }
    }
    await saveAdminUsers([...users, { name: newUser.name.trim(), email }])
    setNewUser(EMPTY_NEW_USER)
    setAdding(false)
  }

  const handleReset = async (email) => {
    setMessage(null)
    try {
      await sendPasswordResetEmail(auth, email)
      flash('ok', `Password reset email sent to ${email}. Ask them to check their spam folder if it doesn't arrive.`)
    } catch (err) {
      flash('error', friendlyError(err))
    }
  }

  const handleRename = (email, name) => {
    const updated = users.map((u) => (sameEmail(u.email, email) ? { ...u, name: name.trim() } : u))
    saveAdminUsers(updated)
  }

  const handleRemove = async (email) => {
    if (!window.confirm(`Remove ${email} from the list?\n\nThis doesn't delete their login. To stop them signing in completely, also delete them in the Firebase console under Authentication > Users.`)) return
    await saveAdminUsers(users.filter((u) => !sameEmail(u.email, email)))
    flash('ok', `${email} removed from the list.`)
  }

  if (users === null) return <div className="empty-state">Loading…</div>

  return (
    <>
      {message && <div className={`settings-message ${message.type}`} role="status">{message.text}</div>}

      <div className="users-layout">
        <div className="panel">
          <div className="panel-header">
            <h3>People with admin access</h3>
            <span className="muted">{users.length} {users.length === 1 ? 'user' : 'users'}</span>
          </div>
          <div className="table-scroll">
            <table className="ledger">
              <thead>
                <tr><th style={{ width: '32%' }}>Name</th><th>Email</th><th /></tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isMe = sameEmail(u.email, myEmail)
                  return (
                    <tr key={u.email}>
                      <td>
                        <input
                          aria-label={`Name for ${u.email}`}
                          defaultValue={u.name}
                          placeholder="Add a name"
                          onBlur={(e) => { if (e.target.value.trim() !== u.name) handleRename(u.email, e.target.value) }}
                        />
                      </td>
                      <td className="user-email">{u.email}{isMe && <span className="muted"> (you)</span>}</td>
                      <td>
                        <div className="user-actions">
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => handleReset(u.email)}>Reset password</button>
                          {!isMe && (
                            <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleRemove(u.email)}>Remove</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="panel-body" style={{ borderTop: '1px solid var(--paper-line)', paddingTop: 14, paddingBottom: 14 }}>
            <p className="field-hint" style={{ margin: 0 }}>
              Click a name to edit it. "Reset password" emails them a link to choose a new password.
            </p>
          </div>
        </div>

        <div className="panel">
          <div className="panel-body">
            <h3 style={{ marginBottom: 4 }}>Add a new user</h3>
            <p className="field-hint" style={{ marginBottom: 14 }}>They'll have full access to the admin side, the same as you.</p>
            <form onSubmit={handleAdd}>
              <div className="field">
                <label htmlFor="nu-name">Name</label>
                <input id="nu-name" required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="nu-email">Email</label>
                <input id="nu-email" type="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="nu-password">Temporary password</label>
                <input id="nu-password" type="text" required minLength={6} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                <span className="field-hint">At least 6 characters. Share it with them, or use "Reset password" afterwards so they choose their own.</span>
              </div>
              <button className="btn btn-accent btn-block" disabled={adding}>{adding ? 'Adding…' : 'Add user'}</button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}

function friendlyError(err) {
  switch (err.code) {
    case 'auth/invalid-email': return "That email address doesn't look right."
    case 'auth/weak-password': return 'Password must be at least 6 characters.'
    case 'auth/user-not-found': return "There's no login for that email yet."
    case 'auth/too-many-requests': return 'Too many attempts. Please wait a few minutes and try again.'
    case 'auth/operation-not-allowed': return 'Email/password logins are turned off in the Firebase console (Authentication > Sign-in method).'
    default: return `Something went wrong (${err.code || err.message}).`
  }
}
