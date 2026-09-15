import { useState } from 'react'

const empty = {
  firstName: '', lastName: '', studentContact: '', grade: '',
  accountable: { name: '', surname: '', contact: '', email: '' },
  paymentMethod: 'EFT',
  paymentTiming: 'onDay',
  hourlyRate: ''
}

export default function StudentForm({ initial, defaultRate, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => initial ? { ...empty, ...initial, accountable: { ...empty.accountable, ...initial.accountable } } : { ...empty, hourlyRate: defaultRate || '' })

  const set = (path, value) => {
    setForm((f) => {
      if (path.startsWith('accountable.')) {
        const key = path.split('.')[1]
        return { ...f, accountable: { ...f.accountable, [key]: value } }
      }
      return { ...f, [path]: value }
    })
  }

  const submit = (e) => {
    e.preventDefault()
    onSubmit({ ...form, hourlyRate: Number(form.hourlyRate) || 0, grade: form.grade === '' ? '' : Number(form.grade) })
  }

  return (
    <form onSubmit={submit}>
      <h3 style={{ marginBottom: 12 }}>Student details</h3>
      <div className="field-row">
        <div className="field">
          <label>First name</label>
          <input required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
        </div>
        <div className="field">
          <label>Surname</label>
          <input required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Student contact number</label>
          <input required value={form.studentContact} onChange={(e) => set('studentContact', e.target.value)} />
        </div>
        <div className="field">
          <label>Grade</label>
          <input type="number" min="0" max="12" placeholder="e.g. 10" value={form.grade} onChange={(e) => set('grade', e.target.value)} />
          <span className="field-hint">Bumped up by one automatically each new year.</span>
        </div>
      </div>

      <h3 style={{ margin: '20px 0 12px' }}>Person accountable for account</h3>
      <div className="field-row">
        <div className="field">
          <label>Name</label>
          <input required value={form.accountable.name} onChange={(e) => set('accountable.name', e.target.value)} />
        </div>
        <div className="field">
          <label>Surname</label>
          <input required value={form.accountable.surname} onChange={(e) => set('accountable.surname', e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Contact number</label>
          <input required value={form.accountable.contact} onChange={(e) => set('accountable.contact', e.target.value)} />
        </div>
        <div className="field">
          <label>Email address</label>
          <input required type="email" value={form.accountable.email} onChange={(e) => set('accountable.email', e.target.value)} />
        </div>
      </div>

      <h3 style={{ margin: '20px 0 12px' }}>Billing</h3>
      <div className="field-row">
        <div className="field">
          <label>Payment method</label>
          <select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
            <option value="EFT">EFT</option>
            <option value="Card">Card</option>
          </select>
        </div>
        <div className="field">
          <label>Hourly rate</label>
          <input required type="number" min="0" step="0.01" value={form.hourlyRate} onChange={(e) => set('hourlyRate', e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>When do they pay?</label>
        <select value={form.paymentTiming} onChange={(e) => set('paymentTiming', e.target.value)}>
          <option value="onDay">Pay on the day</option>
          <option value="startOfMonth">Pay at the start of the month</option>
          <option value="endOfMonth">Pay at the end of the month</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-accent">{initial ? 'Save changes' : 'Register student'}</button>
      </div>
    </form>
  )
}
