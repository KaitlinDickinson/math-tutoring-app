import { useEffect, useMemo, useState } from 'react'
import { listenStudents, listenSessions, listenBookings, addSession, updateSession, deleteSession } from '../lib/db'
import {
  formatDate, formatTime, formatCurrency, monthLabel, exportAttendanceCSV, sessionHours, sessionLabel,
  linkSessionsToBookings
} from '../lib/helpers'
import Modal from '../components/Modal'
import SessionForm from '../components/SessionForm'

const now = new Date()
const fullName = (st) => `${st.firstName} ${st.lastName}`

export default function Attendance() {
  const [students, setStudents] = useState([])
  const [sessions, setSessions] = useState([])
  const [bookings, setBookings] = useState([])
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const { year, month } = cursor
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null) // null | 'add' | session object (edit)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    const u1 = listenStudents(setStudents)
    const u2 = listenSessions(setSessions)
    const u3 = listenBookings(setBookings)
    return () => { u1(); u2(); u3() }
  }, [])

  const studentOf = (id) => students.find((s) => s.id === id)
  // Same session -> booking matching the invoices use, so hours always agree.
  const links = useMemo(() => linkSessionsToBookings(sessions, bookings), [sessions, bookings])
  const bookingFor = (s) => links.get(s.id) || null

  const shiftMonth = (delta) => setCursor(({ year, month }) => {
    const d = new Date(year, month + delta, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  // Hours typed here apply to that one lesson, overriding the calendar length.
  const handleSave = async (data) => {
    if (modal === 'add') await addSession({ ...data, hoursOverride: data.durationHours })
    else if (data.durationHours !== sessionHours(modal, bookingFor(modal))) await updateSession(modal.id, { ...data, hoursOverride: data.durationHours })
    else await updateSession(modal.id, data)
    setModal(null)
  }
  const handleDelete = async () => { await deleteSession(confirmDelete.id); setConfirmDelete(null) }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sessions
      .filter((s) => {
        const d = new Date(s.date)
        return d.getFullYear() === year && d.getMonth() === month
      })
      .filter((s) => {
        if (!q) return true
        const st = studentOf(s.studentId)
        return st && fullName(st).toLowerCase().includes(q)
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1
        return (a.checkInTime || '') < (b.checkInTime || '') ? 1 : -1
      })
  }, [sessions, students, year, month, query])

  // Which students are in view, so the summary and export say exactly
  // whose attendance they cover.
  const shownStudents = useMemo(() => {
    const ids = [...new Set(rows.map((s) => s.studentId))]
    return ids.map(studentOf).filter(Boolean)
  }, [rows, students])

  const searching = query.trim() !== ''
  const oneStudent = searching && shownStudents.length === 1 ? shownStudents[0] : null
  const period = monthLabel(year, month)
  const signIns = `${rows.length} sign-in${rows.length === 1 ? '' : 's'}`

  const exportLabel = !searching
    ? 'Export CSV'
    : oneStudent
      ? `Export ${fullName(oneStudent)}'s attendance`
      : `Export ${shownStudents.length} students' attendance`

  const handleExport = () => {
    const who = oneStudent ? fullName(oneStudent) : searching ? `search-${query.trim()}` : 'all'
    const filename = `attendance-${who}-${period}.csv`.replace(/[^\w.-]+/g, '-')
    exportAttendanceCSV(rows, students, bookings, filename)
  }

  return (
    <>
      <div className="content-header">
        <div>
          <h1>Attendance</h1>
          <p>Every signed-in session, with the student's full profile and accountable-person details.</p>
        </div>
        <button className="btn btn-accent" onClick={() => setModal('add')}>+ Add attendance</button>
      </div>

      <div className="cal-toolbar">
        <div className="cal-nav">
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month">←</button>
          <span className="cal-label">{period}</span>
          <button onClick={() => shiftMonth(1)} aria-label="Next month">→</button>
          <button className="btn btn-outline btn-sm" onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}>This month</button>
        </div>
        <div className="search-wrap" style={{ maxWidth: 280, flex: 1 }}>
          <span className="search-icon">🔍</span>
          <input placeholder="Search student…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search student" />
        </div>
      </div>

      <div className="attendance-summary">
        <div>
          {oneStudent
            ? <><strong>{fullName(oneStudent)}</strong>: {signIns} in {period}</>
            : searching
              ? <>{shownStudents.length} students matching "<strong>{query.trim()}</strong>": {signIns} in {period}</>
              : <>Everyone: {signIns} in {period}</>}
          {searching && (
            <button type="button" className="btn-link" onClick={() => setQuery('')} aria-label="Clear search">× Clear search</button>
          )}
        </div>
        <div className="attendance-actions">
          <button className="btn btn-outline btn-sm" onClick={handleExport} disabled={rows.length === 0}>{exportLabel}</button>
          <button className="btn btn-outline btn-sm" onClick={() => window.print()} disabled={rows.length === 0}>Print / Save as PDF</button>
        </div>
      </div>

      <div className="panel print-area">
        <p className="muted" style={{ padding: '14px 14px 0' }}>
          {oneStudent ? `${fullName(oneStudent)}, ` : ''}{period}: {signIns}
        </p>
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Student</th>
                <th>Signature</th>
                <th>Accountable person</th>
                <th>Payment</th>
                <th>Session</th>
                <th className="no-print"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const st = studentOf(s.studentId)
                return (
                  <tr key={s.id}>
                    <td>{formatDate(s.date)}</td>
                    <td>{formatTime(s.checkInTime)}</td>
                    <td>
                      <strong>{st ? `${st.firstName} ${st.lastName}` : 'Unknown student'}</strong>
                      <div className="muted">{st?.studentContact}</div>
                    </td>
                    <td>
                      {s.signature
                        ? <img src={s.signature} alt="Signature" style={{ height: 32, display: 'block' }} />
                        : <span className="muted">{s.manualEntry ? 'Manually added' : '—'}</span>}
                    </td>
                    <td>
                      {st?.accountable?.name} {st?.accountable?.surname}
                      <div className="muted">{st?.accountable?.contact}</div>
                      <div className="muted">{st?.accountable?.email}</div>
                    </td>
                    <td>
                      {st?.paymentMethod} · {timingLabel(st?.paymentTiming)}
                      <div className="muted">{formatCurrency(st?.hourlyRate)}/hr default</div>
                    </td>
                    <td>
                      {sessionLabel(bookingFor(s), s.bookingTitle, s.sessionType)}
                      <div className="muted">
                        {sessionHours(s, bookingFor(s))}h @ {formatCurrency(s.rate)}
                        {s.notBilled && ', not billed'}
                      </div>
                    </td>
                    <td className="no-print" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setModal(s)}>Edit</button>{' '}
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(s)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8}><div className="empty-state">
                  {searching ? `No sign-ins matching "${query.trim()}" in ${period}.` : `No sign-ins in ${period}.`}
                </div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add attendance' : 'Edit sign-in'} onClose={() => setModal(null)} width={480}>
          <SessionForm
            initial={modal === 'add' ? null : { ...modal, durationHours: sessionHours(modal, bookingFor(modal)) }}
            students={students}
            onSubmit={handleSave}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Remove this sign-in?"
          onClose={() => setConfirmDelete(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Remove</button>
          </>}
        >
          <p>This removes the sign-in for {studentOf(confirmDelete.studentId)?.firstName || 'this student'} on {formatDate(confirmDelete.date)}. Any invoice already generated for that month will update automatically.</p>
        </Modal>
      )}
    </>
  )
}

function timingLabel(t) {
  return { onDay: 'Pays on the day', startOfMonth: 'Pays start of month', endOfMonth: 'Pays end of month' }[t] || t || '—'
}
