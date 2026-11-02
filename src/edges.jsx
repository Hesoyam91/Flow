import { useContext, useEffect, useRef } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, getStraightPath, useReactFlow } from '@xyflow/react'
import { ActionsContext } from './context.js'

// Edición en tiempo real: el texto se actualiza en la flecha mientras se escribe.
function EdgeLabelInput({ id, label = '' }) {
  const { updateEdgeData } = useReactFlow()
  const { takeSnapshot } = useContext(ActionsContext)
  const ref = useRef(null)
  const session = useRef({ original: label, snapped: false, closed: false })

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const finish = (patch = {}) => {
    session.current.closed = true
    updateEdgeData(id, { ...patch, editing: false })
  }

  return (
    <div className="grow-wrap" data-value={label}>
      <textarea
        ref={ref}
        rows={1}
        spellCheck={false}
        value={label}
        onChange={(e) => {
          if (!session.current.snapped) {
            takeSnapshot()
            session.current.snapped = true
          }
          updateEdgeData(id, { label: e.target.value })
        }}
        onBlur={() => !session.current.closed && finish()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            finish()
          }
          if (e.key === 'Escape') finish({ label: session.current.original })
        }}
      />
    </div>
  )
}

const PATHS = { smoothstep: getSmoothStepPath, straight: getStraightPath, bezier: getBezierPath }

export function LabelEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerStart, markerEnd, data, selected }) {
  const { updateEdgeData } = useReactFlow()
  const getPath = PATHS[data?.path] || getSmoothStepPath
  const [path, labelX, labelY] = getPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={{ stroke: 'var(--edge)', strokeWidth: selected ? 3 : 2, strokeDasharray: data?.dashed ? '8 6' : undefined }}
      />
      {(data?.editing || data?.label) && (
        <EdgeLabelRenderer>
          <div
            className="edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onDoubleClick={() => updateEdgeData(id, { editing: true })}
          >
            {data.editing ? <EdgeLabelInput id={id} label={data.label} /> : data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const edgeTypes = { label: LabelEdge }
