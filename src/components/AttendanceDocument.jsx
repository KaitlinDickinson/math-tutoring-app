import {
  formatCurrency, formatDate, sessionHours, sessionLabel, sessionTimeLabel, paymentTimingLabel
} from '../lib/helpers'

// The downloadable attendance register, styled like InvoiceDocument. With one
// student the parent and payment details go in the header; with several they
// become columns so every row still says who it's for.
export default function AttendanceDocument({ sessions, studentOf, bookingFor, settings, period, student }) {
  const billing = settings?.billing || {}
  const hasFrom = billing.businessName || billing.address || billing.contactEmail || billing.contactPhone
  const many = !student
  const totalHours = sessions.reduce((sum, s) => sum + sessionHours(s, bookingFor(s)), 0)
  const parent = (st) => [st?.accountable?.name, st?.accountable?.surname].filter(Boolean).join(' ')
  const payment = (st) => [st?.paymentMethod, paymentTimingLabel(st?.paymentTiming)].filter(Boolean).join(', ')

  return (
    <div className="attendance-doc">
      {settings?.logo && (
        <img src={settings.logo} alt={billing.businessName || 'Company logo'} style={{ display: 'block', maxWidth: 220, maxHeight: 90, marginBottom: 16 }} />
      )}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 2 }}>Attendance register</h2>
        <p className="muted" style={{ margin: 0 }}>{period}</p>
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
        {student && (
          <div style={{ textAlign: hasFrom ? 'right' : 'left' }}>
            <div className="muted">Student</div>
            <strong>{student.firstName} {student.lastName}</strong>
            {student.grade != null && student.grade !== '' && <div className="muted">Grade {student.grade}</div>}
            <div className="muted" style={{ marginTop: 8 }}>Parent / guardian</div>
            <strong>{parent(student) || '—'}</strong>
            {student.accountable?.contact && <div className="muted">{student.accountable.contact}</div>}
            {student.accountable?.email && <div className="muted">{student.accountable.email}</div>}
            <div className="muted" style={{ marginTop: 8 }}>
              {payment(student)}{student.hourlyRate != null && `${payment(student) ? ', ' : ''}${formatCurrency(student.hourlyRate)}/hr`}
            </div>
          </div>
        )}
      </div>

      <table className="ledger attendance-doc-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            {many && <th>Student</th>}
            {many && <th>Parent / guardian</th>}
            {many && <th>Payment</th>}
            <th>Session</th>
            <th>Hours</th>
            <th>Rate</th>
            <th>Signature</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const st = studentOf(s.studentId)
            const booking = bookingFor(s)
            return (
              <tr key={s.id}>
                <td>{formatDate(s.date)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{sessionTimeLabel(s, booking)}</td>
                {many && <td>{st ? `${st.firstName} ${st.lastName}` : 'Unknown student'}</td>}
                {many && (
                  <td>
                    {parent(st)}
                    {st?.accountable?.contact && <div className="muted">{st.accountable.contact}</div>}
                  </td>
                )}
                {many && <td>{payment(st)}</td>}
                <td>
                  {sessionLabel(booking, s.bookingTitle, s.sessionType)}
                  {s.notBilled && <div className="muted">Not billed</div>}
                </td>
                <td>{sessionHours(s, booking)}</td>
                <td>{formatCurrency(s.rate)}</td>
                <td>
                  {s.signature
                    ? <img src={s.signature} alt="Signature" style={{ height: 30, display: 'block' }} />
                    : <span className="muted">{s.manualEntry ? 'Manually added' : '—'}</span>}
                </td>
              </tr>
            )
          })}
          {sessions.length === 0 && (
            <tr><td colSpan={many ? 9 : 6} className="muted">No sessions in {period}.</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ textAlign: 'right', marginTop: 16, fontSize: 16 }}>
        <strong>{sessions.length} session{sessions.length === 1 ? '' : 's'}, {totalHours} hour{totalHours === 1 ? '' : 's'}</strong>
      </div>
    </div>
  )
}
