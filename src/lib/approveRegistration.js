import { addStudent, updateStudentFromRegistration, addNumberedInvoice, updateInvoice, updateRegistration } from './db'
import { buildMonthlyInvoice, invoicePayments, paymentFields, nowStamp, monthLabel } from './helpers'
import { gradeFields } from './registration'

const round = (n) => Math.round(n * 100) / 100

/** The invoice a registration fee would go on, and whether it can. */
export function feeInvoiceCheck(invoices, studentId, year, month) {
  const invoice = studentId ? (invoices || []).find((inv) => inv.studentId === studentId && inv.year === year && inv.month === month) : null
  if (invoice && invoice.status === 'paid') {
    return { invoice, error: `${monthLabel(year, month)}’s invoice${invoice.invoiceNumber ? ` (${invoice.invoiceNumber})` : ''} is already paid. Choose another month for the registration fee.` }
  }
  return { invoice, error: '' }
}

/**
 * Approves a registration:
 * 1. creates the student, or updates `studentId` (history untouched),
 * 2. adds the fee as an extra line on that month's invoice (creating and
 *    numbering it if needed), with the payment if one was taken,
 * 3. marks the registration approved.
 *
 * `fields`: the student fields as checked in the pop-up. `fee`: { label,
 * amount, year, month }. `payment`: { date, method, amount, reference } or
 * null. Refuses to touch an invoice that's already paid.
 */
export async function approveRegistration({
  registration, studentId, existingStudent, fields, fee, payment, invoices, sessions, bookings, usedNumbers
}) {
  const formYear = registration.year
  const amount = round(Number(fee?.amount) || 0)
  const { invoice: existingInvoice, error } = amount > 0 ? feeInvoiceCheck(invoices, studentId, fee.year, fee.month) : { invoice: null, error: '' }
  if (error) throw new Error(error)

  const { grade, ...rest } = fields
  const grades = gradeFields(grade, formYear, new Date().getFullYear())
  const studentData = { ...rest, ...grades, archived: false }

  let id = studentId
  if (id) {
    await updateStudentFromRegistration(id, studentData, formYear, registration.id)
  } else {
    const ref = await addStudent({
      ...studentData,
      grade: grades.grade ?? '',
      registeredYears: [formYear],
      registrationIds: [registration.id]
    })
    id = ref.id
  }

  let invoiceId = null
  if (amount > 0) {
    const line = { label: fee.label || `Registration ${formYear}`, amount }
    const newPayments = payment && Number(payment.amount) > 0 ? [{ ...payment, amount: round(Number(payment.amount)) }] : []
    if (existingInvoice) {
      const total = round(existingInvoice.total + amount)
      const payments = [...invoicePayments(existingInvoice), ...newPayments]
      await updateInvoice(existingInvoice.id, {
        extraLines: [...(existingInvoice.extraLines || []), line],
        total,
        ...(payments.length ? paymentFields(payments, total) : {})
      })
      invoiceId = existingInvoice.id
    } else {
      const student = { ...(existingStudent || {}), ...studentData, id }
      const preview = buildMonthlyInvoice(student, sessions || [], bookings || [], fee.year, fee.month, { extraLines: [line] })
      invoiceId = await addNumberedInvoice({
        ...preview,
        accountable: preview.accountable ?? null,
        status: 'unpaid',
        generatedAt: nowStamp(),
        ...(newPayments.length ? paymentFields(newPayments, preview.total) : {})
      }, usedNumbers)
    }
  }

  await updateRegistration(registration.id, { status: 'approved', studentId: id, invoiceId, approvedAt: nowStamp() })
  return { studentId: id, invoiceId }
}
