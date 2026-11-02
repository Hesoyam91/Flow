import { useEffect, useRef, useState } from 'react'

// items: [{ label, icon, onSelect }] o 'separator'
export default function Dropdown({ label, items, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="dropdown" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}>{label} ▾</button>
      {open && (
        <div className={`menu ${align === 'right' ? 'menu-right' : ''}`}>
          {items.map((item, i) =>
            item === 'separator' ? (
              <hr key={i} />
            ) : (
              <button
                key={item.label}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                <span className="menu-icon">{item.icon}</span>
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
