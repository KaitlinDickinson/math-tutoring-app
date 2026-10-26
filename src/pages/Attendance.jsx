import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listenStudents, listenSessions, listenBookings, listenSettings, addSession, updateSession, deleteSession
} from '../lib/db'
import {
  formatDate, formatTime, monthLabel, exportAttendanceCSV, sessionHours, sessionTimeLabel,
  linkSessionsToBookings, elementPdfBlob, pdfPageSizePx, downloadBlob
} from '../lib/helpers'
import Modal from '../components/Modal'
import SessionForm from '../components/SessionForm'
import AttendanceDocument from '../components/AttendanceDocument'
import BlankSheetPicker from '../components/BlankSheetPicker'
import useOnlineAttendance from '../lib/useOnlineAttendance'

const now = new Date()
const fullName = (st) => `${st.firstName} ${st.lastName}`

export default function Attendance() {
  const [students, setStudents] = useState([])
  const [sessions, setSessions] = useState([])
  const [bookings, setBookings] = useState([])
  const [settings, setSettings] = useState({})
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const { year, month } = cursor
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null) // null | 'add' | 'blank' | session object (edit)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [makingPdf, setMakingPdf] = useState(false) // false | 'register' | 'blank'
  const [pdfError, setPdfError] = useState('')
  const [sheetStudents, setSheetStudents] = useState([]) // who the blank sheets are for
  const docRef = useRef(null)
  const [loaded, setLoaded] = useState({}) // which lists have arrived

  useEffect(() => {
    const got = (key, setter) => (data) => { setter(data); setLoaded((l) => (l[key] ? l : { ...l, [key]: true })) }
    const u1 = listenStudents(got('students', setStudents))
    const u2 = listenSessions(got('sessions', setSessions))
    const u3 = listenBookings(got('bookings', setBookings))
    const u4 = listenSettings(setSettings)
    return () => { u1(); u2(); u3(); u4() }
  }, [])

  // Only once everything has loaded, so it never mistakes "still loading" for "missing".
  const allLoaded = loaded.students && loaded.sessions && loaded.bookings
  useOnlineAttendance(allLoaded ? bookings : null, students, sessions)

  const studentOf = (id) => students.find((s) => s.id === id)
  // Same session -> booking matching the invoices use, so hours always agree.
  const links = useMemo(() => linkSessionsToBookings(sessions, bookings), [sessions, bookings])
  const bookingFor = (s) => links.get(s.id) || null
  // Booked start time, so rows sort by the slot shown rather than arrival time.
  const slotStart = (s) => bookingFor(s)?.startTime || formatTime(s.checkInTime)

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
        return slotStart(a) < slotStart(b) ? 1 : -1
      })
  }, [sessions, students, links, year, month, query])

  // Which students are in view, so the summary and downloads say exactly
  // whose attendance they cover.
  const shownStudents = useMemo(() => {
    const ids = [...new Set(rows.map((s) => s.studentId))]
    return ids.map(studentOf).filter(Boolean)
  }, [rows, students])

  const searching = query.trim() !== ''
  const oneStudent = searching && shownStudents.length === 1 ? shownStudents[0] : null
  const period = monthLabel(year, month)
  const signIns = `${rows.length} sign-in${rows.length === 1 ? '' : 's'}`
  const who = oneStudent ? fullName(oneStudent) : searching ? `${shownStudents.length} students` : 'All students'

  const handleExportCsv = () => {
    const filename = `attendance-${who}-${period}.csv`.replace(/[^\w.-]+/g, '-')
    exportAttendanceCSV(rows, students, bookings, filename)
  }

  // The register is only rendered (off screen) while a PDF is being made.
  useEffect(() => {
    if (!makingPdf || !docRef.current) return
    const blank = makingPdf === 'blank'
    elementPdfBlob(docRef.current, oneStudent || blank ? 'portrait' : 'landscape')
      .then((blob) => downloadBlob(blob, blank ? blankSheetFileName() : `Attendance - ${who} - ${period}.pdf`))
      .catch(() => setPdfError("The PDF couldn't be created. Please try again."))
      .finally(() => setMakingPdf(false))
  }, [makingPdf])

  const blankSheetFileName = () => {
    if (sheetStudents.length === 1) return `Attendance sheet - ${fullName(sheetStudents[0])}.pdf`
    if (sheetStudents.length > 1) return `Attendance sheets - ${sheetStudents.length} students.pdf`
    return 'Blank attendance sheet.pdf'
  }
  const handleBlankSheets = (chosen) => {
    setModal(null)
    setSheetStudents(chosen)
    setPdfError('')
    setMakingPdf('blank')
  }

  // The register lists lessons in date order, oldest first.
  const docRows = useMemo(() => [...rows].reverse(), [rows])

  return (
    <>
      <div className="content-header">
        <div>
          <h1>Attendance</h1>
          <p>Every signed-in session. Parent, payment and session details are included in the download.</p>
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
          <button className="btn btn-accent btn-sm" onClick={() => { setPdfError(''); setMakingPdf('register') }} disabled={rows.length === 0 || !!makingPdf}>
            {makingPdf === 'register' ? 'Creating PDF…' : oneStudent ? `Download ${fullName(oneStudent)}'s register (PDF)` : 'Download register (PDF)'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleExportCsv} disabled={rows.length === 0}>Export CSV</button>
          <button className="btn btn-outline btn-sm" onClick={() => setModal('blank')} disabled={!!makingPdf}>
            {makingPdf === 'blank' ? 'Creating PDF…' : 'Blank sheets (PDF)'}
          </button>
        </div>
      </div>
      {pdfError && <div className="settings-message error">{pdfError}</div>}

      <div className="panel">
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Student</th>
                <th>Signature</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const st = studentOf(s.studentId)
                return (
                  <tr key={s.id}>
                    <td>{formatDate(s.date)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{sessionTimeLabel(s, bookingFor(s))}</td>
                    <td>
                      <strong>{st ? fullName(st) : 'Unknown student'}</strong>
                      <div className="muted">{st?.studentContact}</div>
                    </td>
                    <td>
                      {s.signature
                        ? <img src={s.signature} alt="Signature" style={{ height: 32, display: 'block' }} />
                        : <span className="muted">{s.online ? 'Online – marked by tutor' : s.manualEntry ? 'Manually added' : '—'}</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setModal(s)}>Edit</button>{' '}
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(s)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={5}><div className="empty-state">
                  {searching ? `No sign-ins matching "${query.trim()}" in ${period}.` : `No sign-ins in ${period}.`}
                </div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {makingPdf && (
        <div className="pdf-stage" aria-hidden="true">
          {makingPdf === 'blank' ? (
            <div ref={docRef} style={{ width: pdfPageSizePx('portrait').width, background: '#fff' }}>
              <AttendanceDocument settings={settings} students={sheetStudents} blank />
            </div>
          ) : (
            <div ref={docRef} style={{ width: pdfPageSizePx(oneStudent ? 'portrait' : 'landscape').width, background: '#fff' }}>
              <AttendanceDocument
                sessions={docRows}
                studentOf={studentOf}
                bookingFor={bookingFor}
                settings={settings}
                period={period}
                student={oneStudent}
              />
            </div>
          )}
        </div>
      )}

      {modal === 'blank' && (
        <Modal title="Blank attendance sheets" onClose={() => setModal(null)} width={480}>
          <BlankSheetPicker students={students} onDownload={handleBlankSheets} onCancel={() => setModal(null)} />
        </Modal>
      )}

      {modal && modal !== 'blank' && (
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
