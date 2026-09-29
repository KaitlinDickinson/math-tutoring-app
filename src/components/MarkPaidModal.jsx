import { useState } from 'react'
import { todayISO, formatCurrency, formatDate } from '../lib/helpers'
import Modal from './Modal'

const METHODS = ['EFT', 'Card', 'Cash']

// Pre-filled with today, the full amount and the student's usual payment
// method, so the common case is a single "Confirm paid".
export default function MarkPaidModal({ invoice, defaultMethod, onClose, onConfirm }) {
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState(METHODS.includes(defaultMethod) ? defaultMethod : 'EFT')
  const [amount, setAmount] = useState(String(invoice.total))
  const [reference, setReference] = useState('')

  const amountPaid = Number(amount) || 0
  const diff = amountPaid - invoice.total

  return (
    <Modal
      title={`Mark ${invoice.studentName}'s invoice as paid`}
      onClose={onClose}
      width={560}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-accent"
          onClick={() => onConfirm({ paidDate: date, paidMethod: method, amountPaid, paidReference: reference })}
        >
          Confirm paid
        </button>
      </>}
    >
      <table className="ledger" style={{ marginBottom: 12 }}>
        <thead>
          <tr><th>Date</th><th>Session</th><th>Amount</th></tr>
        </thead>
        <tbody>
          {invoice.lineItems.map((li, i) => (
            <tr key={i}>
              <td>{formatDate(li.date)}</td>
              <td>{li.label}</td>
              <td>{formatCurrency(li.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ textAlign: 'right', marginBottom: 16 }}>
        <strong>Total outstanding: {formatCurrency(invoice.total)}</strong>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Date paid</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Payment method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Amount paid</label>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Reference</label>
          <input placeholder="e.g. EFT ref, receipt #" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>

      {diff !== 0 && (
        <p style={{ color: diff > 0 ? 'var(--accent)' : 'var(--red)', fontWeight: 600, marginTop: -6 }}>
          {diff > 0
            ? `Overpaid by ${formatCurrency(diff)}`
            : `Underpaid by ${formatCurrency(-diff)}`}
        </p>
      )}
    </Modal>
  )
}
