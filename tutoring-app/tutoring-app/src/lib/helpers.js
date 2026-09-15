import { format, parseISO, isSameMonth, isSameYear } from 'date-fns'

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
 */
export function buildMonthlyInvoice(student, sessions, year, month) {
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

  return {
    studentId: student.id,
    studentName: `${student.firstName} ${student.lastName}`,
    accountable: student.accountable,
    year,
    month,
    lineItems,
    sessionCount: lineItems.length,
    total
  }
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

export function exportSessionsCSV(sessions, students) {
  const nameOf = (id) => {
    const st = students.find((s) => s.id === id)
    return st ? `${st.firstName} ${st.lastName}` : id
  }
  const rows = sessions.map((s) => ({
    Date: s.date,
    Time: s.checkInTime || '',
    Student: nameOf(s.studentId),
    Type: s.sessionType,
    DurationHours: s.durationHours,
    Rate: s.rate
  }))
  downloadCSV(`sign-ins-${todayISO()}.csv`, rows)
}
