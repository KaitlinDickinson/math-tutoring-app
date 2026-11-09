import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMonthlyInvoice, lockedInvoice, sameSynced } from './helpers.js'

const student = { id: 'st1', firstName: 'Zoey', lastName: 'Lee', hourlyRate: 100 }
const booking = {
  id: 'bk1', studentIds: ['st1'], type: 'group', title: 'Graad 9',
  startTime: '15:00', endTime: '17:00', repeat: 'none', startDate: '2026-08-31', endDate: '2026-08-31'
}
const session = (id, date, extra = {}) => ({ id, studentId: 'st1', date, rate: 100, durationHours: 2, ...extra })

// The August invoice as it was paid: only 31 Aug, R200, R500 paid.
const paidAugust = (sessions, bookings) => ({
  ...buildMonthlyInvoice(student, sessions, bookings, 2026, 7),
  id: 'inv1', status: 'paid',
  payments: [{ date: '2026-08-25', method: 'EFT', amount: 500, reference: '' }]
})

test('sign-ins added after payment are billed on a locked invoice', () => {
  const before = [session('s31', '2026-08-31', { bookingId: 'bk1' })]
  const existing = paidAugust(before, [booking])
  const after = [...before, session('s03', '2026-08-03', { hoursOverride: 2 }), session('s06', '2026-08-06', { hoursOverride: 1.75 })]
  const preview = buildMonthlyInvoice(student, after, [booking], 2026, 7, existing)

  const locked = lockedInvoice(existing, preview, after, [booking])
  assert.deepEqual(locked.lineItems.map((l) => l.date), ['2026-08-03', '2026-08-06', '2026-08-31'])
  assert.equal(locked.total, 575)
  assert.equal(locked.sessionCount, 3)
  assert.equal(locked.added, 2)
  assert.equal(locked.removed, 0)
})

test('a later calendar change does not rewrite lessons already billed', () => {
  const sessions = [session('s31', '2026-08-31', { bookingId: 'bk1' })]
  const existing = paidAugust(sessions, [booking])
  const longer = { ...booking, endTime: '18:00', title: 'Renamed' }
  const preview = buildMonthlyInvoice(student, sessions, [longer], 2026, 7, existing)
  assert.equal(preview.total, 300) // the unlocked preview would follow the calendar

  const locked = lockedInvoice(existing, preview, sessions, [longer])
  assert.equal(locked.total, 200)
  assert.equal(locked.lineItems[0].label, 'Graad 9')
  assert.equal(locked.added, 0)
  assert.ok(sameSynced(existing, locked))
})

test('hours set by hand on a sign-in still change a locked line', () => {
  const sessions = [session('s31', '2026-08-31', { bookingId: 'bk1' })]
  const existing = paidAugust(sessions, [booking])
  const edited = [session('s31', '2026-08-31', { bookingId: 'bk1', hoursOverride: 1 })]
  const preview = buildMonthlyInvoice(student, edited, [booking], 2026, 7, existing)
  assert.equal(lockedInvoice(existing, preview, edited, [booking]).total, 100)
})

test('a rate change after payment does not rewrite a billed lesson', () => {
  const sessions = [session('s31', '2026-08-31', { bookingId: 'bk1' })]
  const existing = paidAugust(sessions, [booking])
  const recreated = [session('s31', '2026-08-31', { bookingId: 'bk1', rate: 300 })]
  const preview = buildMonthlyInvoice(student, recreated, [booking], 2026, 7, existing)
  assert.equal(lockedInvoice(existing, preview, recreated, [booking]).total, 200)
})

test('same-day lessons keep the order they were billed in', () => {
  const sessions = [session('a', '2026-08-30', { hoursOverride: 2 }), session('b', '2026-08-30', { hoursOverride: 2.5 })]
  const existing = paidAugust(sessions, [])
  const preview = buildMonthlyInvoice(student, [...sessions].reverse(), [], 2026, 7, existing)
  const locked = lockedInvoice(existing, preview, sessions, [])
  assert.deepEqual(locked.lineItems.map((l) => l.sessionId), existing.lineItems.map((l) => l.sessionId))
  assert.ok(sameSynced(existing, locked))
})

test('an old paid invoice with nothing changed is left exactly as it was', () => {
  const sessions = [session('s31', '2026-08-31', { bookingId: 'bk1' })]
  const existing = { ...paidAugust(sessions, [booking]), studentName: 'Old Name', bookedLines: undefined, bookedCount: undefined, missedSessions: [{ date: '2026-08-24' }], missedCount: 1 }
  const preview = buildMonthlyInvoice(student, sessions, [booking], 2026, 7, existing)
  assert.ok(sameSynced(existing, lockedInvoice(existing, preview, sessions, [booking])))
})

test('a deleted sign-in comes off a locked invoice', () => {
  const sessions = [session('s31', '2026-08-31', { bookingId: 'bk1' }), session('s03', '2026-08-03')]
  const existing = paidAugust(sessions, [booking])
  const remaining = [sessions[0]]
  const preview = buildMonthlyInvoice(student, remaining, [booking], 2026, 7, existing)
  const locked = lockedInvoice(existing, preview, remaining, [booking])
  assert.equal(locked.total, 200)
  assert.equal(locked.removed, 1)
})

test('older lines saved without a session id are matched by date', () => {
  const sessions = [session('s31', '2026-08-31', { bookingId: 'bk1' })]
  const existing = paidAugust(sessions, [booking])
  existing.lineItems = existing.lineItems.map(({ sessionId, ...rest }) => rest)
  const preview = buildMonthlyInvoice(student, sessions, [booking], 2026, 7, existing)
  const locked = lockedInvoice(existing, preview, sessions, [booking])
  assert.equal(locked.added, 0)
  assert.equal(locked.total, 200)
})

test('lessons billed up front stay as billed, and drop off once signed in', () => {
  const bk = { ...booking, repeat: 'weekly', daysOfWeek: [1], startDate: '2026-08-03', endDate: '2026-12-31' } // Mondays: 3, 10, 17, 24, 31 Aug
  const existing = {
    ...buildMonthlyInvoice(student, [], [bk], 2026, 7, { upcomingFrom: '2026-08-01' }),
    upcomingFrom: '2026-08-01', removedBooked: [], status: 'paid',
    payments: [{ date: '2026-08-01', method: 'EFT', amount: 1000 }]
  }
  assert.equal(existing.total, 1000)

  // Booking made longer later: the up-front charges stay at 2 h each.
  const longer = { ...bk, endTime: '18:00' }
  const p1 = buildMonthlyInvoice(student, [], [longer], 2026, 7, existing)
  assert.equal(lockedInvoice(existing, p1, [], [longer]).total, 1000)

  // Signing in for 10 Aug turns that booked line into an attended one, not two charges.
  const signed = [session('s10', '2026-08-10', { bookingId: 'bk1' })]
  const p2 = buildMonthlyInvoice(student, signed, [bk], 2026, 7, existing)
  const locked = lockedInvoice(existing, p2, signed, [bk])
  assert.equal(locked.bookedLines.length, 4)
  assert.equal(locked.lineItems.length, 1)
  assert.equal(locked.total, 1000)

  // A booking deleted from the calendar keeps its up-front charges.
  const p3 = buildMonthlyInvoice(student, [], [], 2026, 7, existing)
  assert.equal(lockedInvoice(existing, p3, [], []).total, 1000)
})

test('sameSynced ignores the order of keys in saved lines', () => {
  const a = { lineItems: [{ date: 'x', amount: 1 }], total: 1 }
  const b = { lineItems: [{ amount: 1, date: 'x' }], total: 1 }
  assert.ok(sameSynced(a, b))
  assert.ok(!sameSynced(a, { ...b, total: 2 }))
})
