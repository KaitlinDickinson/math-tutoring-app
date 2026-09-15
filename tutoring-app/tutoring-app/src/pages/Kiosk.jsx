import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listenStudents, listenBookings, addSession } from '../lib/db'
import { todayISO, nowStamp, bookingsOnDate, durationHours } from '../lib/helpers'
import SignaturePad from '../components/SignaturePad'

export default function Kiosk() {
  const [students, setStudents] = useState([])
  const [bookings, setBookings] = useState([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const sigRef = useRef(null)

  useEffect(() => {
    const u1 = listenStudents(setStudents)
    const u2 = listenBookings(setBookings)
    return () => { u1(); u2() }
  }, [])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    return students.filter((s) =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q)
    ).slice(0, 8)
  }, [query, students])

  // Bookings that occur today and include the selected student
  const todaysSlotsForStudent = useMemo(() => {
    if (!selected) return []
    return bookingsOnDate(bookings, todayISO()).filter((b) => b.studentIds?.includes(selected.id))
  }, [selected, bookings])

  const reset = () => {
    setSelected(null)
    setSelectedSlot(null)
    setQuery('')
    setSubmitted(false)
    sigRef.current?.clear()
  }

  const handleSubmit = async () => {
    if (!selected || sigRef.current.isEmpty()) return
    const slot = selectedSlot
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
                placeholder="Type your first or last name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="kiosk-result-list">
              {results.map((s) => (
                <button key={s.id} className="kiosk-result" onClick={() => setSelected(s)}>
                  <strong>{s.firstName} {s.lastName}</strong>
                  <span className="muted">Tap to sign in →</span>
                </button>
              ))}
              {query.trim() && results.length === 0 && (
                <p className="muted">No student found. Ask your tutor to check your registration.</p>
              )}
            </div>
          </>
        )}

        {selected && (
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
              {todaysSlotsForStudent.length === 0 && (
                <p className="field-hint">No pre-booked slot found for today — this will be logged as a general 1-hour session.</p>
              )}

              <div className="field">
                <label>Sign to confirm attendance</label>
                <SignaturePad ref={sigRef} />
                <button className="btn-outline btn btn-sm" type="button" onClick={() => sigRef.current?.clear()}>Clear signature</button>
              </div>

              <button className="btn btn-accent btn-block" onClick={handleSubmit}>Sign in</button>
            </div>
          </div>
        )}
      </div>
      <Link to="/admin" className="muted" style={{ marginTop: 40, textDecoration: 'none' }}>Tutor login</Link>
    </div>
  )
}
