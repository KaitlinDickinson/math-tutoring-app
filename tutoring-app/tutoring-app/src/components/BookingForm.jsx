import { useState } from 'react'

const DAYS = [
  { v: 0, l: 'Sun' }, { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' },
  { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }
]

export default function BookingForm({ initial, students, defaultDate, onSubmit, onCancel }) {
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

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const toggleStudent = (id) => {
    setForm((f) => {
      const has = f.studentIds.includes(id)
      const studentIds = has ? f.studentIds.filter((x) => x !== id) : [...f.studentIds, id]
      return { ...f, studentIds }
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
        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #cdd3de', borderRadius: 3 }}>
          {students.map((s) => (
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

      {form.type === 'group' && form.studentIds.length > 0 && (
        <div className="field">
          <label>Rate per hour for each student</label>
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
