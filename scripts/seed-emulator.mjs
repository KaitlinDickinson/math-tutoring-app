// Fills the local Firebase emulators with a test admin and a few students,
// so the app can be tried out without touching the live database.
//   1. npm run emulators        (leave running)
//   2. npm run seed:emulator
//   3. npm run dev:emulator     then log in as admin@test.local / test1234
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, doc, setDoc, collection, addDoc, getDocs } from 'firebase/firestore'

const PROJECT_ID = 'demo-multiplying-minds'
const EMAIL = 'admin@test.local'
const PASSWORD = 'test1234'

const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` })
const auth = getAuth(app)
const db = getFirestore(app)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
connectFirestoreEmulator(db, '127.0.0.1', 8080)

try {
  await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD)
} catch (err) {
  if (err.code !== 'auth/email-already-in-use') throw err
  await signInWithEmailAndPassword(auth, EMAIL, PASSWORD)
}

// The first admin may create the admin list with themselves on it.
await setDoc(doc(db, 'settings', 'users'), { users: [{ name: 'Test admin', email: EMAIL }], emails: [EMAIL] })
await setDoc(doc(db, 'settings', 'general'), {
  defaultHourlyRate: 250,
  gradeRolloverYear: new Date().getFullYear(),
  billing: {
    businessName: 'Multiplying Minds', address: '', contactEmail: 'marisa@example.com', contactPhone: '082 000 0000',
    bankName: 'FNB', accountHolder: 'Multiplying Minds', accountNumber: '63229304231', branchCode: '250655'
  }
}, { merge: true })
// The public copy of the logo and banking details the registration form shows.
await setDoc(doc(db, 'publicSettings', 'branding'), {
  logo: '',
  bank: { businessName: 'Multiplying Minds', bankName: 'FNB', accountHolder: 'Multiplying Minds', accountNumber: '63229304231', branchCode: '250655' }
})
// Invoice numbering already switched to the yearly scheme, as on the live site.
await setDoc(doc(db, 'settings', 'invoiceCounter'), { scheme: 'yearly-2026-10' }, { merge: true })

const existing = await getDocs(collection(db, 'students'))
if (existing.empty) {
  const students = [
    { firstName: 'Anri', lastName: 'van der Merwe', studentContact: '071 222 3333', grade: 9, accountable: { name: 'Sanet', surname: 'van der Merwe', contact: '082 555 1234', email: 'sanet@example.com' }, paymentMethod: 'EFT', paymentTiming: 'startOfMonth', hourlyRate: 250 },
    { firstName: 'Pieter', lastName: 'Botha', studentContact: '072 111 2222', grade: 11, accountable: { name: 'Johan', surname: 'Botha', contact: '083 444 5555', email: 'johan@example.com' }, paymentMethod: 'EFT', paymentTiming: 'endOfMonth', hourlyRate: 200 },
    { firstName: 'Lize', lastName: 'Smit', studentContact: '073 999 8888', grade: 12, accountable: { name: 'Elmarie', surname: 'Smit', contact: '084 777 6666', email: 'elmarie@example.com' }, paymentMethod: 'Card', paymentTiming: 'onDay', hourlyRate: 300 },
    { firstName: 'Thabo', lastName: 'Nkosi', studentContact: '074 333 1111', grade: 8, accountable: { name: 'Lerato', surname: 'Nkosi', contact: '076 123 4567', email: 'lerato@example.com' }, paymentMethod: 'EFT', paymentTiming: 'startOfMonth', hourlyRate: 150 }
  ]
  for (const s of students) await addDoc(collection(db, 'students'), s)
}

console.log(`Seeded. Log in at /admin/login as ${EMAIL} / ${PASSWORD}`)
process.exit(0)
