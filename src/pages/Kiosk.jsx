import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listenStudents, listenBookings, addSession, addBooking } from '../lib/db'
import { todayISO, nowStamp, bookingsOnDate, durationHours } from '../lib/helpers'
import SignaturePad from '../components/SignaturePad'
import Modal from '../components/Modal'

export default function Kiosk() {
  const [students, setStudents] = useState([])
  const [bookings, setBookings] = useState([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [walkInConfirmed, setWalkInConfirmed] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const sigRef = useRef(null)

  useEffect(() => {
    const u1 = listenStudents(setStudents)
    const u2 = listenBookings(setBookings)
    return () => { u1(); u2() }
  }, [])

  // All students, browsable as tiles; typing narrows the same list rather
  // than switching to a separate results view.
  const visibleStudents = useMemo(() => {
    const sorted = [...students].sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    )
    if (!query.trim()) return sorted
    const q = query.trim().toLowerCase()
    return sorted.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q))
  }, [query, students])

  // Bookings that occur today and include the selected student
  const todaysSlotsForStudent = useMemo(() => {
    if (!selected) return []
    return bookingsOnDate(bookings, todayISO()).filter((b) => b.studentIds?.includes(selected.id))
  }, [selected, bookings])

  const reset = () => {
    setSelected(null)
    setSelectedSlot(null)
    setWalkInConfirmed(false)
    setQuery('')
    setSubmitted(false)
    setError('')
    sigRef.current?.clear()
  }

  const handleSubmit = async () => {
    if (!selected || sigRef.current.isEmpty()) return
    setError('')
    let slot = selectedSlot

    try {
      // No pre-booked slot exists for this student today at all — log it on the
      // calendar too (one-off, today only) so sign-ins and bookings stay in sync.
      if (todaysSlotsForStudent.length === 0) {
        const now = new Date()
        const pad = (n) => String(n).padStart(2, '0')
        const startTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`
        const end = new Date(now.getTime() + 60 * 60 * 1000)
        const endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`
        const ratesOverride = { [selected.id]: selected.hourlyRate ?? 0 }
        const newBooking = await addBooking({
          type: 'individual',
          title: '',
          startTime,
          endTime,
          startDate: todayISO(),
          endDate: todayISO(),
          repeat: 'none',
          daysOfWeek: [],
          studentIds: [selected.id],
          ratesOverride
        })
        slot = { id: newBooking.id, type: 'individual', title: '', startTime, endTime, ratesOverride }
      }

      await addSession({
        studentId: selected.id,
        date: todayISO(),
        checkInTime: nowStamp(),
        signature: sigRef.current.toDataURL(),
        sessionType: slot?.type || 'individual',
        durationHours: slot ? durationHours(slot.startTime, slot.endTime) : 1,
        rate: (slot?.ratesOverride && slot.ratesOverride[selected.id]) ?? selected.hourlyRate ?? 0,
        bookingId: slot?.id || null,
        bookingTitle: slot?.title || null
      })
      setSubmitted(true)
      setTimeout(reset, 3500)
    } catch (err) {
      setError('Something went wrong signing you in. Please ask your tutor for help.')
    }
  }

  if (submitted) {
    return (
      <div className="kiosk">
        <div className="kiosk-body">
          <div className="kiosk-confirm">
            <h2>Thanks, {selected.firstName}!</h2>
            <p>You're signed in for today. See you at your next session.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="kiosk">
      <div className="kiosk-header">
        <h1>Welcome</h1>
        <p>Find your name below to sign in for today's session.</p>
      </div>
      <div className="kiosk-body">
        {!selected && (
          <>
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input
                autoFocus
                placeholder="Search your name, or scroll below..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="kiosk-grid">
              {visibleStudents.map((s) => (
                <button key={s.id} className="kiosk-cube" onClick={() => setSelected(s)}>
                  <span className="kiosk-cube-initials">{s.firstName?.[0]}{s.lastName?.[0]}</span>
                  <span className="kiosk-cube-name">{s.firstName} {s.lastName}</span>
                </button>
              ))}
              {visibleStudents.length === 0 && (
                <p className="muted kiosk-grid-empty">No student found. Ask your tutor to check your registration.</p>
              )}
            </div>
          </>
        )}

        {selected && todaysSlotsForStudent.length === 0 && !walkInConfirmed && (
          <Modal
            title="No scheduled session"
            onClose={reset}
            footer={<>
              <button className="btn btn-outline" onClick={reset}>No</button>
              <button className="btn btn-accent" onClick={() => setWalkInConfirmed(true)}>Yes, sign in</button>
            </>}
          >
            <p>There's no session booked for {selected.firstName} today. Would you still like to sign in?</p>
            <p className="muted">This will bill for a 1-hour session starting now and add it to the calendar.</p>
          </Modal>
        )}

        {selected && (todaysSlotsForStudent.length > 0 || walkInConfirmed) && (
          <div className="panel">
            <div className="panel-header">
              <h3>{selected.firstName} {selected.lastName}</h3>
              <button className="btn-outline btn btn-sm" onClick={reset}>Not you?</button>
            </div>
            <div className="panel-body">
              {todaysSlotsForStudent.length > 0 && (
                <div className="field">
                  <label>Which session is this?</label>
                  <div className="pill-row">
                    {todaysSlotsForStudent.map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        className={`pill ${selectedSlot?.id === slot.id ? 'active' : ''}`}
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {slot.startTime}–{slot.endTime}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {walkInConfirmed && todaysSlotsForStudent.length === 0 && (
                <p className="field-hint">Signing in for a 1-hour walk-in session, billed from now.</p>
              )}

              <div className="field">
                <label>Sign to confirm attendance</label>
                <SignaturePad ref={sigRef} />
                <button className="btn-outline btn btn-sm" type="button" onClick={() => sigRef.current?.clear()}>Clear signature</button>
              </div>

              {error && <p style={{ color: 'var(--red)' }}>{error}</p>}

              <button className="btn btn-accent btn-block" onClick={handleSubmit}>Sign in</button>
            </div>
          </div>
        )}
      </div>
      <Link to="/admin" className="muted" style={{ marginTop: 40, textDecoration: 'none' }}>Tutor login</Link>
    </div>
  )
}
