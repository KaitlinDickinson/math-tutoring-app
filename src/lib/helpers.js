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

export const DEFAULT_INVOICE_THANK_YOU =
  'Thank you for your support! Together, we’re adding confidence, multiplying knowledge and making a difference.'

/** An invoice for a month is due on the first Monday of the following month. */
export function invoiceDueDate(year, month) {
  const d = new Date(year, month + 1, 1)
  d.setDate(1 + ((8 - d.getDay()) % 7))
  return d
}

/**
 * Hours for a sign-in: a manual override set on that one lesson, else its
 * calendar booking's length, else what was stored at check-in (booking gone).
 */
export function sessionHours(session, booking) {
  if (session.hoursOverride != null) return session.hoursOverride
  return booking ? durationHours(booking.startTime, booking.endTime) : (session.durationHours || 1)
}

/**
 * Works out which calendar booking each sign-in belongs to, as a Map of
 * session id -> booking. Older kiosk versions let a student sign in without
 * choosing their session, leaving no bookingId; those are matched to the
 * student's booking that same day that no other sign-in has claimed.
 * Sessions added as extras on an invoice (`standalone`) are never matched.
 */
export function linkSessionsToBookings(sessions, bookings) {
  const byId = new Map((bookings || []).map((b) => [b.id, b]))
  const links = new Map()
  const claimed = new Set()
  const claimKey = (s, b) => `${s.studentId}|${s.date}|${b.id}`

  sessions.forEach((s) => {
    const b = s.bookingId && byId.get(s.bookingId)
    if (!b) return
    links.set(s.id, b)
    claimed.add(claimKey(s, b))
  })

  sessions
    .filter((s) => !s.bookingId && !s.standalone)
    .sort((a, b) => (a.checkInTime || '').localeCompare(b.checkInTime || ''))
    .forEach((s) => {
      const b = bookingsOnDate(bookings || [], s.date)
        .find((bk) => bk.studentIds?.includes(s.studentId) && !claimed.has(claimKey(s, bk)))
      if (!b) return
      links.set(s.id, b)
      claimed.add(claimKey(s, b))
    })

  return links
}

export const bookingRate = (booking, student) =>
  (booking?.ratesOverride && booking.ratesOverride[student.id]) ?? student.hourlyRate ?? 0

export function sessionLabel(booking, fallbackTitle, fallbackType) {
  if (booking?.walkIn) return 'Walk-in session'
  const title = booking ? booking.title : fallbackTitle
  const type = booking ? booking.type : fallbackType
  return title || (type === 'group' ? 'Group session' : 'Individual session')
}

/**
 * Build a monthly invoice for one student from their raw check-in sessions.
 * Hours come from the session's calendar booking as it is now, so fixing a
 * booking's times fixes the invoice (the Invoices page stops syncing once an
 * invoice is paid). The rate stays the snapshot taken at check-in so later
 * rate changes don't rewrite history. Sessions whose booking was deleted fall
 * back to what was stored at check-in.
 *
 * Also compares against the student's calendar bookings for the month so
 * admin can see booked-but-not-signed-in sessions — these are never billed,
 * just surfaced for transparency.
 *
 * Manual edits from the invoice editor live on the sign-ins themselves
 * (hoursOverride, rate, notBilled), plus `extraLines` ({ label, amount }) —
 * charges or discounts stored on the invoice and passed back in here.
 */
export function buildMonthlyInvoice(student, sessions, bookings, year, month, extraLines = []) {
  const studentSessions = sessions.filter((s) => s.studentId === student.id)
  const links = linkSessionsToBookings(studentSessions, bookings)
  const monthSessions = studentSessions
    .filter((s) => {
      const d = parseISO(s.date)
      return d.getFullYear() === year && d.getMonth() === month
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  let uncheckedWalkIns = 0
  const lineItems = monthSessions.map((s) => {
    const booking = links.get(s.id) || null
    const hours = sessionHours(s, booking)
    const rate = s.rate ?? student.hourlyRate ?? 0
    if (booking?.walkIn && booking.needsTimeCheck) uncheckedWalkIns += 1
    return {
      sessionId: s.id ?? null,
      date: s.date,
      label: sessionLabel(booking, s.bookingTitle, s.sessionType),
      durationHours: hours,
      rate,
      notBilled: !!s.notBilled,
      amount: s.notBilled ? 0 : hours * rate
    }
  })

  const extras = (extraLines || []).map((x) => ({ label: x.label || '', amount: Number(x.amount) || 0 }))
  const total = lineItems.reduce((sum, li) => sum + li.amount, 0) + extras.reduce((sum, x) => sum + x.amount, 0)

  const missedSessions = findMissedSessions(student, bookings, monthSessions, links, year, month)

  return {
    studentId: student.id,
    studentName: `${student.firstName} ${student.lastName}`,
    accountable: student.accountable,
    year,
    month,
    lineItems,
    extraLines: extras,
    sessionCount: lineItems.length,
    uncheckedWalkIns,
    missedSessions,
    missedCount: missedSessions.length,
    total
  }
}

/**
 * A student's account statement from their saved invoices, for the months
 * `from` to `to` ({ year, month }, inclusive). Billed lessons and extra lines
 * are charges; each invoice's recorded payment is a payment on its paid date.
 * Anything dated before the range is rolled into the opening balance.
 * Balances are positive when money is owed, negative when in credit.
 */
export function buildStatement(invoices, from, to) {
  const pad = (n) => String(n).padStart(2, '0')
  const startISO = `${from.year}-${pad(from.month + 1)}-01`
  const endISO = format(new Date(to.year, to.month + 1, 0), 'yyyy-MM-dd')

  const entries = []
  invoices.forEach((inv) => {
    inv.lineItems?.forEach((li) => {
      if (li.notBilled || !li.amount) return
      entries.push({ date: li.date, label: `${li.label}, ${li.durationHours} h`, charge: li.amount })
    })
    const monthEnd = format(new Date(inv.year, inv.month + 1, 0), 'yyyy-MM-dd')
    inv.extraLines?.forEach((x) => {
      if (x.amount) entries.push({ date: monthEnd, label: x.label || 'Adjustment', charge: x.amount })
    })
    if (inv.status === 'paid' && inv.paidDate) {
      const ref = inv.paidReference ? ` (ref ${inv.paidReference})` : ''
      entries.push({
        date: inv.paidDate,
        label: `Payment received${inv.paidMethod ? ` – ${inv.paidMethod}` : ''}${ref}`,
        payment: inv.amountPaid ?? inv.total
      })
    }
  })
  // Charges before payments on the same day.
  entries.sort((a, b) => a.date.localeCompare(b.date) || (a.payment ? 1 : 0) - (b.payment ? 1 : 0))

  const net = (e) => (e.charge || 0) - (e.payment || 0)
  const openingBalance = entries.filter((e) => e.date < startISO).reduce((sum, e) => sum + net(e), 0)
  let balance = openingBalance
  const rows = entries
    .filter((e) => e.date >= startISO && e.date <= endISO)
    .map((e) => { balance += net(e); return { ...e, balance } })

  return {
    startISO,
    endISO,
    openingBalance,
    rows,
    totalCharges: rows.reduce((sum, r) => sum + (r.charge || 0), 0),
    totalPayments: rows.reduce((sum, r) => sum + (r.payment || 0), 0),
    closingBalance: balance
  }
}

/** "January – October 2026", or "October 2026" for a single month. */
export function periodLabel(from, to) {
  if (from.year === to.year && from.month === to.month) return monthLabel(from.year, from.month)
  const start = format(new Date(from.year, from.month, 1), from.year === to.year ? 'MMMM' : 'MMMM yyyy')
  return `${start} – ${monthLabel(to.year, to.month)}`
}

/** Every [year, month] (month 0-11) in which a student has a signed-in session. */
export function monthsWithSessions(sessions, studentId) {
  const keys = new Set()
  sessions.forEach((s) => {
    if (s.studentId !== studentId || !s.date) return
    keys.add(s.date.slice(0, 7))
  })
  return [...keys].sort().map((k) => [Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1])
}

/**
 * Booked occurrences (up to today, so future bookings aren't judged yet)
 * for this student in the given month that have no matching signed-in
 * session for that exact booking + date.
 */
function findMissedSessions(student, bookings, monthSessions, links, year, month) {
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
      const attended = monthSessions.some((s) => links.get(s.id)?.id === booking.id && s.date === iso)
      if (attended) continue
      missed.push({
        bookingId: booking.id,
        date: iso,
        label: sessionLabel(booking),
        durationHours: durationHours(booking.startTime, booking.endTime),
        rate: bookingRate(booking, student)
      })
    }
  }

  return missed.sort((a, b) => (a.date < b.date ? -1 : 1))
}

// ---------- Online lessons ----------
// Online students can't sign in at the kiosk, so every online lesson up to
// today counts as attended by default; the tutor unticks anyone absent.

export const isOnlineBooking = (booking) => booking?.mode === 'online'
export const onlineSessionId = (bookingId, dateISO, studentId) => `online_${bookingId}_${dateISO}_${studentId}`
export const onlineAbsentKey = (dateISO, studentId) => `${dateISO}|${studentId}`

/** The attendance record a ticked online lesson stands for. */
export function onlineSessionData(booking, dateISO, student) {
  return {
    studentId: student.id,
    date: dateISO,
    checkInTime: `${dateISO}T${booking.startTime}:00`,
    signature: null,
    online: true,
    sessionType: booking.type || 'individual',
    durationHours: durationHours(booking.startTime, booking.endTime),
    rate: booking.ratesOverride?.[student.id] ?? student.hourlyRate ?? 0,
    bookingId: booking.id,
    bookingTitle: booking.title || null
  }
}

/**
 * Online-lesson attendance records that should exist but don't yet: one per
 * student per occurrence, from when the booking went online up to today,
 * skipping anyone unticked as absent. Returns [{ id, data }].
 */
export function missingOnlineSessions(bookings, students, sessions, today = todayISO()) {
  const sessionIds = new Set(sessions.map((s) => s.id))
  const studentById = new Map(students.map((s) => [s.id, s]))
  const missing = []
  bookings.filter(isOnlineBooking).forEach((b) => {
    const from = [b.startDate, b.onlineSince].filter(Boolean).sort().pop()
    const to = b.endDate < today ? b.endDate : today
    const absent = new Set(b.onlineAbsent || [])
    for (let d = parseISO(from); format(d, 'yyyy-MM-dd') <= to; d = addDays(d, 1)) {
      const iso = format(d, 'yyyy-MM-dd')
      if (!occursOnDate(b, iso)) continue
      ;(b.studentIds || []).forEach((sid) => {
        const student = studentById.get(sid)
        const id = onlineSessionId(b.id, iso, sid)
        if (!student || absent.has(onlineAbsentKey(iso, sid)) || sessionIds.has(id)) return
        missing.push({ id, data: onlineSessionData(b, iso, student) })
      })
    }
  })
  return missing
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

const PDF_MARGIN_MM = 12

/**
 * The printable area of an A4 PDF page in CSS pixels (96 per inch). html2pdf
 * lays the element out at this width, so anything wider is cut off on the
 * right: draw PDF documents at exactly this width.
 */
export function pdfPageSizePx(orientation = 'portrait') {
  const [w, h] = orientation === 'landscape' ? [297, 210] : [210, 297]
  const px = (mm) => Math.floor((mm - 2 * PDF_MARGIN_MM) * 96 / 25.4)
  return { width: px(w), height: px(h) }
}

/** Renders an invoice element to a PDF Blob. The library is loaded on first use. */
export async function elementPdfBlob(element, orientation = 'portrait') {
  const { default: html2pdf } = await import('html2pdf.js')
  return html2pdf()
    .set({
      margin: PDF_MARGIN_MM,
      html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation },
      pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' }
    })
    .from(element)
    .outputPdf('blob')
}

export const invoicePdfBlob = (element) => elementPdfBlob(element, 'portrait')

/** The time slot to show for a sign-in: the booked slot if it has one, else the sign-in time. */
export function sessionTimeLabel(session, booking) {
  if (booking) return `${booking.startTime} – ${booking.endTime}`
  return formatTime(session.checkInTime)
}

export function paymentTimingLabel(t) {
  return { onDay: 'Pays on the day', startOfMonth: 'Pays start of month', endOfMonth: 'Pays end of month' }[t] || t || ''
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
export function exportAttendanceCSV(sessions, students, bookings, filename = `attendance-${todayISO()}.csv`) {
  const studentOf = (id) => students.find((s) => s.id === id)
  const links = linkSessionsToBookings(sessions, bookings)
  const rows = sessions.map((s) => {
    const st = studentOf(s.studentId)
    const booking = links.get(s.id) || null
    return {
      Date: s.date,
      BookedTime: booking ? `${booking.startTime}-${booking.endTime}` : '',
      SignedInAt: formatTime(s.checkInTime),
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
      Session: sessionLabel(booking, s.bookingTitle, s.sessionType),
      DurationHours: sessionHours(s, booking),
      RateCharged: s.rate,
      Billed: s.notBilled ? 'No' : 'Yes',
      Signed: s.signature ? 'Yes' : s.online ? 'Online' : 'No'
    }
  })
  downloadCSV(filename, rows)
}
