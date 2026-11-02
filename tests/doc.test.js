import { describe, expect, it } from 'vitest'
import { cleanDoc, defaultDoc, emptyDoc, normalizeDoc } from '../src/doc.js'

const box = (id, extra = {}) => ({ id, type: 'box', position: { x: 10, y: 20 }, style: { width: 100, height: 50 }, data: { label: id, color: '#ffffff', shape: 'round', note: '' }, ...extra })

describe('normalizeDoc: formatos', () => {
  it('migra el formato antiguo (un solo diagrama) a un tablero', () => {
    const doc = normalizeDoc({ nodes: [box('a')], edges: [] })
    expect(doc.boards).toHaveLength(1)
    expect(doc.boards[0].name).toBe('Board 1')
    expect(doc.activeId).toBe(doc.boards[0].id)
  })

  it('conserva varios tableros y el activo', () => {
    const doc = normalizeDoc({ activeId: 'b2', boards: [{ id: 'b1', name: 'Uno', nodes: [], edges: [] }, { id: 'b2', name: 'Dos', nodes: [box('a')], edges: [] }] })
    expect(doc.boards.map((b) => b.name)).toEqual(['Uno', 'Dos'])
    expect(doc.activeId).toBe('b2')
  })

  it('no lanza con basura y devuelve un documento usable', () => {
    for (const junk of [null, undefined, 42, 'texto', [], { boards: 'x' }, { nodes: 'x', edges: 5 }]) {
      const doc = normalizeDoc(junk)
      expect(doc.boards.length).toBeGreaterThan(0)
      expect(doc.boards.some((b) => b.id === doc.activeId)).toBe(true)
    }
  })

  it('renombra tableros con id repetido', () => {
    const doc = normalizeDoc({ boards: [{ id: 'x', nodes: [], edges: [] }, { id: 'x', nodes: [], edges: [] }] })
    expect(new Set(doc.boards.map((b) => b.id)).size).toBe(2)
  })

  it('documentos por defecto', () => {
    expect(defaultDoc().boards[0].nodes).toHaveLength(1)
    expect(emptyDoc().boards[0].nodes).toHaveLength(0)
  })
})

describe('normalizeDoc: nodos', () => {
  const nodesOf = (nodes) => normalizeDoc({ nodes, edges: [] }).boards[0].nodes

  it('descarta tipos desconocidos, ids inválidos y posiciones no numéricas', () => {
    const out = nodesOf([box('ok'), box('x', { type: 'script' }), { ...box('y'), position: { x: 'a', y: 1 } }, { ...box(''), id: '' }, null, 7, { ...box('z'), position: { x: NaN, y: 0 } }])
    expect(out.map((n) => n.id)).toEqual(['ok'])
  })

  it('elimina ids duplicados', () => {
    expect(nodesOf([box('a'), box('a')])).toHaveLength(1)
  })

  it('no copia propiedades desconocidas ni campos peligrosos', () => {
    const [n] = nodesOf([{ ...box('a'), evil: 'x', data: { label: 'hola', onClick: 'alert(1)', __proto__: { polluted: true }, note: '' } }])
    expect(n.evil).toBeUndefined()
    expect(n.data.onClick).toBeUndefined()
    expect({}.polluted).toBeUndefined()
  })

  it('limita tamaños y valida colores', () => {
    const [n] = nodesOf([{ ...box('a'), style: { width: 9e9, height: -5 }, data: { label: 'x', color: 'red; background:url(http://evil)', shape: 'nope', note: '' } }])
    expect(n.style.width).toBeLessThanOrEqual(50000)
    expect(n.style.height).toBeGreaterThanOrEqual(1)
    expect(n.data.color).toBe('#ffffff')
    expect(n.data.shape).toBe('round')
  })

  it('descarta imágenes remotas y javascript:, conserva data:image', () => {
    const img = (src) => nodesOf([{ id: 'i', type: 'image', position: { x: 0, y: 0 }, style: { width: 50, height: 50 }, data: { image: src, label: '' } }])[0].data.image
    expect(img('http://evil.example/track.png')).toBeUndefined()
    expect(img('https://evil.example/x.png')).toBeUndefined()
    expect(img('javascript:alert(1)')).toBeUndefined()
    expect(img('data:text/html;base64,PHNjcmlwdD4=')).toBeUndefined()
    expect(img('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
  })

  it('valida los trazos: puntos numéricos, máximo y tipos', () => {
    const draw = (points) => nodesOf([{ id: 'd', type: 'draw', position: { x: 0, y: 0 }, style: { width: 20, height: 20 }, data: { points, w: 20, h: 20, size: 5, color: 'auto' } }])
    expect(draw([[0, 0], [5, 5]])).toHaveLength(1)
    expect(draw('no')).toHaveLength(0)
    expect(draw([[0, 0]])).toHaveLength(0)
    expect(draw([[0, 0], ['a', 1]])).toHaveLength(0)
    const big = Array.from({ length: 50000 }, (_, i) => [i, i])
    expect(draw(big)[0].data.points.length).toBe(20000)
  })

  it('las secciones se fuerzan al fondo y conservan su cuerpo', () => {
    const [s] = nodesOf([{ id: 's', type: 'section', zIndex: 9999, position: { x: 0, y: 0 }, style: { width: 300, height: 200 }, data: { label: 'S', body: '<p>hola</p>', color: '#fdba74' } }])
    expect(s.zIndex).toBe(-1)
    expect(s.data.body).toBe('<p>hola</p>')
  })

  it('los enlaces solo apuntan a elementos existentes', () => {
    const [a] = nodesOf([box('a', { data: { label: 'a', note: '', links: ['b', 'fantasma', 5] } }), box('b')])
    expect(a.data.links).toEqual(['b'])
  })

  it('limita la cantidad de nodos', () => {
    const many = Array.from({ length: 6000 }, (_, i) => box(`n${i}`))
    expect(nodesOf(many).length).toBe(5000)
  })
})

describe('normalizeDoc: aristas', () => {
  it('descarta aristas a nodos inexistentes y normaliza opciones', () => {
    const doc = normalizeDoc({
      nodes: [box('a'), box('b')],
      edges: [
        { id: 'e1', source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left', data: { path: 'bezier', arrow: 'both', dashed: true, label: 'sí' } },
        { id: 'e2', source: 'a', target: 'nada' },
        { id: 'e3', source: 'a', target: 'b', sourceHandle: '<img>', data: { path: 'x', arrow: 'y', dashed: 'si' } },
        { id: 'e1', source: 'b', target: 'a' },
      ],
    })
    const edges = doc.boards[0].edges
    expect(edges.map((e) => e.id)).toEqual(['e1', 'e3'])
    expect(edges[0].data).toEqual({ path: 'bezier', arrow: 'both', dashed: true, label: 'sí' })
    expect(edges[1].sourceHandle).toBeNull()
    expect(edges[1].data).toEqual({ path: 'smoothstep', arrow: 'end', dashed: false })
  })
})

describe('cleanDoc', () => {
  it('quita selección y estados de edición, y las puntas guardadas', () => {
    const out = cleanDoc({
      nodes: [{ ...box('a'), selected: true, className: 'dim', data: { label: 'a', editing: true, bodyEditing: true } }],
      edges: [{ id: 'e', source: 'a', target: 'a', selected: true, markerEnd: { type: 'x' }, data: { editing: true } }],
    })
    expect(out.nodes[0]).toMatchObject({ selected: false, className: undefined, data: { editing: false, bodyEditing: false } })
    expect(out.edges[0].markerEnd).toBeUndefined()
    expect(out.edges[0].data).toMatchObject({ editing: false, path: 'smoothstep', arrow: 'end' })
  })
})
