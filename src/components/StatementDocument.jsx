import { formatCurrency, formatDate, DEFAULT_INVOICE_THANK_YOU } from '../lib/helpers'

// A student's account statement, laid out like InvoiceDocument. `statement`
// comes from buildStatement; balances are positive when money is owed.
export default function StatementDocument({ student, statement, period, settings }) {
  const billing = settings?.billing || {}
  const parent = student.accountable || {}
  const hasFrom = billing.businessName || billing.address || billing.contactEmail || billing.contactPhone
  const hasBanking = billing.bankName || billing.accountHolder || billing.accountNumber || billing.branchCode
  const thankYou = (billing.thankYouMessage ?? DEFAULT_INVOICE_THANK_YOU).trim()
  const { openingBalance, rows, totalCharges, totalPayments, closingBalance } = statement
  const owing = closingBalance > 0.005
  const inCredit = closingBalance < -0.005
  const money = (n) => (n ? formatCurrency(n) : '')
  const balance = (n) => (n < -0.005 ? `${formatCurrency(-n)} CR` : formatCurrency(n))

  return (
    <>
      {settings?.logo && (
        <img src={settings.logo} alt={billing.businessName || 'Company logo'} className="doc-logo" />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>Statement</h2>
          <p className="muted">{period}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          Statement date: <strong>{formatDate(new Date())}</strong>
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
          <strong>{parent.name} {parent.surname}</strong>
          <div className="muted">{parent.email}</div>
          <div className="muted">{parent.contact}</div>
          <div className="muted" style={{ marginTop: 8 }}>Student: <strong>{student.firstName} {student.lastName}</strong></div>
        </div>
      </div>

      <table className="ledger">
        <thead>
          <tr><th>Date</th><th>Description</th><th>Charges</th><th>Payments</th><th>Balance</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>{formatDate(statement.startISO)}</td>
            <td><strong>Balance brought forward</strong></td>
            <td /><td />
            <td><strong>{balance(openingBalance)}</strong></td>
          </tr>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{formatDate(r.date)}</td>
              <td>{r.label}</td>
              <td>{money(r.charge)}</td>
              <td>{money(r.payment)}</td>
              <td>{balance(r.balance)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="muted">No lessons or payments in this period.</td></tr>
          )}
          <tr>
            <td />
            <td><strong>Totals for the period</strong></td>
            <td><strong>{formatCurrency(totalCharges)}</strong></td>
            <td><strong>{formatCurrency(totalPayments)}</strong></td>
            <td />
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: 'right', marginTop: 16, fontSize: 18 }}>
        {owing && <strong style={{ color: 'var(--red)' }}>Amount owing: {formatCurrency(closingBalance)}</strong>}
        {inCredit && <strong style={{ color: 'var(--accent)' }}>In credit: {formatCurrency(-closingBalance)}</strong>}
        {!owing && !inCredit && <strong>Account settled – nothing owing</strong>}
      </div>

      {hasBanking && owing && (
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
