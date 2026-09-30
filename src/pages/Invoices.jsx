import { useEffect, useMemo, useRef, useState } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import {
  listenStudents, listenSessions, listenBookings, listenInvoices, listenSettings, addInvoice, updateInvoice
} from '../lib/db'
import {
  buildMonthlyInvoice, monthsWithSessions, formatCurrency, monthLabel, exportInvoicesCSV, nowStamp
} from '../lib/helpers'
import InvoiceView from '../components/InvoiceView'
import MarkPaidModal from '../components/MarkPaidModal'
import InvoiceEditor from '../components/InvoiceEditor'

const TABS = [
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'month', label: 'By month' }
]

const keyOf = (studentId, year, month) => `${studentId}-${year}-${month}`

// Fields that come from sessions + bookings; kept in sync on unpaid invoices.
const SYNCED_FIELDS = ['studentName', 'accountable', 'lineItems', 'extraLines', 'sessionCount', 'missedSessions', 'missedCount', 'uncheckedWalkIns', 'total']
const syncedSnapshot = (inv) => JSON.stringify(SYNCED_FIELDS.map((f) => inv[f] ?? null))

export default function Invoices() {
  const [students, setStudents] = useState(null)
  const [sessions, setSessions] = useState(null)
  const [bookings, setBookings] = useState(null)
  const [invoices, setInvoices] = useState(null)
  const [settings, setSettings] = useState({})
  const [tab, setTab] = useState('outstanding')
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [viewing, setViewing] = useState(null)
  const [markingPaid, setMarkingPaid] = useState(null)
  const [editing, setEditing] = useState(null) // { studentId, year, month }
  const creating = useRef(new Set())

  useEffect(() => {
    const u1 = listenStudents(setStudents)
    const u2 = listenSessions(setSessions)
    const u3 = listenInvoices(setInvoices)
    const u4 = listenBookings(setBookings)
    const u5 = listenSettings(setSettings)
    return () => { u1(); u2(); u3(); u4(); u5() }
  }, [])

  const loaded = students && sessions && bookings && invoices
  const studentById = useMemo(() => new Map((students || []).map((s) => [s.id, s])), [students])

  // Saved invoices by student + month. Deleted students' invoices are kept
  // in the database for the record but left out of everything on this page.
  const invoiceByKey = useMemo(() => {
    const map = new Map()
    ;(invoices || []).forEach((inv) => {
      if (!studentById.has(inv.studentId)) return
      const k = keyOf(inv.studentId, inv.year, inv.month)
      if (!map.has(k)) map.set(k, inv)
    })
    return map
  }, [invoices, studentById])

  // What every invoice should say right now, from sign-ins and the calendar:
  // one per student per month with sessions, plus any already-saved invoice.
  const previewByKey = useMemo(() => {
    const map = new Map()
    if (!loaded) return map
    students.forEach((student) => {
      const months = new Set(monthsWithSessions(sessions, student.id).map(([y, m]) => `${y}-${m}`))
      invoiceByKey.forEach((inv) => { if (inv.studentId === student.id) months.add(`${inv.year}-${inv.month}`) })
      months.forEach((ym) => {
        const [y, m] = ym.split('-').map(Number)
        const k = keyOf(student.id, y, m)
        map.set(k, buildMonthlyInvoice(student, sessions, bookings, y, m, invoiceByKey.get(k)?.extraLines))
      })
    })
    return map
  }, [loaded, students, sessions, bookings, invoiceByKey])

  // Every month with signed-in sessions gets an invoice automatically, and
  // unpaid invoices follow any change to sign-ins or the calendar. Paid
  // invoices are never touched.
  useEffect(() => {
    if (!loaded) return
    previewByKey.forEach((preview, k) => {
      const existing = invoiceByKey.get(k)
      if (!existing) {
        if (preview.sessionCount === 0 || creating.current.has(k)) return
        creating.current.add(k)
        addInvoice({ ...preview, accountable: preview.accountable ?? null, status: 'unpaid', generatedAt: nowStamp() })
          .catch(() => creating.current.delete(k))
        return
      }
      if (existing.status === 'paid') return
      if (syncedSnapshot(existing) !== syncedSnapshot(preview)) {
        updateInvoice(existing.id, Object.fromEntries(SYNCED_FIELDS.map((f) => [f, preview[f] ?? null])))
      }
    })
  }, [loaded, previewByKey, invoiceByKey])

  const isCurrentMonth = (inv) => inv.year === today.getFullYear() && inv.month === today.getMonth()

  const outstanding = useMemo(() => {
    const list = [...invoiceByKey.values()]
      .filter((inv) => inv.status !== 'paid' && inv.total > 0)
      .sort((a, b) => (a.year - b.year) || (a.month - b.month) || a.studentName.localeCompare(b.studentName))
    const total = list.reduce((sum, inv) => sum + inv.total, 0)
    const inProgress = list.filter(isCurrentMonth).reduce((sum, inv) => sum + inv.total, 0)
    return { list, total, inProgress }
  }, [invoiceByKey])

  // By month: every student with sessions or missed bookings that month.
  const monthRows = useMemo(() => {
    if (!loaded) return []
    const { year, month } = cursor
    return students
      .map((student) => {
        const k = keyOf(student.id, year, month)
        const invoice = invoiceByKey.get(k)
        const preview = previewByKey.get(k) || buildMonthlyInvoice(student, sessions, bookings, year, month, invoice?.extraLines)
        return { student, invoice, preview }
      })
      .filter((r) => r.invoice || r.preview.sessionCount > 0 || r.preview.missedCount > 0)
      .sort((a, b) => a.preview.studentName.localeCompare(b.preview.studentName))
  }, [loaded, students, sessions, bookings, invoiceByKey, previewByKey, cursor])

  const monthTotals = useMemo(() => {
    let billed = 0
    let paid = 0
    monthRows.forEach(({ invoice }) => {
      if (!invoice) return
      billed += invoice.total
      if (invoice.status === 'paid') paid += invoice.total
    })
    return { billed, paid, unpaid: billed - paid }
  }, [monthRows])

  const shiftMonth = (delta) => setCursor(({ year, month }) => {
    const d = new Date(year, month + delta, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  const handleMarkPaid = async ({ paidDate, paidMethod, amountPaid, paidReference }) => {
    const wasPaid = markingPaid.status === 'paid'
    await updateInvoice(markingPaid.id, { status: 'paid', paidDate, paidMethod, amountPaid, paidReference })
    setMarkingPaid(null)
    if (!wasPaid) setViewing(null) // after an edit, stay on the invoice to see the correction
  }

  // Undo a payment recorded by mistake; the invoice goes back to Outstanding
  // and resumes syncing with sign-ins and the calendar.
  const handleMarkUnpaid = async () => {
    await updateInvoice(markingPaid.id, { status: 'unpaid', paidDate: null, paidMethod: null, amountPaid: null, paidReference: null })
    setMarkingPaid(null)
  }

  // Always show the live saved copy, so the open invoice updates with syncs.
  const liveViewing = viewing && (invoices || []).find((inv) => inv.id === viewing.id)

  const exportRows = tab === 'outstanding'
    ? outstanding.list
    : monthRows.map((r) => r.invoice).filter(Boolean)

  if (!loaded) return <div className="empty-state">Loading…</div>

  return (
    <>
      <div className="content-header" style={{ marginBottom: 14 }}>
        <div>
          <h1>Invoices</h1>
          <p>Built automatically from sign-ins and the calendar. Missed sessions are listed but not billed.</p>
        </div>
        <button className="btn btn-outline" onClick={() => exportInvoicesCSV(exportRows)} disabled={exportRows.length === 0}>
          Export CSV
        </button>
      </div>

      <div className="tab-bar" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'outstanding' && outstanding.list.length > 0 && <span className="tab-count">{outstanding.list.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'outstanding' ? (
        <>
          <div className="owed-summary">
            <div className="owed-label">Total outstanding</div>
            <div className="owed-amount">{formatCurrency(outstanding.total)}</div>
            {outstanding.inProgress > 0 && (
              <div className="owed-note">
                Includes {formatCurrency(outstanding.inProgress)} for {monthLabel(today.getFullYear(), today.getMonth())}, which is still in progress.
              </div>
            )}
          </div>

          <div className="panel">
            <div className="table-scroll">
              <table className="ledger invoice-table">
                <thead>
                  <tr><th>Student</th><th>Month</th><th>Sessions</th><th>Amount</th><th>Waiting</th><th /></tr>
                </thead>
                <tbody>
                  {outstanding.list.map((inv) => (
                    <InvoiceRow
                      key={inv.id}
                      invoice={inv}
                      showMonth
                      waiting={isCurrentMonth(inv) ? null : differenceInCalendarDays(today, new Date(inv.year, inv.month + 1, 0))}
                      onOpen={() => setViewing(inv)}
                      onMarkPaid={() => setMarkingPaid(inv)}
                      onEdit={() => setEditing({ studentId: inv.studentId, year: inv.year, month: inv.month })}
                    />
                  ))}
                  {outstanding.list.length === 0 && (
                    <tr><td colSpan={6}><div className="empty-state">Nobody owes anything right now.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="cal-toolbar">
            <div className="cal-nav">
              <button onClick={() => shiftMonth(-1)} aria-label="Previous month">←</button>
              <span className="cal-label">{monthLabel(cursor.year, cursor.month)}</span>
              <button onClick={() => shiftMonth(1)} aria-label="Next month">→</button>
              <button className="btn btn-outline btn-sm" onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}>This month</button>
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-box"><div className="stat-label">Billed</div><div className="stat-value">{formatCurrency(monthTotals.billed)}</div></div>
            <div className="stat-box"><div className="stat-label">Paid</div><div className="stat-value">{formatCurrency(monthTotals.paid)}</div></div>
            <div className="stat-box"><div className="stat-label">Still owed</div><div className="stat-value">{formatCurrency(monthTotals.unpaid)}</div></div>
          </div>

          <div className="panel">
            <div className="table-scroll">
              <table className="ledger invoice-table">
                <thead>
                  <tr><th>Student</th><th>Sessions</th><th>Amount</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {monthRows.map(({ student, invoice, preview }) => (
                    invoice ? (
                      <InvoiceRow
                        key={student.id}
                        invoice={invoice}
                        showStatus
                        onOpen={() => setViewing(invoice)}
                        onMarkPaid={() => setMarkingPaid(invoice)}
                        onEdit={() => setEditing({ studentId: student.id, year: cursor.year, month: cursor.month })}
                      />
                    ) : (
                      <tr key={student.id} className="invoice-row-empty">
                        <td><strong>{preview.studentName}</strong></td>
                        <td><SessionSummary inv={preview} /></td>
                        <td className="muted">—</td>
                        <td><span className="muted">Nothing to bill</span></td>
                        <td className="row-actions">
                          <EditButton onClick={() => setEditing({ studentId: student.id, year: cursor.year, month: cursor.month })} />
                        </td>
                      </tr>
                    )
                  ))}
                  {monthRows.length === 0 && (
                    <tr><td colSpan={5}><div className="empty-state">No sessions for {monthLabel(cursor.year, cursor.month)}.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {liveViewing && (
        <InvoiceView invoice={liveViewing} settings={settings} onClose={() => setViewing(null)} onMarkPaid={setMarkingPaid} />
      )}
      {markingPaid && (
        <MarkPaidModal
          invoice={markingPaid}
          defaultMethod={studentById.get(markingPaid.studentId)?.paymentMethod}
          onClose={() => setMarkingPaid(null)}
          onConfirm={handleMarkPaid}
          onMarkUnpaid={handleMarkUnpaid}
        />
      )}
      {editing && studentById.get(editing.studentId) && (
        <InvoiceEditor
          student={studentById.get(editing.studentId)}
          year={editing.year}
          month={editing.month}
          invoice={invoiceByKey.get(keyOf(editing.studentId, editing.year, editing.month)) || null}
          sessions={sessions}
          bookings={bookings}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function SessionSummary({ inv }) {
  return (
    <>
      {inv.sessionCount} attended
      {inv.missedCount > 0 && <div className="muted">{inv.missedCount} missed, not billed</div>}
      {inv.uncheckedWalkIns > 0 && (
        <div className="walkin-note">
          {inv.uncheckedWalkIns} walk-in{inv.uncheckedWalkIns > 1 ? 's' : ''}: check length on the calendar
        </div>
      )}
    </>
  )
}

// A whole row opens the invoice; Mark paid works straight from the row.
function EditButton({ onClick }) {
  return (
    <button type="button" className="btn btn-outline btn-sm btn-icon" onClick={onClick} aria-label="Edit invoice" title="Edit invoice">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  )
}

function InvoiceRow({ invoice, showMonth, showStatus, waiting, onOpen, onMarkPaid, onEdit }) {
  const paid = invoice.status === 'paid'
  const inProgress = invoice.year === new Date().getFullYear() && invoice.month === new Date().getMonth()
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }
  return (
    <tr className="invoice-row" onClick={onOpen}>
      <td>
        <button type="button" className="row-link" onClick={stop(onOpen)}>{invoice.studentName}</button>
      </td>
      {showMonth && <td>{monthLabel(invoice.year, invoice.month)}</td>}
      <td><SessionSummary inv={invoice} /></td>
      <td><strong>{formatCurrency(invoice.total)}</strong></td>
      {showStatus && (
        <td>
          {paid
            ? <span className="badge badge-paid"><span className="badge-dot" />Paid</span>
            : <span className="badge badge-unpaid"><span className="badge-dot" />Unpaid</span>}
          {!paid && inProgress && <div className="muted">Month in progress</div>}
        </td>
      )}
      {!showStatus && (
        <td>
          {waiting == null
            ? <span className="in-progress-tag">Month in progress</span>
            : <span className={waiting > 30 ? 'overdue' : ''}>{waiting} {waiting === 1 ? 'day' : 'days'}</span>}
        </td>
      )}
      <td className="row-actions">
        {!paid && <EditButton onClick={stop(onEdit)} />}
        {paid
          ? <button type="button" className="btn btn-outline btn-sm" onClick={stop(onMarkPaid)}>Edit payment</button>
          : <button type="button" className="btn btn-accent btn-sm" onClick={stop(onMarkPaid)}>Mark paid</button>}
        <button type="button" className="btn btn-outline btn-sm" onClick={stop(onOpen)}>Open</button>
      </td>
    </tr>
  )
}
