import { format, parseISO, addDays, isSameMonth, isSameYear } from 'date-fns'

export const CURRENCY = 'R' // South African Rand — change to '$', '£' etc. if needed

export function formatCurrency(amount) {
  const n = Number(amount) || 0
  return `${CURRENCY}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(dateStr, fmt = 'd MMM yyyy') {
  if (!dateStr) return ''
  const d = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
  return format(d, fmt)
}

export function formatTime(isoStamp) {
  if (!isoStamp) return ''
  return format(parseISO(isoStamp), 'HH:mm')
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function nowStamp() {
  return new Date().toISOString()
}

/**
 * Build a monthly invoice for one student from their raw check-in sessions.
 * Each session already stores: date (ISO), durationHours, rate (snapshot at
 * check-in time so later rate changes don't rewrite history), bookingTitle.
 *
 * Also compares against the student's calendar bookings for the month so
 * admin can see booked-but-not-signed-in sessions — these are never billed,
 * just surfaced for transparency.
 */
export function buildMonthlyInvoice(student, sessions, bookings, year, month) {
  const monthSessions = sessions
    .filter((s) => s.studentId === student.id)
    .filter((s) => {
      const d = parseISO(s.date)
      return d.getFullYear() === year && d.getMonth() === month
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const lineItems = monthSessions.map((s) => ({
    date: s.date,
    label: s.bookingTitle || (s.sessionType === 'group' ? 'Group session' : 'Individual session'),
    durationHours: s.durationHours || 1,
    rate: s.rate ?? student.hourlyRate ?? 0,
    amount: (s.durationHours || 1) * (s.rate ?? student.hourlyRate ?? 0)
  }))

  const total = lineItems.reduce((sum, li) => sum + li.amount, 0)

  const missedSessions = findMissedSessions(student, bookings, monthSessions, year, month)

  return {
    studentId: student.id,
    studentName: `${student.firstName} ${student.lastName}`,
    accountable: student.accountable,
    year,
    month,
    lineItems,
    sessionCount: lineItems.length,
    missedSessions,
    missedCount: missedSessions.length,
    total
  }
}

/**
 * Booked occurrences (up to today, so future bookings aren't judged yet)
 * for this student in the given month that have no matching signed-in
 * session for that exact booking + date.
 */
function findMissedSessions(student, bookings, monthSessions, year, month) {
  const todayIso = todayISO()
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)

  const studentBookings = (bookings || []).filter((b) => b.studentIds?.includes(student.id))
  const missed = []

  for (const booking of studentBookings) {
    for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) {
      const iso = format(d, 'yyyy-MM-dd')
      if (iso > todayIso) continue
      if (!occursOnDate(booking, iso)) continue
      const attended = monthSessions.some((s) => s.bookingId === booking.id && s.date === iso)
      if (attended) continue
      missed.push({
        date: iso,
        label: booking.title || (booking.type === 'group' ? 'Group session' : 'Individual session'),
        durationHours: durationHours(booking.startTime, booking.endTime),
        rate: (booking.ratesOverride && booking.ratesOverride[student.id]) ?? student.hourlyRate ?? 0
      })
    }
  }

  return missed.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** Does a booking (with possible repeat rule) occur on the given ISO date? */
export function occursOnDate(booking, dateISO) {
  if (dateISO < booking.startDate || dateISO > booking.endDate) return false
  if (booking.repeat === 'daily') return true
  if (booking.repeat === 'weekly') {
    const dow = parseISO(dateISO).getDay()
    return booking.daysOfWeek?.includes(dow)
  }
  // 'none' - single occurrence, only on startDate
  return booking.startDate === dateISO
}

export function bookingsOnDate(bookings, dateISO) {
  return bookings
    .filter((b) => occursOnDate(b, dateISO))
    .sort((a, b) => (a.startTime < b.startTime ? -1 : 1))
}

export function durationHours(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60
}

export function monthLabel(year, month) {
  return format(new Date(year, month, 1), 'MMMM yyyy')
}

// ---------- WhatsApp invoice sharing ----------

export const DEFAULT_WHATSAPP_MESSAGE =
  "Hi {parent}, please find attached {student}'s invoice for {month}. The total due is {total}.\n\nThank you!\n{business}"

// Placeholders the tutor can use in the Settings message template.
export const WHATSAPP_PLACEHOLDERS = [
  { key: '{parent}', label: "Parent's first name" },
  { key: '{student}', label: "Student's name" },
  { key: '{month}', label: 'Invoice month' },
  { key: '{total}', label: 'Invoice total' },
  { key: '{business}', label: 'Your business name' }
]

export function fillWhatsAppMessage(template, invoice, settings) {
  const values = {
    '{parent}': invoice.accountable?.name || '',
    '{student}': invoice.studentName || '',
    '{month}': monthLabel(invoice.year, invoice.month),
    '{total}': formatCurrency(invoice.total),
    '{business}': settings?.billing?.businessName || ''
  }
  return (template || DEFAULT_WHATSAPP_MESSAGE)
    .replace(/\{(parent|student|month|total|business)\}/g, (m) => values[m])
    .trim()
}

/** Turns a local SA number like "082 123 4567" into WhatsApp's 27821234567 format. */
export function whatsAppNumber(phone) {
  let digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `27${digits.slice(1)}`
  else if (digits.length === 9) digits = `27${digits}`
  return digits.length >= 10 ? digits : ''
}

export function whatsAppLink(phone, text) {
  const number = whatsAppNumber(phone)
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

export function invoiceFileName(invoice) {
  return `Invoice - ${invoice.studentName} - ${monthLabel(invoice.year, invoice.month)}.pdf`
}

/** Renders an invoice element to a PDF Blob. The library is loaded on first use. */
export async function invoicePdfBlob(element) {
  const { default: html2pdf } = await import('html2pdf.js')
  return html2pdf()
    .set({
      margin: 12,
      html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    })
    .from(element)
    .outputPdf('blob')
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Generic CSV download for arrays of flat objects. */
export function downloadCSV(filename, rows) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const escape = (val) => {
    const s = String(val ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(','))
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function exportStudentsCSV(students) {
  const rows = students.map((s) => ({
    FirstName: s.firstName,
    Surname: s.lastName,
    Grade: s.grade ?? '',
    StudentContact: s.studentContact,
    AccountableName: s.accountable?.name || '',
    AccountableSurname: s.accountable?.surname || '',
    AccountableContact: s.accountable?.contact || '',
    AccountableEmail: s.accountable?.email || '',
    PaymentMethod: s.paymentMethod,
    PaymentTiming: s.paymentTiming,
    HourlyRate: s.hourlyRate
  }))
  downloadCSV(`students-${todayISO()}.csv`, rows)
}

export function exportInvoicesCSV(invoices) {
  const rows = invoices.map((inv) => ({
    Student: inv.studentName,
    Month: monthLabel(inv.year, inv.month),
    Sessions: inv.sessionCount,
    Total: inv.total.toFixed(2),
    Status: inv.status,
    PaidDate: inv.paidDate || '',
    PaymentMethod: inv.paidMethod || ''
  }))
  downloadCSV(`invoices-${todayISO()}.csv`, rows)
}

/** Full attendance register: every sign-in plus the student's profile and
 * accountable-person details, for the tutor's records. Signatures are
 * images, so they're left out of the CSV — see the printable attendance
 * view for those.
 */
export function exportAttendanceCSV(sessions, students) {
  const studentOf = (id) => students.find((s) => s.id === id)
  const rows = sessions.map((s) => {
    const st = studentOf(s.studentId)
    return {
      Date: s.date,
      Time: formatTime(s.checkInTime),
      FirstName: st?.firstName || '',
      LastName: st?.lastName || '',
      Grade: st?.grade ?? '',
      StudentContact: st?.studentContact || '',
      AccountableName: st?.accountable?.name || '',
      AccountableSurname: st?.accountable?.surname || '',
      AccountableContact: st?.accountable?.contact || '',
      AccountableEmail: st?.accountable?.email || '',
      PaymentMethod: st?.paymentMethod || '',
      PaymentTiming: st?.paymentTiming || '',
      HourlyRate: st?.hourlyRate ?? '',
      SessionType: s.sessionType,
      DurationHours: s.durationHours,
      RateCharged: s.rate,
      Signed: s.signature ? 'Yes' : 'No'
    }
  })
  downloadCSV(`attendance-${todayISO()}.csv`, rows)
}
