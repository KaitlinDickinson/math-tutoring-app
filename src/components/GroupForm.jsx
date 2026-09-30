import { useState } from 'react'

// Name a group and tick its students; the list narrows as you search, and
// ticked students stay ticked while you search for the next one.
export default function GroupForm({ initial, students, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [studentIds, setStudentIds] = useState(() => (initial?.studentIds || []).filter((id) => students.some((s) => s.id === id)))
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const visible = [...students]
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
    .filter((s) => !q || `${s.firstName} ${s.lastName}`.toLowerCase().includes(q))

  const toggle = (id) => setStudentIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const allVisibleTicked = visible.length > 0 && visible.every((s) => studentIds.includes(s.id))
  const toggleAllVisible = () => setStudentIds((ids) => (
    allVisibleTicked
      ? ids.filter((id) => !visible.some((s) => s.id === id))
      : [...new Set([...ids, ...visible.map((s) => s.id)])]
  ))

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim() || studentIds.length === 0) return
    onSubmit({ name: name.trim(), studentIds })
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="group-name">Group name</label>
        <input id="group-name" required placeholder="e.g. Tuesday Grade 10s" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field">
        <label>Students in this group <span className="muted">({studentIds.length} selected)</span></label>
        <div className="search-wrap" style={{ marginBottom: 8 }}>
          <span className="search-icon">🔍</span>
          <input
            placeholder="Search students…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
            aria-label="Search students"
          />
        </div>
        <div className="picker-list">
          {visible.length > 1 && (
            <label className="checkbox-row picker-row picker-all">
              <input type="checkbox" checked={allVisibleTicked} onChange={toggleAllVisible} />
              {q ? `Select all ${visible.length} matching` : 'Select all students'}
            </label>
          )}
          {visible.map((s) => (
            <label key={s.id} className="checkbox-row picker-row">
              <input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => toggle(s.id)} />
              {s.firstName} {s.lastName}
              {s.grade != null && s.grade !== '' && <span className="muted">Grade {s.grade}</span>}
            </label>
          ))}
          {visible.length === 0 && <div className="picker-row muted">No students match "{query}"</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-accent" disabled={!name.trim() || studentIds.length === 0}>
          {initial ? 'Save changes' : 'Create group'}
        </button>
      </div>
    </form>
  )
}
