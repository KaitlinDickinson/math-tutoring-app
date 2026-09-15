import { formatCurrency, formatDate, monthLabel } from '../lib/helpers'

export default function InvoiceView({ invoice, onClose, onMarkPaid }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header no-print">
          <h3>Invoice — {invoice.studentName}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body" id="invoice-print-area">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h2 style={{ marginBottom: 2 }}>Invoice</h2>
              <p className="muted">{monthLabel(invoice.year, invoice.month)}</p>
            </div>
            <span className={`badge ${invoice.status === 'paid' ? 'badge-paid' : 'badge-unpaid'}`}>
              <span className="badge-dot" /> {invoice.status === 'paid' ? 'Paid' : 'Unpaid'}
            </span>
          </div>

          <div className="field-row" style={{ marginBottom: 18 }}>
            <div>
              <div className="muted">Billed to</div>
              <strong>{invoice.accountable?.name} {invoice.accountable?.surname}</strong>
              <div className="muted">{invoice.accountable?.email}</div>
              <div className="muted">{invoice.accountable?.contact}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="muted">Student</div>
              <strong>{invoice.studentName}</strong>
            </div>
          </div>

          <table className="ledger">
            <thead>
              <tr><th>Date</th><th>Session</th><th>Hours</th><th>Rate</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((li, i) => (
                <tr key={i}>
                  <td>{formatDate(li.date)}</td>
                  <td>{li.label}</td>
                  <td>{li.durationHours}</td>
                  <td>{formatCurrency(li.rate)}</td>
                  <td>{formatCurrency(li.amount)}</td>
                </tr>
              ))}
              {invoice.lineItems.length === 0 && (
                <tr><td colSpan={5} className="muted">No signed-in sessions recorded this month.</td></tr>
              )}
            </tbody>
          </table>

          <div style={{ textAlign: 'right', marginTop: 16, fontSize: 18 }}>
            <strong>Total: {formatCurrency(invoice.total)}</strong>
          </div>

          {invoice.status === 'paid' && (
            <p className="muted" style={{ marginTop: 10 }}>
              Paid on {formatDate(invoice.paidDate)} via {invoice.paidMethod}
            </p>
          )}
        </div>
        <div className="modal-footer no-print">
          {invoice.status !== 'paid' && (
            <button className="btn btn-accent" onClick={() => onMarkPaid(invoice)}>Mark as paid</button>
          )}
          <button className="btn btn-outline" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>
    </div>
  )
}
