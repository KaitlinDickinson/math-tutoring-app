import { useEffect, useMemo, useState } from 'react'
import {
  listenStudents, listenSessions, listenBookings, listenInvoices, listenSettings, addInvoice, updateInvoice
} from '../lib/db'
import { buildMonthlyInvoice, formatCurrency, monthLabel, exportInvoicesCSV, nowStamp } from '../lib/helpers'
import InvoiceView from '../components/InvoiceView'
import MarkPaidModal from '../components/MarkPaidModal'

const now = new Date()

export default function Invoices() {
  const [students, setStudents] = useState([])
  const [sessions, setSessions] = useState([])
  const [bookings, setBookings] = useState([])
  const [invoices, setInvoices] = useState([])
  const [settings, setSettings] = useState({})
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [viewing, setViewing] = useState(null)
  const [markingPaid, setMarkingPaid] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    const u1 = listenStudents(setStudents)
    const u2 = listenSessions(setSessions)
    const u3 = listenInvoices(setInvoices)
    const u4 = listenBookings(setBookings)
    const u5 = listenSettings(setSettings)
    return () => { u1(); u2(); u3(); u4(); u5() }
  }, [])

  // One row per student for the selected month: existing invoice, or a live preview built from sign-ins
  const rows = useMemo(() => {
    return students.map((student) => {
      const existing = invoices.find((inv) => inv.studentId === student.id && inv.year === year && inv.month === month)
      const preview = buildMonthlyInvoice(student, sessions, bookings, year, month)
      return { student, existing, preview }
    }).filter((r) => r.existing || r.preview.sessionCount > 0 || r.preview.missedCount > 0)
  }, [students, sessions, bookings, invoices, year, month])

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows
    return rows.filter((r) => (r.existing?.status || 'unbilled') === statusFilter)
  }, [rows, statusFilter])

  const generate = async (row) => {
    const inv = { ...row.preview, status: 'unpaid', generatedAt: nowStamp() }
    if (row.existing) {
      await updateInvoice(row.existing.id, inv)
    } else {
      await addInvoice(inv)
    }
  }

  // Keep already-generated (unpaid) invoices in sync with new sign-ins automatically —
  // no manual "Refresh" needed. Stops once an invoice is marked paid.
  useEffect(() => {
    rows.forEach((row) => {
      const { existing, preview } = row
      if (!existing || existing.status === 'paid') return
      const changed = existing.sessionCount !== preview.sessionCount
        || existing.total !== preview.total
        || (existing.missedCount || 0) !== preview.missedCount
        || JSON.stringify(existing.lineItems) !== JSON.stringify(preview.lineItems)
        || JSON.stringify(existing.missedSessions || []) !== JSON.stringify(preview.missedSessions)
      if (changed) {
        updateInvoice(existing.id, { ...preview, status: existing.status })
      }
    })
  }, [rows])

  const handleMarkPaid = async ({ paidDate, paidMethod, amountPaid, paidReference }) => {
    await updateInvoice(markingPaid.id, { status: 'paid', paidDate, paidMethod, amountPaid, paidReference })
    setMarkingPaid(null)
    setViewing(null)
  }

  const totals = useMemo(() => {
    const unpaid = invoices.filter((i) => i.year === year && i.month === month && i.status === 'unpaid')
    const paid = invoices.filter((i) => i.year === year && i.month === month && i.status === 'paid')
    return {
      unpaidTotal: unpaid.reduce((s, i) => s + i.total, 0),
      paidTotal: paid.reduce((s, i) => s + i.total, 0)
    }
  }, [invoices, year, month])

  return (
    <>
      <div className="content-header">
        <div>
          <h1>Invoices</h1>
          <p>Generated from signed-in sessions each month.</p>
        </div>
        <button className="btn btn-outline" onClick={() => exportInvoicesCSV(invoices.filter((i) => i.year === year && i.month === month))}>
          Export CSV
        </button>
      </div>

      <div className="cal-toolbar">
        <div className="cal-nav">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i} value={i}>{monthLabel(year, i).split(' ')[0]}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="pill-row">
          {['all', 'unbilled', 'unpaid', 'paid'].map((f) => (
            <button key={f} className={`pill ${statusFilter === f ? 'active' : ''}`} onClick={() => setStatusFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-box"><div className="stat-label">Unpaid this month</div><div className="stat-value">{formatCurrency(totals.unpaidTotal)}</div></div>
        <div className="stat-box"><div className="stat-label">Paid this month</div><div className="stat-value">{formatCurrency(totals.paidTotal)}</div></div>
      </div>

      <div className="panel">
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr><th>Student</th><th>Sessions signed in</th><th>Total</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const active = row.existing
                const sessionCount = active ? active.sessionCount : row.preview.sessionCount
                const missedCount = active ? (active.missedCount || 0) : row.preview.missedCount
                const total = active ? active.total : row.preview.total
                const status = active?.status
                return (
                  <tr key={row.student.id}>
                    <td><strong>{row.student.firstName} {row.student.lastName}</strong></td>
                    <td>
                      {sessionCount}
                      {missedCount > 0 && (
                        <div className="muted" style={{ fontSize: 12 }}>+{missedCount} missed (not billed)</div>
                      )}
                    </td>
                    <td>{formatCurrency(total)}</td>
                    <td>
                      {status === 'paid' && <span className="badge badge-paid"><span className="badge-dot" />Paid</span>}
                      {status === 'unpaid' && <span className="badge badge-unpaid"><span className="badge-dot" />Unpaid</span>}
                      {!status && <span className="muted">Not yet invoiced</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {!active && <button className="btn btn-accent btn-sm" onClick={() => generate(row)}>Generate invoice</button>}
                      {active && (
                        <>
                          <button className="btn btn-outline btn-sm" onClick={() => setViewing(active)}>View / Download</button>
                          {active.status !== 'paid' && (
                            <>{' '}<button className="btn btn-accent btn-sm" onClick={() => setMarkingPaid(active)}>Mark paid</button></>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filteredRows.length === 0 && (
                <tr><td colSpan={5}><div className="empty-state">No sessions found for this month yet.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewing && (
        <InvoiceView invoice={viewing} settings={settings} onClose={() => setViewing(null)} onMarkPaid={setMarkingPaid} />
      )}
      {markingPaid && (
        <MarkPaidModal invoice={markingPaid} onClose={() => setMarkingPaid(null)} onConfirm={handleMarkPaid} />
      )}
    </>
  )
}
