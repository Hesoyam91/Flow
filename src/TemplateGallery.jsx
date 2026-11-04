import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TEMPLATES, instantiateTemplate } from './templates.js'
import { cardHeight, columnHeight, columnWidth, layoutColumns } from './kanban.js'

const sizeOf = (n) =>
  n.type === 'column'
    ? { w: columnWidth(n), h: columnHeight(n) }
    : { w: parseFloat(n.style?.width) || 0, h: n.data?.columnId ? cardHeight(n) : parseFloat(n.style?.height) || 0 }

// Miniatura dibujada a partir de la propia plantilla, así siempre coincide con lo que se va a crear.
function Preview({ template, t }) {
  const { nodes, edges, box } = useMemo(() => {
    const doc = instantiateTemplate(template, t)
    const laid = layoutColumns(doc.nodes)
    const xs = laid.flatMap((n) => [n.position.x, n.position.x + sizeOf(n).w])
    const ys = laid.flatMap((n) => [n.position.y, n.position.y + sizeOf(n).h])
    const pad = 30
    return {
      nodes: laid,
      edges: doc.edges,
      box: `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`,
    }
  }, [template, t])

  const center = (id) => {
    const n = nodes.find((x) => x.id === id)
    const s = sizeOf(n)
    return [n.position.x + s.w / 2, n.position.y + s.h / 2]
  }

  return (
    <svg className="template-preview" viewBox={box} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {edges.map((e) => {
        const [x1, y1] = center(e.source)
        const [x2, y2] = center(e.target)
        return <line key={e.id} x1={x1} y1={y1} x2={x2} y2={y2} className="preview-edge" />
      })}
      {nodes.map((n) => {
        const { w, h } = sizeOf(n)
        const { x, y } = n.position
        const fill = n.data.color && n.data.color !== 'transparent' ? n.data.color : 'none'
        if (n.type === 'text') return <rect key={n.id} x={x} y={y + h * 0.25} width={w * 0.7} height={h * 0.5} rx={h * 0.2} className="preview-text" />
        if (n.type === 'image') return <rect key={n.id} x={x} y={y} width={w} height={h} rx={10} className="preview-image" />
        if (n.type === 'box' && n.data.shape === 'diamond') return <polygon key={n.id} points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`} fill={fill} className="preview-node" />
        if (n.type === 'box' && n.data.shape === 'ellipse') return <ellipse key={n.id} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={fill} className="preview-node" />
        const container = n.type === 'section' || n.type === 'column'
        const rx = n.type === 'box' && n.data.shape === 'pill' ? h / 2 : container ? 14 : 8
        return <rect key={n.id} x={x} y={y} width={w} height={h} rx={rx} fill={fill} fillOpacity={container ? 0.45 : 1} className="preview-node" />
      })}
    </svg>
  )
}

export default function TemplateGallery({ onPick, onClose }) {
  const { t } = useTranslation()
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="templates-window" role="dialog" aria-label={t('templates.title')}>
        <header className="templates-header">
          <div>
            <h2>{t('templates.title')}</h2>
            <p>{t('templates.subtitle')}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t('editor.close')}>✕</button>
        </header>
        <div className="templates-grid">
          {TEMPLATES.map((template) => (
            <button key={template.id} className={`template-card ${template.featured ? 'featured' : ''}`} onClick={() => onPick(template)}>
              <Preview template={template} t={t} />
              <span className="template-name">{t(`templates.${template.id}.name`)}</span>
              <span className="template-desc">{t(`templates.${template.id}.desc`)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
