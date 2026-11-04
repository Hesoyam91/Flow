// Tablero tipo Trello: las columnas son nodos 'column' y las tarjetas son notas adhesivas con data.columnId.
// La posición de una tarjeta siempre se deriva de su columna y de su orden (su "y" relativa a las demás),
// así que mover columnas, borrar tarjetas o escribir descripciones largas reacomoda todo solo.

export const COLUMN = { pad: 12, header: 52, footer: 48, gap: 10, minHeight: 220 }

const first = (...values) => values.find((v) => Number.isFinite(v))

export const columnWidth = (n) => first(n.width, parseFloat(n.style?.width), n.measured?.width, 300)
export const columnHeight = (n) => first(parseFloat(n.style?.height), n.height, n.measured?.height, COLUMN.minHeight)
export const cardWidth = (n) => first(n.measured?.width, n.width, parseFloat(n.style?.width), 180)
// La altura real de una tarjeta depende de su texto: se usa la medida del DOM en cuanto existe.
export const cardHeight = (n) => first(n.measured?.height, n.height, parseFloat(n.style?.height), n.initialHeight, 90)

const isColumn = (n) => n.type === 'column'
const isCardOf = (n, columnId) => n.type === 'sticky' && n.data?.columnId === columnId
const byOrder = (a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id)

// Convierte una nota en tarjeta: la altura pasa a ser automática (crece con su texto).
function toCard(n, columnId, y) {
  const { width, height, ...rest } = n // eslint-disable-line no-unused-vars
  const { height: styleHeight, ...style } = n.style || {} // eslint-disable-line no-unused-vars
  return { ...rest, style, position: { x: n.position.x, y }, data: { ...n.data, columnId } }
}

// Devuelve una tarjeta al lienzo libre como nota normal, con el tamaño que tenía.
function toFreeNote(n) {
  const { columnId, ...data } = n.data // eslint-disable-line no-unused-vars
  const { width, height, ...rest } = n // eslint-disable-line no-unused-vars
  return { ...rest, style: { width: cardWidth(n), height: Math.max(cardHeight(n), 100) }, data }
}

// Calcula dónde va cada tarjeta y cuánto mide cada columna. `drag` (opcional) describe el arrastre en curso:
// { ids: Set, over: columnId, index, height }: las tarjetas arrastradas se dejan quietas y se abre un hueco.
// Devuelve el mismo array si nada cambia, para no provocar renderizados de más.
export function layoutColumns(nodes, drag = null) {
  const columns = nodes.filter(isColumn)
  const hasCards = nodes.some((n) => n.data?.columnId)
  if (!columns.length && !hasCards) return nodes

  const columnIds = new Set(columns.map((c) => c.id))
  const updates = new Map()

  for (const n of nodes) {
    // La columna ya no existe (se borró): la tarjeta sobrevive como nota normal.
    if (n.data?.columnId && !columnIds.has(n.data.columnId)) updates.set(n.id, toFreeNote(n))
  }

  for (const col of columns) {
    const w = columnWidth(col)
    const inner = w - COLUMN.pad * 2
    const x = col.position.x + COLUMN.pad
    const cards = nodes.filter((n) => isCardOf(n, col.id) && !drag?.ids?.has(n.id)).sort(byOrder)
    const gapHere = drag?.over === col.id
    let y = col.position.y + COLUMN.header

    cards.forEach((card, i) => {
      if (gapHere && drag.index === i) y += drag.height + COLUMN.gap
      const moved = Math.abs(card.position.x - x) > 0.5 || Math.abs(card.position.y - y) > 0.5
      const resized = parseFloat(card.style?.width) !== inner || card.width !== undefined || card.height !== undefined || card.style?.height !== undefined
      if (moved || resized) {
        const { width, height, ...rest } = card // eslint-disable-line no-unused-vars
        updates.set(card.id, { ...rest, position: { x, y }, style: { width: inner } })
      }
      y += cardHeight(card) + COLUMN.gap
    })
    if (gapHere && drag.index >= cards.length) y += drag.height + COLUMN.gap

    const used = y - col.position.y - (cards.length || gapHere ? COLUMN.gap : 0) + COLUMN.footer
    const h = Math.max(COLUMN.minHeight, used)
    if (Math.abs(columnHeight(col) - h) > 0.5) {
      const { height, ...rest } = col // eslint-disable-line no-unused-vars
      updates.set(col.id, { ...rest, style: { ...col.style, width: w, height: h } })
    }
  }

  if (!updates.size) return nodes
  return nodes.map((n) => updates.get(n.id) ?? n)
}

// ¿Sobre qué columna y en qué posición caería esta nota? El centro de la tarjeta decide, como en Trello.
export function dropTarget(nodes, card) {
  const cx = card.position.x + cardWidth(card) / 2
  const cy = card.position.y + cardHeight(card) / 2
  const col = nodes.find(
    (n) => isColumn(n) && cx >= n.position.x && cx <= n.position.x + columnWidth(n) && cy >= n.position.y - 40 && cy <= n.position.y + columnHeight(n) + 120,
  )
  if (!col) return null
  const others = nodes.filter((n) => isCardOf(n, col.id) && n.id !== card.id).sort(byOrder)
  const index = others.filter((o) => o.position.y + cardHeight(o) / 2 < cy).length
  return { over: col.id, index, height: cardHeight(card), others, column: col }
}

// Aplica el resultado de soltar: la nota entra en la columna en su sitio, o sale al lienzo si cayó fuera.
export function dropCards(nodes, ids) {
  const order = nodes.filter((n) => ids.has(n.id) && n.type === 'sticky').sort(byOrder)
  let out = nodes
  for (const { id } of order) {
    const card = out.find((n) => n.id === id)
    const target = dropTarget(out, card)
    let next = card
    if (target) {
      const { index, others, column } = target
      const y = index === 0 ? (others[0] ? others[0].position.y - 1 : column.position.y) : others[index - 1].position.y + 0.5
      next = toCard(card, target.over, y)
    } else if (card.data?.columnId) {
      next = toFreeNote(card)
    }
    out = out.map((n) => (n.id === id ? next : n))
  }
  // El arrastre las elevaba sobre las demás: vuelven a su capa normal.
  return out.map((n) => {
    if (!ids.has(n.id) || n.zIndex === undefined) return n
    const { zIndex, ...rest } = n // eslint-disable-line no-unused-vars
    return rest
  })
}
