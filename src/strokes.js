import getStroke from 'perfect-freehand'

// Convierte puntos [x, y, presión] en el contorno SVG de un trazo suave.
export function strokePath(points, size) {
  const stroke = getStroke(points, { size, thinning: 0.5, smoothing: 0.6, streamline: 0.5, simulatePressure: false })
  if (!stroke.length) return ''
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return acc
    },
    ['M', ...stroke[0], 'Q'],
  )
  d.push('Z')
  return d.join(' ')
}
