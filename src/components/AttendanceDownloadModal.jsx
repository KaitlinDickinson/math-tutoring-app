import { useEffect, useMemo, useRef, useState } from 'react'
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns'
import Modal from './Modal'
import AttendanceDocument from './AttendanceDocument'
import {
  formatDate, formatTime, exportAttendanceCSV, elementPdfBlob, pdfPageSizePx, downloadBlob
} from '../lib/helpers'

const ALL = 'all'
const fullName = (st) => `${st.firstName} ${st.lastName}`
const iso = (d) => format(d, 'yyyy-MM-dd')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Quick date ranges; each gives [from, to] as yyyy-MM-dd.
const PRESETS = [
  { key: 'thisMonth', label: 'This month', range: () => [iso(startOfMonth(new Date())), iso(endOfMonth(new Date()))] },
  { key: 'lastMonth', label: 'Last month', range: () => { const d = subMonths(new Date(), 1); return [iso(startOfMonth(d)), iso(endOfMonth(d))] } },
  { key: 'thisYear', label: 'This year', range: () => [iso(startOfYear(new Date())), iso(endOfYear(new Date()))] }
]

// "November 2026" for a whole month, "2026" for a whole year, otherwise both dates.
function rangeLabel(from, to) {
  const f = new Date(`${from}T00:00`)
  if (from === iso(startOfMonth(f)) && to === iso(endOfMonth(f))) return format(f, 'MMMM yyyy')
  if (from === iso(startOfYear(f)) && to === iso(endOfYear(f))) return format(f, 'yyyy')
  return `${formatDate(from)} – ${formatDate(to)}`
}

// Pick the dates and either everyone or one learner, then download the
// attendance register as a PDF or CSV.
export default function AttendanceDownloadModal({ sessions, students, bookings, settings, bookingFor, onClose }) {
  const [[from, to], setRange] = useState(PRESETS[0].range)
  const [query, setQuery] = useState('')
  const [studentId, setStudentId] = useState(ALL)
  const [making, setMaking] = useState(false)
  const [error, setError] = useState('')
  const docRef = useRef(null)

  const studentOf = (id) => students.find((s) => s.id === id)
  const validRange = Boolean(from && to && from <= to)
  const period = validRange ? rangeLabel(from, to) : ''
  const activePreset = PRESETS.find((p) => { const [f, t] = p.range(); return f === from && t === to })?.key
  const slotStart = (s) => bookingFor(s)?.startTime || formatTime(s.checkInTime)

  // Every sign-in in the chosen dates, oldest first (the order the register reads).
  const inRange = useMemo(() => {
    if (!validRange) return []
    return sessions
      .filter((s) => s.date >= from && s.date <= to)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1
        return slotStart(a) < slotStart(b) ? -1 : 1
      })
  }, [sessions, from, to, validRange])

  const countFor = useMemo(() => {
    const counts = new Map()
    inRange.forEach((s) => counts.set(s.studentId, (counts.get(s.studentId) || 0) + 1))
    return counts
  }, [inRange])

  // Current learners, plus archived ones who still have sign-ins in these dates.
  const q = query.trim().toLowerCase()
  const matches = students
    .filter((s) => !s.archived || countFor.has(s.id))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)))
    .filter((s) => !q || fullName(s).toLowerCase().includes(q))

  const student = studentId === ALL ? null : studentOf(studentId)
  const rows = student ? inRange.filter((s) => s.studentId === student.id) : inRange
  const who = student ? fullName(student) : 'All students'
  const canDownload = validRange && rows.length > 0 && !making

  const downloadCsv = () => {
    exportAttendanceCSV(rows, students, bookings, `attendance-${who}-${period}.csv`.replace(/[^\w.-]+/g, '-'))
  }
  const downloadPdf = () => { setError(''); setMaking(true) }

  // The register is only rendered (off screen) while its PDF is being made.
  useEffect(() => {
    if (!making || !docRef.current) return
    elementPdfBlob(docRef.current, student ? 'portrait' : 'landscape')
      .then((blob) => downloadBlob(blob, `Attendance - ${who} - ${period}.pdf`))
      .catch(() => setError("The PDF couldn't be created. Please try again."))
      .finally(() => setMaking(false))
  }, [making])

  const footer = (
    <>
      <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
      <button type="button" className="btn btn-outline" onClick={downloadCsv} disabled={!canDownload}>Download CSV</button>
      <button type="button" className="btn btn-accent" onClick={downloadPdf} disabled={!canDownload}>
        {making ? 'Creating PDF…' : 'Download PDF'}
      </button>
    </>
  )

  const pickRow = (id, label, extra, className = '') => (
    <button
      key={id}
      type="button"
      className={`statement-pick-row ${className} ${studentId === id ? 'selected' : ''}`}
      onClick={() => setStudentId(id)}
      aria-pressed={studentId === id}
    >
      {label}
      <span className="muted">{extra}</span>
    </button>
  )

  return (
    <Modal title="Download attendance" onClose={onClose} width={560} footer={footer}>
      <div className="field-row attendance-dates">
        <div className="field">
          <label htmlFor="att-from">From</label>
          <input id="att-from" type="date" value={from} onChange={(e) => setRange([e.target.value, to])} />
        </div>
        <div className="field">
          <label htmlFor="att-to">To</label>
          <input id="att-to" type="date" value={to} onChange={(e) => setRange([from, e.target.value])} />
        </div>
      </div>
      <div className="cal-toggle attendance-presets" role="group" aria-label="Quick dates">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" className={activePreset === p.key ? 'active' : ''} onClick={() => setRange(p.range())}>
            {p.label}
          </button>
        ))}
      </div>
      {!validRange && <div className="settings-message error">The "From" date must be on or before the "To" date.</div>}

      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor="att-search">Learner</label>
        <div className="search-wrap statement-search" style={{ marginBottom: 0 }}>
          <span className="search-icon">🔍</span>
          <input id="att-search" placeholder="Search learner…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="picker-list">
        {!q && pickRow(ALL, 'All students', plural(inRange.length, 'sign-in'), 'picker-all')}
        {matches.map((s) => pickRow(s.id, fullName(s), plural(countFor.get(s.id) || 0, 'sign-in')))}
        {q && matches.length === 0 && <div className="picker-row muted">No learners match "{query}"</div>}
      </div>

      <p className="attendance-download-summary">
        {validRange
          ? <><strong>{who}</strong>: {plural(rows.length, 'sign-in')} in {period}</>
          : 'Fix the dates to see the sign-ins.'}
      </p>
      {error && <div className="settings-message error">{error}</div>}

      {making && (
        <div className="pdf-stage" aria-hidden="true">
          <div ref={docRef} style={{ width: pdfPageSizePx(student ? 'portrait' : 'landscape').width, background: '#fff' }}>
            <AttendanceDocument
              sessions={rows}
              studentOf={studentOf}
              bookingFor={bookingFor}
              settings={settings}
              period={period}
              student={student}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
