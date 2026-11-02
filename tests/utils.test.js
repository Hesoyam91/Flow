// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { safeUrl, stripHtml, taskProgress } from '../src/utils.js'
import { alignPositions } from '../src/layout.js'
import { strokePath } from '../src/strokes.js'

describe('stripHtml', () => {
  it('devuelve el texto plano', () => {
    expect(stripHtml('<p>Hola <b>mundo</b></p><ul><li>uno</li></ul>')).toBe('Hola mundo uno')
    expect(stripHtml('')).toBe('')
    expect(stripHtml(undefined)).toBe('')
  })

  it('no crea elementos en el documento real (usa un parser inerte)', () => {
    const spy = vi.spyOn(document, 'createElement')
    stripHtml('<img src=x onerror="globalThis.__pwned=1"><script>globalThis.__pwned=2</script>texto')
    expect(spy).not.toHaveBeenCalled()
    expect(globalThis.__pwned).toBeUndefined()
    spy.mockRestore()
  })
})

describe('safeUrl', () => {
  it('añade https y acepta http, https y mailto', () => {
    expect(safeUrl('example.com')).toBe('https://example.com/')
    expect(safeUrl('http://example.com/a?b=1')).toBe('http://example.com/a?b=1')
    expect(safeUrl('mailto:a@b.co')).toBe('mailto:a@b.co')
  })

  it('rechaza protocolos peligrosos y entradas vacías', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'file:///C:/x', 'vbscript:x', '', '   ', null, undefined]) {
      expect(safeUrl(bad)).toBeNull()
    }
  })
})

describe('taskProgress', () => {
  const html = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">a</li><li data-type="taskItem" data-checked="false">b</li><li data-type="taskItem" data-checked="false">c</li></ul>'
  it('cuenta tareas hechas y totales', () => {
    expect(taskProgress(html)).toEqual({ done: 1, total: 3 })
  })
  it('devuelve null sin tareas', () => {
    expect(taskProgress('<p>hola</p>')).toBeNull()
    expect(taskProgress('')).toBeNull()
  })
})

describe('alignPositions', () => {
  const boxes = [
    { id: 'a', x: 0, y: 0, w: 100, h: 50 },
    { id: 'b', x: 200, y: 100, w: 50, h: 100 },
    { id: 'c', x: 500, y: 30, w: 100, h: 20 },
  ]

  it('alinea a los bordes y centros', () => {
    expect(alignPositions(boxes, 'left').get('b')).toEqual({ x: 0, y: 100 })
    expect(alignPositions(boxes, 'right').get('a')).toEqual({ x: 500, y: 0 })
    expect(alignPositions(boxes, 'top').get('b')).toEqual({ x: 200, y: 0 })
    expect(alignPositions(boxes, 'bottom').get('a')).toEqual({ x: 0, y: 150 })
    expect(alignPositions(boxes, 'hcenter').get('b').x).toBe(300 - 25)
    expect(alignPositions(boxes, 'vcenter').get('c').y).toBe(100 - 10)
  })

  it('distribuye con huecos iguales', () => {
    const pos = alignPositions(boxes, 'hdist')
    const gaps = [pos.get('b').x - (pos.get('a').x + 100), pos.get('c').x - (pos.get('b').x + 50)]
    expect(gaps[0]).toBeCloseTo(gaps[1])
    expect(pos.get('a').x).toBe(0)
    expect(pos.get('c').x).toBe(500)
  })

  it('devuelve null con pocos elementos', () => {
    expect(alignPositions([boxes[0]], 'left')).toBeNull()
    expect(alignPositions(boxes.slice(0, 2), 'hdist')).toBeNull()
  })
})

describe('strokePath', () => {
  it('genera un contorno SVG cerrado', () => {
    const d = strokePath([[0, 0, 0.5], [10, 5, 0.5], [20, 0, 0.5]], 5)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })
  it('no falla con un solo punto', () => {
    expect(() => strokePath([[0, 0, 0.5]], 5)).not.toThrow()
  })
})
