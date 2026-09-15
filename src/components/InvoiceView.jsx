import { formatCurrency, formatDate, monthLabel } from '../lib/helpers'

export default function InvoiceView({ invoice, settings, onClose, onMarkPaid }) {
  const billing = settings?.billing || {}
  const hasFrom = billing.businessName || billing.address || billing.contactEmail || billing.contactPhone
  const hasBanking = billing.bankName || billing.accountHolder || billing.accountNumber || billing.branchCode

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
            {hasFrom && (
              <div>
                <div className="muted">From</div>
                {billing.businessName && <strong>{billing.businessName}</strong>}
                {billing.address && <div className="muted">{billing.address}</div>}
                {billing.contactEmail && <div className="muted">{billing.contactEmail}</div>}
                {billing.contactPhone && <div className="muted">{billing.contactPhone}</div>}
              </div>
            )}
            <div style={{ textAlign: hasFrom ? 'right' : 'left' }}>
              <div className="muted">Billed to</div>
              <strong>{invoice.accountable?.name} {invoice.accountable?.surname}</strong>
              <div className="muted">{invoice.accountable?.email}</div>
              <div className="muted">{invoice.accountable?.contact}</div>
              <div className="muted" style={{ marginTop: 8 }}>Student: <strong>{invoice.studentName}</strong></div>
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
              {(invoice.missedSessions || []).map((li, i) => (
                <tr key={`missed-${i}`} className="muted">
                  <td>{formatDate(li.date)}</td>
                  <td>{li.label}</td>
                  <td>{li.durationHours}</td>
                  <td>{formatCurrency(li.rate)}</td>
                  <td><span className="badge badge-unpaid"><span className="badge-dot" />Missed — not billed</span></td>
                </tr>
              ))}
              {invoice.lineItems.length === 0 && (invoice.missedSessions || []).length === 0 && (
                <tr><td colSpan={5} className="muted">No signed-in sessions recorded this month.</td></tr>
              )}
            </tbody>
          </table>

          <div style={{ textAlign: 'right', marginTop: 16, fontSize: 18 }}>
            <strong>Total: {formatCurrency(invoice.total)}</strong>
          </div>

          {hasBanking && invoice.status !== 'paid' && (
            <div className="panel" style={{ marginTop: 20, padding: 14 }}>
              <div className="muted" style={{ marginBottom: 6 }}>Payment details</div>
              {billing.bankName && <div>Bank: <strong>{billing.bankName}</strong></div>}
              {billing.accountHolder && <div>Account holder: <strong>{billing.accountHolder}</strong></div>}
              {billing.accountNumber && <div>Account number: <strong>{billing.accountNumber}</strong></div>}
              {billing.branchCode && <div>Branch code: <strong>{billing.branchCode}</strong></div>}
            </div>
          )}

          {invoice.status === 'paid' && (
            <p className="muted" style={{ marginTop: 10 }}>
              Paid {formatCurrency(invoice.amountPaid ?? invoice.total)} on {formatDate(invoice.paidDate)} via {invoice.paidMethod}
              {invoice.paidReference ? ` (ref: ${invoice.paidReference})` : ''}
              {invoice.amountPaid != null && invoice.amountPaid !== invoice.total && (
                <span style={{ color: invoice.amountPaid > invoice.total ? 'var(--accent)' : 'var(--red)', fontWeight: 600 }}>
                  {' — '}
                  {invoice.amountPaid > invoice.total
                    ? `overpaid by ${formatCurrency(invoice.amountPaid - invoice.total)}`
                    : `underpaid by ${formatCurrency(invoice.total - invoice.amountPaid)}`}
                </span>
              )}
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
