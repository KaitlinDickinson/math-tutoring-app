import { Fragment, useLayoutEffect, useRef } from 'react'
import {
  formatCurrency, formatDate, sessionHours, sessionLabel, sessionTimeLabel, paymentTimingLabel, pdfPageSizePx
} from '../lib/helpers'

// Empty lines on the printable blank sheet; fills one portrait A4 page.
const BLANK_ROWS = 20
const BLANK_COLUMNS = ['Date of class attended', 'Lesson duration', 'Amount received', 'Date amount received', 'Cash / EFT', 'Invoice number', 'Signature']

// The watermark from Settings (or the logo, if none) sits faintly behind the table.
function Watermark({ settings }) {
  const src = settings?.watermark || settings?.logo
  return src ? <img className="attendance-doc-watermark" src={src} alt="" /> : null
}

// The business details shown at the top of every register.
function From({ billing }) {
  return (
    <div>
      <div className="muted">From</div>
      {billing.businessName && <strong>{billing.businessName}</strong>}
      {billing.address && <div className="muted">{billing.address}</div>}
      {billing.contactEmail && <div className="muted">{billing.contactEmail}</div>}
      {billing.contactPhone && <div className="muted">{billing.contactPhone}</div>}
    </div>
  )
}

// A one-student sign-in card to print and fill in by hand, laid out like the
// paper register: learner and parent details boxed at the top, then the lines.
// Given a student, the top box comes filled in with their details.
function BlankSheet({ settings, student }) {
  const billing = settings?.billing || {}
  const hasFrom = billing.businessName || billing.address || billing.contactEmail || billing.contactPhone
  const pageRef = useRef(null)
  const bodyRef = useRef(null)

  // Share the space left under the header between the rows, so the table
  // reaches the bottom of the page however tall the business details are.
  useLayoutEffect(() => {
    const page = pageRef.current
    const rows = [...bodyRef.current.rows]
    const padding = parseFloat(getComputedStyle(page).paddingBottom) || 0
    const sheetBorder = 2
    const space = page.getBoundingClientRect().bottom - padding - sheetBorder - bodyRef.current.getBoundingClientRect().top
    const height = Math.floor(space / rows.length)
    rows.forEach((tr) => { tr.style.height = `${height}px` })
  })

  const parent = student?.accountable || {}
  const cell = (label, flex, value) => [
    <div key={`${label}-l`} className="blank-sheet-label" style={{ flex: flex[0] }}>{label}:</div>,
    <div key={`${label}-v`} className="blank-sheet-value" style={{ flex: flex[1] }}>{value}</div>
  ]

  return (
    // One printable page tall, less a little so it never spills onto a second.
    <div className="attendance-doc blank-page" ref={pageRef} style={{ height: pdfPageSizePx('portrait').height - 8 }}>
      <div className="field-row" style={{ marginBottom: 16, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Attendance register</h2>
        {hasFrom && <div style={{ textAlign: 'right' }}><From billing={billing} /></div>}
      </div>

      <div className="attendance-doc-body">
        <Watermark settings={settings} />
        <div className="blank-sheet">
          <div className="blank-sheet-row">
            {cell('Parent / guardian', [2, 4], [parent.name, parent.surname].filter(Boolean).join(' '))}
            {cell('Learner name and surname', [3, 3], student && `${student.firstName} ${student.lastName}`)}
          </div>
          <div className="blank-sheet-row">
            {cell('Email', [1, 3.5], parent.email)}
            {cell('Contact number', [1.8, 2], parent.contact)}
            {cell('Birthday', [1.5, 1.5])}
          </div>
          <table className="blank-sheet-table">
            <thead>
              <tr>{BLANK_COLUMNS.map((c) => <th key={c}>{c}:</th>)}</tr>
            </thead>
            <tbody ref={bodyRef}>
              {Array.from({ length: BLANK_ROWS }, (_, i) => (
                <tr key={i}>{BLANK_COLUMNS.map((c) => <td key={c} />)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// The downloadable attendance register, styled like InvoiceDocument. With one
// student the parent and payment details go in the header; with several they
// become columns so every row still says who it's for. `blank` gives sign-in
// sheets to print instead: one page per student in `students`, or one empty page.
export default function AttendanceDocument({ sessions, studentOf, bookingFor, settings, period, student, students, blank }) {
  if (blank) {
    const pages = students?.length ? students : [null]
    return pages.map((st, i) => (
      <Fragment key={st?.id || 'empty'}>
        {i > 0 && <div className="html2pdf__page-break" />}
        <BlankSheet settings={settings} student={st} />
      </Fragment>
    ))
  }

  const billing = settings?.billing || {}
  const hasFrom = billing.businessName || billing.address || billing.contactEmail || billing.contactPhone
  const many = !student
  const totalHours = sessions.reduce((sum, s) => sum + sessionHours(s, bookingFor(s)), 0)
  const parent = (st) => [st?.accountable?.name, st?.accountable?.surname].filter(Boolean).join(' ')
  const payment = (st) => [st?.paymentMethod, paymentTimingLabel(st?.paymentTiming)].filter(Boolean).join(', ')

  return (
    <div className="attendance-doc">
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 2 }}>Attendance register</h2>
        <p className="muted" style={{ margin: 0 }}>{period}</p>
      </div>

      <div className="field-row" style={{ marginBottom: 18 }}>
        {hasFrom && <From billing={billing} />}
        {student && (
          <div style={{ textAlign: hasFrom ? 'right' : 'left' }}>
            <div className="muted">Student</div>
            <strong>{student.firstName} {student.lastName}</strong>
            {student.grade != null && student.grade !== '' && <div className="muted">Grade {student.grade}</div>}
            <div className="muted" style={{ marginTop: 8 }}>Parent / guardian</div>
            <strong>{parent(student) || '—'}</strong>
            {student.accountable?.contact && <div className="muted">{student.accountable.contact}</div>}
            {student.accountable?.email && <div className="muted">{student.accountable.email}</div>}
            <div className="muted" style={{ marginTop: 8 }}>
              {payment(student)}{student.hourlyRate != null && `${payment(student) ? ', ' : ''}${formatCurrency(student.hourlyRate)}/hr`}
            </div>
          </div>
        )}
      </div>

      <div className="attendance-doc-body">
        <Watermark settings={settings} />
        <table className="ledger attendance-doc-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              {many && <th>Student</th>}
              {many && <th>Parent / guardian</th>}
              {many && <th>Payment</th>}
              <th>Session</th>
              <th>Hours</th>
              <th>Rate</th>
              <th>Signature</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const st = studentOf(s.studentId)
              const booking = bookingFor(s)
              return (
                <tr key={s.id}>
                  <td>{formatDate(s.date)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{sessionTimeLabel(s, booking)}</td>
                  {many && <td>{st ? `${st.firstName} ${st.lastName}` : 'Unknown student'}</td>}
                  {many && (
                    <td>
                      {parent(st)}
                      {st?.accountable?.contact && <div className="muted">{st.accountable.contact}</div>}
                    </td>
                  )}
                  {many && <td>{payment(st)}</td>}
                  <td>
                    {sessionLabel(booking, s.bookingTitle, s.sessionType)}
                    {s.notBilled && <div className="muted">Not billed</div>}
                  </td>
                  <td>{sessionHours(s, booking)}</td>
                  <td>{formatCurrency(s.rate)}</td>
                  <td>
                    {s.signature
                      ? <img src={s.signature} alt="Signature" style={{ height: 30, display: 'block' }} />
                      : <span className="muted">{s.manualEntry ? 'Manually added' : '—'}</span>}
                  </td>
                </tr>
              )
            })}
            {sessions.length === 0 && (
              <tr><td colSpan={many ? 9 : 6} className="muted">No sessions in {period}.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: 'right', marginTop: 16, fontSize: 16 }}>
        <strong>{sessions.length} session{sessions.length === 1 ? '' : 's'}, {totalHours} hour{totalHours === 1 ? '' : 's'}</strong>
      </div>
    </div>
  )
}
