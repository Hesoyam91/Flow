import { useTranslation } from 'react-i18next'
import { LANGUAGES, setLanguage } from './i18n'
import { PREF_DEFAULTS } from './prefs.js'

const CANVAS_PREFS = ['minimap', 'controls', 'hint', 'grid', 'stars', 'snap']
const THEMES = ['light', 'dark']

function Toggle({ prefKey, prefs, onChange }) {
  const { t } = useTranslation()
  return (
    <label className="pref-row">
      <span className="pref-text">
        <span className="pref-name">{t(`prefs.${prefKey}`)}</span>
        <span className="pref-help">{t(`prefs.${prefKey}Help`)}</span>
      </span>
      <input type="checkbox" className="pref-switch" data-pref={prefKey} checked={prefs[prefKey]} onChange={(e) => onChange({ ...prefs, [prefKey]: e.target.checked })} />
    </label>
  )
}

export default function Preferences({ prefs, onChange, theme, onTheme, onClose }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="prefs-window" role="dialog" aria-label={t('prefs.title')}>
        <header className="templates-header">
          <h2>{t('prefs.title')}</h2>
          <button className="icon-btn" onClick={onClose} title={t('editor.close')}>✕</button>
        </header>
        <div className="prefs-body">
          <h3>{t('prefs.appearance')}</h3>
          <div className="pref-row">
            <span className="pref-name">{t('prefs.theme')}</span>
            <div className="seg">
              {THEMES.map((id) => (
                <button key={id} className={theme === id ? 'active' : ''} onClick={() => onTheme(id)}>{t(`prefs.theme_${id}`)}</button>
              ))}
            </div>
          </div>
          <div className="pref-row">
            <span className="pref-name">{t('prefs.language')}</span>
            <div className="seg">
              {LANGUAGES.map((id) => (
                <button key={id} className={i18n.language === id ? 'active' : ''} onClick={() => setLanguage(id)}>{t(`prefs.lang_${id}`)}</button>
              ))}
            </div>
          </div>

          <h3>{t('prefs.canvas')}</h3>
          {CANVAS_PREFS.map((key) => (
            <Toggle key={key} prefKey={key} prefs={prefs} onChange={onChange} />
          ))}

          <h3>{t('prefs.behavior')}</h3>
          <Toggle prefKey="confirmExit" prefs={prefs} onChange={onChange} />
        </div>
        <footer className="prefs-footer">
          <button onClick={() => onChange({ ...PREF_DEFAULTS })}>{t('prefs.reset')}</button>
        </footer>
      </div>
    </div>
  )
}
