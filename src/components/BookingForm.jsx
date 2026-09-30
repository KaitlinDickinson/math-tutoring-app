import { useState } from 'react'

const DAYS = [
  { v: 0, l: 'Sun' }, { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' },
  { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }
]

export default function BookingForm({ initial, students, groups = [], defaultDate, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => initial || {
    type: 'individual',
    title: '',
    startTime: '10:00',
    endTime: '11:00',
    startDate: defaultDate,
    endDate: defaultDate,
    repeat: 'none',
    daysOfWeek: [],
    studentIds: [],
    ratesOverride: {}
  })

  const [query, setQuery] = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const q = query.trim().toLowerCase()
  const visibleStudents = q
    ? students.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q))
    : students

  const toggleStudent = (id) => {
    setForm((f) => {
      const has = f.studentIds.includes(id)
      const studentIds = has ? f.studentIds.filter((x) => x !== id) : [...f.studentIds, id]
      return { ...f, studentIds }
    })
  }

  // Ticks every (still registered) student in the group, keeping anyone
  // already ticked. More than one student makes it a group lesson.
  const addGroupStudents = (groupId) => {
    const group = groups.find((g) => g.id === groupId)
    if (!group) return
    const memberIds = (group.studentIds || []).filter((id) => students.some((s) => s.id === id))
    setForm((f) => {
      const studentIds = [...new Set([...f.studentIds, ...memberIds])]
      return { ...f, type: studentIds.length > 1 ? 'group' : f.type, studentIds }
    })
  }

  const toggleDay = (v) => {
    setForm((f) => {
      const has = f.daysOfWeek.includes(v)
      return { ...f, daysOfWeek: has ? f.daysOfWeek.filter((x) => x !== v) : [...f.daysOfWeek, v] }
    })
  }

  const setRateOverride = (studentId, rate) => {
    setForm((f) => ({ ...f, ratesOverride: { ...f.ratesOverride, [studentId]: Number(rate) || 0 } }))
  }

  const submit = (e) => {
    e.preventDefault()
    if (form.studentIds.length === 0) return
    onSubmit(form)
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>Session type</label>
        <div className="pill-row">
          <button type="button" className={`pill ${form.type === 'individual' ? 'active' : ''}`} onClick={() => set('type', 'individual')}>Individual lesson</button>
          <button type="button" className={`pill ${form.type === 'group' ? 'active' : ''}`} onClick={() => set('type', 'group')}>Group lesson</button>
        </div>
      </div>

      <div className="field">
        <label>Title (optional)</label>
        <input placeholder="e.g. Grade 10 Algebra" value={form.title} onChange={(e) => set('title', e.target.value)} />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Start time</label>
          <input type="time" required value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
        </div>
        <div className="field">
          <label>End time</label>
          <input type="time" required value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Start date</label>
          <input type="date" required value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </div>
        <div className="field">
          <label>End date</label>
          <input type="date" required value={form.endDate} min={form.startDate} onChange={(e) => set('endDate', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>Repeat</label>
        <select value={form.repeat} onChange={(e) => set('repeat', e.target.value)}>
          <option value="none">Doesn't repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly on selected days</option>
        </select>
      </div>

      {form.repeat === 'weekly' && (
        <div className="field">
          <label>Repeat on</label>
          <div className="pill-row">
            {DAYS.map((d) => (
              <button type="button" key={d.v} className={`pill ${form.daysOfWeek.includes(d.v) ? 'active' : ''}`} onClick={() => toggleDay(d.v)}>{d.l}</button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label>{form.type === 'group' ? 'Students in this group' : 'Student'}</label>
        {groups.length > 0 && (
          <div className="group-add-row">
            <select value="" onChange={(e) => addGroupStudents(e.target.value)} aria-label="Add a saved group">
              <option value="">Add a saved group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({(g.studentIds || []).filter((id) => students.some((s) => s.id === id)).length})</option>
              ))}
            </select>
            {form.studentIds.length > 0 && <span className="muted">{form.studentIds.length} selected</span>}
          </div>
        )}
        <div className="search-wrap" style={{ marginBottom: 8 }}>
          <span className="search-icon">🔍</span>
          <input
            placeholder="Search students…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
          />
        </div>
        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #cdd3de', borderRadius: 3 }}>
          {visibleStudents.length === 0 && (
            <div style={{ padding: '9px 12px', fontSize: 14, color: '#6b7280' }}>No students match "{query}"</div>
          )}
          {visibleStudents.map((s) => (
            <label key={s.id} className="checkbox-row" style={{ padding: '9px 12px', borderBottom: '1px solid #eef0eb' }}>
              <input
                type={form.type === 'group' ? 'checkbox' : 'radio'}
                name="studentPick"
                checked={form.studentIds.includes(s.id)}
                onChange={() => form.type === 'group' ? toggleStudent(s.id) : set('studentIds', [s.id])}
              />
              {s.firstName} {s.lastName}
            </label>
          ))}
        </div>
      </div>

      {form.studentIds.length > 0 && (
        <div className="field">
          <label>{form.type === 'group' ? 'Rate per hour for each student' : 'Rate per hour'}</label>
          {form.studentIds.map((id) => {
            const s = students.find((st) => st.id === id)
            return (
              <div key={id} className="field-row" style={{ marginBottom: 8, alignItems: 'center' }}>
                <span style={{ flex: 1, fontSize: 14 }}>{s?.firstName} {s?.lastName}</span>
                <input
                  type="number" min="0" step="0.01" style={{ maxWidth: 110 }}
                  value={form.ratesOverride[id] ?? s?.hourlyRate ?? ''}
                  onChange={(e) => setRateOverride(id, e.target.value)}
                />
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-accent" disabled={form.studentIds.length === 0}>{initial ? 'Save changes' : 'Add booking'}</button>
      </div>
    </form>
  )
}
