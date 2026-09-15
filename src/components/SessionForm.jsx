import { useState } from 'react'
import { todayISO, nowStamp, formatTime } from '../lib/helpers'

export default function SessionForm({ initial, students, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => initial ? {
    studentId: initial.studentId,
    date: initial.date,
    time: formatTime(initial.checkInTime) || '',
    sessionType: initial.sessionType || 'individual',
    durationHours: initial.durationHours ?? 1,
    rate: initial.rate ?? 0
  } : {
    studentId: students[0]?.id || '',
    date: todayISO(),
    time: formatTime(nowStamp()),
    sessionType: 'individual',
    durationHours: 1,
    rate: students[0]?.hourlyRate ?? 0
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // Adding fresh (not editing) — prefill the rate from whoever gets picked,
  // since there's no existing billed rate to preserve yet.
  const setStudent = (id) => {
    setForm((f) => {
      if (initial) return { ...f, studentId: id }
      const st = students.find((s) => s.id === id)
      return { ...f, studentId: id, rate: st?.hourlyRate ?? f.rate }
    })
  }

  const submit = (e) => {
    e.preventDefault()
    const checkInTime = form.time ? new Date(`${form.date}T${form.time}:00`).toISOString() : (initial?.checkInTime || nowStamp())
    const data = {
      studentId: form.studentId,
      date: form.date,
      checkInTime,
      sessionType: form.sessionType,
      durationHours: Number(form.durationHours) || 0,
      rate: Number(form.rate) || 0
    }
    if (!initial) {
      data.manualEntry = true
      data.signature = null
      data.bookingId = null
      data.bookingTitle = null
    }
    onSubmit(data)
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>Student</label>
        <select value={form.studentId} onChange={(e) => setStudent(e.target.value)}>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
          ))}
        </select>
        {initial && <span className="field-hint">Change this if the wrong student signed in.</span>}
      </div>

      <div className="field">
        <label>Session type</label>
        <div className="pill-row">
          <button type="button" className={`pill ${form.sessionType === 'individual' ? 'active' : ''}`} onClick={() => set('sessionType', 'individual')}>Individual</button>
          <button type="button" className={`pill ${form.sessionType === 'group' ? 'active' : ''}`} onClick={() => set('sessionType', 'group')}>Group</button>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Date</label>
          <input type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div className="field">
          <label>Sign-in time</label>
          <input type="time" required value={form.time} onChange={(e) => set('time', e.target.value)} />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Duration (hours)</label>
          <input type="number" min="0" step="0.25" required value={form.durationHours} onChange={(e) => set('durationHours', e.target.value)} />
        </div>
        <div className="field">
          <label>Rate per hour</label>
          <input type="number" min="0" step="0.01" required value={form.rate} onChange={(e) => set('rate', e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-accent">{initial ? 'Save changes' : 'Add attendance'}</button>
      </div>
    </form>
  )
}
