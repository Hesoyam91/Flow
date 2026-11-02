// Cálculo de alineación y distribución. boxes: [{ id, x, y, w, h }] -> Map(id -> { x, y }) o null.
export function alignPositions(boxes, mode) {
  if (boxes.length < 2) return null
  const minX = Math.min(...boxes.map((b) => b.x))
  const maxX = Math.max(...boxes.map((b) => b.x + b.w))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxY = Math.max(...boxes.map((b) => b.y + b.h))
  const pos = new Map()

  if (mode === 'hdist' || mode === 'vdist') {
    if (boxes.length < 3) return null
    const horizontal = mode === 'hdist'
    const sorted = [...boxes].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))
    const total = sorted.reduce((s, b) => s + (horizontal ? b.w : b.h), 0)
    const gap = ((horizontal ? maxX - minX : maxY - minY) - total) / (sorted.length - 1)
    let cur = horizontal ? minX : minY
    sorted.forEach((b) => {
      pos.set(b.id, horizontal ? { x: cur, y: b.y } : { x: b.x, y: cur })
      cur += (horizontal ? b.w : b.h) + gap
    })
    return pos
  }

  boxes.forEach((b) => {
    const p = { x: b.x, y: b.y }
    if (mode === 'left') p.x = minX
    if (mode === 'right') p.x = maxX - b.w
    if (mode === 'hcenter') p.x = (minX + maxX) / 2 - b.w / 2
    if (mode === 'top') p.y = minY
    if (mode === 'bottom') p.y = maxY - b.h
    if (mode === 'vcenter') p.y = (minY + maxY) / 2 - b.h / 2
    pos.set(b.id, p)
  })
  return pos
}
