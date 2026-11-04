// Validaciones del proceso principal. Todo lo que llega del renderer se trata como no confiable.
const path = require('path')

const MAX_BYTES = 200 * 1024 * 1024
const EXPORT_EXTENSIONS = ['png', 'svg', 'pdf']

// Solo se acepta IPC de nuestra propia página (la URL de desarrollo o el index.html empaquetado).
function isTrustedUrl(url, { dev, devUrl, appUrl }) {
  if (typeof url !== 'string') return false
  if (dev) return url === devUrl || url.startsWith(`${devUrl}/`)
  return url === appUrl || url.startsWith(`${appUrl}#`) || url.startsWith(`${appUrl}?`)
}

// Rutas que el usuario eligió en un diálogo del sistema. El renderer no puede escribir en otras.
class PathGrants {
  constructor() {
    this.paths = new Set()
  }
  add(p) {
    this.paths.add(path.resolve(p))
  }
  has(p) {
    return typeof p === 'string' && this.paths.has(path.resolve(p))
  }
}

function parseSavePayload(payload) {
  if (!payload || typeof payload.content !== 'string') throw new Error('Contenido no válido')
  if (Buffer.byteLength(payload.content) > MAX_BYTES) throw new Error('Archivo demasiado grande')
  return { content: payload.content, filePath: typeof payload.filePath === 'string' ? payload.filePath : null }
}

function parseExportPayload(payload) {
  if (!payload || typeof payload.data !== 'string') throw new Error('Datos no válidos')
  if (!['utf8', 'base64'].includes(payload.encoding)) throw new Error('Codificación no válida')
  const buffer = Buffer.from(payload.data, payload.encoding)
  if (buffer.length > MAX_BYTES) throw new Error('Archivo demasiado grande')

  const name = path.basename(String(payload.defaultName || 'export')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 120) || 'export'
  const filters = (Array.isArray(payload.filters) ? payload.filters : [])
    .slice(0, 3)
    .map((f) => ({
      name: String(f?.name || 'Archivo').slice(0, 60),
      extensions: (Array.isArray(f?.extensions) ? f.extensions : []).filter((e) => EXPORT_EXTENSIONS.includes(e)),
    }))
    .filter((f) => f.extensions.length)
  if (!filters.length) throw new Error('Formato no permitido')
  return { buffer, name, filters }
}

// Mensaje de diagnóstico enviado por la interfaz: solo texto, acotado.
function parseLogPayload(payload) {
  if (typeof payload !== 'string') throw new Error('Mensaje no válido')
  return payload.slice(0, 4000)
}

function ensureExtension(file, ext) {
  return file.toLowerCase().endsWith(`.${ext}`) ? file : `${file}.${ext}`
}

// Solo se abren enlaces web o de correo en el navegador del sistema.
function isSafeExternalUrl(url) {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

module.exports = { MAX_BYTES, isTrustedUrl, PathGrants, parseSavePayload, parseExportPayload, parseLogPayload, ensureExtension, isSafeExternalUrl }
