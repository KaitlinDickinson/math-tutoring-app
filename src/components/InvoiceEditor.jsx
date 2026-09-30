import { useMemo, useState } from 'react'
import { addSession, updateSession, deleteSession, updateInvoice } from '../lib/db'
import { buildMonthlyInvoice, formatCurrency, formatDate, monthLabel } from '../lib/helpers'
import Modal from './Modal'

const pad = (n) => String(n).padStart(2, '0')
const num = (v) => Number(v) || 0
let nextKey = 0
const newKey = () => `k${nextKey++}`

// Edits an invoice by changing what it's built from: each lesson's sign-in
// (hours, rate, not billed, removed), new sign-ins for missed or extra
// lessons, and charges/discounts stored on the invoice. Nothing is written
// until "Save changes", and Attendance shows the same edits.
export default function InvoiceEditor({ student, year, month, invoice, sessions, bookings, onClose }) {
  const base = useMemo(
    () => buildMonthlyInvoice(student, sessions, bookings, year, month, invoice?.extraLines),
    [] // built once when the editor opens, so live updates don't reset the form

  )
  const bookingById = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings])

  const [lines, setLines] = useState(() => base.lineItems.map((li) => ({
    ...li, hours: String(li.durationHours), rateInput: String(li.rate), billed: !li.notBilled, remove: false
  })))
  const [missed, setMissed] = useState(() => base.missedSessions.map((m) => ({ ...m, attend: false })))
  const [added, setAdded] = useState([])
  const [extras, setExtras] = useState(() => base.extraLines.map((x) => ({ ...x, key: newKey(), amount: String(x.amount) })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const firstDay = `${year}-${pad(month + 1)}-01`
  const lastDay = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`

  const patchLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const patchAdded = (key, patch) => setAdded((as) => as.map((a) => (a.key === key ? { ...a, ...patch } : a)))
  const patchExtra = (key, patch) => setExtras((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  const total =
    lines.reduce((sum, l) => sum + (l.remove || !l.billed ? 0 : num(l.hours) * num(l.rateInput)), 0) +
    missed.reduce((sum, m) => sum + (m.attend ? m.durationHours * m.rate : 0), 0) +
    added.reduce((sum, a) => sum + num(a.hours) * num(a.rate), 0) +
    extras.reduce((sum, x) => sum + num(x.amount), 0)

  const removing = lines.filter((l) => l.remove).length

  const handleSave = async () => {
    setError('')
    if (added.some((a) => !a.date || a.date < firstDay || a.date > lastDay)) {
      setError(`Added sessions need a date in ${monthLabel(year, month)}.`)
      return
    }
    if (removing > 0 && !window.confirm(
      `Remove ${removing} sign-in${removing > 1 ? 's' : ''}? This also deletes ${removing > 1 ? 'them' : 'it'} from Attendance, including the signature.`
    )) return

    setSaving(true)
    try {
      const writes = []

      lines.forEach((l) => {
        if (!l.sessionId) return
        if (l.remove) { writes.push(deleteSession(l.sessionId)); return }
        const patch = {}
        if (num(l.hours) !== l.durationHours) patch.hoursOverride = num(l.hours)
        if (num(l.rateInput) !== l.rate) patch.rate = num(l.rateInput)
        if (!l.billed !== l.notBilled) patch.notBilled = !l.billed
        if (Object.keys(patch).length) writes.push(updateSession(l.sessionId, patch))
      })

      missed.filter((m) => m.attend).forEach((m) => {
        const booking = bookingById.get(m.bookingId)
        writes.push(addSession({
          studentId: student.id,
          date: m.date,
          checkInTime: new Date(`${m.date}T${booking?.startTime || '12:00'}:00`).toISOString(),
          sessionType: booking?.type || 'individual',
          durationHours: m.durationHours,
          rate: m.rate,
          bookingId: m.bookingId,
          bookingTitle: booking?.title || null,
          manualEntry: true,
          signature: null
        }))
      })

      added.forEach((a) => {
        writes.push(addSession({
          studentId: student.id,
          date: a.date,
          checkInTime: new Date(`${a.date}T12:00:00`).toISOString(),
          sessionType: 'individual',
          durationHours: num(a.hours),
          hoursOverride: num(a.hours),
          rate: num(a.rate),
          bookingId: null,
          bookingTitle: a.label.trim() || null,
          standalone: true, // an extra lesson, never matched to a booking
          manualEntry: true,
          signature: null
        }))
      })

      const cleanExtras = extras
        .filter((x) => x.label.trim() || num(x.amount))
        .map((x) => ({ label: x.label.trim(), amount: num(x.amount) }))
      if (invoice && JSON.stringify(cleanExtras) !== JSON.stringify(base.extraLines)) {
        writes.push(updateInvoice(invoice.id, { extraLines: cleanExtras }))
      }

      await Promise.all(writes)
      onClose()
    } catch (err) {
      setError(`Some changes couldn't be saved (${err.code || err.message}). Please try again.`)
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Edit invoice: ${base.studentName}, ${monthLabel(year, month)}`}
      onClose={onClose}
      width={880}
      footer={<>
        <span className="editor-total">New total: <strong>{formatCurrency(total)}</strong></span>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-accent" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </>}
    >
      <p className="field-hint" style={{ marginTop: 0 }}>
        Changes to hours and rates apply to that one lesson only; the calendar isn't changed.
      </p>

      <div className="table-scroll">
        <table className="ledger editor-table">
          <thead>
            <tr><th>Date</th><th>Session</th><th>Hours</th><th>Rate / hr</th><th>Amount</th><th /></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.sessionId || i} className={l.remove ? 'is-removed' : ''}>
                <td>{formatDate(l.date)}</td>
                <td>{l.label}</td>
                <td><input type="number" min="0" step="0.25" value={l.hours} disabled={l.remove} aria-label="Hours" onChange={(e) => patchLine(i, { hours: e.target.value })} /></td>
                <td><input type="number" min="0" step="0.01" value={l.rateInput} disabled={l.remove} aria-label="Rate per hour" onChange={(e) => patchLine(i, { rateInput: e.target.value })} /></td>
                <td>
                  {l.remove ? <span className="muted">Removed</span>
                    : l.billed ? formatCurrency(num(l.hours) * num(l.rateInput))
                      : <span className="muted">Not billed</span>}
                </td>
                <td className="editor-actions">
                  {!l.remove && (
                    <label className="checkbox-row">
                      <input type="checkbox" checked={!l.billed} onChange={(e) => patchLine(i, { billed: !e.target.checked })} />
                      Don't bill
                    </label>
                  )}
                  <button type="button" className="btn-link" onClick={() => patchLine(i, { remove: !l.remove })}>
                    {l.remove ? 'Undo' : 'Remove'}
                  </button>
                </td>
              </tr>
            ))}

            {missed.map((m, i) => (
              <tr key={`${m.bookingId}-${m.date}`} className={m.attend ? '' : 'is-missed'}>
                <td>{formatDate(m.date)}</td>
                <td>{m.label}{!m.attend && <span className="badge badge-unpaid" style={{ marginLeft: 8 }}>Missed</span>}</td>
                <td>{m.durationHours}</td>
                <td>{formatCurrency(m.rate)}</td>
                <td>{m.attend ? formatCurrency(m.durationHours * m.rate) : <span className="muted">Not billed</span>}</td>
                <td className="editor-actions">
                  <button
                    type="button"
                    className={m.attend ? 'btn-link' : 'btn btn-outline btn-sm'}
                    onClick={() => setMissed((ms) => ms.map((x, j) => (j === i ? { ...x, attend: !x.attend } : x)))}
                  >
                    {m.attend ? 'Undo' : 'Mark as attended'}
                  </button>
                </td>
              </tr>
            ))}

            {added.map((a) => (
              <tr key={a.key} className="is-added">
                <td><input type="date" min={firstDay} max={lastDay} value={a.date} aria-label="Date" onChange={(e) => patchAdded(a.key, { date: e.target.value })} /></td>
                <td><input placeholder="e.g. Extra lesson" value={a.label} aria-label="Description" onChange={(e) => patchAdded(a.key, { label: e.target.value })} /></td>
                <td><input type="number" min="0" step="0.25" value={a.hours} aria-label="Hours" onChange={(e) => patchAdded(a.key, { hours: e.target.value })} /></td>
                <td><input type="number" min="0" step="0.01" value={a.rate} aria-label="Rate per hour" onChange={(e) => patchAdded(a.key, { rate: e.target.value })} /></td>
                <td>{formatCurrency(num(a.hours) * num(a.rate))}</td>
                <td className="editor-actions">
                  <button type="button" className="btn-link" onClick={() => setAdded((as) => as.filter((x) => x.key !== a.key))}>Remove</button>
                </td>
              </tr>
            ))}

            {extras.map((x) => (
              <tr key={x.key} className="is-added">
                <td className="muted">Charge / discount</td>
                <td colSpan={3}><input placeholder="e.g. Workbook, or Sibling discount" value={x.label} aria-label="Charge or discount description" onChange={(e) => patchExtra(x.key, { label: e.target.value })} /></td>
                <td><input type="number" step="0.01" value={x.amount} aria-label="Amount" onChange={(e) => patchExtra(x.key, { amount: e.target.value })} /></td>
                <td className="editor-actions">
                  <button type="button" className="btn-link" onClick={() => setExtras((xs) => xs.filter((y) => y.key !== x.key))}>Remove</button>
                </td>
              </tr>
            ))}

            {lines.length + missed.length + added.length + extras.length === 0 && (
              <tr><td colSpan={6} className="muted">No sessions this month yet. Add one below.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="editor-add">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setAdded((as) => [...as, { key: newKey(), date: firstDay, label: '', hours: '1', rate: String(student.hourlyRate ?? 0) }])}
        >
          + Add session
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={!invoice}
          title={invoice ? undefined : 'Available once the invoice has a billed session'}
          onClick={() => setExtras((xs) => [...xs, { key: newKey(), label: '', amount: '' }])}
        >
          + Add charge or discount
        </button>
        <span className="field-hint">Use a minus amount for a discount, e.g. -100.</span>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 0 }}>{error}</p>}
    </Modal>
  )
}
