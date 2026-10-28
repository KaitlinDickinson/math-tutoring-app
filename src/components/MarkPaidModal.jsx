import { useState } from 'react'
import { todayISO, formatCurrency, formatDate, invoicePayments, CREDIT_METHOD } from '../lib/helpers'
import Modal from './Modal'

const METHODS = ['EFT', 'Card', 'Cash']
const round = (n) => Math.round(n * 100) / 100

// Every payment towards an invoice, so a parent can pay in parts. A new
// payment is pre-filled with today, whatever is still owed and the student's
// usual payment method, so the common case is a single "Save payment".
// `creditAvailable` is what the student overpaid on other invoices; it can be
// put towards this one as an "Account credit" payment. Nothing is saved until
// Save, so removing a payment by mistake can be undone with Cancel.
export default function MarkPaidModal({ invoice, defaultMethod, creditAvailable = 0, onClose, onSave }) {
  const [payments, setPayments] = useState(() => invoicePayments(invoice))
  const paidSoFar = round(payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0))
  const creditUsedHere = payments.filter((p) => p.method === CREDIT_METHOD).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const creditLeft = Math.max(0, round(creditAvailable - creditUsedHere))
  const owed = round(invoice.total - paidSoFar)

  const [adding, setAdding] = useState(owed > 0)
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState(METHODS.includes(defaultMethod) ? defaultMethod : 'EFT')
  const [amount, setAmount] = useState(owed > 0 ? String(owed) : '')
  const [reference, setReference] = useState('')

  const newAmount = adding ? round(Number(amount) || 0) : 0
  const afterSave = round(paidSoFar + newAmount)
  const diff = round(afterSave - invoice.total)
  const creditTooHigh = adding && method === CREDIT_METHOD && newAmount > creditLeft
  const methods = creditLeft > 0 || method === CREDIT_METHOD ? [...METHODS, CREDIT_METHOD] : METHODS

  const useCredit = () => {
    setAdding(true)
    setMethod(CREDIT_METHOD)
    setAmount(String(Math.min(creditLeft, Math.max(owed, 0))))
    setReference('')
  }

  const startAdding = () => {
    setAdding(true)
    setAmount(owed > 0 ? String(owed) : '')
  }

  const save = () => {
    const next = newAmount > 0
      ? [...payments, { date, method, amount: newAmount, reference: reference.trim() }]
      : payments
    onSave(next)
  }

  const sorted = payments.map((p, i) => ({ ...p, i })).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <Modal
      title={`Payments for ${invoice.studentName}`}
      onClose={onClose}
      width={600}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-accent" onClick={save} disabled={creditTooHigh}>
          {newAmount > 0 ? 'Save payment' : 'Save changes'}
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
        <strong>Invoice total: {formatCurrency(invoice.total)}</strong>
      </div>

      <h4 style={{ marginBottom: 8 }}>Payments received</h4>
      {sorted.length === 0 ? (
        <p className="muted" style={{ marginBottom: 12 }}>No payments yet.</p>
      ) : (
        <table className="ledger" style={{ marginBottom: 8 }}>
          <thead>
            <tr><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th><th /></tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.i}>
                <td>{formatDate(p.date)}</td>
                <td>{p.method}</td>
                <td>{p.reference || <span className="muted">—</span>}</td>
                <td>{formatCurrency(Number(p.amount) || 0)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ color: 'var(--red)' }}
                    onClick={() => setPayments((list) => list.filter((_, j) => j !== p.i))}
                    aria-label="Remove payment"
                    title="Remove payment"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sorted.length > 0 && (
        <div style={{ textAlign: 'right', marginBottom: 16 }}>
          Paid so far: <strong>{formatCurrency(paidSoFar)}</strong>
          {' · '}
          {owed > 0
            ? <>Still owed: <strong style={{ color: 'var(--red)' }}>{formatCurrency(owed)}</strong></>
            : owed < 0
              ? <>Overpaid: <strong style={{ color: 'var(--accent)' }}>{formatCurrency(-owed)}</strong></>
              : <strong style={{ color: 'var(--accent)' }}>Paid in full</strong>}
        </div>
      )}

      {creditLeft > 0 && owed > 0 && method !== CREDIT_METHOD && (
        <div className="panel" style={{ padding: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <span>{invoice.studentName} has <strong>{formatCurrency(creditLeft)}</strong> credit from overpaying an earlier invoice.</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={useCredit}>Use credit</button>
        </div>
      )}

      {adding ? (
        <>
          <h4 style={{ marginBottom: 8 }}>{sorted.length > 0 ? 'Add another payment' : 'New payment'}</h4>
          <div className="field-row">
            <div className="field">
              <label>Date paid</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Payment method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {methods.map((m) => <option key={m} value={m}>{m}</option>)}
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

          {creditTooHigh && (
            <p style={{ color: 'var(--red)', fontWeight: 600, marginTop: -6 }}>
              Only {formatCurrency(creditLeft)} credit is available.
            </p>
          )}
          {!creditTooHigh && newAmount > 0 && diff !== 0 && (
            <p style={{ color: diff > 0 ? 'var(--accent)' : 'var(--red)', fontWeight: 600, marginTop: -6 }}>
              {diff > 0
                ? `Overpaid by ${formatCurrency(diff)}. This becomes credit for ${invoice.studentName}'s next invoice.`
                : `${formatCurrency(-diff)} will still be owed, and the invoice stays under Outstanding.`}
            </p>
          )}
        </>
      ) : (
        <button type="button" className="btn btn-outline btn-sm" onClick={startAdding}>+ Add a payment</button>
      )}
    </Modal>
  )
}
