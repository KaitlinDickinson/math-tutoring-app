import { useRef, useState } from 'react'

// Tick the students who need a blank attendance sheet; each gets their own
// page with their details filled in. With nobody ticked, one empty sheet.
export default function BlankSheetPicker({ students, onDownload, onCancel }) {
  const [studentIds, setStudentIds] = useState([])
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const sorted = [...students].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
  const visible = sorted.filter((s) => !q || `${s.firstName} ${s.lastName}`.toLowerCase().includes(q))

  // After ticking someone found by searching, empty the search box and put
  // the cursor back in it, ready to type the next name.
  const searchRef = useRef(null)
  const readyForNextSearch = () => {
    if (!q) return
    setQuery('')
    searchRef.current?.focus()
  }

  const toggle = (id) => {
    const adding = !studentIds.includes(id)
    setStudentIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
    if (adding) readyForNextSearch()
  }
  const allVisibleTicked = visible.length > 0 && visible.every((s) => studentIds.includes(s.id))
  const toggleAllVisible = () => {
    setStudentIds((ids) => (
      allVisibleTicked
        ? ids.filter((id) => !visible.some((s) => s.id === id))
        : [...new Set([...ids, ...visible.map((s) => s.id)])]
    ))
    if (!allVisibleTicked) readyForNextSearch()
  }

  // Pages come out in alphabetical order, whatever order they were ticked in.
  const download = () => onDownload(sorted.filter((s) => studentIds.includes(s.id)))
  const count = studentIds.length

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Each student gets their own page with their name, parent and contact details filled in.
        Leave everyone unticked for one empty sheet.
      </p>
      <div className="field">
        <label>Students <span className="muted">({count} selected)</span></label>
        <div className="search-wrap" style={{ marginBottom: 8 }}>
          <span className="search-icon">🔍</span>
          <input
            ref={searchRef}
            placeholder="Search students…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
            aria-label="Search students"
          />
        </div>
        {visible.length > 0 && (
          <label className="checkbox-row picker-row picker-all picker-all-box">
            <input type="checkbox" checked={allVisibleTicked} onChange={toggleAllVisible} />
            {q ? `Select all ${visible.length} matching` : `Select all students (${visible.length})`}
          </label>
        )}
        <div className="picker-list">
          {visible.map((s) => (
            <label key={s.id} className="checkbox-row picker-row">
              <input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => toggle(s.id)} />
              {s.firstName} {s.lastName}
              {s.grade != null && s.grade !== '' && <span className="muted">Grade {s.grade}</span>}
            </label>
          ))}
          {visible.length === 0 && <div className="picker-row muted">No students match "{query}"</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-accent" onClick={download}>
          {count === 0 ? 'Download empty sheet' : `Download ${count} sheet${count === 1 ? '' : 's'} (PDF)`}
        </button>
      </div>
    </>
  )
}
