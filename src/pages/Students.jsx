import { useEffect, useMemo, useState } from 'react'
import { listenStudents, addStudent, updateStudent, deleteStudent, listenSettings } from '../lib/db'
import { formatCurrency, exportStudentsCSV } from '../lib/helpers'
import Modal from '../components/Modal'
import StudentForm from '../components/StudentForm'

export default function Students() {
  const [students, setStudents] = useState([])
  const [settings, setSettings] = useState({})
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null) // null | 'add' | student object (edit)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    const u1 = listenStudents(setStudents)
    const u2 = listenSettings(setSettings)
    return () => { u1(); u2() }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q))
  }, [query, students])

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
          <button className="btn btn-outline" onClick={() => exportStudentsCSV(students)}>Export CSV</button>
          <button className="btn btn-accent" onClick={() => setModal('add')}>+ Register student</button>
        </div>
      </div>

      <div className="search-wrap" style={{ marginBottom: 18, maxWidth: 420 }}>
        <span className="search-icon">🔍</span>
        <input placeholder="Search students…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="panel">
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Student</th>
                <th>Contact</th>
                <th>Accountable person</th>
                <th>Payment</th>
                <th>Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.firstName} {s.lastName}</strong></td>
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
              {filtered.length === 0 && (
                <tr><td colSpan={6}><div className="empty-state">No students found.</div></td></tr>
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
