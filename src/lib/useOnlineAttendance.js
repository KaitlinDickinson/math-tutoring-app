import { useEffect, useRef } from 'react'
import { setOnlineSession } from './db'
import { missingOnlineSessions } from './helpers'

// Keeps online lessons ticked by default: creates any attendance record an
// online lesson up to today should have. Used by every admin page that shows
// sign-ins so they're always there. Pass null for anything still loading.
export default function useOnlineAttendance(bookings, students, sessions) {
  const writing = useRef(new Set())
  useEffect(() => {
    if (!bookings || !students || !sessions) return
    missingOnlineSessions(bookings, students, sessions).forEach(({ id, data }) => {
      if (writing.current.has(id)) return
      writing.current.add(id)
      setOnlineSession(id, data)
        .catch((err) => console.error('Marking online attendance failed:', err))
        .finally(() => writing.current.delete(id))
    })
  }, [bookings, students, sessions])
}
