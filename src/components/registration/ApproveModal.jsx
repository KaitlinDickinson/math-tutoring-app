import { useEffect, useMemo, useState } from 'react'
import { listenInvoices, listenSessions, listenBookings } from '../../lib/db'
import { studentFromAnswers, pricingFromAnswers, findMatches, studentPatch } from '../../lib/registration'
import { approveRegistration, feeInvoiceCheck } from '../../lib/approveRegistration'
import { formatCurrency, monthLabel, todayISO } from '../../lib/helpers'
import Modal from '../Modal'

const METHODS = ['EFT', 'Card', 'Cash']

// "GR 10–11 (R1 500)" -> "GR 10–11": the amount is on the invoice line anyway.
const withoutPrice = (label) => label.replace(/\s*\(\s*R\s?[\d\s.,]+\)\s*/g, ' ').trim()

const fullName = (s) => `${s.firstName || ''} ${s.lastName || ''}`.trim()

function monthChoices() {
  const now = new Date()
  return Array.from({ length: 17 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 2 + i, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
}

/**
 * Approve a registration: check the details, choose new student or update an
 * existing one, and put the registration fee on an invoice, paid or not yet.
 */
export default function ApproveModal({ registration, students, defaultRate, onClose, onDone }) {
  const form = registration.form
  const fromForm = useMemo(() => studentFromAnswers(form, registration.answers), [form, registration])
  const pricing = useMemo(() => pricingFromAnswers(form, registration.answers), [form, registration])
  const matches = useMemo(() => findMatches(fromForm, students), [fromForm, students])
  const learnerMatch = matches.find((m) => m.type === 'learner')
  const parentMatch = !learnerMatch ? matches.find((m) => m.type === 'parent') : null

  const [mode, setMode] = useState(learnerMatch ? 'update' : 'new')
  const [targetId, setTargetId] = useState((learnerMatch || matches[0])?.student.id || '')
  const target = mode === 'update' ? students.find((s) => s.id === targetId) || null : null

  const [invoices, setInvoices] = useState(null)
  const [sessions, setSessions] = useState(null)
  const [bookings, setBookings] = useState(null)
  useEffect(() => {
    const u1 = listenInvoices(setInvoices)
    const u2 = listenSessions(setSessions)
    const u3 = listenBookings(setBookings)
    return () => { u1(); u2(); u3() }
  }, [])

  // Student fields: the form's answers, laid over the existing student's
  // details when updating (blank answers keep what's there).
  const prefill = (student) => {
    const base = student
      ? { ...student, ...studentPatch(student, fromForm), accountable: { ...student.accountable, ...(studentPatch(student, fromForm).accountable || {}) } }
      : fromForm
    const rate = pricing.rate ?? student?.hourlyRate ?? defaultRate ?? ''
    return {
      firstName: base.firstName || '',
      lastName: base.lastName || '',
      studentContact: base.studentContact || '',
      grade: fromForm.grade !== '' ? fromForm.grade : '',
      accountable: { name: '', surname: '', contact: '', email: '', ...base.accountable },
      paymentMethod: student?.paymentMethod || 'EFT',
      paymentTiming: student?.paymentTiming || 'startOfMonth',
      hourlyRate: rate === null ? '' : String(rate)
    }
  }
  const [fields, setFields] = useState(() => prefill(learnerMatch?.student || null))
  useEffect(() => { setFields(prefill(target)) }, [mode, targetId]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setFields((f) => ({ ...f, [k]: v }))
  const setAcc = (k, v) => setFields((f) => ({ ...f, accountable: { ...f.accountable, [k]: v } }))

  const months = useMemo(monthChoices, [])
  const now = new Date()
  const defaultLabel = `Registration ${registration.year}${pricing.feeOptions.length ? ` – ${pricing.feeOptions.map(withoutPrice).join(', ')}` : ''}`
  const [feeLabel, setFeeLabel] = useState(defaultLabel)
  const [feeAmount, setFeeAmount] = useState(pricing.fee ? String(pricing.fee) : '')
  const [feeMonth, setFeeMonth] = useState(`${now.getFullYear()}-${now.getMonth()}`)
  const [paid, setPaid] = useState(false)
  const [payDate, setPayDate] = useState(todayISO())
  const [payMethod, setPayMethod] = useState('EFT')
  const [payAmount, setPayAmount] = useState(pricing.fee ? String(pricing.fee) : '')
  const [payRef, setPayRef] = useState(fullName(fromForm))
  useEffect(() => { if (!paid) setPayAmount(feeAmount) }, [feeAmount, paid])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [fy, fm] = feeMonth.split('-').map(Number)
  const feeNum = Number(feeAmount) || 0
  const invoiceCheck = invoices && feeNum > 0 ? feeInvoiceCheck(invoices, target?.id, fy, fm) : { invoice: null, error: '' }
  const alreadyRegistered = target && (target.registeredYears || []).includes(registration.year)
  const futureYear = registration.year > now.getFullYear()
  const loaded = invoices && sessions && bookings
  const missingCore = !fields.firstName.trim() || !fields.lastName.trim()

  const sortedStudents = useMemo(() => {
    const matchedIds = new Set(matches.map((m) => m.student.id))
    return [...students].sort((a, b) => (matchedIds.has(b.id) - matchedIds.has(a.id)) || fullName(a).localeCompare(fullName(b)))
  }, [students, matches])

  const save = async () => {
    setError('')
    if (mode === 'update' && !target) { setError('Choose which student to update.'); return }
    setSaving(true)
    try {
      await approveRegistration({
        registration,
        studentId: target?.id || null,
        existingStudent: target,
        fields: {
          ...fields,
          firstName: fields.firstName.trim(),
          lastName: fields.lastName.trim(),
          hourlyRate: Number(fields.hourlyRate) || 0,
          grade: fields.grade === '' ? '' : Number(fields.grade)
        },
        fee: { label: feeLabel.trim(), amount: feeNum, year: fy, month: fm },
        payment: paid && feeNum > 0 ? { date: payDate, method: payMethod, amount: Number(payAmount) || 0, reference: payRef.trim() } : null,
        invoices,
        sessions,
        bookings,
        usedNumbers: new Set(invoices.map((inv) => inv.invoiceNumber).filter(Boolean))
      })
      onDone(`${fields.firstName} ${fields.lastName} ${mode === 'update' ? 'updated' : 'added as a student'}${feeNum > 0 ? `, with the ${formatCurrency(feeNum)} fee on ${monthLabel(fy, fm)}’s invoice${paid ? ' (payment recorded)' : ''}` : ''}.`)
    } catch (err) {
      setError(err.message || String(err))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Approve ${fullName(fromForm) || 'registration'}`}
      onClose={onClose}
      width={680}
      footer={<>
        {error && <span className="rb-warn" style={{ flexBasis: '100%' }}>{error}</span>}
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-accent" onClick={save} disabled={saving || !loaded || !!invoiceCheck.error || missingCore}>
          {saving ? 'Saving…' : 'Approve and save'}
        </button>
      </>}
    >
      {learnerMatch && (
        <div className="reg-banner match">This looks like <strong>{fullName(learnerMatch.student)}</strong>{learnerMatch.student.archived ? ' (archived)' : ''}, already a student.</div>
      )}
      {parentMatch && (
        <div className="reg-banner match">Same parent as <strong>{fullName(parentMatch.student)}</strong>. Probably a brother or sister, so this will be added as a new student.</div>
      )}

      <fieldset className="reg-fieldset">
        <legend>Student</legend>
        <div className="reg-choice" style={{ marginTop: 0, marginBottom: 12 }}>
          <label><input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> Create as a new student</label>
          <label><input type="radio" checked={mode === 'update'} onChange={() => { setMode('update'); if (!targetId && sortedStudents[0]) setTargetId(sortedStudents[0].id) }} /> Update an existing student (keeps their invoices and attendance)</label>
        </div>
        {mode === 'update' && (
          <div className="field">
            <label>Student to update</label>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {sortedStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}{s.archived ? ' (archived)' : ''}{matches.some((m) => m.student.id === s.id) ? ' (match)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {alreadyRegistered && <div className="reg-banner warn">{fullName(target)} is already registered for {registration.year}. This may be a duplicate.</div>}
        {target?.archived && <div className="reg-banner warn">{fullName(target)} is archived and will be brought back to the active list.</div>}

        <div className="field-row">
          <div className="field"><label>First name</label><input required value={fields.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
          <div className="field"><label>Surname</label><input required value={fields.lastName} onChange={(e) => set('lastName', e.target.value)} /></div>
        </div>
        <div className="field-row">
          <div className="field"><label>Student contact number</label><input value={fields.studentContact} onChange={(e) => set('studentContact', e.target.value)} /></div>
          <div className="field">
            <label>Grade in {registration.year}</label>
            <input type="number" min="0" max="13" value={fields.grade} onChange={(e) => set('grade', e.target.value)} />
            {futureYear && fields.grade !== '' && (
              <span className="field-hint">
                Applied on 1 January {registration.year}.{target?.grade !== undefined && target?.grade !== '' && target ? ` Stays Grade ${target.grade} until then.` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="field-row">
          <div className="field"><label>Parent name</label><input value={fields.accountable.name} onChange={(e) => setAcc('name', e.target.value)} /></div>
          <div className="field"><label>Parent surname</label><input value={fields.accountable.surname} onChange={(e) => setAcc('surname', e.target.value)} /></div>
        </div>
        <div className="field-row">
          <div className="field"><label>Parent contact number</label><input value={fields.accountable.contact} onChange={(e) => setAcc('contact', e.target.value)} /></div>
          <div className="field"><label>Parent email</label><input type="email" value={fields.accountable.email} onChange={(e) => setAcc('email', e.target.value)} /></div>
        </div>
        <div className="field-row" style={{ flexWrap: 'wrap' }}>
          <div className="field">
            <label>Hourly rate</label>
            <input type="number" min="0" step="0.01" value={fields.hourlyRate} onChange={(e) => set('hourlyRate', e.target.value)} />
            {pricing.rate !== null && <span className="field-hint">From the lesson option they chose.</span>}
          </div>
          <div className="field">
            <label>Payment method</label>
            <select value={fields.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
              <option value="EFT">EFT</option>
              <option value="Card">Card</option>
            </select>
          </div>
          <div className="field">
            <label>When do they pay?</label>
            <select value={fields.paymentTiming} onChange={(e) => set('paymentTiming', e.target.value)}>
              <option value="onDay">Pay on the day</option>
              <option value="startOfMonth">Pay at the start of the month</option>
              <option value="endOfMonth">Pay at the end of the month</option>
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="reg-fieldset">
        <legend>Registration fee</legend>
        <div className="field-row" style={{ flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 2, minWidth: 220 }}><label>Invoice line</label><input value={feeLabel} onChange={(e) => setFeeLabel(e.target.value)} /></div>
          <div className="field" style={{ minWidth: 120 }}><label>Amount</label><input type="number" min="0" step="0.01" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} /></div>
          <div className="field" style={{ minWidth: 160 }}>
            <label>On the invoice for</label>
            <select value={feeMonth} onChange={(e) => setFeeMonth(e.target.value)}>
              {months.map((m) => <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{monthLabel(m.year, m.month)}</option>)}
            </select>
          </div>
        </div>
        {feeNum <= 0 && <p className="muted" style={{ marginTop: 0 }}>No fee: nothing is added to an invoice.</p>}
        {invoiceCheck.error && <div className="reg-banner error">{invoiceCheck.error}</div>}
        {!invoiceCheck.error && invoiceCheck.invoice && feeNum > 0 && (
          <p className="muted" style={{ marginTop: 0 }}>Added to their existing {monthLabel(fy, fm)} invoice{invoiceCheck.invoice.invoiceNumber ? ` (${invoiceCheck.invoice.invoiceNumber})` : ''}.</p>
        )}

        {feeNum > 0 && (
          <>
            <div className="reg-paid-toggle" role="group" aria-label="Has the fee been paid?">
              <button type="button" className={!paid ? 'active' : ''} aria-pressed={!paid} onClick={() => setPaid(false)}>Not paid yet</button>
              <button type="button" className={paid ? 'active' : ''} aria-pressed={paid} onClick={() => setPaid(true)}>Paid</button>
            </div>
            {paid ? (
              <div className="field-row" style={{ flexWrap: 'wrap' }}>
                <div className="field"><label>Date paid</label><input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
                <div className="field">
                  <label>Method</label>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
                </div>
                <div className="field">
                  <label>Amount</label>
                  <input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                  {Number(payAmount) > 0 && Number(payAmount) < feeNum && <span className="field-hint">Part payment: {formatCurrency(feeNum - Number(payAmount))} still owed.</span>}
                </div>
                <div className="field"><label>Reference</label><input value={payRef} onChange={(e) => setPayRef(e.target.value)} /></div>
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>The invoice shows under Invoices &gt; Outstanding until a payment is recorded.</p>
            )}
          </>
        )}
      </fieldset>
      {!loaded && <p className="muted">Loading invoices…</p>}
    </Modal>
  )
}
