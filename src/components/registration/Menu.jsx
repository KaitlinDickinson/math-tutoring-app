import { useEffect, useRef, useState } from 'react'

/**
 * A "⋯" button that opens a short list of actions, so rarely used actions
 * don't crowd the screen. items: [{ label, onClick, disabled, title, danger }]
 * (falsy entries are skipped).
 */
export default function Menu({ items, label = 'More actions', align = 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const shown = items.filter(Boolean)
  if (!shown.length) return null
  return (
    <div className="rb-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="rb-menu-btn" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>⋯</button>
      {open && (
        <div className={`rb-menu-list ${align}`} role="menu">
          {shown.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={it.danger ? 'danger' : ''}
              disabled={it.disabled}
              title={it.title}
              onClick={() => { setOpen(false); it.onClick() }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
