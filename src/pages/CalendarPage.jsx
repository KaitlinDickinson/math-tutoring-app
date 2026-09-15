import { useEffect, useMemo, useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, addWeeks, format, isSameMonth, isToday
} from 'date-fns'
import { listenStudents, listenBookings, addBooking, updateBooking, deleteBooking } from '../lib/db'
import { bookingsOnDate } from '../lib/helpers'
import Modal from '../components/Modal'
import BookingForm from '../components/BookingForm'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarPage() {
  const [view, setView] = useState('month') // 'month' | 'day'
  const [cursor, setCursor] = useState(new Date())
  const [students, setStudents] = useState([])
  const [bookings, setBookings] = useState([])
  const [modal, setModal] = useState(null) // null | 'add' | booking (edit)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    const u1 = listenStudents(setStudents)
    const u2 = listenBookings(setBookings)
    return () => { u1(); u2() }
  }, [])

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
    if (modal === 'add') await addBooking(data)
    else await updateBooking(modal.id, data)
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
          <span className="cal-label">{view === 'month' ? format(cursor, 'MMMM yyyy') : format(cursor, 'EEEE, d MMM yyyy')}</span>
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
                className={`month-cell ${isSameMonth(day, cursor) ? '' : 'outside'}`}
                onClick={() => jumpToDay(day)}
              >
                <span className="cell-date" style={isToday(day) ? { color: 'var(--accent)' } : undefined}>{format(day, 'd')}</span>
                {shown.map((s) => (
                  <span key={s.id} className="cell-slot">{s.startTime} {s.title || (s.type === 'group' ? 'Group' : nameOf(s.studentIds[0]))}</span>
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
          onEdit={setModal}
          onDelete={setConfirmDelete}
        />
      )}

      {modal && (
        <Modal title={modal === 'add' ? 'Add booking' : 'Edit booking'} onClose={() => setModal(null)} width={560}>
          <BookingForm
            initial={modal === 'add' ? null : modal}
            students={students}
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

function DayView({ dateISO, bookings, nameOf, onEdit, onDelete }) {
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
              {b.title && <strong>{b.title}: </strong>}
              {b.studentIds.map(nameOf).join(', ')}
            </div>
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
