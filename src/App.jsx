import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
  MarkerType,
  SelectionMode,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react'
import { nodeTypes } from './nodes.jsx'
import { edgeTypes } from './edges.jsx'
import { ActionsContext } from './context.js'
import NoteEditor from './NoteEditor.jsx'
import Dropdown from './Dropdown.jsx'
import DrawingLayer from './DrawingLayer.jsx'
import Stars from './Stars.jsx'
import { exportBoard } from './exportBoard.js'
import logo from './assets/logo.svg'
import { useTranslation } from 'react-i18next'
import i18n, { LANGUAGES, setLanguage } from './i18n'
import { PEN_COLORS, fileToImageData, imageSize, pickImage, stripHtml } from './utils.js'
import { EDGE_DATA_DEFAULTS, cleanDoc, cleanNode, cleanEdge, defaultDoc, emptyDoc, normalizeDoc } from './doc.js'
import { alignPositions } from './layout.js'

const STORAGE_KEY = 'flow:autosave'
const THEME_KEY = 'flow:theme'
const HISTORY_LIMIT = 100

const EDGE_OPTIONS = { type: 'label' }

const sizeOf = (n) => ({
  w: (n.measured?.width ?? n.width ?? parseFloat(n.style?.width)) || 0,
  h: (n.measured?.height ?? n.height ?? parseFloat(n.style?.height)) || 0,
})

const docOpts = () => ({ boardName: (n) => i18n.t('defaults.board', { n }), sampleLabel: i18n.t('defaults.sample') })

function loadInitial() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved?.boards || saved?.nodes) return normalizeDoc(saved, docOpts())
  } catch {
    /* ignora autosave corrupto */
  }
  return defaultDoc(docOpts())
}

const PATH_OPTIONS = ['straight', 'smoothstep', 'bezier']
const ARROW_OPTIONS = [['none', '—'], ['end', '→'], ['start', '←'], ['both', '↔']]
const ALIGN_OPTIONS = [['left', '⇤'], ['hcenter', '⇔'], ['right', '⇥'], ['top', '⤒'], ['vcenter', '⇕'], ['bottom', '⤓'], ['hdist', '⋯'], ['vdist', '⋮']]

function Editor() {
  const { t, i18n: i18 } = useTranslation()
  const colorName = (c) => t(`colors.${c.replace('#', '')}`, { defaultValue: c })
  const initial = useRef(loadInitial()).current
  const firstBoard = initial.boards.find((b) => b.id === initial.activeId)
  const [nodes, setNodes, onNodesChange] = useNodesState(firstBoard.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(firstBoard.edges)
  const [boardMeta, setBoardMeta] = useState(initial.boards.map(({ id, name }) => ({ id, name })))
  const [activeId, setActiveId] = useState(initial.activeId)
  const [renamingBoard, setRenamingBoard] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [filePath, setFilePath] = useState(null)
  const [status, setStatus] = useState('')
  const [tool, setTool] = useState('select') // select | pen | eraser
  const [penColor, setPenColor] = useState('auto')
  const [penSize, setPenSize] = useState(5)
  const [query, setQuery] = useState('')
  const [colorFilter, setColorFilter] = useState(null)
  const [, setTick] = useState(0)
  const { screenToFlowPosition, fitView } = useReactFlow()
  const wrapper = useRef(null)
  const searchRef = useRef(null)
  const matchIndex = useRef(0)

  // El encuadre inicial corre antes de que los elementos tengan medidas; se repite al terminar de montar.
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.12 }), 250)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Tema: claro = atardecer, oscuro = noche ----
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])
  const toggleLanguage = () => setLanguage(LANGUAGES[(LANGUAGES.indexOf(i18.language) + 1) % LANGUAGES.length])
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  const edgeColor = theme === 'dark' ? '#d5e0ff' : '#000000'

  // Puntas de flecha según data.arrow y el color del tema, sin tocar los datos guardados.
  const themedEdges = useMemo(() => {
    const marker = { type: MarkerType.ArrowClosed, color: edgeColor }
    return edges.map((e) => {
      const arrow = e.data?.arrow ?? 'end'
      return {
        ...e,
        markerEnd: arrow === 'end' || arrow === 'both' ? marker : undefined,
        markerStart: arrow === 'start' || arrow === 'both' ? marker : undefined,
      }
    })
  }, [edges, edgeColor])

  // ---- Historial (deshacer / rehacer) del tablero activo ----
  const latest = useRef({ nodes, edges })
  latest.current = { nodes, edges }
  const past = useRef([])
  const future = useRef([])
  const typingSnap = useRef(false)

  const snapshotOf = () => cleanDoc(latest.current)

  const takeSnapshot = useCallback(() => {
    past.current.push(cleanDoc(latest.current))
    if (past.current.length > HISTORY_LIMIT) past.current.shift()
    future.current = []
    setTick((t) => t + 1)
  }, [])

  const restore = (doc) => {
    setNodes(doc.nodes)
    setEdges(doc.edges)
    setTick((t) => t + 1)
  }

  const undo = () => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(snapshotOf())
    restore(prev)
  }

  const redo = () => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(snapshotOf())
    restore(next)
  }

  const actions = useMemo(() => ({ takeSnapshot }), [takeSnapshot])

  // ---- Tableros (pestañas) ----
  // Los tableros inactivos viven en `store`; el activo vive en el estado de React Flow.
  const store = useRef(Object.fromEntries(initial.boards.map((b) => [b.id, { nodes: b.nodes, edges: b.edges, past: [], future: [] }])))
  const activeName = boardMeta.find((b) => b.id === activeId)?.name || t('app.defaultFileName')

  const saveActive = () => {
    store.current[activeId] = { ...cleanDoc(latest.current), past: past.current, future: future.current }
  }

  const loadBoard = (id) => {
    const t = store.current[id]
    past.current = t.past
    future.current = t.future
    setNodes(t.nodes)
    setEdges(t.edges)
    setActiveId(id)
    setEditingId(null)
    setTool('select')
    setTick((x) => x + 1)
    setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 60)
  }

  const switchBoard = (id) => {
    if (id === activeId) return
    saveActive()
    loadBoard(id)
  }

  const addBoard = () => {
    saveActive()
    const id = crypto.randomUUID()
    store.current[id] = { nodes: [], edges: [], past: [], future: [] }
    setBoardMeta((m) => [...m, { id, name: t('defaults.board', { n: m.length + 1 }) }])
    loadBoard(id)
    setRenamingBoard(id)
  }

  const closeBoard = (id) => {
    if (boardMeta.length < 2) return
    const name = boardMeta.find((b) => b.id === id)?.name
    if (!window.confirm(t('confirm.closeBoard', { name }))) return
    if (id === activeId) {
      const idx = boardMeta.findIndex((b) => b.id === id)
      const next = boardMeta[idx + 1] ?? boardMeta[idx - 1]
      loadBoard(next.id)
    }
    delete store.current[id]
    setBoardMeta((m) => m.filter((b) => b.id !== id))
  }

  const renameBoard = (id, name) => setBoardMeta((m) => m.map((b) => (b.id === id ? { ...b, name } : b)))

  const collectBoards = () =>
    boardMeta.map((m) => ({
      ...m,
      ...(m.id === activeId ? cleanDoc(latest.current) : { nodes: store.current[m.id].nodes, edges: store.current[m.id].edges }),
    }))

  // ---- Persistencia ----
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, activeId, boards: collectBoards() }))
      } catch {
        // Cuota de almacenamiento local agotada (imágenes grandes): el archivo .flow sigue siendo la copia fiable.
        flash(t('status.autosaveFull'))
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [nodes, edges, boardMeta, activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (msg) => {
    setStatus(msg)
    setTimeout(() => setStatus(''), 2500)
  }

  const serialize = () => JSON.stringify({ version: 2, activeId, boards: collectBoards() }, null, 2)

  const applyDoc = (doc) => {
    store.current = Object.fromEntries(doc.boards.map((b) => [b.id, { nodes: b.nodes, edges: b.edges, past: [], future: [] }]))
    setBoardMeta(doc.boards.map(({ id, name }) => ({ id, name })))
    loadBoard(doc.activeId)
  }

  const save = async () => {
    if (!window.flowFiles) return flash(t('status.desktopOnlySave'))
    const res = await window.flowFiles.save(serialize(), filePath)
    if (res) {
      setFilePath(res.path)
      flash(t('status.saved'))
    }
  }

  const open = async () => {
    const res = await window.flowFiles?.open()
    if (!res) return
    try {
      applyDoc(normalizeDoc(JSON.parse(res.content), docOpts()))
      setFilePath(res.path)
      flash(t('status.opened'))
    } catch {
      flash(t('status.invalidFile'))
    }
  }

  const newDoc = () => {
    if (!window.confirm(t('confirm.newDoc'))) return
    applyDoc(emptyDoc(docOpts()))
    setFilePath(null)
  }

  // ---- Exportar ----
  const doExport = async (format) => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })))
    await new Promise((r) => setTimeout(r, 150))
    flash(t('status.exporting'))
    try {
      const res = await exportBoard(format, { nodes: latest.current.nodes, name: activeName })
      flash(res.error || (res.cancelled ? '' : t('status.exported')))
    } catch (err) {
      console.error(err)
      flash(t('status.exportError'))
    }
  }

  const exportItems = [
    { icon: '🖼', label: t('menu.exportPng'), onSelect: () => doExport('png') },
    { icon: '◩', label: t('menu.exportSvg'), onSelect: () => doExport('svg') },
    { icon: '📄', label: t('menu.exportPdf'), onSelect: () => doExport('pdf') },
  ]

  // ---- Elementos ----
  const openEditor = (id) => {
    typingSnap.current = false
    setEditingId(id)
  }

  const onConnect = useCallback(
    (conn) => {
      takeSnapshot()
      setEdges((eds) => addEdge({ ...conn, ...EDGE_OPTIONS, data: { ...EDGE_DATA_DEFAULTS } }, eds))
    },
    [setEdges, takeSnapshot],
  )

  const addNode = async (kind, preloadedImage) => {
    let image = null
    let imageStyle = { width: 220, height: 220 }
    if (kind === 'image') {
      image = preloadedImage || (await pickImage())
      if (!image) return
      const { w, h } = await imageSize(image)
      imageStyle = { width: w, height: h }
    }
    const rect = wrapper.current.getBoundingClientRect()
    const pos = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    const jitter = () => (Math.random() - 0.5) * 80
    const boxData = (shape, label) => ({ label, color: '#ffffff', shape, note: '', editing: true })
    const presets = {
      box: { type: 'box', style: { width: 180, height: 70 }, data: boxData('round', t('defaults.box')) },
      diamond: { type: 'box', style: { width: 160, height: 110 }, data: boxData('diamond', t('defaults.diamond')) },
      ellipse: { type: 'box', style: { width: 170, height: 90 }, data: boxData('ellipse', t('defaults.ellipse')) },
      hexagon: { type: 'box', style: { width: 170, height: 90 }, data: boxData('hexagon', t('defaults.hexagon')) },
      text: { type: 'text', style: { width: 200, height: 44 }, data: { label: t('defaults.text'), color: 'transparent', note: '', editing: true } },
      sticky: { type: 'sticky', style: { width: 180, height: 140 }, data: { label: t('defaults.sticky'), color: '#fde68a', note: '', editing: true } },
      section: { type: 'section', zIndex: -1, style: { width: 380, height: 260 }, data: { label: t('defaults.section'), color: '#fed7aa', note: '', editing: true } },
      image: { type: 'image', style: imageStyle, data: { label: '', image, note: '' } },
    }
    takeSnapshot()
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      { id: crypto.randomUUID(), position: { x: pos.x + jitter(), y: pos.y + jitter() }, ...presets[kind], selected: true },
    ])
  }

  const insertItems = [
    { icon: '▭', label: t('menu.box'), onSelect: () => addNode('box') },
    { icon: '◇', label: t('menu.diamond'), onSelect: () => addNode('diamond') },
    { icon: '⬭', label: t('menu.ellipse'), onSelect: () => addNode('ellipse') },
    { icon: '⬡', label: t('menu.hexagon'), onSelect: () => addNode('hexagon') },
    'separator',
    { icon: 'T', label: t('menu.text'), onSelect: () => addNode('text') },
    { icon: '🗒', label: t('menu.sticky'), onSelect: () => addNode('sticky') },
    { icon: '▦', label: t('menu.section'), onSelect: () => addNode('section') },
    { icon: '🖼', label: t('menu.image'), onSelect: () => addNode('image') },
  ]

  const updateData = (id, patch) => {
    // Escribir (título o nota) cuenta como un solo paso de deshacer por sesión del editor.
    const typing = 'note' in patch || 'body' in patch || 'label' in patch
    if (!typing || !typingSnap.current) takeSnapshot()
    if (typing) typingSnap.current = true
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)))
  }

  // Quita de los demás elementos los enlaces que apuntaban a los eliminados.
  const pruneLinks = (nds, removedIds) =>
    nds.map((n) =>
      n.data.links?.some((l) => removedIds.has(l)) ? { ...n, data: { ...n.data, links: n.data.links.filter((l) => !removedIds.has(l)) } } : n,
    )

  const deleteNode = (id) => {
    takeSnapshot()
    setNodes((nds) => pruneLinks(nds.filter((n) => n.id !== id), new Set([id])))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    setEditingId(null)
  }

  const deleteSelected = () => {
    takeSnapshot()
    const ids = new Set(latest.current.nodes.filter((n) => n.selected).map((n) => n.id))
    setNodes((nds) => pruneLinks(nds.filter((n) => !n.selected), ids))
    setEdges((eds) => eds.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)))
  }

  const startRename = (_, node) => {
    if (node.type === 'draw' || node.type === 'section') return
    setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, editing: true } } : n)))
  }

  const startEdgeLabel = (_, edge) =>
    setEdges((eds) => eds.map((e) => (e.id === edge.id ? { ...e, data: { ...e.data, editing: true } } : e)))

  // Selecciona un elemento y centra la vista en él (búsqueda y enlaces).
  const focusNode = (id) => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })))
    fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.2, padding: 0.6 })
  }

  // ---- Búsqueda y filtro por color ----
  const q = query.trim().toLowerCase()
  const matchIds = useMemo(
    () =>
      q
        ? nodes.filter((n) => n.type !== 'draw' && `${n.data.label || ''} ${stripHtml(n.data.note)} ${stripHtml(n.data.body)}`.toLowerCase().includes(q)).map((n) => n.id)
        : [],
    [nodes, q],
  )

  const displayNodes = useMemo(() => {
    if (!q && !colorFilter) return nodes
    const matchSet = new Set(matchIds)
    return nodes.map((n) => {
      if (n.type === 'section') return q && matchSet.has(n.id) ? { ...n, className: 'match' } : n
      const dim = (q && !matchSet.has(n.id)) || (colorFilter && n.data.color !== colorFilter)
      if (dim) return { ...n, className: 'dim' }
      return q && matchSet.has(n.id) ? { ...n, className: 'match' } : n
    })
  }, [nodes, q, colorFilter, matchIds])

  const usedColors = useMemo(
    () => [...new Set(nodes.filter((n) => n.type !== 'draw' && n.type !== 'section').map((n) => n.data.color).filter((c) => c && c !== 'transparent'))],
    [nodes],
  )

  const filterItems = [
    { icon: '◎', label: t('menu.allColors'), onSelect: () => setColorFilter(null) },
    ...usedColors.map((c) => ({ icon: <span className="dot" style={{ background: c }} />, label: colorName(c), onSelect: () => setColorFilter(c) })),
  ]

  const onSearchKey = (e) => {
    if (e.key === 'Enter' && matchIds.length) {
      matchIndex.current = (matchIndex.current + (e.shiftKey ? -1 : 1) + matchIds.length) % matchIds.length
      focusNode(matchIds[matchIndex.current])
    }
    if (e.key === 'Escape') {
      setQuery('')
      e.target.blur()
    }
  }

  // ---- Dibujo a mano ----
  const addStroke = ({ position, w, h, points }) => {
    takeSnapshot()
    setNodes((nds) => [
      ...nds,
      { id: crypto.randomUUID(), type: 'draw', position, style: { width: w, height: h }, connectable: false, data: { points, w, h, size: penSize, color: penColor } },
    ])
  }

  const eraseStroke = (id) => setNodes((nds) => nds.filter((n) => n.id !== id))

  // ---- Secciones: mover una sección arrastra lo que tiene dentro ----
  const dragGroup = useRef(null)

  const onNodeDragStart = (_, node) => {
    takeSnapshot()
    if (node.type !== 'section') return
    const { w, h } = sizeOf(node)
    const members = latest.current.nodes.filter((n) => {
      if (n.id === node.id || n.type === 'section' || n.selected) return false
      const s = sizeOf(n)
      const cx = n.position.x + s.w / 2
      const cy = n.position.y + s.h / 2
      return cx >= node.position.x && cx <= node.position.x + w && cy >= node.position.y && cy <= node.position.y + h
    })
    dragGroup.current = { start: { ...node.position }, members: new Map(members.map((n) => [n.id, { ...n.position }])) }
  }

  const onNodeDrag = (_, node) => {
    const g = dragGroup.current
    if (!g || node.type !== 'section') return
    const dx = node.position.x - g.start.x
    const dy = node.position.y - g.start.y
    setNodes((nds) => nds.map((n) => (g.members.has(n.id) ? { ...n, position: { x: g.members.get(n.id).x + dx, y: g.members.get(n.id).y + dy } } : n)))
  }

  const onNodeDragStop = () => {
    dragGroup.current = null
  }

  // ---- Conectores ----
  const selectedEdges = edges.filter((e) => e.selected)
  const selectedNodes = nodes.filter((n) => n.selected)
  const edgeProps = { ...EDGE_DATA_DEFAULTS, ...selectedEdges[0]?.data }

  const setEdgeProps = (patch) => {
    takeSnapshot()
    setEdges((eds) => eds.map((e) => (e.selected ? { ...e, data: { ...e.data, ...patch } } : e)))
  }

  // ---- Copiar, pegar, duplicar ----
  const clipboard = useRef(null)
  const pasteCount = useRef(0)

  const copySelection = () => {
    const { nodes: ns, edges: es } = latest.current
    const sel = ns.filter((n) => n.selected)
    if (!sel.length) return false
    const ids = new Set(sel.map((n) => n.id))
    clipboard.current = {
      nodes: sel.map(cleanNode),
      edges: es.filter((e) => ids.has(e.source) && ids.has(e.target)).map(cleanEdge),
    }
    pasteCount.current = 0
    return true
  }

  const pasteClipboard = () => {
    const cb = clipboard.current
    if (!cb) return
    pasteCount.current += 1
    const off = 30 * pasteCount.current
    const idMap = new Map(cb.nodes.map((n) => [n.id, crypto.randomUUID()]))
    takeSnapshot()
    const newNodes = cb.nodes.map((n) => ({
      ...n,
      id: idMap.get(n.id),
      position: { x: n.position.x + off, y: n.position.y + off },
      data: { ...n.data, links: undefined },
      selected: true,
    }))
    const newEdges = cb.edges.map((e) => ({ ...e, id: crypto.randomUUID(), source: idMap.get(e.source), target: idMap.get(e.target) }))
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes])
    setEdges((eds) => [...eds.map((e) => ({ ...e, selected: false })), ...newEdges])
  }

  const selectAll = () => setNodes((nds) => nds.map((n) => ({ ...n, selected: true })))

  // ---- Alinear y distribuir ----
  const alignNodes = (mode) => {
    const boxes = selectedNodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, ...sizeOf(n) }))
    if ((mode === 'hdist' || mode === 'vdist') && boxes.length === 2) return flash(t('status.distributeMin'))
    const pos = alignPositions(boxes, mode)
    if (!pos) return
    takeSnapshot()
    setNodes((nds) => nds.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id) } : n)))
  }

  // ---- Atajos de teclado y pegado ----
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 's') {
        e.preventDefault()
        save()
        return
      }
      if (mod && key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (e.key === 'Escape') {
        setEditingId(null)
        setTool('select')
      }
      const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]')
      if (!mod || typing || editingId) return
      if (key === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      } else if (key === 'y') {
        e.preventDefault()
        redo()
      } else if (key === 'c') {
        if (copySelection()) e.preventDefault()
      } else if (key === 'x') {
        if (copySelection()) {
          e.preventDefault()
          deleteSelected()
        }
      } else if (key === 'd') {
        e.preventDefault()
        if (copySelection()) pasteClipboard()
      } else if (key === 'a') {
        e.preventDefault()
        selectAll()
      }
    }

    const onPaste = async (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || editingId) return
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
      if (item) {
        e.preventDefault()
        try {
          addNode('image', await fileToImageData(item.getAsFile()))
        } catch (err) {
          flash(err.message)
        }
      } else if (clipboard.current) {
        e.preventDefault()
        pasteClipboard()
      }
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  })

  const editing = nodes.find((n) => n.id === editingId)
  const fileName = filePath ? filePath.split(/[\\/]/).pop() : t('app.unsaved')
  const toggleTool = (t) => setTool((cur) => (cur === t ? 'select' : t))

  return (
    <ActionsContext.Provider value={actions}>
      <div className="app">
        <header className="topbar">
          <img className="logo" src={logo} alt="Flow" />
          <span className="filename">{fileName}</span>
          <Dropdown label={t('app.insert')} items={insertItems} />
          <button className={tool === 'pen' ? 'active' : ''} onClick={() => toggleTool('pen')} title={t('app.penTip')}>{t('app.pen')}</button>
          <button className={tool === 'eraser' ? 'active' : ''} onClick={() => toggleTool('eraser')} title={t('app.eraserTip')}>{t('app.eraser')}</button>
          <div className="spacer" />
          {status && <span className="status">{status}</span>}
          <div className="search">
            <input
              ref={searchRef}
              value={query}
              placeholder={t('app.search')}
              onChange={(e) => {
                setQuery(e.target.value)
                matchIndex.current = -1
              }}
              onKeyDown={onSearchKey}
            />
            {q && <span className="search-count">{matchIds.length}</span>}
          </div>
          <Dropdown label={colorFilter ? `◐ ${colorName(colorFilter)}` : t('app.filter')} items={filterItems} align="right" />
          <Dropdown label={t('app.export')} items={exportItems} align="right" />
          <button onClick={toggleLanguage} title={t('app.language')}>🌐 {i18.language.toUpperCase()}</button>
          <button onClick={toggleTheme} title={theme === 'dark' ? t('app.themeToDay') : t('app.themeToNight')}>{theme === 'dark' ? '🌇' : '🌙'}</button>
          <button onClick={undo} disabled={!past.current.length} title={t('app.undo')}>↶</button>
          <button onClick={redo} disabled={!future.current.length} title={t('app.redo')}>↷</button>
          <button onClick={newDoc}>{t('app.new')}</button>
          <button onClick={open}>{t('app.open')}</button>
          <button className="primary" onClick={save}>{t('app.save')}</button>
        </header>

        <div className="tabs">
          {boardMeta.map((b) => (
            <div key={b.id} className={`tab ${b.id === activeId ? 'active' : ''}`} onClick={() => switchBoard(b.id)} onDoubleClick={() => setRenamingBoard(b.id)}>
              {renamingBoard === b.id ? (
                <input
                  autoFocus
                  value={b.name}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => renameBoard(b.id, e.target.value)}
                  onBlur={() => setRenamingBoard(null)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && setRenamingBoard(null)}
                />
              ) : (
                <span>{b.name || t('app.unnamedBoard')}</span>
              )}
              {boardMeta.length > 1 && (
                <button
                  className="tab-close"
                  title={t('app.closeBoard')}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeBoard(b.id)
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button className="tab-add" onClick={addBoard} title={t('app.newBoard')}>＋</button>
        </div>

        <div className="canvas" ref={wrapper}>
          <Stars />
          <ReactFlow
            nodes={displayNodes}
            edges={themedEdges}
            colorMode={theme}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeContextMenu={(e, node) => {
              e.preventDefault()
              if (node.type !== 'draw') openEditor(node.id)
            }}
            onNodeDoubleClick={startRename}
            onEdgeDoubleClick={startEdgeLabel}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onSelectionDragStart={takeSnapshot}
            onBeforeDelete={async () => {
              takeSnapshot()
              return true
            }}
            onNodesDelete={(deleted) => setNodes((nds) => pruneLinks(nds, new Set(deleted.map((n) => n.id))))}
            defaultEdgeOptions={EDGE_OPTIONS}
            connectionLineStyle={{ stroke: edgeColor, strokeWidth: 2 }}
            connectionMode={ConnectionMode.Loose}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnDrag={[1, 2]}
            minZoom={0.1}
            proOptions={{ hideAttribution: true }}
            elevateNodesOnSelect={false}
            zoomOnDoubleClick={false}
            fitView
            deleteKeyCode={editingId ? null : ['Delete', 'Backspace']}
          >
            <Background gap={20} color={theme === 'dark' ? 'rgba(165,180,252,0.1)' : 'rgba(124,45,18,0.16)'} />
            <Controls />
            <MiniMap pannable zoomable nodeColor={(n) => (n.data?.color && n.data.color !== 'transparent' ? n.data.color : '#94a3b8')} />
          </ReactFlow>

          {tool !== 'select' && (
            <DrawingLayer tool={tool} color={penColor} size={penSize} onStroke={addStroke} onErase={eraseStroke} />
          )}

          <div className="float-panels">
            {tool === 'pen' && (
              <div className="float-panel">
                <span className="panel-label">{t('pen.color')}</span>
                {PEN_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`swatch small ${penColor === c ? 'active' : ''}`}
                    style={{ background: c === 'auto' ? 'var(--text)' : c }}
                    onClick={() => setPenColor(c)}
                    title={c === 'auto' ? t('pen.auto') : c}
                  />
                ))}
                <span className="panel-label">{t('pen.thickness')}</span>
                <input type="range" min="2" max="24" value={penSize} onChange={(e) => setPenSize(Number(e.target.value))} />
                <button onClick={() => setTool('select')}>{t('pen.done')}</button>
              </div>
            )}
            {tool === 'eraser' && (
              <div className="float-panel">
                <span className="panel-label">{t('pen.eraserHelp')}</span>
                <button onClick={() => setTool('select')}>{t('pen.done')}</button>
              </div>
            )}
            {tool === 'select' && selectedEdges.length > 0 && (
              <div className="float-panel">
                <span className="panel-label">{t('edge.title')}</span>
                <div className="seg">
                  {PATH_OPTIONS.map((id) => (
                    <button key={id} className={edgeProps.path === id ? 'active' : ''} onClick={() => setEdgeProps({ path: id })}>{t(`edge.path.${id}`)}</button>
                  ))}
                </div>
                <div className="seg">
                  {ARROW_OPTIONS.map(([id, label]) => (
                    <button key={id} title={t(`edge.arrow.${id}`)} className={edgeProps.arrow === id ? 'active' : ''} onClick={() => setEdgeProps({ arrow: id })}>{label}</button>
                  ))}
                </div>
                <button className={edgeProps.dashed ? 'active' : ''} onClick={() => setEdgeProps({ dashed: !edgeProps.dashed })}>{t('edge.dashed')}</button>
              </div>
            )}
            {tool === 'select' && selectedNodes.length > 1 && (
              <div className="float-panel">
                <span className="panel-label">{t('align.selected', { count: selectedNodes.length })}</span>
                <div className="seg">
                  {ALIGN_OPTIONS.map(([id, label]) => (
                    <button key={id} title={t(`align.${id}`)} onClick={() => alignNodes(id)}>{label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="hint">
            {t('app.hint')}
          </div>
        </div>

        {editing && (
          <NoteEditor
            key={editing.id}
            node={editing}
            allNodes={nodes.filter((n) => n.type !== 'draw')}
            onChange={(patch) => updateData(editing.id, patch)}
            onDelete={() => deleteNode(editing.id)}
            onClose={() => setEditingId(null)}
            onJump={(id) => {
              setEditingId(null)
              focusNode(id)
            }}
          />
        )}
      </div>
    </ActionsContext.Provider>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  )
}
