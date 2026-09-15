import { useEffect, useMemo, useState } from 'react'
import { listenStudents, listenSessions, addSession, updateSession, deleteSession } from '../lib/db'
import { formatDate, formatTime, formatCurrency, monthLabel, exportAttendanceCSV } from '../lib/helpers'
import Modal from '../components/Modal'
import SessionForm from '../components/SessionForm'

const now = new Date()

export default function Attendance() {
  const [students, setStudents] = useState([])
  const [sessions, setSessions] = useState([])
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null) // null | 'add' | session object (edit)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    const u1 = listenStudents(setStudents)
    const u2 = listenSessions(setSessions)
    return () => { u1(); u2() }
  }, [])

  const studentOf = (id) => students.find((s) => s.id === id)

  const handleSave = async (data) => {
    if (modal === 'add') await addSession(data)
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
        return st && `${st.firstName} ${st.lastName}`.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1
        return (a.checkInTime || '') < (b.checkInTime || '') ? 1 : -1
      })
  }, [sessions, students, year, month, query])

  return (
    <>
      <div className="content-header">
        <div>
          <h1>Attendance</h1>
          <p>Every signed-in session, with the student's full profile and accountable-person details.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={() => exportAttendanceCSV(rows, students)}>Export CSV</button>
          <button className="btn btn-outline" onClick={() => window.print()}>Print / Save as PDF</button>
          <button className="btn btn-accent" onClick={() => setModal('add')}>+ Add attendance</button>
        </div>
      </div>

      <div className="cal-toolbar">
        <div className="cal-nav">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i} value={i}>{monthLabel(year, i).split(' ')[0]}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="search-wrap" style={{ maxWidth: 280 }}>
          <span className="search-icon">🔍</span>
          <input placeholder="Search student…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="panel print-area">
        <p className="muted" style={{ padding: '14px 14px 0' }}>{monthLabel(year, month)} — {rows.length} sign-in{rows.length === 1 ? '' : 's'}</p>
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
                      {s.bookingTitle || (s.sessionType === 'group' ? 'Group session' : 'Individual session')}
                      <div className="muted">{s.durationHours}h @ {formatCurrency(s.rate)}</div>
                    </td>
                    <td className="no-print" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setModal(s)}>Edit</button>{' '}
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(s)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8}><div className="empty-state">No sign-ins found for this month.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add attendance' : 'Edit sign-in'} onClose={() => setModal(null)} width={480}>
          <SessionForm
            initial={modal === 'add' ? null : modal}
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
