// Plantillas: cada una construye un tablero con textos en el idioma activo.
import { normalizeDoc } from './doc.js'

const WHITE = '#ffffff'
const YELLOW = '#fde68a'
const BLUE = '#bfdbfe'
const GREEN = '#bbf7d0'
const VIOLET = '#ddd6fe'
const ORANGE = '#fed7aa'
const PINK = '#fbcfe8'
const TEAL = '#99f6e4'

const box = (id, label, x, y, shape, color, w = 180, h = 70) => ({ id, type: 'box', position: { x, y }, style: { width: w, height: h }, data: { label, color, shape, note: '' } })
const sticky = (id, label, desc, x, y, color, w = 200, h = 120) => ({ id, type: 'sticky', position: { x, y }, style: { width: w, height: h }, data: { label, desc, color, note: '' } })
const title = (id, label, x, y, fontSize = 32) => ({ id, type: 'text', position: { x, y }, style: { width: Math.ceil(label.length * fontSize * 0.6) + 30, height: Math.ceil(fontSize * 1.6) }, data: { label, color: 'transparent', note: '', fontSize } })
const section = (id, label, x, y, w, h, color, body = '') => ({ id, type: 'section', position: { x, y }, style: { width: w, height: h }, data: { label, color, note: '', body, fontSize: 18 } })
const column = (id, label, x, color) => ({ id, type: 'column', position: { x, y: 0 }, style: { width: 300, height: 220 }, data: { label, color, note: '' } })
const card = (id, columnId, y, label, desc) => ({ id, type: 'sticky', position: { x: 0, y }, style: { width: 276 }, data: { label, desc, color: WHITE, note: '', columnId } })
const image = (id, x, y, w, h) => ({ id, type: 'image', position: { x, y }, style: { width: w, height: h }, data: { label: '', note: '' } })
const edge = (id, source, target, sourceHandle, targetHandle, data = {}) => ({ id, source, target, sourceHandle, targetHandle, type: 'label', data: { path: 'smoothstep', arrow: 'end', dashed: false, ...data } })

function scrum(t) {
  return {
    nodes: [
      column('todo', 'To Do', 0, BLUE),
      column('doing', 'In Progress', 330, YELLOW),
      column('done', 'Done', 660, GREEN),
      card('c1', 'todo', 1, t('templates.scrum.card1'), t('templates.scrum.card1Desc')),
      card('c2', 'todo', 2, t('templates.scrum.card2'), t('templates.scrum.card2Desc')),
      card('c3', 'todo', 3, t('templates.scrum.card3'), ''),
      card('c4', 'doing', 1, t('templates.scrum.card4'), t('templates.scrum.card4Desc')),
      card('c5', 'done', 1, t('templates.scrum.card5'), ''),
    ],
    edges: [],
  }
}

function flowchart(t) {
  const x = 40
  return {
    nodes: [
      box('start', t('templates.flowchart.start'), x + 10, 0, 'ellipse', TEAL, 160, 70),
      box('step1', t('templates.flowchart.step1'), x, 130, 'round', WHITE),
      box('check', t('templates.flowchart.check'), x - 10, 260, 'diamond', VIOLET, 200, 120),
      box('step2', t('templates.flowchart.step2'), x, 450, 'round', WHITE),
      box('end', t('templates.flowchart.end'), x + 10, 580, 'ellipse', ORANGE, 160, 70),
      box('fix', t('templates.flowchart.fix'), x + 290, 285, 'round', YELLOW),
    ],
    edges: [
      edge('e1', 'start', 'step1', 'bottom', 'top'),
      edge('e2', 'step1', 'check', 'bottom', 'top'),
      edge('e3', 'check', 'step2', 'bottom', 'top', { label: t('templates.flowchart.yes') }),
      edge('e4', 'step2', 'end', 'bottom', 'top'),
      edge('e5', 'check', 'fix', 'right', 'left', { label: t('templates.flowchart.no') }),
      edge('e6', 'fix', 'step1', 'top', 'right'),
    ],
  }
}

function mindmap(t) {
  const branch = (id, label, x, y, color) => box(id, label, x, y, 'pill', color, 170, 60)
  const leaf = (id, label, x, y) => box(id, label, x, y, 'round', WHITE, 140, 50)
  const link = (id, a, b, ah, bh) => edge(id, a, b, ah, bh, { path: 'bezier', arrow: 'none' })
  return {
    nodes: [
      box('center', t('templates.mindmap.center'), 340, 215, 'ellipse', YELLOW, 220, 100),
      branch('b1', t('templates.mindmap.branch1'), 40, 60, BLUE),
      branch('b2', t('templates.mindmap.branch2'), 40, 400, GREEN),
      branch('b3', t('templates.mindmap.branch3'), 690, 60, PINK),
      branch('b4', t('templates.mindmap.branch4'), 690, 400, VIOLET),
      leaf('l1', t('templates.mindmap.idea'), -180, 0),
      leaf('l2', t('templates.mindmap.idea'), -180, 110),
      leaf('l3', t('templates.mindmap.idea'), -180, 350),
      leaf('l4', t('templates.mindmap.idea'), -180, 460),
      leaf('l5', t('templates.mindmap.idea'), 940, 0),
      leaf('l6', t('templates.mindmap.idea'), 940, 110),
      leaf('l7', t('templates.mindmap.idea'), 940, 350),
      leaf('l8', t('templates.mindmap.idea'), 940, 460),
    ],
    edges: [
      link('m1', 'center', 'b1', 'left', 'right'),
      link('m2', 'center', 'b2', 'left', 'right'),
      link('m3', 'center', 'b3', 'right', 'left'),
      link('m4', 'center', 'b4', 'right', 'left'),
      link('m5', 'b1', 'l1', 'left', 'right'),
      link('m6', 'b1', 'l2', 'left', 'right'),
      link('m7', 'b2', 'l3', 'left', 'right'),
      link('m8', 'b2', 'l4', 'left', 'right'),
      link('m9', 'b3', 'l5', 'right', 'left'),
      link('m10', 'b3', 'l6', 'right', 'left'),
      link('m11', 'b4', 'l7', 'right', 'left'),
      link('m12', 'b4', 'l8', 'right', 'left'),
    ],
  }
}

function timeline(t) {
  const colors = [BLUE, VIOLET, PINK, ORANGE, GREEN]
  const nodes = [title('title', t('templates.timeline.title'), 0, -90)]
  const edges = []
  colors.forEach((color, i) => {
    const x = i * 270
    const n = i + 1
    nodes.push(box(`m${n}`, t('templates.timeline.milestone', { n }), x + 15, 0, 'pill', color, 190, 64))
    nodes.push(sticky(`s${n}`, t('templates.timeline.when', { n }), t('templates.timeline.what'), x, 130, YELLOW, 220, 130))
    edges.push(edge(`d${n}`, `m${n}`, `s${n}`, 'bottom', 'top', { path: 'straight', arrow: 'none', dashed: true }))
    if (i > 0) edges.push(edge(`l${n}`, `m${i}`, `m${n}`, 'right', 'left', { path: 'straight' }))
  })
  return { nodes, edges }
}

function moodboard(t) {
  return {
    nodes: [
      title('title', t('templates.moodboard.title'), 0, -90, 36),
      section('inspo', t('templates.moodboard.inspiration'), 0, 0, 640, 470, ORANGE),
      image('i1', 30, 40, 280, 190),
      image('i2', 330, 40, 280, 190),
      image('i3', 30, 250, 280, 190),
      image('i4', 330, 250, 280, 190),
      section('palette', t('templates.moodboard.palette'), 680, 0, 400, 190, PINK),
      box('p1', '', 705, 50, 'round', '#f97316', 64, 110),
      box('p2', '', 778, 50, 'round', '#ec4899', 64, 110),
      box('p3', '', 851, 50, 'round', '#8b5cf6', 64, 110),
      box('p4', '', 924, 50, 'round', '#0ea5e9', 64, 110),
      box('p5', '', 997, 50, 'round', '#10b981', 64, 110),
      section('words', t('templates.moodboard.keywords'), 680, 230, 400, 240, VIOLET, `<ul><li><p>${t('templates.moodboard.word1')}</p></li><li><p>${t('templates.moodboard.word2')}</p></li><li><p>${t('templates.moodboard.word3')}</p></li></ul>`),
    ],
    edges: [],
  }
}

export const TEMPLATES = [
  { id: 'scrum', build: scrum, featured: true },
  { id: 'flowchart', build: flowchart },
  { id: 'mindmap', build: mindmap },
  { id: 'timeline', build: timeline },
  { id: 'moodboard', build: moodboard },
]

// Tablero listo para usar: pasa por la misma sanitización que un archivo y con ids nuevos (se puede usar varias veces).
export function instantiateTemplate(template, t) {
  const raw = template.build(t)
  const ids = new Map(raw.nodes.map((n) => [n.id, crypto.randomUUID()]))
  const doc = normalizeDoc({
    nodes: raw.nodes.map((n) => ({
      ...n,
      id: ids.get(n.id),
      data: { ...n.data, ...(n.data.columnId ? { columnId: ids.get(n.data.columnId) } : {}) },
    })),
    edges: raw.edges.map((e) => ({ ...e, id: crypto.randomUUID(), source: ids.get(e.source), target: ids.get(e.target) })),
  })
  return { nodes: doc.boards[0].nodes, edges: doc.boards[0].edges }
}
