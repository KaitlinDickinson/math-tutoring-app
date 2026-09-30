import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, onSnapshot, query, orderBy, setDoc, writeBatch
} from 'firebase/firestore'
import { db } from '../firebase'

function liveCollection(name, order) {
  return (callback, onError) => {
    const q = order ? query(collection(db, name), orderBy(order)) : collection(db, name)
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    }, onError)
  }
}

// ---------- Students ----------
export const listenStudents = liveCollection('students', 'lastName')
export const addStudent = (data) => addDoc(collection(db, 'students'), data)
export const updateStudent = (id, data) => updateDoc(doc(db, 'students', id), data)
export const deleteStudent = (id) => deleteDoc(doc(db, 'students', id))
// updates: [{ id, data }] — applied together, used for the yearly grade rollover.
export const bulkUpdateStudents = (updates) => {
  const batch = writeBatch(db)
  updates.forEach(({ id, data }) => batch.update(doc(db, 'students', id), data))
  return batch.commit()
}

// ---------- Sessions (kiosk sign-ins) ----------
export const listenSessions = liveCollection('sessions', 'date')
export const addSession = (data) => addDoc(collection(db, 'sessions'), data)
export const updateSession = (id, data) => updateDoc(doc(db, 'sessions', id), data)
export const deleteSession = (id) => deleteDoc(doc(db, 'sessions', id))

// ---------- Bookings (calendar) ----------
export const listenBookings = liveCollection('bookings')
export const addBooking = (data) => addDoc(collection(db, 'bookings'), data)
export const updateBooking = (id, data) => updateDoc(doc(db, 'bookings', id), data)
export const deleteBooking = (id) => deleteDoc(doc(db, 'bookings', id))

// ---------- Student groups ({ name, studentIds }) ----------
// Only used to fill in a booking's students quickly; bookings keep their own copy.
export const listenGroups = liveCollection('groups', 'name')
export const addGroup = (data) => addDoc(collection(db, 'groups'), data)
export const updateGroup = (id, data) => updateDoc(doc(db, 'groups', id), data)
export const deleteGroup = (id) => deleteDoc(doc(db, 'groups', id))

// ---------- Invoices ----------
export const listenInvoices = liveCollection('invoices')
export const addInvoice = (data) => addDoc(collection(db, 'invoices'), data)
export const updateInvoice = (id, data) => updateDoc(doc(db, 'invoices', id), data)
export const deleteInvoice = (id) => deleteDoc(doc(db, 'invoices', id))

// ---------- Settings (single doc: settings/general) ----------
export const listenSettings = (callback) => {
  return onSnapshot(doc(db, 'settings', 'general'), (snap) => {
    callback(snap.exists() ? snap.data() : { defaultHourlyRate: 250 })
  })
}
export const saveSettings = (data) => setDoc(doc(db, 'settings', 'general'), data, { merge: true })

// ---------- Admin users (single doc: settings/users) ----------
// The client SDK can't list Firebase Auth accounts, so we keep our own list
// of tutor logins here: users: [{ name, email }]. `emails` is a lowercase copy
// that firestore.rules checks to decide who counts as an admin.
const adminUsersDoc = doc(db, 'settings', 'users')
const normEmail = (email) => email.trim().toLowerCase()

export const listenAdminUsers = (callback) => {
  return onSnapshot(adminUsersDoc, (snap) => {
    callback(snap.exists() ? snap.data().users || [] : [])
  })
}
export const saveAdminUsers = (users) =>
  setDoc(adminUsersDoc, { users, emails: users.map((u) => normEmail(u.email)) })

// Resolves true if this login is on the admin list. The very first time
// (no list set up yet) the logged-in tutor is added as the first admin.
export async function ensureAdminAccess(email) {
  let snap
  try {
    snap = await getDoc(adminUsersDoc)
  } catch (err) {
    if (err.code === 'permission-denied') return false
    throw err
  }
  const data = snap.exists() ? snap.data() : {}
  if (Array.isArray(data.emails)) return data.emails.includes(normEmail(email))

  const users = data.users || []
  const listed = users.some((u) => normEmail(u.email) === normEmail(email))
  await saveAdminUsers(listed ? users : [...users, { name: '', email }])
  return true
}
