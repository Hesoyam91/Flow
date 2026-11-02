import { useContext, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { ActionsContext } from './context.js'
import { strokePath } from './strokes.js'

// Capa transparente sobre el lienzo que captura el lápiz o el borrador.
// El trazo se dibuja en pantalla mientras se arrastra y al soltar se convierte en un nodo.
export default function DrawingLayer({ tool, color, size, onStroke, onErase }) {
  const { screenToFlowPosition, getZoom } = useReactFlow()
  const { takeSnapshot } = useContext(ActionsContext)
  const ref = useRef(null)
  const [live, setLive] = useState(null) // puntos en coordenadas de cliente
  const erasing = useRef(false)
  const snapped = useRef(false)

  const point = (e) => [e.clientX, e.clientY, e.pressure || 0.5]

  const eraseAt = (e) => {
    for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
      const id = el.dataset?.drawId
      if (id) {
        if (!snapped.current) {
          takeSnapshot()
          snapped.current = true
        }
        onErase(id)
      }
    }
  }

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* sin captura: el trazo igual funciona dentro del lienzo */
    }
    if (tool === 'eraser') {
      erasing.current = true
      snapped.current = false
      eraseAt(e)
    } else {
      setLive([point(e)])
    }
  }

  const onPointerMove = (e) => {
    if (tool === 'eraser') {
      if (erasing.current) eraseAt(e)
    } else if (live) {
      setLive((pts) => [...pts, point(e)])
    }
  }

  const finish = () => {
    erasing.current = false
    if (!live) return
    const pts = live.length === 1 ? [live[0], [live[0][0] + 0.1, live[0][1] + 0.1, live[0][2]]] : live
    const flow = pts.map(([x, y, p]) => {
      const f = screenToFlowPosition({ x, y })
      return [f.x, f.y, p]
    })
    const xs = flow.map((p) => p[0])
    const ys = flow.map((p) => p[1])
    const pad = size
    const minX = Math.min(...xs) - pad
    const minY = Math.min(...ys) - pad
    onStroke({
      position: { x: minX, y: minY },
      w: Math.max(...xs) + pad - minX,
      h: Math.max(...ys) + pad - minY,
      points: flow.map(([x, y, p]) => [x - minX, y - minY, p]),
    })
    setLive(null)
  }

  const rect = ref.current?.getBoundingClientRect()
  const screenPts = live && rect ? live.map(([x, y, p]) => [x - rect.left, y - rect.top, p]) : null

  return (
    <div
      ref={ref}
      className={`drawing-layer ${tool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {screenPts && (
        <svg width="100%" height="100%">
          <path d={strokePath(screenPts, size * getZoom())} fill={color === 'auto' ? 'var(--text)' : color} />
        </svg>
      )}
    </div>
  )
}
