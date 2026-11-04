// Modelo del documento: limpieza de estados transitorios y sanitización de archivos cargados.
// Un archivo .flow es contenido no confiable: aquí se valida todo antes de que llegue a React.

export const NODE_TYPES = ['box', 'sticky', 'image', 'text', 'draw', 'section', 'column']
export const EDGE_DATA_DEFAULTS = { path: 'smoothstep', arrow: 'end', dashed: false }

const SHAPES = ['rect', 'round', 'pill', 'ellipse', 'diamond', 'hexagon']
const PATHS = ['straight', 'smoothstep', 'bezier']
const ARROWS = ['none', 'start', 'end', 'both']
const HANDLES = ['top', 'right', 'bottom', 'left']

const LIMITS = { boards: 50, nodes: 5000, edges: 10000, points: 20000, links: 500, text: 200_000, note: 2_000_000, image: 30_000_000 }
const DEFAULT_SIZE = { box: [180, 70], sticky: [180, 140], image: [220, 220], text: [200, 44], draw: [50, 50], section: [380, 260], column: [300, 220] }

export const defaultNodes = (label = 'Business 1') => [
  { id: 'n1', type: 'box', position: { x: 0, y: 0 }, style: { width: 180, height: 70 }, data: { label, color: '#bfdbfe', shape: 'round', note: '' } },
]

// ---- Limpieza de estados transitorios (historial, copiar/pegar, guardado) ----
export const cleanNode = (n) => ({ ...n, selected: false, className: undefined, data: { ...n.data, editing: false, editingDesc: false, bodyEditing: false } })

export const cleanEdge = (e) => {
  const { markerEnd, markerStart, ...rest } = e // eslint-disable-line no-unused-vars
  return { ...rest, type: 'label', selected: false, data: { ...EDGE_DATA_DEFAULTS, ...e.data, editing: false } }
}

export const cleanDoc = (doc) => ({ nodes: (doc.nodes || []).map(cleanNode), edges: (doc.edges || []).map(cleanEdge) })

// ---- Sanitización ----
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const clamp = (v, min, max, fallback) => (isNum(v) ? Math.min(max, Math.max(min, v)) : fallback)
const text = (v, max = LIMITS.text) => (typeof v === 'string' ? v.slice(0, max) : '')
// Texto plano de un HTML sin usar el DOM (este módulo también corre en Node, en las pruebas).
export function plainText(html) {
  return String(html || '')
    .replace(/<\/(p|li|h[1-6]|blockquote|div)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

const COLOR_RE = /^(#[0-9a-f]{3,8}|transparent)$/i
const color = (v, fallback) => (typeof v === 'string' && COLOR_RE.test(v) ? v : fallback)

function sanitizeNode(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id || raw.id.length > 100) return null
  if (!NODE_TYPES.includes(raw.type)) return null
  const x = raw.position?.x
  const y = raw.position?.y
  if (!isNum(x) || !isNum(y)) return null

  const d = raw.data && typeof raw.data === 'object' ? raw.data : {}
  const [dw, dh] = DEFAULT_SIZE[raw.type]
  const node = {
    id: raw.id,
    type: raw.type,
    position: { x: clamp(x, -1e6, 1e6, 0), y: clamp(y, -1e6, 1e6, 0) },
    // Al redimensionar, React Flow guarda el tamaño en node.width/height; tienen prioridad sobre style.
    style: { width: clamp(parseFloat(raw.width ?? raw.style?.width), 1, 50000, dw), height: clamp(parseFloat(raw.height ?? raw.style?.height), 1, 50000, dh) },
  }
  // Medidas iniciales: React Flow las necesita para elementos que aún no se han dibujado (renderizado solo de lo visible).
  node.initialWidth = node.style.width
  node.initialHeight = node.style.height
  const data = { label: text(d.label, 5000), note: text(d.note, LIMITS.note), color: color(d.color, raw.type === 'sticky' ? '#fde68a' : '#ffffff') }

  // Título propio de la ventana de clic derecho (independiente del título de la tarjeta).
  if (typeof d.noteTitle === 'string' && d.noteTitle) data.noteTitle = d.noteTitle.slice(0, 5000)
  // Descripción de la tarjeta, independiente de la nota. Los archivos anteriores la mostraban desde la nota: se copia una vez.
  if (raw.type === 'sticky') data.desc = typeof d.desc === 'string' ? d.desc.slice(0, 50000) : plainText(data.note).slice(0, 50000)
  if (Array.isArray(d.links)) data.links = d.links.filter((l) => typeof l === 'string').slice(0, LIMITS.links)
  if (isNum(d.fontSize)) data.fontSize = clamp(d.fontSize, 8, 200, 18)

  // Tarjeta de un tablero: la altura es automática (crece con su texto). Se valida la columna en sanitizeBoard.
  if (raw.type === 'sticky' && typeof d.columnId === 'string' && d.columnId) {
    data.columnId = d.columnId.slice(0, 100)
    node.initialHeight = 90
    delete node.style.height
  }
  if (raw.type === 'column') {
    node.zIndex = -1
    node.dragHandle = '.column-header'
  }
  if (raw.type === 'box') data.shape = SHAPES.includes(d.shape) ? d.shape : 'round'
  if (raw.type === 'section') {
    node.zIndex = -1
    data.body = text(d.body, LIMITS.note)
  }
  // Solo imágenes incrustadas (data:image/...). Las URL remotas se descartan: harían peticiones de red.
  if ((raw.type === 'image' || raw.type === 'box' || raw.type === 'sticky') && typeof d.image === 'string' && /^data:image\/(png|jpe?g|gif|webp|svg\+xml|bmp|avif);/i.test(d.image) && d.image.length <= LIMITS.image) {
    data.image = d.image
  }
  if (raw.type === 'draw') {
    if (!Array.isArray(d.points) || d.points.length < 2) return null
    const pts = d.points.slice(0, LIMITS.points)
    if (!pts.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]))) return null
    data.points = pts.map((p) => [p[0], p[1], isNum(p[2]) ? p[2] : 0.5])
    data.w = clamp(d.w, 1, 50000, node.style.width)
    data.h = clamp(d.h, 1, 50000, node.style.height)
    data.size = clamp(d.size, 1, 100, 5)
    data.color = d.color === 'auto' ? 'auto' : color(d.color, 'auto')
    node.connectable = false
  }
  return { ...node, data }
}

function sanitizeEdge(raw, nodeIds) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null
  if (!nodeIds.has(raw.source) || !nodeIds.has(raw.target)) return null
  const d = raw.data && typeof raw.data === 'object' ? raw.data : {}
  return {
    id: raw.id.slice(0, 100),
    source: raw.source,
    target: raw.target,
    sourceHandle: HANDLES.includes(raw.sourceHandle) ? raw.sourceHandle : null,
    targetHandle: HANDLES.includes(raw.targetHandle) ? raw.targetHandle : null,
    type: 'label',
    data: {
      path: PATHS.includes(d.path) ? d.path : EDGE_DATA_DEFAULTS.path,
      arrow: ARROWS.includes(d.arrow) ? d.arrow : EDGE_DATA_DEFAULTS.arrow,
      dashed: d.dashed === true,
      ...(typeof d.label === 'string' && d.label ? { label: d.label.slice(0, 500) } : {}),
    },
  }
}

function sanitizeBoard(raw, index, boardName) {
  const seen = new Set()
  const nodes = (Array.isArray(raw?.nodes) ? raw.nodes.slice(0, LIMITS.nodes) : [])
    .map(sanitizeNode)
    .filter((n) => n && !seen.has(n.id) && seen.add(n.id))
  const ids = new Set(nodes.map((n) => n.id))
  const columnIds = new Set(nodes.filter((n) => n.type === 'column').map((n) => n.id))
  nodes.forEach((n) => {
    // Una tarjeta cuya columna no existe vuelve a ser una nota normal.
    if (n.data.columnId && !columnIds.has(n.data.columnId)) {
      delete n.data.columnId
      n.style.height = DEFAULT_SIZE.sticky[1]
      n.initialHeight = DEFAULT_SIZE.sticky[1]
    }
  })
  const edgeIds = new Set()
  const edges = (Array.isArray(raw?.edges) ? raw.edges.slice(0, LIMITS.edges) : [])
    .map((e) => sanitizeEdge(e, ids))
    .filter((e) => e && !edgeIds.has(e.id) && edgeIds.add(e.id))
  // Los enlaces solo pueden apuntar a elementos que existen en el mismo tablero.
  nodes.forEach((n) => {
    if (n.data.links) n.data.links = n.data.links.filter((l) => ids.has(l))
  })
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id.slice(0, 100) : crypto.randomUUID(),
    name: text(raw?.name, 80) || boardName(index + 1),
    nodes,
    edges,
  }
}

// Acepta el formato con varios tableros y el anterior (un solo diagrama). Nunca lanza por contenido inválido.
export function normalizeDoc(raw, { boardName = (n) => `Board ${n}` } = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const list = Array.isArray(source.boards) && source.boards.length ? source.boards.slice(0, LIMITS.boards) : [source]
  const used = new Set()
  const boards = list.map((b, i) => sanitizeBoard(b, i, boardName)).map((b) => {
    if (used.has(b.id)) b.id = crypto.randomUUID()
    used.add(b.id)
    return b
  })
  const activeId = boards.some((b) => b.id === source.activeId) ? source.activeId : boards[0].id
  return { boards, activeId }
}

export const emptyDoc = (opts) => normalizeDoc({ nodes: [], edges: [] }, opts)
export const defaultDoc = (opts = {}) => normalizeDoc({ nodes: defaultNodes(opts.sampleLabel), edges: [] }, opts)
