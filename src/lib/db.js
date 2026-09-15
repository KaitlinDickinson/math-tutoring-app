import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, setDoc, writeBatch
} from 'firebase/firestore'
import { db } from '../firebase'

function liveCollection(name, order) {
  return (callback) => {
    const q = order ? query(collection(db, name), orderBy(order)) : collection(db, name)
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
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
