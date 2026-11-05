import { useMemo, useState } from 'react'
import { updateRegistration, deleteRegistration } from '../../lib/db'
import { studentFromAnswers, pricingFromAnswers, allQuestions, answerText, CHOICE_TYPES } from '../../lib/registration'
import { formatCurrency, nowStamp } from '../../lib/helpers'
import Modal from '../Modal'
import RegistrationDetails, { submittedLabel } from './RegistrationDetails'
import ApproveModal from './ApproveModal'

const FILTERS = [
  { key: 'new', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' }
]

const submittedMs = (r) => (r.submittedAt?.toMillis ? r.submittedAt.toMillis() : 0)

/** The lesson choice(s) on a registration, for the list. */
function choicesSummary(reg) {
  return allQuestions(reg.form)
    .filter((q) => CHOICE_TYPES.includes(q.type) && (q.options || []).some((o) => o.rate != null))
    .map((q) => answerText(q, reg.answers?.[q.id]))
    .filter(Boolean)
    .join(', ')
}

/**
 * Students > Registrations: what parents sent from /register. Approve turns
 * one into a student (with the fee on an invoice); Reject parks it in the
 * Rejected list, where it can be restored or deleted.
 */
export default function RegistrationsTab({ registrations, students, defaultRate }) {
  const [filter, setFilter] = useState('new')
  const [viewing, setViewing] = useState(null)
  const [approving, setApproving] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [notice, setNotice] = useState('')

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const counts = useMemo(() => {
    const c = { new: 0, approved: 0, rejected: 0 }
    ;(registrations || []).forEach((r) => { c[r.status] = (c[r.status] || 0) + 1 })
    return c
  }, [registrations])
  const list = useMemo(() => (registrations || [])
    .filter((r) => r.status === filter)
    .sort((a, b) => submittedMs(b) - submittedMs(a)), [registrations, filter])

  if (!registrations) return <div className="empty-state">Loading registrations…</div>

  const reject = async () => {
    await updateRegistration(rejecting.id, { status: 'rejected', rejectedAt: nowStamp(), rejectNote: rejectNote.trim() })
    setRejecting(null)
    setViewing(null)
    setRejectNote('')
  }
  const restore = (r) => updateRegistration(r.id, { status: 'new', rejectNote: '' })
  const remove = async () => { await deleteRegistration(deleting.id); setDeleting(null); setViewing(null) }

  const actions = (r, inModal = false) => (
    <>
      {!inModal && <button className="btn btn-outline btn-sm" onClick={() => setViewing(r)}>View</button>}
      {r.status === 'new' && <button className="btn btn-accent btn-sm" onClick={() => { setViewing(null); setApproving(r) }}>Approve</button>}
      {r.status === 'new' && <button className="btn btn-outline btn-sm" onClick={() => setRejecting(r)}>Reject</button>}
      {r.status === 'rejected' && <button className="btn btn-outline btn-sm" onClick={() => restore(r)}>Restore</button>}
      {r.status === 'rejected' && <button className="btn btn-danger btn-sm" onClick={() => setDeleting(r)}>Delete</button>}
    </>
  )

  return (
    <>
      <div className="cal-toolbar">
        <div className="cal-toggle" role="group" aria-label="Show registrations">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)}>
              {f.label} ({counts[f.key] || 0})
            </button>
          ))}
        </div>
      </div>
      {notice && <div className="reg-banner match" role="status">{notice}</div>}

      <div className="panel">
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Sent</th><th>Learner</th><th>Grade</th><th>Parent</th><th>Contact</th><th>Lessons</th><th>Fee</th>
                {filter === 'approved' && <th>Student</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const s = studentFromAnswers(r.form, r.answers)
                const fee = pricingFromAnswers(r.form, r.answers).fee
                const linked = r.studentId && studentById.get(r.studentId)
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{submittedLabel(r)}</td>
                    <td><strong>{s.firstName} {s.lastName}</strong></td>
                    <td>{s.grade !== '' ? s.grade : <span className="muted">—</span>}</td>
                    <td>{s.accountable.name} {s.accountable.surname}<div className="muted">{s.accountable.email}</div></td>
                    <td>{s.accountable.contact}</td>
                    <td>{choicesSummary(r) || <span className="muted">—</span>}</td>
                    <td>{fee ? formatCurrency(fee) : <span className="muted">—</span>}</td>
                    {filter === 'approved' && <td>{linked ? `${linked.firstName} ${linked.lastName}` : <span className="muted">Removed</span>}</td>}
                    <td style={{ whiteSpace: 'nowrap' }}>{actions(r)}</td>
                  </tr>
                )
              })}
              {list.length === 0 && (
                <tr><td colSpan={9}><div className="empty-state">
                  {filter === 'new' ? 'No registrations waiting. Share the link from Settings > Register builder.' : `No ${filter} registrations.`}
                </div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewing && (
        <Modal
          title={`Registration: ${studentFromAnswers(viewing.form, viewing.answers).firstName} ${studentFromAnswers(viewing.form, viewing.answers).lastName}`}
          onClose={() => setViewing(null)}
          width={680}
          footer={<><button className="btn btn-outline" onClick={() => setViewing(null)}>Close</button>{actions(viewing, true)}</>}
        >
          <RegistrationDetails registration={viewing} />
        </Modal>
      )}

      {approving && (
        <ApproveModal
          registration={approving}
          students={students}
          defaultRate={defaultRate}
          onClose={() => setApproving(null)}
          onDone={(msg) => { setApproving(null); setNotice(msg) }}
        />
      )}

      {rejecting && (
        <Modal
          title="Reject registration?"
          onClose={() => setRejecting(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setRejecting(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={reject}>Reject</button>
          </>}
        >
          <p>It moves to the Rejected list. You can restore it or delete it from there. The parent isn’t told automatically.</p>
          <div className="field">
            <label>Note (optional, only you see it)</label>
            <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="e.g. Duplicate, sent twice" />
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete registration?"
          onClose={() => setDeleting(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={remove}>Delete for good</button>
          </>}
        >
          <p>This permanently deletes everything the parent sent on this form, including ID number, address and signature. It can’t be undone.</p>
        </Modal>
      )}
    </>
  )
}
