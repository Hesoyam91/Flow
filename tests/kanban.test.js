import { describe, expect, it } from 'vitest'
import { COLUMN, dropCards, dropTarget, layoutColumns } from '../src/kanban.js'
import { normalizeDoc } from '../src/doc.js'
import { TEMPLATES, instantiateTemplate } from '../src/templates.js'

const column = (id, x = 0, y = 0, width = 300) => ({ id, type: 'column', position: { x, y }, style: { width, height: 220 }, data: { label: id } })
const card = (id, columnId, y, height = 100) => ({ id, type: 'sticky', position: { x: 0, y }, style: { width: 276 }, measured: { width: 276, height }, data: { label: id, columnId } })
const note = (id, x, y) => ({ id, type: 'sticky', position: { x, y }, style: { width: 180, height: 140 }, measured: { width: 180, height: 140 }, data: { label: id } })
const byId = (nodes, id) => nodes.find((n) => n.id === id)
const cardY = (i, heights) => COLUMN.header + heights.slice(0, i).reduce((s, h) => s + h + COLUMN.gap, 0)

describe('layoutColumns', () => {
  it('no toca nada en un tablero sin columnas (devuelve el mismo array)', () => {
    const nodes = [note('a', 5, 5)]
    expect(layoutColumns(nodes)).toBe(nodes)
  })

  it('apila las tarjetas por orden y las centra en la columna', () => {
    const out = layoutColumns([column('c', 100, 50), card('b', 'c', 20), card('a', 'c', 10)])
    expect(byId(out, 'a').position).toEqual({ x: 100 + COLUMN.pad, y: 50 + COLUMN.header })
    expect(byId(out, 'b').position).toEqual({ x: 100 + COLUMN.pad, y: 50 + COLUMN.header + 100 + COLUMN.gap })
  })

  it('es estable: una segunda pasada devuelve el mismo array', () => {
    const once = layoutColumns([column('c'), card('a', 'c', 1), card('b', 'c', 2)])
    expect(layoutColumns(once)).toBe(once)
  })

  it('las tarjetas ajustan su ancho a la columna y no fijan altura', () => {
    const out = layoutColumns([column('c', 0, 0, 400), { ...card('a', 'c', 1), width: 50, height: 50, style: { width: 50, height: 50 } }])
    const a = byId(out, 'a')
    expect(a.style).toEqual({ width: 400 - COLUMN.pad * 2 })
    expect(a.width).toBeUndefined()
    expect(a.height).toBeUndefined()
  })

  it('la columna crece con sus tarjetas y nunca baja del mínimo', () => {
    const tall = layoutColumns([column('c'), card('a', 'c', 1, 400), card('b', 'c', 2, 400)])
    expect(byId(tall, 'c').style.height).toBe(COLUMN.header + 400 + COLUMN.gap + 400 + COLUMN.footer)
    const empty = layoutColumns([column('c')])
    expect(parseFloat(byId(empty, 'c').style.height)).toBe(COLUMN.minHeight)
  })

  it('mover la columna arrastra sus tarjetas', () => {
    const start = layoutColumns([column('c'), card('a', 'c', 1)])
    const moved = start.map((n) => (n.id === 'c' ? { ...n, position: { x: 500, y: 200 } } : n))
    expect(byId(layoutColumns(moved), 'a').position).toEqual({ x: 500 + COLUMN.pad, y: 200 + COLUMN.header })
  })

  it('si la columna desaparece, la tarjeta sigue viva como nota normal con altura propia', () => {
    const out = layoutColumns([card('a', 'borrada', 1, 130)])
    const a = byId(out, 'a')
    expect(a.data.columnId).toBeUndefined()
    expect(a.style.height).toBe(130)
  })

  it('durante un arrastre deja quieta la tarjeta y abre el hueco en su destino', () => {
    const base = [column('c1'), column('c2', 400), card('a', 'c1', 1), card('b', 'c2', 1), card('d', 'c2', 2)]
    const drag = { ids: new Set(['a']), over: 'c2', index: 1, height: 100 }
    const out = layoutColumns(base, drag)
    expect(byId(out, 'a').position).toEqual(byId(base, 'a').position)
    const heights = [100, 100]
    expect(byId(out, 'b').position.y).toBe(cardY(0, heights))
    expect(byId(out, 'd').position.y).toBe(cardY(2, [100, 100, 100]))
  })
})

describe('dropTarget y dropCards', () => {
  const board = () => layoutColumns([column('todo'), column('done', 400), card('a', 'todo', 1), card('b', 'todo', 2), card('c', 'done', 1)])

  it('detecta columna y posición por el centro de la tarjeta', () => {
    const nodes = board()
    const t = dropTarget(nodes, { ...byId(nodes, 'a'), position: { x: 420, y: COLUMN.header + 90 } })
    expect(t.over).toBe('done')
    expect(t.index).toBe(1)
  })

  it('fuera de cualquier columna no hay destino', () => {
    const nodes = board()
    expect(dropTarget(nodes, { ...byId(nodes, 'a'), position: { x: 2000, y: 40 } })).toBeNull()
  })

  it('soltar en otra columna cambia de columna y respeta el orden', () => {
    const nodes = board().map((n) => (n.id === 'a' ? { ...n, position: { x: 420, y: 0 } } : n))
    const out = layoutColumns(dropCards(nodes, new Set(['a'])))
    expect(byId(out, 'a').data.columnId).toBe('done')
    expect(byId(out, 'a').position.y).toBeLessThan(byId(out, 'c').position.y)
    expect(byId(out, 'b').position.y).toBe(COLUMN.header) // la columna de origen cierra el hueco
  })

  it('reordena dentro de la misma columna', () => {
    const nodes = board().map((n) => (n.id === 'a' ? { ...n, position: { x: 12, y: 400 } } : n))
    const out = layoutColumns(dropCards(nodes, new Set(['a'])))
    expect(byId(out, 'b').position.y).toBeLessThan(byId(out, 'a').position.y)
  })

  it('soltar fuera convierte la tarjeta en nota libre', () => {
    const nodes = board().map((n) => (n.id === 'a' ? { ...n, position: { x: 2000, y: 40 } } : n))
    const a = byId(dropCards(nodes, new Set(['a'])), 'a')
    expect(a.data.columnId).toBeUndefined()
    expect(a.position).toEqual({ x: 2000, y: 40 })
    expect(a.style.height).toBeGreaterThanOrEqual(100)
  })

  it('una nota libre entra en una columna como tarjeta de altura automática', () => {
    const nodes = [...board(), note('n', 420, 100)]
    const out = dropCards(nodes, new Set(['n']))
    const n = byId(out, 'n')
    expect(n.data.columnId).toBe('done')
    expect(n.style.height).toBeUndefined()
  })

  it('quita la elevación del arrastre', () => {
    const nodes = board().map((n) => (n.id === 'a' ? { ...n, zIndex: 1000 } : n))
    expect(byId(dropCards(nodes, new Set(['a'])), 'a').zIndex).toBeUndefined()
  })
})

describe('archivos con tableros', () => {
  const load = (nodes) => normalizeDoc({ nodes, edges: [] }).boards[0].nodes

  it('conserva columnas y tarjetas', () => {
    const [c, a] = load([column('c'), card('a', 'c', 1)])
    expect(c).toMatchObject({ type: 'column', zIndex: -1, dragHandle: '.column-header' })
    expect(a.data.columnId).toBe('c')
    expect(a.style.height).toBeUndefined()
  })

  it('una tarjeta que apunta a algo que no es una columna vuelve a ser nota', () => {
    const [, a] = load([{ ...note('x', 0, 0) }, card('a', 'x', 1)])
    expect(a.data.columnId).toBeUndefined()
    expect(a.style.height).toBeGreaterThan(0)
  })

  it('conserva el tamaño de un elemento redimensionado (node.width/height)', () => {
    const [n] = load([{ ...note('n', 0, 0), width: 512, height: 333 }])
    expect(n.style).toEqual({ width: 512, height: 333 })
    expect(n.initialWidth).toBe(512)
  })
})

describe('plantillas', () => {
  const t = (key, opts) => `${key}${opts?.n ?? ''}`

  it.each(TEMPLATES.map((x) => [x.id, x]))('%s: no pierde nada al sanitizar', (_id, template) => {
    const raw = template.build(t)
    const { nodes, edges } = instantiateTemplate(template, t)
    expect(nodes).toHaveLength(raw.nodes.length)
    expect(edges).toHaveLength(raw.edges.length)
    const ids = new Set(nodes.map((n) => n.id))
    edges.forEach((e) => {
      expect(ids.has(e.source)).toBe(true)
      expect(ids.has(e.target)).toBe(true)
    })
  })

  it('cada uso genera ids nuevos', () => {
    const scrum = TEMPLATES.find((x) => x.id === 'scrum')
    const a = instantiateTemplate(scrum, t).nodes.map((n) => n.id)
    const b = new Set(instantiateTemplate(scrum, t).nodes.map((n) => n.id))
    expect(a.some((id) => b.has(id))).toBe(false)
  })

  it('el tablero Scrum trae tres columnas con sus tarjetas enlazadas', () => {
    const { nodes } = instantiateTemplate(TEMPLATES.find((x) => x.id === 'scrum'), t)
    const columns = nodes.filter((n) => n.type === 'column')
    expect(columns.map((c) => c.data.label)).toEqual(['To Do', 'In Progress', 'Done'])
    const cards = nodes.filter((n) => n.type === 'sticky')
    expect(cards.length).toBeGreaterThan(0)
    cards.forEach((c) => expect(columns.some((col) => col.id === c.data.columnId)).toBe(true))
  })
})
