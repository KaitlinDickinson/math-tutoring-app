import { useState } from 'react'
import { todayISO, formatCurrency, formatDate } from '../lib/helpers'
import Modal from './Modal'

const METHODS = ['EFT', 'Card', 'Cash']

// New payments are pre-filled with today, the full amount and the student's
// usual payment method, so the common case is a single "Confirm paid".
// For an invoice that's already paid, the form opens with what was recorded
// so mistakes can be corrected, or the payment undone with "Mark as unpaid".
export default function MarkPaidModal({ invoice, defaultMethod, onClose, onConfirm, onMarkUnpaid }) {
  const editing = invoice.status === 'paid'
  const [date, setDate] = useState(editing && invoice.paidDate ? invoice.paidDate : todayISO())
  const [method, setMethod] = useState(() => {
    const m = editing ? invoice.paidMethod : defaultMethod
    return METHODS.includes(m) ? m : 'EFT'
  })
  const [amount, setAmount] = useState(String(editing ? (invoice.amountPaid ?? invoice.total) : invoice.total))
  const [reference, setReference] = useState(editing ? invoice.paidReference || '' : '')
  const [confirmUnpaid, setConfirmUnpaid] = useState(false)

  const amountPaid = Number(amount) || 0
  const diff = amountPaid - invoice.total

  if (confirmUnpaid) {
    return (
      <Modal
        title="Mark as unpaid?"
        onClose={() => setConfirmUnpaid(false)}
        footer={<>
          <button className="btn btn-outline" onClick={() => setConfirmUnpaid(false)}>Keep as paid</button>
          <button className="btn btn-danger" onClick={onMarkUnpaid}>Mark as unpaid</button>
        </>}
      >
        <p>
          This removes the payment recorded for {invoice.studentName}'s invoice and moves it back to Outstanding.
          It will also update again from sign-ins and the calendar.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title={editing ? `Edit payment for ${invoice.studentName}` : `Mark ${invoice.studentName}'s invoice as paid`}
      onClose={onClose}
      width={560}
      footer={<>
        {editing && onMarkUnpaid && (
          <button className="btn btn-outline" style={{ color: 'var(--red)', marginRight: 'auto' }} onClick={() => setConfirmUnpaid(true)}>
            Mark as unpaid
          </button>
        )}
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-accent"
          onClick={() => onConfirm({ paidDate: date, paidMethod: method, amountPaid, paidReference: reference })}
        >
          {editing ? 'Save changes' : 'Confirm paid'}
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
              <td>{li.notBilled ? 'Not billed' : formatCurrency(li.amount)}</td>
            </tr>
          ))}
          {(invoice.extraLines || []).map((x, i) => (
            <tr key={`extra-${i}`}>
              <td />
              <td>{x.label}</td>
              <td>{formatCurrency(x.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ textAlign: 'right', marginBottom: 16 }}>
        <strong>{editing ? 'Invoice total' : 'Total outstanding'}: {formatCurrency(invoice.total)}</strong>
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
