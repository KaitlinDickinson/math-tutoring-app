import { useEffect, useMemo, useRef, useState } from 'react'
import { listenStudents, addStudent, updateStudent, deleteStudent, bulkUpdateStudents, listenSettings, saveSettings } from '../lib/db'
import { formatCurrency, exportStudentsCSV } from '../lib/helpers'
import Modal from '../components/Modal'
import StudentForm from '../components/StudentForm'

const COLUMN_DEFS = {
  firstName: { label: 'Name', accessor: (s) => s.firstName || '' },
  lastName: { label: 'Surname', accessor: (s) => s.lastName || '' },
  grade: { label: 'Grade', accessor: (s) => Number(s.grade) || 0, numeric: true },
  studentContact: { label: 'Contact', accessor: (s) => s.studentContact || '' },
  accountable: { label: 'Accountable person', accessor: (s) => `${s.accountable?.name || ''} ${s.accountable?.surname || ''}`.trim() },
  paymentMethod: { label: 'Payment', accessor: (s) => s.paymentMethod || '' },
  hourlyRate: { label: 'Rate', accessor: (s) => Number(s.hourlyRate) || 0, numeric: true }
}
const DEFAULT_COLUMN_ORDER = ['firstName', 'lastName', 'grade', 'studentContact', 'accountable', 'paymentMethod', 'hourlyRate']

function renderCell(key, s) {
  switch (key) {
    case 'firstName': return <strong>{s.firstName}</strong>
    case 'lastName': return <strong>{s.lastName}</strong>
    case 'grade': return s.grade !== undefined && s.grade !== null && s.grade !== '' ? s.grade : <span className="muted">—</span>
    case 'studentContact': return s.studentContact
    case 'accountable': return <>{s.accountable?.name} {s.accountable?.surname}<div className="muted">{s.accountable?.email}</div></>
    case 'paymentMethod': return <>{s.paymentMethod} · {timingLabel(s.paymentTiming)}</>
    case 'hourlyRate': return `${formatCurrency(s.hourlyRate)}/hr`
    default: return null
  }
}

export default function Students() {
  const [students, setStudents] = useState([])
  const [settings, setSettings] = useState({})
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [sortKey, setSortKey] = useState('lastName')
  const [sortDir, setSortDir] = useState('asc')
  const [columnOrder, setColumnOrder] = useState(DEFAULT_COLUMN_ORDER)
  const [dragKey, setDragKey] = useState(null)
  const [overKey, setOverKey] = useState(null)
  const [modal, setModal] = useState(null) // null | 'add' | student object (edit)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const rolloverRan = useRef(false)

  useEffect(() => {
    const u1 = listenStudents(setStudents)
    const u2 = listenSettings((s) => { setSettings(s); setSettingsLoaded(true) })
    return () => { u1(); u2() }
  }, [])

  // Restore the admin's saved column order once settings arrive. Unknown keys
  // (an old order referencing a removed column) are dropped, and any new
  // column not yet in a saved order is appended at the end.
  useEffect(() => {
    if (!settingsLoaded) return
    const saved = settings.studentColumnOrder
    if (Array.isArray(saved) && saved.length) {
      const validSaved = saved.filter((k) => DEFAULT_COLUMN_ORDER.includes(k))
      const missing = DEFAULT_COLUMN_ORDER.filter((k) => !validSaved.includes(k))
      setColumnOrder([...validSaved, ...missing])
    }
  }, [settingsLoaded, settings.studentColumnOrder])

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
    const col = COLUMN_DEFS[sortKey] || COLUMN_DEFS.lastName
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

  const handleDragStart = (key) => (e) => {
    setDragKey(key)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (key) => (e) => {
    e.preventDefault()
    if (key !== overKey) setOverKey(key)
  }
  const handleDrop = (key) => (e) => {
    e.preventDefault()
    setOverKey(null)
    if (!dragKey || dragKey === key) { setDragKey(null); return }
    const next = [...columnOrder]
    next.splice(next.indexOf(dragKey), 1)
    next.splice(next.indexOf(key), 0, dragKey)
    setColumnOrder(next)
    saveSettings({ studentColumnOrder: next })
    setDragKey(null)
  }
  const handleDragEnd = () => { setDragKey(null); setOverKey(null) }

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
        <p className="muted" style={{ padding: '12px 14px 0' }}>Drag a column header to reorder it — your order is remembered next time you log in.</p>
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                {columnOrder.map((key) => (
                  <th
                    key={key}
                    className={`sortable-th draggable-th ${dragKey === key ? 'dragging' : ''} ${overKey === key && dragKey !== key ? 'drag-over' : ''}`}
                    draggable
                    onDragStart={handleDragStart(key)}
                    onDragOver={handleDragOver(key)}
                    onDrop={handleDrop(key)}
                    onDragEnd={handleDragEnd}
                    onClick={() => toggleSort(key)}
                  >
                    {COLUMN_DEFS[key].label}{sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id}>
                  {columnOrder.map((key) => <td key={key}>{renderCell(key, s)}</td>)}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setModal(s)}>Edit</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(s)}>Delete</button>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={columnOrder.length + 1}><div className="empty-state">No students found.</div></td></tr>
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
