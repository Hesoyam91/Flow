import i18n from './i18n'

export const COLORS = ['#ffffff', '#fde68a', '#fed7aa', '#fecaca', '#fbcfe8', '#ddd6fe', '#bfdbfe', '#99f6e4', '#bbf7d0', '#e5e7eb']

// Cuenta las tareas (hechas / total) de una nota en HTML de TipTap.
export function taskProgress(html = '') {
  if (!html.includes('data-type="taskItem"')) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const items = doc.querySelectorAll('li[data-type="taskItem"]')
  const done = doc.querySelectorAll('li[data-type="taskItem"][data-checked="true"]').length
  return items.length ? { done, total: items.length } : null
}

export const SHAPES = ['rect', 'round', 'pill', 'ellipse', 'diamond', 'hexagon']

// Texto plano de un HTML no confiable. DOMParser crea un documento inerte: no carga imágenes
// ni ejecuta scripts o manejadores (a diferencia de asignar innerHTML a un elemento).
const BLOCK_TAGS = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, div, br, tr'

export function stripHtml(html = '') {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(String(html), 'text/html')
  // Un espacio tras cada bloque evita que "una" + "lista" se lean como "unalista".
  doc.body.querySelectorAll(BLOCK_TAGS).forEach((el) => el.append(' '))
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

// Solo enlaces http, https y mailto. Añade https:// si falta el protocolo. Devuelve null si no es válido.
export function safeUrl(input) {
  const text = String(input || '').trim()
  if (!text) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const MAX_IMAGE_INPUT = 15 * 1024 * 1024
const MAX_IMAGE_SIDE = 1280

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(i18n.t('errors.imageRead')))
    img.src = src
  })
}

// Valida un archivo de imagen y lo reduce (máx. 1280 px, WebP) para que los diagramas no pesen demasiado.
// Los GIF y SVG se conservan tal cual (animación / vector).
export async function fileToImageData(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error(i18n.t('errors.notImage'))
  if (file.size > MAX_IMAGE_INPUT) throw new Error(i18n.t('errors.imageTooLarge'))
  const original = await readFileAsDataUrl(file)
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return original

  const img = await loadImage(original)
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  if (scale === 1 && file.size < 400 * 1024) return original
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  const compressed = canvas.toDataURL('image/webp', 0.85)
  return compressed.length < original.length ? compressed : original
}

export function pickImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      try {
        resolve(await fileToImageData(file))
      } catch (err) {
        window.alert(err.message)
        resolve(null)
      }
    }
    input.click()
  })
}

export const PEN_COLORS = ['auto', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7']

// Tamaño natural de una imagen (dataURL), escalado para que quepa en `max` px.
export function imageSize(src, max = 320) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      resolve({ w: Math.max(60, Math.round(img.naturalWidth * scale)), h: Math.max(60, Math.round(img.naturalHeight * scale)) })
    }
    img.onerror = () => resolve({ w: 220, h: 220 })
    img.src = src
  })
}
