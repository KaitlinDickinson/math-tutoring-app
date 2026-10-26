import { useMemo, useRef, useState } from 'react'
import Modal from './Modal'
import StatementDocument from './StatementDocument'
import { buildStatement, periodLabel, elementPdfBlob, downloadBlob, pdfPageSizePx } from '../lib/helpers'

const fullName = (s) => `${s.firstName} ${s.lastName}`
const pad = (n) => String(n).padStart(2, '0')
const toInput = ({ year, month }) => `${year}-${pad(month + 1)}`
const fromInput = (v) => ({ year: Number(v.slice(0, 4)), month: Number(v.slice(5, 7)) - 1 })

// Search for a student, pick the months, preview and download their statement.
// `invoices` are the saved invoices (one per student per month).
export default function StatementModal({ students, invoices, settings, onClose }) {
  const today = new Date()
  const [query, setQuery] = useState('')
  const [studentId, setStudentId] = useState(null)
  const [fromValue, setFromValue] = useState(toInput({ year: today.getFullYear(), month: 0 }))
  const [toValue, setToValue] = useState(toInput({ year: today.getFullYear(), month: today.getMonth() }))
  const [making, setMaking] = useState(false)
  const [error, setError] = useState('')
  const docRef = useRef(null)

  const q = query.trim().toLowerCase()
  const matches = [...students]
    .sort((a, b) => fullName(a).localeCompare(fullName(b)))
    .filter((s) => !q || fullName(s).toLowerCase().includes(q))
  const student = students.find((s) => s.id === studentId) || null

  // A range picked back to front is read the right way round.
  const [from, to] = [fromInput(fromValue), fromInput(toValue)].sort((a, b) => (a.year - b.year) || (a.month - b.month))
  const validRange = /^\d{4}-\d{2}$/.test(fromValue) && /^\d{4}-\d{2}$/.test(toValue)
  const period = validRange ? periodLabel(from, to) : ''

  const statement = useMemo(() => {
    if (!student || !validRange) return null
    return buildStatement(invoices.filter((inv) => inv.studentId === student.id), from, to)
  }, [student, invoices, fromValue, toValue]) // eslint-disable-line react-hooks/exhaustive-deps

  const download = () => {
    setMaking(true)
    setError('')
    elementPdfBlob(docRef.current, 'portrait')
      .then((blob) => downloadBlob(blob, `Statement - ${fullName(student)} - ${period}.pdf`))
      .catch(() => setError("The PDF couldn't be created. Please try again."))
      .finally(() => setMaking(false))
  }

  const footer = student && (
    <>
      <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
      <button type="button" className="btn btn-accent" onClick={download} disabled={!statement || making}>
        {making ? 'Creating PDF…' : 'Download PDF'}
      </button>
    </>
  )

  return (
    <Modal title={student ? `Statement — ${fullName(student)}` : 'Statement'} onClose={onClose} width={860} footer={footer}>
      {!student ? (
        <div className="statement-pick">
          <p className="muted" style={{ marginTop: 0 }}>Choose the student whose statement you need.</p>
          <div className="search-wrap statement-search">
            <span className="search-icon">🔍</span>
            <input autoFocus placeholder="Search student…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search student" />
          </div>
          <div className="picker-list">
            {matches.map((s) => (
              <button key={s.id} type="button" className="statement-pick-row" onClick={() => setStudentId(s.id)}>
                {fullName(s)}
                {s.grade != null && s.grade !== '' && <span className="muted">Grade {s.grade}</span>}
              </button>
            ))}
            {matches.length === 0 && <div className="picker-row muted">No students match "{query}"</div>}
          </div>
        </div>
      ) : (
        <>
          <div className="statement-controls">
            <div className="field">
              <label>Student</label>
              <div className="statement-student">
                <strong>{fullName(student)}</strong>
                <button type="button" className="btn-link" onClick={() => { setStudentId(null); setQuery('') }}>Change</button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="st-from">From</label>
              <input id="st-from" type="month" value={fromValue} onChange={(e) => setFromValue(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="st-to">To</label>
              <input id="st-to" type="month" value={toValue} onChange={(e) => setToValue(e.target.value)} />
            </div>
          </div>
          {error && <div className="settings-message error" style={{ margin: '0 0 12px' }}>{error}</div>}

          {statement ? (
            <div className="statement-preview">
              <div className="statement-sheet" style={{ width: pdfPageSizePx().width }}>
                <div ref={docRef} style={{ background: '#fff' }}>
                  <StatementDocument student={student} statement={statement} period={period} settings={settings} />
                </div>
              </div>
            </div>
          ) : (
            <p className="muted">Choose both months to see the statement.</p>
          )}
        </>
      )}
    </Modal>
  )
}
