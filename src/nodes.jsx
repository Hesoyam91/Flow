import { useContext, useEffect, useMemo, useRef } from 'react'
import { Handle, Position, NodeResizer, useReactFlow } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { ActionsContext } from './context.js'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { strokePath } from './strokes.js'
import { stripHtml, taskProgress } from './utils.js'

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left]

const POLYGONS = {
  diamond: '50,0 100,50 50,100 0,50',
  hexagon: '25,0 75,0 100,50 75,100 25,100 0,50',
}

function Handles() {
  return SIDES.map((p) => <Handle key={p} id={p} type="source" position={p} />)
}

function Resizer({ selected, ...props }) {
  const { takeSnapshot } = useContext(ActionsContext)
  return <NodeResizer isVisible={selected} onResizeStart={takeSnapshot} {...props} />
}

// Insignia con el estado de la nota: tareas hechas/total, o un 📝 si solo hay texto; 🔗 si tiene enlaces.
function NoteBadge({ data }) {
  const { t } = useTranslation()
  const tasks = taskProgress(data.note)
  const parts = []
  if (tasks) parts.push(`☑ ${tasks.done}/${tasks.total}`)
  else if (stripHtml(data.note)) parts.push('📝')
  if (data.links?.length) parts.push('🔗')
  return parts.length ? <span className="note-badge" title={t('nodes.hasNote')}>{parts.join(' ')}</span> : null
}

// Etiqueta editable en el mismo lugar (doble click → data.editing). El texto se actualiza
// en el nodo mientras se escribe; el textarea no tiene caja y hereda tipografía y alineación.
function EditableLabel({ id, data, placeholder, className }) {
  const { updateNodeData } = useReactFlow()
  const { takeSnapshot } = useContext(ActionsContext)
  const ref = useRef(null)
  const session = useRef({ original: '', snapped: false, closed: false })
  const label = data.label || ''

  useEffect(() => {
    if (!data.editing) return
    session.current = { original: label, snapped: false, closed: false }
    // React Flow mantiene un nodo recién creado oculto hasta medirlo, y focus() falla en un elemento oculto:
    // se reintenta hasta que el foco se aplica.
    let timer
    let tries = 0
    const tryFocus = () => {
      const el = ref.current
      if (!el) return
      el.focus()
      if (document.activeElement === el) return el.select()
      if (++tries < 25) timer = setTimeout(tryFocus, 40)
    }
    timer = setTimeout(tryFocus, 0)
    return () => clearTimeout(timer)
  }, [data.editing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data.editing) return <div className={`${className} label-text`}>{label || placeholder}</div>

  const finish = (patch = {}) => {
    session.current.closed = true
    updateNodeData(id, { ...patch, editing: false })
  }

  return (
    <div className={`grow-wrap nodrag nopan ${className}`} data-value={label}>
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
          updateNodeData(id, { label: e.target.value })
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

export function BoxNode({ id, data, selected }) {
  const { t } = useTranslation()
  const shape = data.shape || 'round'
  return (
    <div className={`box-node shape-${shape}`} style={{ background: data.color || '#fff' }}>
      <Resizer selected={selected} minWidth={100} minHeight={50} />
      {POLYGONS[shape] && (
        <svg className="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points={POLYGONS[shape]} fill={data.color || '#fff'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <Handles />
      <EditableLabel id={id} data={data} className="node-label" placeholder={t('nodes.untitled')} />
      <NoteBadge data={data} />
    </div>
  )
}

export function TextNode({ id, data, selected }) {
  const { t } = useTranslation()
  const transparent = !data.color || data.color === 'transparent'
  return (
    <div className="text-node" style={{ background: data.color || 'transparent', color: transparent ? 'var(--text)' : '#111', fontSize: data.fontSize || 18 }}>
      <Resizer selected={selected} minWidth={60} minHeight={30} />
      <Handles />
      <EditableLabel id={id} data={data} className="text-label" placeholder={t('nodes.text')} />
      <NoteBadge data={data} />
    </div>
  )
}

export function StickyNode({ id, data, selected }) {
  const { t } = useTranslation()
  const text = stripHtml(data.note)
  return (
    <div className="sticky-node" style={{ background: data.color || '#fde68a' }}>
      <Resizer selected={selected} minWidth={140} minHeight={100} />
      <Handles />
      <EditableLabel id={id} data={data} className="node-label sticky-title" placeholder={t('nodes.note')} />
      {text && <div className="sticky-body">{text}</div>}
    </div>
  )
}

export function ImageNode({ id, data, selected }) {
  const { t } = useTranslation()
  return (
    <div className="image-node">
      <Resizer selected={selected} minWidth={80} minHeight={80} keepAspectRatio />
      <Handles />
      {data.image ? <img src={data.image} alt={data.label || ''} draggable={false} /> : <div className="image-empty">{t('nodes.noImage')}</div>}
      {(data.label || data.editing) && (
        <div className="image-caption">
          <EditableLabel id={id} data={data} className="caption-label" placeholder="" />
        </div>
      )}
      <NoteBadge data={data} />
    </div>
  )
}

// Trazo a mano alzada. Escala con el nodo porque el SVG usa viewBox con las medidas originales.
export function DrawNode({ id, data, selected }) {
  const d = useMemo(() => strokePath(data.points, data.size), [data.points, data.size])
  return (
    <div className={`draw-node ${selected ? 'selected' : ''}`}>
      <Resizer selected={selected} minWidth={20} minHeight={20} keepAspectRatio />
      <svg viewBox={`0 0 ${data.w} ${data.h}`} preserveAspectRatio="none" width="100%" height="100%">
        <path data-draw-id={id} d={d} fill={data.color === 'auto' || !data.color ? 'var(--text)' : data.color} />
      </svg>
    </div>
  )
}

// Texto enriquecido dentro de una sección. Doble click para escribir; Esc o click fuera para terminar.
function SectionBody({ id, data }) {
  const { t } = useTranslation()
  const { updateNodeData } = useReactFlow()
  const { takeSnapshot } = useContext(ActionsContext)
  const snapped = useRef(false)
  const editing = !!data.bodyEditing

  const editor = useEditor({
    extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), Placeholder.configure({ placeholder: t('nodes.bodyPlaceholder') })],
    content: data.body || '',
    editable: editing,
    onUpdate: ({ editor }) => {
      if (!snapped.current) {
        takeSnapshot()
        snapped.current = true
      }
      updateNodeData(id, { body: editor.getHTML() })
    },
    onBlur: () => updateNodeData(id, { bodyEditing: false }),
    editorProps: {
      handleKeyDown: (_view, e) => {
        if (e.key !== 'Escape') return false
        updateNodeData(id, { bodyEditing: false })
        return true
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editing)
    if (editing) {
      snapped.current = false
      editor.commands.focus('end')
    }
  }, [editing, editor])

  // Refleja cambios hechos desde fuera (ventana de nota, deshacer) cuando no se está escribiendo aquí.
  useEffect(() => {
    if (editor && !editor.isFocused && (data.body || '') !== editor.getHTML()) editor.commands.setContent(data.body || '', { emitUpdate: false })
  }, [data.body, editor])

  const btn = (label, title, run) => (
    <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  )

  return (
    <div
      className={`section-body ${editing ? 'editing nodrag nopan nowheel' : ''}`}
      style={{ fontSize: data.fontSize || 18 }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (!editing) updateNodeData(id, { bodyEditing: true })
      }}
    >
      {editing && editor && (
        <div className="section-toolbar">
          {btn(<b>B</b>, t('editor.tb.bold'), () => editor.chain().focus().toggleBold().run())}
          {btn(<i>I</i>, t('editor.tb.italic'), () => editor.chain().focus().toggleItalic().run())}
          {btn('H', t('editor.tb.h2'), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
          {btn(t('editor.tb.bullets'), t('editor.tb.bulletsTip'), () => editor.chain().focus().toggleBulletList().run())}
          {btn(t('editor.tb.numbers'), t('editor.tb.numbersTip'), () => editor.chain().focus().toggleOrderedList().run())}
          {btn(t('editor.tb.tasks'), t('editor.tb.tasksTip'), () => editor.chain().focus().toggleTaskList().run())}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}

// Contenedor con etiqueta de color y texto propio. Al moverlo se mueve también lo que tiene dentro (ver App).
export function SectionNode({ id, data, selected }) {
  const { t } = useTranslation()
  const { updateNodeData } = useReactFlow()
  const color = data.color && data.color !== 'transparent' ? data.color : '#e5e7eb'
  return (
    <div className="section-node" style={{ background: `color-mix(in srgb, ${color} var(--section-mix), transparent)`, borderColor: color }}>
      <SectionBody id={id} data={data} />
      <Resizer selected={selected} minWidth={120} minHeight={80} />
      <div
        className="section-chip"
        style={{ background: color }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          updateNodeData(id, { editing: true })
        }}
      >
        <EditableLabel id={id} data={data} className="section-label" placeholder={t('nodes.section')} />
      </div>
    </div>
  )
}

export const nodeTypes = { box: BoxNode, sticky: StickyNode, image: ImageNode, text: TextNode, draw: DrawNode, section: SectionNode }
