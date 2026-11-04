import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { COLORS, SHAPES, pickImage, safeUrl } from './utils.js'

const FONT_SIZES = [[14, 'S'], [18, 'M'], [24, 'L'], [32, 'XL'], [44, 'XXL']]

function Toolbar({ editor }) {
  const { t } = useTranslation()
  const [linking, setLinking] = useState(false)
  const [url, setUrl] = useState('')
  if (!editor) return null
  const btn = (label, action, active, title) => (
    <button type="button" title={title} className={active ? 'active' : ''} onMouseDown={(e) => e.preventDefault()} onClick={action}>
      {label}
    </button>
  )
  const addImage = async () => {
    const src = await pickImage()
    if (src) editor.chain().focus().setImage({ src }).run()
  }
  // window.prompt no existe en Electron: el enlace se pide con un campo en la barra.
  const toggleLink = () => {
    if (editor.isActive('link')) return editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setUrl('')
    setLinking(true)
  }
  const applyLink = () => {
    const href = safeUrl(url)
    if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    setLinking(false)
  }
  if (linking) {
    return (
      <div className="toolbar link-bar">
        <input
          autoFocus
          value={url}
          placeholder={t('editor.linkPlaceholder')}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') applyLink()
            if (e.key === 'Escape') setLinking(false)
          }}
        />
        <button type="button" disabled={!safeUrl(url)} onClick={applyLink}>{t('editor.apply')}</button>
        <button type="button" onClick={() => setLinking(false)}>{t('editor.cancel')}</button>
      </div>
    )
  }
  return (
    <div className="toolbar">
      {btn(<b>B</b>, () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'), t('editor.tb.bold'))}
      {btn(<i>I</i>, () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'), t('editor.tb.italic'))}
      {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }), t('editor.tb.h1'))}
      {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }), t('editor.tb.h2'))}
      {btn(t('editor.tb.bullets'), () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'), t('editor.tb.bulletsTip'))}
      {btn(t('editor.tb.numbers'), () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'), t('editor.tb.numbersTip'))}
      {btn(t('editor.tb.tasks'), () => editor.chain().focus().toggleTaskList().run(), editor.isActive('taskList'), t('editor.tb.tasksTip'))}
      {btn('❝', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'), t('editor.tb.quote'))}
      {btn('🔗', toggleLink, editor.isActive('link'), t('editor.tb.link'))}
      {btn('🖼', addImage, false, t('editor.tb.image'))}
    </div>
  )
}

export default function NoteEditor({ node, allNodes, onChange, onDelete, onClose, onJump }) {
  const { t } = useTranslation()
  const { data } = node
  // La ventana es una expansión de la tarjeta: tiene su propio título (noteTitle) y contenido (note),
  // independientes del título y la descripción que se ven en el lienzo.
  const field = 'note'
  const links = (data.links || []).map((id) => allNodes.find((n) => n.id === id)).filter(Boolean)
  const candidates = allNodes.filter((n) => n.id !== node.id && !(data.links || []).includes(n.id))
  const nodeName = (n) => n.data.label || t('editor.untitled')
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: t('editor.placeholder') }),
    ],
    content: data[field] || '',
    onUpdate: ({ editor }) => onChange({ [field]: editor.getHTML() }),
  })

  const setCover = async () => {
    const image = await pickImage()
    if (image) onChange({ image })
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="note-window">
        <div className="note-main">
          <div className="note-topbar">
            <button className="icon-btn" onClick={onClose} title={t('editor.close')}>←</button>
            <span className="expanded-label">{t('editor.expanded', { title: data.label || t('editor.untitled') })}</span>
            <span className="autosave">{t('editor.autosave')}</span>
          </div>
          <div className="note-scroll">
            {data.image && <img className="cover" src={data.image} alt="" />}
            <input className="note-title" value={data.noteTitle || ''} placeholder={data.label || t('editor.titlePlaceholder')} onChange={(e) => onChange({ noteTitle: e.target.value })} />
            <Toolbar editor={editor} />
            <EditorContent editor={editor} className="note-body" />
          </div>
        </div>
        <aside className="note-settings">
          <h3>{t('editor.settings')}</h3>
          <h4>{t('editor.color')}</h4>
          <div className="swatches">
            {COLORS.map((c) => (
              <button key={c} className={`swatch ${data.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => onChange({ color: c })} />
            ))}
          </div>
          {node.type === 'text' && (
            <div className="shape-options" style={{ marginTop: 8 }}>
              <button onClick={() => onChange({ color: 'transparent' })}>{t('editor.noFill')}</button>
            </div>
          )}
          {(node.type === 'text' || node.type === 'section') && (
            <>
              <h4>{t('editor.textSize')}</h4>
              <div className="size-options">
                {FONT_SIZES.map(([size, label]) => (
                  <button key={size} className={(data.fontSize || (node.type === 'text' ? 18 : 18)) === size ? 'active' : ''} onClick={() => onChange({ fontSize: size })}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          {node.type === 'box' && (
            <>
              <h4>{t('editor.shape')}</h4>
              <div className="shape-options">
                {SHAPES.map((id) => (
                  <button key={id} className={(data.shape || 'round') === id ? 'active' : ''} onClick={() => onChange({ shape: id })}>
                    {t(`shapes.${id}`)}
                  </button>
                ))}
              </div>
            </>
          )}
          {node.type !== 'section' && node.type !== 'column' && (
            <>
              <h4>{t('editor.image')}</h4>
              <div className="shape-options">
                <button onClick={setCover}>{data.image ? t('editor.changeImage') : t('editor.addImage')}</button>
                {data.image && <button onClick={() => onChange({ image: null })}>{t('editor.remove')}</button>}
              </div>
            </>
          )}
          <h4>{t('editor.links')}</h4>
          <div className="shape-options">
            {links.map((n) => (
              <div className="link-row" key={n.id}>
                <button onClick={() => onJump(n.id)} title={t('editor.goTo')}>↗ {nodeName(n)}</button>
                <button className="link-remove" title={t('editor.removeLink')} onClick={() => onChange({ links: data.links.filter((id) => id !== n.id) })}>✕</button>
              </div>
            ))}
            {candidates.length > 0 && (
              <select
                className="link-select"
                value=""
                onChange={(e) => e.target.value && onChange({ links: [...(data.links || []), e.target.value] })}
              >
                <option value="">{t('editor.linkTo')}</option>
                {candidates.map((n) => (
                  <option key={n.id} value={n.id}>{nodeName(n)}</option>
                ))}
              </select>
            )}
          </div>
          <div className="spacer" />
          <button className="danger" onClick={onDelete}>{t('editor.delete')}</button>
        </aside>
      </div>
    </div>
  )
}
