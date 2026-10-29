import { formatCurrency, formatDate, monthLabel, invoiceDueDate, DEFAULT_INVOICE_THANK_YOU, invoicePayments, totalPaid, CREDIT_METHOD } from '../lib/helpers'

// The invoice itself, shared by InvoiceView (real invoices) and the live
// preview on the Settings page so the two never drift apart.
export default function InvoiceDocument({ invoice, settings }) {
  const billing = settings?.billing || {}
  const hasFrom = billing.businessName || billing.address || billing.contactEmail || billing.contactPhone
  const hasBanking = billing.bankName || billing.accountHolder || billing.accountNumber || billing.branchCode
  // Left blank in Settings means no closing line at all.
  const thankYou = (billing.thankYouMessage ?? DEFAULT_INVOICE_THANK_YOU).trim()
  const payments = [...invoicePayments(invoice)].sort((a, b) => a.date.localeCompare(b.date))
  const balance = Math.round((invoice.total - totalPaid(invoice)) * 100) / 100

  return (
    <>
      {settings?.logo && (
        <img src={settings.logo} alt={billing.businessName || 'Company logo'} className="doc-logo" />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>Invoice</h2>
          <p className="muted">{monthLabel(invoice.year, invoice.month)}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          {invoice.invoiceNumber && <div>Invoice no: <strong>{invoice.invoiceNumber}</strong></div>}
          <div>Due date: <strong>{formatDate(invoiceDueDate(invoice.year, invoice.month))}</strong></div>
          {invoice.status === 'paid' && (
            <span className="badge badge-paid" style={{ marginTop: 6 }}><span className="badge-dot" /> Paid</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        {hasFrom && (
          <div>
            <div className="muted">From</div>
            {billing.businessName && <strong>{billing.businessName}</strong>}
            {billing.address && <div className="muted">{billing.address}</div>}
            {billing.contactEmail && <div className="muted">{billing.contactEmail}</div>}
            {billing.contactPhone && <div className="muted">{billing.contactPhone}</div>}
          </div>
        )}
        <div style={{ textAlign: 'right', marginLeft: 'auto' }}>
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
              <td>
                {li.notBilled
                  ? <span className="badge badge-paid"><span className="badge-dot" />Attended — not billed</span>
                  : formatCurrency(li.amount)}
              </td>
            </tr>
          ))}
          {(invoice.bookedLines || []).length > 0 && (
            <tr className="booked-heading">
              <td colSpan={5}>Booked lessons, billed in advance</td>
            </tr>
          )}
          {(invoice.bookedLines || []).map((li, i) => (
            <tr key={`booked-${i}`} className={li.removed ? 'muted' : ''}>
              <td>{formatDate(li.date)}</td>
              <td>{li.label}</td>
              <td>{li.durationHours}</td>
              <td>{formatCurrency(li.rate)}</td>
              <td>
                {li.removed
                  ? <span className="badge badge-unpaid"><span className="badge-dot" />Cancelled — not billed</span>
                  : formatCurrency(li.amount)}
              </td>
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
          {(invoice.extraLines || []).map((x, i) => (
            <tr key={`extra-${i}`}>
              <td />
              <td colSpan={3}>{x.label}</td>
              <td>{formatCurrency(x.amount)}</td>
            </tr>
          ))}
          {invoice.lineItems.length === 0 && (invoice.missedSessions || []).length === 0 && (invoice.bookedLines || []).length === 0 && (
            <tr><td colSpan={5} className="muted">No signed-in sessions recorded this month.</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ textAlign: 'right', marginTop: 16, fontSize: 18 }}>
        <strong>Total: {formatCurrency(invoice.total)}</strong>
      </div>

      {payments.length > 0 && (
        <div style={{ textAlign: 'right', marginTop: 8 }}>
          {payments.map((p, i) => (
            <div key={i} className="muted">
              {p.method === CREDIT_METHOD
                ? `Credit from an earlier overpayment, applied ${formatDate(p.date)}`
                : `Paid ${formatDate(p.date)}${p.method ? ` via ${p.method}` : ''}${p.reference ? ` (ref: ${p.reference})` : ''}`}
              : −{formatCurrency(Number(p.amount) || 0)}
            </div>
          ))}
          <div style={{ marginTop: 6, fontSize: 16, color: balance > 0 ? 'var(--red)' : 'var(--accent)' }}>
            <strong>
              {balance > 0
                ? `Balance due: ${formatCurrency(balance)}`
                : balance < 0
                  ? `In credit: ${formatCurrency(-balance)} (carried to the next invoice)`
                  : 'Paid in full'}
            </strong>
          </div>
        </div>
      )}

      {hasBanking && invoice.status !== 'paid' && (
        <div className="panel" style={{ marginTop: 20, padding: 14 }}>
          <div className="muted" style={{ marginBottom: 6 }}>Payment details</div>
          {billing.bankName && <div>Bank: <strong>{billing.bankName}</strong></div>}
          {billing.accountHolder && <div>Account holder: <strong>{billing.accountHolder}</strong></div>}
          {billing.accountNumber && <div>Account number: <strong>{billing.accountNumber}</strong></div>}
          {billing.branchCode && <div>Branch code: <strong>{billing.branchCode}</strong></div>}
        </div>
      )}

      {thankYou && (
        <p style={{ marginTop: 28, textAlign: 'center', fontStyle: 'italic', whiteSpace: 'pre-line' }}>{thankYou}</p>
      )}
    </>
  )
}
