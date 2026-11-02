// Genera el logo de Flow: texto "Flow" al fondo y ondas por delante.
// Uso: node scripts/make-logo.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import opentype from 'opentype.js'
import sharp from 'sharp'

const FONT = process.env.FLOW_FONT || 'C:/Windows/Fonts/segoeuib.ttf'
const buf = readFileSync(FONT)
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

function wavePath(w, h, baseY, amp, periods, phase) {
  const pts = []
  for (let x = 0; x <= w; x += 2) {
    const y = baseY + amp * Math.sin((x / w) * periods * Math.PI * 2 + phase)
    pts.push(`${x === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return `${pts.join(' ')} L${w},${h} L0,${h} Z`
}

function logo({ w, h, radius, fontSize, textY, waves }) {
  const text = font.getPath('Flow', 0, 0, fontSize)
  const box = text.getBoundingBox()
  const tx = (w - (box.x2 - box.x1)) / 2 - box.x1
  const d = font.getPath('Flow', tx, textY, fontSize).toPathData(2)
  const layers = waves
    .map((l, i) => `<path d="${wavePath(w, h, l.y, l.amp, l.periods, l.phase)}" fill="${l.fill}"/>`)
    .join('\n    ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
    <clipPath id="clip"><rect width="${w}" height="${h}" rx="${radius}"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <path d="${d}" fill="#ffffff" fill-opacity="0.96"/>
    ${layers}
  </g>
</svg>
`
}

// Versión horizontal para la barra superior
const wide = logo({
  w: 220,
  h: 64,
  radius: 16,
  fontSize: 46,
  textY: 46,
  waves: [
    { y: 36, amp: 5, periods: 2, phase: 0, fill: 'rgba(255,255,255,0.28)' },
    { y: 44, amp: 5, periods: 2.4, phase: 1.6, fill: 'rgba(14,116,144,0.55)' },
    { y: 53, amp: 4, periods: 2, phase: 3.1, fill: 'rgba(30,27,75,0.6)' },
  ],
})

// Versión cuadrada para el icono de la aplicación
const square = logo({
  w: 512,
  h: 512,
  radius: 112,
  fontSize: 176,
  textY: 290,
  waves: [
    { y: 252, amp: 18, periods: 1.5, phase: 0, fill: 'rgba(255,255,255,0.28)' },
    { y: 318, amp: 18, periods: 1.7, phase: 1.6, fill: 'rgba(14,116,144,0.55)' },
    { y: 392, amp: 16, periods: 1.5, phase: 3.1, fill: 'rgba(30,27,75,0.62)' },
  ],
})

mkdirSync('src/assets', { recursive: true })
mkdirSync('build', { recursive: true })
writeFileSync('src/assets/logo.svg', wide)
writeFileSync('build/icon.svg', square)
await sharp(Buffer.from(square), { density: 300 }).resize(1024, 1024).png().toFile('build/icon.png')
await sharp(Buffer.from(wide), { density: 300 }).resize(880).png().toFile('build/logo-preview.png')
console.log('Logo generado')
