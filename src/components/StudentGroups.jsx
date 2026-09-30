import { useEffect, useState } from 'react'
import { listenGroups, addGroup, updateGroup, deleteGroup } from '../lib/db'
import Modal from './Modal'
import GroupForm from './GroupForm'

// Groups tab on the Students page. Students who've since been deleted are
// simply left out of a group's member list.
export default function StudentGroups({ students }) {
  const [groups, setGroups] = useState(null)
  const [modal, setModal] = useState(null) // null | 'add' | group (edit)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => listenGroups(setGroups, (err) => {
    setGroups([])
    setError(err.code === 'permission-denied'
      ? "Groups can't be loaded yet: the updated security rules haven't been published."
      : `Groups couldn't be loaded (${err.code || err.message}).`)
  }), [])

  const studentById = new Map(students.map((s) => [s.id, s]))
  const membersOf = (g) => (g.studentIds || []).map((id) => studentById.get(id)).filter(Boolean)

  const handleSave = async (data) => {
    setError('')
    try {
      if (modal === 'add') await addGroup(data)
      else await updateGroup(modal.id, data)
      setModal(null)
    } catch (err) {
      setError(err.code === 'permission-denied'
        ? "Groups can't be saved yet: the updated security rules haven't been published."
        : `The group couldn't be saved (${err.code || err.message}).`)
      setModal(null)
    }
  }
  const handleDelete = async () => { await deleteGroup(confirmDelete.id); setConfirmDelete(null) }

  return (
    <>
      <div className="attendance-summary">
        <div>Save a set of students once, then add them to a booking in one go.</div>
        <button className="btn btn-accent" onClick={() => setModal('add')}>+ New group</button>
      </div>
      {error && <div className="settings-message error">{error}</div>}

      {groups === null ? (
        <div className="empty-state">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="panel"><div className="empty-state">No groups yet. Create one to speed up group bookings.</div></div>
      ) : (
        <div className="group-grid">
          {groups.map((g) => {
            const members = membersOf(g)
            return (
              <div key={g.id} className="panel group-card">
                <div className="panel-header">
                  <div>
                    <h3>{g.name}</h3>
                    <span className="muted">{members.length} student{members.length === 1 ? '' : 's'}</span>
                  </div>
                  <div style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setModal(g)}>Edit</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(g)}>Delete</button>
                  </div>
                </div>
                <div className="panel-body group-members">
                  {members.length
                    ? members.map((s) => <span key={s.id} className="group-chip">{s.firstName} {s.lastName}</span>)
                    : <span className="muted">No current students in this group.</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <Modal title={modal === 'add' ? 'New group' : `Edit ${modal.name}`} onClose={() => setModal(null)} width={520}>
          <GroupForm initial={modal === 'add' ? null : modal} students={students} onSubmit={handleSave} onCancel={() => setModal(null)} />
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete group?"
          onClose={() => setConfirmDelete(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Delete group</button>
          </>}
        >
          <p>This deletes the group "{confirmDelete.name}". The students themselves, and any bookings made with this group, stay as they are.</p>
        </Modal>
      )}
    </>
  )
}
