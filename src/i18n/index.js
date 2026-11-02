import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './es.json'
import en from './en.json'

export const LANG_KEY = 'flow:lang'
export const LANGUAGES = ['es', 'en']

// Idioma elegido por el usuario; si no hay, el del sistema (español si empieza por "es", si no inglés).
export function detectLanguage() {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (LANGUAGES.includes(saved)) return saved
  } catch {
    /* sin almacenamiento */
  }
  const system = typeof navigator !== 'undefined' ? navigator.language || '' : ''
  return system.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export function setLanguage(lng) {
  try {
    localStorage.setItem(LANG_KEY, lng)
  } catch {
    /* sin almacenamiento */
  }
  return i18n.changeLanguage(lng)
}

i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React ya escapa el contenido
  returnNull: false,
})

const syncLang = (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng
}
syncLang(i18n.language)
i18n.on('languageChanged', syncLang)

export default i18n
