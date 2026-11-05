import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, onSnapshot, query, orderBy, setDoc, writeBatch, runTransaction, arrayUnion, arrayRemove, deleteField, serverTimestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { formatInvoiceNumber, firstInvoiceSeq } from './helpers'
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
// Online lessons: attendance records use a fixed id (see onlineSessionId) so
// writing one twice, from two tabs say, can never make a duplicate.
export const setOnlineSession = (id, data) => setDoc(doc(db, 'sessions', id), data)

// ---------- Bookings (calendar) ----------
export const listenBookings = liveCollection('bookings')
export const addBooking = (data) => addDoc(collection(db, 'bookings'), data)
export const updateBooking = (id, data) => updateDoc(doc(db, 'bookings', id), data)
export const deleteBooking = (id) => deleteDoc(doc(db, 'bookings', id))
// Online bookings keep a list of "date|studentId" for students unticked as absent.
export const markOnlineAbsent = (bookingId, key) => updateDoc(doc(db, 'bookings', bookingId), { onlineAbsent: arrayUnion(key) })
export const clearOnlineAbsent = (bookingId, key) => updateDoc(doc(db, 'bookings', bookingId), { onlineAbsent: arrayRemove(key) })

// ---------- Student groups ({ name, studentIds }) ----------
// Only used to fill in a booking's students quickly; bookings keep their own copy.
export const listenGroups = liveCollection('groups', 'name')
export const addGroup = (data) => addDoc(collection(db, 'groups'), data)
export const updateGroup = (id, data) => updateDoc(doc(db, 'groups', id), data)
export const deleteGroup = (id) => deleteDoc(doc(db, 'groups', id))

// ---------- Invoices ----------
export const listenInvoices = liveCollection('invoices')
export const addInvoice = (data) => addDoc(collection(db, 'invoices'), data)

// Invoice numbers start with the two-digit year of the month billed, then a
// count that restarts each year: 2603, 2604 … 2699, 26100 … then 2701, 2702 …
// The counts live in settings/invoiceCounter as { y2026: 3, … }; transactions
// keep two tutors with the app open from ever getting the same number.
const invoiceCounterDoc = doc(db, 'settings', 'invoiceCounter')
// Invoices for this month onward get numbers; earlier months stay unnumbered.
export const FIRST_NUMBERED_MONTH = { year: 2026, month: 9 } // October 2026 (months are 0-based)
// Bumped when numbering is restarted; see ensureNumberingScheme.
const NUMBERING_SCHEME = 'yearly-2026-10'

const counterField = (year) => `y${year}`
// The next free count for a year, stepping over numbers already typed in by hand.
function nextSeq(counts, year, used) {
  let seq = (counts[counterField(year)] || firstInvoiceSeq(year) - 1) + 1
  while (used.has(formatInvoiceNumber(year, seq))) seq += 1
  return seq
}

// `used`: every invoice number already taken (a Set), from the invoice list.
export const addNumberedInvoice = (data, used = new Set()) => runTransaction(db, async (tx) => {
  const snap = await tx.get(invoiceCounterDoc)
  const seq = nextSeq(snap.exists() ? snap.data() : {}, data.year, used)
  const ref = doc(collection(db, 'invoices'))
  tx.set(invoiceCounterDoc, { [counterField(data.year)]: seq }, { merge: true })
  tx.set(ref, { ...data, invoiceNumber: formatInvoiceNumber(data.year, seq) })
  return ref.id
})

// Numbers invoices that don't have one yet, in the order of `ids`, in one
// transaction. Any that already have a number are skipped.
export const numberExistingInvoices = (ids, used = new Set()) => runTransaction(db, async (tx) => {
  const counterSnap = await tx.get(invoiceCounterDoc)
  const refs = ids.map((id) => doc(db, 'invoices', id))
  const snaps = await Promise.all(refs.map((ref) => tx.get(ref)))
  const counts = { ...(counterSnap.exists() ? counterSnap.data() : {}) }
  snaps.forEach((snap, i) => {
    if (!snap.exists() || snap.data().invoiceNumber) return
    const { year } = snap.data()
    const seq = nextSeq(counts, year, used)
    counts[counterField(year)] = seq
    tx.update(refs[i], { invoiceNumber: formatInvoiceNumber(year, seq) })
  })
  tx.set(invoiceCounterDoc, counts)
})

// One-off restart of numbering: the first time a tutor opens Invoices on this
// version, every number is wiped and the counts reset, then the Invoices page
// renumbers from October 2026. Resolves once the scheme is in place.
export const ensureNumberingScheme = (numberedIds) => runTransaction(db, async (tx) => {
  const snap = await tx.get(invoiceCounterDoc)
  if (snap.exists() && snap.data().scheme === NUMBERING_SCHEME) return
  if (numberedIds.length > 490) throw new Error('Too many invoices to renumber in one go.')
  numberedIds.forEach((id) => tx.update(doc(db, 'invoices', id), { invoiceNumber: deleteField() }))
  tx.set(invoiceCounterDoc, { scheme: NUMBERING_SCHEME })
})
// Set by hand (e.g. to match invoices made outside the app); '' removes it.
export const setInvoiceNumber = (id, number) =>
  updateDoc(doc(db, 'invoices', id), { invoiceNumber: number || deleteField() })
export const updateInvoice = (id, data) => updateDoc(doc(db, 'invoices', id), data)
export const deleteInvoice = (id) => deleteDoc(doc(db, 'invoices', id))

// ---------- Settings (single doc: settings/general) ----------
export const listenSettings = (callback) => {
  return onSnapshot(doc(db, 'settings', 'general'), (snap) => {
    callback(snap.exists() ? snap.data() : { defaultHourlyRate: 250 })
  })
}
export const saveSettings = (data) => setDoc(doc(db, 'settings', 'general'), data, { merge: true })
export const getSettings = async () => {
  const snap = await getDoc(doc(db, 'settings', 'general'))
  return snap.exists() ? snap.data() : {}
}

// ---------- Online registration ----------
// Form definitions are public (the /register page reads them without a
// login); publicSettings/registration says which one is live. Submissions
// can be created by anyone but only admins can read them (firestore.rules).
const publicRegistrationDoc = doc(db, 'publicSettings', 'registration')
export const listenRegistrationForms = liveCollection('registrationForms', 'year')
export const saveRegistrationForm = (form) => setDoc(doc(db, 'registrationForms', form.id), form)
export const listenPublicRegistration = (callback) =>
  onSnapshot(publicRegistrationDoc, (snap) => callback(snap.exists() ? snap.data() : {}))
export const setActiveRegistrationForm = (formId) => setDoc(publicRegistrationDoc, { activeFormId: formId })

// The logo and banking details from Settings > General, copied somewhere
// public so the registration form always shows the current ones. Only these
// fields are copied: the rest of settings stays admin-only.
const publicBrandingDoc = doc(db, 'publicSettings', 'branding')
export const brandingFromSettings = (s) => {
  const b = s?.billing || {}
  return {
    logo: s?.logo || '',
    bank: {
      businessName: b.businessName || '',
      bankName: b.bankName || '',
      accountHolder: b.accountHolder || '',
      accountNumber: b.accountNumber || '',
      branchCode: b.branchCode || ''
    }
  }
}
export const savePublicBranding = (settings) => setDoc(publicBrandingDoc, brandingFromSettings(settings))
/** Re-copies the current logo and banking details (run when an admin opens the builder). */
export async function syncPublicBranding() {
  const snap = await getDoc(doc(db, 'settings', 'general'))
  if (snap.exists()) await savePublicBranding(snap.data())
}
export async function getPublicBranding() {
  const snap = await getDoc(publicBrandingDoc)
  return snap.exists() ? snap.data() : { logo: '', bank: {} }
}
export const listenPublicBranding = (callback) =>
  onSnapshot(publicBrandingDoc, (snap) => callback(snap.exists() ? snap.data() : { logo: '', bank: {} }))

/** The live form for /register, or null when none has been set up. */
export async function getPublicRegistrationForm() {
  const pointer = await getDoc(publicRegistrationDoc)
  const formId = pointer.exists() ? pointer.data().activeFormId : null
  if (!formId) return null
  const snap = await getDoc(doc(db, 'registrationForms', formId))
  return snap.exists() ? snap.data() : null
}

// data: { formId, year, lang, answers, signatures, form }. The form is a
// copy of the questions as they were, so later edits don't change it.
export const submitRegistration = (data) =>
  addDoc(collection(db, 'registrations'), { ...data, status: 'new', submittedAt: serverTimestamp() })
export const listenRegistrations = liveCollection('registrations')
export const updateRegistration = (id, data) => updateDoc(doc(db, 'registrations', id), data)
export const deleteRegistration = (id) => deleteDoc(doc(db, 'registrations', id))
// Approving onto an existing student: new details plus the year and
// registration added to their lists (without repeating either).
export const updateStudentFromRegistration = (id, data, year, registrationId) =>
  updateDoc(doc(db, 'students', id), { ...data, registeredYears: arrayUnion(year), registrationIds: arrayUnion(registrationId) })

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
