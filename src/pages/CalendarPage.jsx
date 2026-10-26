import { useEffect, useMemo, useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, addWeeks, format, isSameMonth, isToday
} from 'date-fns'
import {
  listenStudents, listenBookings, listenGroups, listenSessions, addBooking, updateBooking, deleteBooking,
  deleteSession, setOnlineSession, markOnlineAbsent, clearOnlineAbsent
} from '../lib/db'
import {
  bookingsOnDate, todayISO, isOnlineBooking, onlineSessionId, onlineSessionData, onlineAbsentKey
} from '../lib/helpers'
import useOnlineAttendance from '../lib/useOnlineAttendance'
import Modal from '../components/Modal'
import BookingForm from '../components/BookingForm'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarPage() {
  const [view, setView] = useState('month') // 'month' | 'day'
  const [cursor, setCursor] = useState(new Date())
  const [students, setStudents] = useState([])
  const [bookings, setBookings] = useState([])
  const [groups, setGroups] = useState([])
  const [sessions, setSessions] = useState(null)
  const [modal, setModal] = useState(null) // null | 'add' | booking (edit)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    const u1 = listenStudents(setStudents)
    const u2 = listenBookings(setBookings)
    // Groups are optional here: if they can't load, the form works without them.
    const u3 = listenGroups(setGroups, () => setGroups([]))
    const u4 = listenSessions(setSessions)
    return () => { u1(); u2(); u3(); u4() }
  }, [])

  useOnlineAttendance(bookings, students, sessions)

  const dateISO = format(cursor, 'yyyy-MM-dd')

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor))
    const end = endOfWeek(endOfMonth(cursor))
    const days = []
    let d = start
    while (d <= end) { days.push(d); d = addDays(d, 1) }
    return days
  }, [cursor])

  const goPrev = () => setCursor((c) => view === 'month' ? addMonths(c, -1) : addDays(c, -1))
  const goNext = () => setCursor((c) => view === 'month' ? addMonths(c, 1) : addDays(c, 1))
  const goToday = () => setCursor(new Date())

  const jumpToDay = (day) => { setCursor(day); setView('day') }

  const nameOf = (id) => {
    const s = students.find((st) => st.id === id)
    return s ? `${s.firstName} ${s.lastName}` : '—'
  }

  const handleSave = async (data) => {
    // Online lessons are auto-marked attended from `onlineSince`: a new booking
    // from its start date, one switched to online only from today, so months
    // of past lessons don't suddenly get billed.
    if (isOnlineBooking(data) && (modal === 'add' || !isOnlineBooking(modal))) {
      data = { ...data, onlineSince: modal === 'add' ? data.startDate : todayISO() }
    }
    if (modal === 'add') await addBooking(data)
    // Saving a walk-in from the edit form counts as confirming its times.
    else await updateBooking(modal.id, modal.walkIn ? { ...data, needsTimeCheck: false } : data)
    setModal(null)
  }
  const handleDelete = async () => { await deleteBooking(confirmDelete.id); setConfirmDelete(null) }

  return (
    <>
      <div className="content-header">
        <div>
          <h1>Calendar</h1>
          <p>Pre-booked sessions, grouped by time slot.</p>
        </div>
        <button className="btn btn-accent" onClick={() => setModal('add')}>+ Add booking</button>
      </div>

      <div className="cal-toolbar">
        <div className="cal-toggle">
          <button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>Day</button>
          <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
        </div>
        <div className="cal-nav">
          <button onClick={goPrev}>←</button>
          <span className="cal-label">
            {view === 'month' ? format(cursor, 'MMMM yyyy') : format(cursor, 'EEEE, d MMM yyyy')}
            {view === 'day' && isToday(cursor) && <span className="today-label">Today</span>}
          </span>
          <button onClick={goNext}>→</button>
          <button className="btn-outline btn btn-sm" onClick={goToday}>Today</button>
        </div>
      </div>

      {view === 'month' ? (
        <div className="month-grid">
          {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
          {monthDays.map((day) => {
            const iso = format(day, 'yyyy-MM-dd')
            const slots = bookingsOnDate(bookings, iso)
            const shown = slots.slice(0, 2)
            const extra = slots.length - shown.length
            return (
              <div
                key={iso}
                className={`month-cell ${isSameMonth(day, cursor) ? '' : 'outside'} ${isToday(day) ? 'today' : ''}`}
                onClick={() => jumpToDay(day)}
                aria-current={isToday(day) ? 'date' : undefined}
              >
                <span className="cell-date-row">
                  <span className="cell-date">{format(day, 'd')}</span>
                  {isToday(day) && <span className="today-label">Today</span>}
                </span>
                {shown.map((s) => (
                  <span key={s.id} className={`cell-slot ${s.walkIn ? 'walk-in' : ''}`}>
                    {s.startTime} {isOnlineBooking(s) && '💻 '}{s.walkIn && 'Walk-in: '}{s.title || (s.type === 'group' ? 'Group' : nameOf(s.studentIds[0]))}
                  </span>
                ))}
                {extra > 0 && <span className="cell-more">+{extra} more</span>}
              </div>
            )
          })}
        </div>
      ) : (
        <DayView
          dateISO={dateISO}
          bookings={bookingsOnDate(bookings, dateISO)}
          nameOf={nameOf}
          students={students}
          sessions={sessions || []}
          onEdit={setModal}
          onDelete={setConfirmDelete}
        />
      )}

      {modal && (
        <Modal title={modal === 'add' ? 'Add booking' : 'Edit booking'} onClose={() => setModal(null)} width={560}>
          <BookingForm
            initial={modal === 'add' ? null : modal}
            students={students}
            groups={groups}
            defaultDate={dateISO}
            onSubmit={handleSave}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Remove booking?"
          onClose={() => setConfirmDelete(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Remove</button>
          </>}
        >
          <p>This removes the whole booking series, not just one occurrence.</p>
        </Modal>
      )}
    </>
  )
}

// Online students don't sign in, so each one gets an Attended tick box,
// ticked by default (see useOnlineAttendance). Unticking records them absent
// so they aren't re-ticked, and removes the attendance record.
function OnlineAttendance({ booking, dateISO, students, sessions, nameOf }) {
  const [busy, setBusy] = useState(null)
  if (dateISO > todayISO()) {
    return <div className="online-attendance muted">Attendance can be marked from the day of the lesson.</div>
  }
  const absent = new Set(booking.onlineAbsent || [])

  const toggle = async (studentId, attended) => {
    const key = onlineAbsentKey(dateISO, studentId)
    const id = onlineSessionId(booking.id, dateISO, studentId)
    setBusy(studentId)
    try {
      if (attended) {
        // Absent first, so the record isn't re-created in between.
        await markOnlineAbsent(booking.id, key)
        await deleteSession(id)
      } else {
        await clearOnlineAbsent(booking.id, key)
        const student = students.find((s) => s.id === studentId)
        if (student) await setOnlineSession(id, onlineSessionData(booking, dateISO, student))
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="online-attendance">
      {booking.studentIds.map((sid) => {
        const signedIn = sessions.some((s) => s.studentId === sid && s.date === dateISO && s.bookingId === booking.id && !s.online)
        const attended = signedIn || (!absent.has(onlineAbsentKey(dateISO, sid)) && sessions.some((s) => s.id === onlineSessionId(booking.id, dateISO, sid)))
        return (
          <label key={sid} className="checkbox-row">
            <input type="checkbox" checked={attended} disabled={signedIn || busy === sid} onChange={() => toggle(sid, attended)} />
            {nameOf(sid)}
            <span className="muted">{signedIn ? 'Signed in' : attended ? 'Attended' : 'Absent'}</span>
          </label>
        )
      })}
    </div>
  )
}

function DayView({ dateISO, bookings, nameOf, students, sessions, onEdit, onDelete }) {
  if (bookings.length === 0) {
    return <div className="day-empty">No sessions booked for this day.</div>
  }
  return (
    <div className="day-view">
      {bookings.map((b) => (
        <div key={b.id} className={`day-slot ${b.type}`}>
          <div>
            <div className="day-slot-time">{b.startTime} – {b.endTime}</div>
            <div className="day-slot-students">
              <span className="badge" style={{ background: b.type === 'group' ? 'var(--amber-soft)' : 'var(--accent-soft)', color: b.type === 'group' ? 'var(--amber)' : 'var(--accent)', marginRight: 8 }}>
                {b.type === 'group' ? 'Group' : 'Individual'}
              </span>
              {isOnlineBooking(b) && <span className="badge badge-online">💻 Online</span>}
              {b.walkIn && (
                <span className="badge badge-walkin" title="Added at sign-in without a booking. The invoice uses these times.">
                  {b.needsTimeCheck ? 'Walk-in: check times' : 'Walk-in'}
                </span>
              )}
              {b.title && <strong>{b.title}: </strong>}
              {b.studentIds.map(nameOf).join(', ')}
            </div>
            {isOnlineBooking(b) && (
              <OnlineAttendance booking={b} dateISO={dateISO} students={students} sessions={sessions} nameOf={nameOf} />
            )}
          </div>
          <div>
            <button className="btn btn-outline btn-sm" onClick={() => onEdit(b)}>Edit</button>{' '}
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(b)}>Remove</button>
          </div>
        </div>
      ))}
    </div>
  )
}
