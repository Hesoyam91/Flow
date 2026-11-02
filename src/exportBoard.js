import { getNodesBounds } from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'
import i18n from './i18n'

const PAD = 60
const MAX_SIDE = 8000

// Exporta todo el tablero (no solo lo visible) a PNG, SVG o PDF y lo guarda con el diálogo del sistema.
export async function exportBoard(format, { nodes, name }) {
  const viewport = document.querySelector('.react-flow__viewport')
  if (!viewport || !nodes.length) return { error: i18n.t('errors.nothingToExport') }
  if (!window.flowFiles?.export) return { error: i18n.t('errors.exportDesktopOnly') }

  const bounds = getNodesBounds(nodes)
  const width = Math.ceil(bounds.width) + PAD * 2
  const height = Math.ceil(bounds.height) + PAD * 2
  const opts = {
    width,
    height,
    pixelRatio: Math.min(2, MAX_SIDE / Math.max(width, height)),
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#ffffff',
    style: { width: `${width}px`, height: `${height}px`, transform: `translate(${PAD - bounds.x}px, ${PAD - bounds.y}px) scale(1)` },
    filter: (el) => !(el.classList && (el.classList.contains('react-flow__resize-control') || el.classList.contains('react-flow__handle'))),
  }

  const safeName = (name || i18n.t('app.defaultFileName')).replace(/[\\/:*?"<>|]/g, '_')
  let payload
  if (format === 'png') {
    const url = await toPng(viewport, opts)
    payload = { ext: 'png', label: i18n.t('menu.exportPng'), data: url.split(',')[1], encoding: 'base64' }
  } else if (format === 'svg') {
    const url = await toSvg(viewport, opts)
    payload = { ext: 'svg', label: i18n.t('menu.exportSvg'), data: decodeURIComponent(url.slice(url.indexOf(',') + 1)), encoding: 'utf8' }
  } else {
    const url = await toPng(viewport, opts)
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: width > height ? 'l' : 'p', unit: 'px', format: [width, height], hotfixes: ['px_scaling'] })
    pdf.addImage(url, 'PNG', 0, 0, width, height)
    payload = { ext: 'pdf', label: i18n.t('menu.exportPdf'), data: pdf.output('datauristring').split(',')[1], encoding: 'base64' }
  }

  const res = await window.flowFiles.export({
    defaultName: `${safeName}.${payload.ext}`,
    filters: [{ name: payload.label, extensions: [payload.ext] }],
    data: payload.data,
    encoding: payload.encoding,
  })
  return res ? { path: res.path } : { cancelled: true }
}
