// Preferencias de la interfaz, guardadas en este equipo (no forman parte de los archivos .flow).
const PREFS_KEY = 'flow:prefs'

export const PREF_DEFAULTS = {
  minimap: true,
  controls: true,
  hint: true,
  grid: true,
  stars: true,
  snap: false,
  confirmExit: true,
}

export function loadPrefs(storage = localStorage) {
  const prefs = { ...PREF_DEFAULTS }
  try {
    const saved = JSON.parse(storage.getItem(PREFS_KEY))
    for (const key of Object.keys(PREF_DEFAULTS)) {
      if (typeof saved?.[key] === 'boolean') prefs[key] = saved[key]
    }
  } catch {
    /* preferencias dañadas: se usan las de fábrica */
  }
  return prefs
}

export function savePrefs(prefs, storage = localStorage) {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* sin almacenamiento: duran hasta cerrar la app */
  }
}
