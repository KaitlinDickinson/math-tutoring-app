import { useEffect, useMemo, useRef, useState } from 'react'
import { listenStudents, addStudent, updateStudent, deleteStudent, bulkUpdateStudents, listenSettings, saveSettings } from '../lib/db'
import { formatCurrency, exportStudentsCSV } from '../lib/helpers'
import Modal from '../components/Modal'
import StudentForm from '../components/StudentForm'

const COLUMNS = [
  { key: 'firstName', label: 'Name', accessor: (s) => s.firstName || '' },
  { key: 'lastName', label: 'Surname', accessor: (s) => s.lastName || '' },
  { key: 'grade', label: 'Grade', accessor: (s) => Number(s.grade) || 0, numeric: true },
  { key: 'studentContact', label: 'Contact', accessor: (s) => s.studentContact || '' },
  { key: 'accountable', label: 'Accountable person', accessor: (s) => `${s.accountable?.name || ''} ${s.accountable?.surname || ''}`.trim() },
  { key: 'paymentMethod', label: 'Payment', accessor: (s) => s.paymentMethod || '' },
  { key: 'hourlyRate', label: 'Rate', accessor: (s) => Number(s.hourlyRate) || 0, numeric: true }
]

export default function Students() {
  const [students, setStudents] = useState([])
  const [settings, setSettings] = useState({})
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [sortKey, setSortKey] = useState('lastName')
  const [sortDir, setSortDir] = useState('asc')
  const [modal, setModal] = useState(null) // null | 'add' | student object (edit)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const rolloverRan = useRef(false)

  useEffect(() => {
    const u1 = listenStudents(setStudents)
    const u2 = listenSettings((s) => { setSettings(s); setSettingsLoaded(true) })
    return () => { u1(); u2() }
  }, [])

  // Bumps every student's grade by one the first time this page is opened in
  // a new calendar year. The very first run just records a baseline year —
  // there's nothing to promote from yet.
  useEffect(() => {
    if (!settingsLoaded || rolloverRan.current || students.length === 0) return
    rolloverRan.current = true
    const currentYear = new Date().getFullYear()
    const lastYear = settings.gradeRolloverYear
    if (lastYear === currentYear) return
    if (lastYear != null) {
      const updates = students
        .filter((s) => s.grade !== undefined && s.grade !== null && s.grade !== '')
        .map((s) => ({ id: s.id, data: { grade: Number(s.grade) + 1 } }))
      if (updates.length > 0) bulkUpdateStudents(updates)
    }
    saveSettings({ gradeRolloverYear: currentYear })
  }, [settingsLoaded, settings.gradeRolloverYear, students])

  const gradeOptions = useMemo(() => {
    const set = new Set(students.map((s) => s.grade).filter((g) => g !== undefined && g !== null && g !== ''))
    return Array.from(set).sort((a, b) => Number(a) - Number(b))
  }, [students])

  const filtered = useMemo(() => {
    let list = students
    const q = query.trim().toLowerCase()
    if (q) list = list.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q))
    if (gradeFilter !== 'all') list = list.filter((s) => String(s.grade ?? '') === gradeFilter)
    return list
  }, [students, query, gradeFilter])

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sortKey) || COLUMNS[1]
    const arr = [...filtered].sort((a, b) => {
      const av = col.accessor(a)
      const bv = col.accessor(b)
      const cmp = col.numeric ? av - bv : String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const handleAdd = async (data) => { await addStudent(data); setModal(null) }
  const handleEdit = async (data) => { await updateStudent(modal.id, data); setModal(null) }
  const handleDelete = async () => { await deleteStudent(confirmDelete.id); setConfirmDelete(null) }

  return (
    <>
      <div className="content-header">
        <div>
          <h1>Students</h1>
          <p>{students.length} registered</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={() => exportStudentsCSV(sorted)}>Export CSV</button>
          <button className="btn btn-accent" onClick={() => setModal('add')}>+ Register student</button>
        </div>
      </div>

      <div className="cal-toolbar">
        <div className="search-wrap" style={{ maxWidth: 420, flex: 1 }}>
          <span className="search-icon">🔍</span>
          <input placeholder="Search students…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
          <option value="all">All grades</option>
          {gradeOptions.map((g) => <option key={g} value={g}>Grade {g}</option>)}
        </select>
      </div>

      <div className="panel">
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="sortable-th" onClick={() => toggleSort(c.key)}>
                    {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.firstName}</strong></td>
                  <td><strong>{s.lastName}</strong></td>
                  <td>{s.grade !== undefined && s.grade !== null && s.grade !== '' ? s.grade : <span className="muted">—</span>}</td>
                  <td>{s.studentContact}</td>
                  <td>
                    {s.accountable?.name} {s.accountable?.surname}
                    <div className="muted">{s.accountable?.email}</div>
                  </td>
                  <td>{s.paymentMethod} · {timingLabel(s.paymentTiming)}</td>
                  <td>{formatCurrency(s.hourlyRate)}/hr</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setModal(s)}>Edit</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(s)}>Delete</button>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={8}><div className="empty-state">No students found.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Register a student' : 'Edit student'} onClose={() => setModal(null)} width={560}>
          <StudentForm
            initial={modal === 'add' ? null : modal}
            defaultRate={settings.defaultHourlyRate}
            onSubmit={modal === 'add' ? handleAdd : handleEdit}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Remove student?"
          onClose={() => setConfirmDelete(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Remove</button>
          </>}
        >
          <p>This removes {confirmDelete.firstName} {confirmDelete.lastName} from your student list. Their past sign-ins and invoices are kept.</p>
        </Modal>
      )}
    </>
  )
}

function timingLabel(t) {
  return { onDay: 'Pays on the day', startOfMonth: 'Pays start of month', endOfMonth: 'Pays end of month' }[t] || t
}
