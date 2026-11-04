import { describe, expect, it } from 'vitest'
import { PREF_DEFAULTS, loadPrefs, savePrefs } from '../src/prefs.js'

const memory = (initial = null) => {
  let value = initial
  return { getItem: () => value, setItem: (_k, v) => (value = v) }
}

describe('preferencias', () => {
  it('sin nada guardado usa las de fábrica', () => {
    expect(loadPrefs(memory())).toEqual(PREF_DEFAULTS)
  })

  it('recuerda lo guardado', () => {
    const storage = memory()
    savePrefs({ ...PREF_DEFAULTS, minimap: false, snap: true }, storage)
    expect(loadPrefs(storage)).toEqual({ ...PREF_DEFAULTS, minimap: false, snap: true })
  })

  it('ignora datos dañados, claves desconocidas y valores que no son booleanos', () => {
    expect(loadPrefs(memory('{no es json'))).toEqual(PREF_DEFAULTS)
    expect(loadPrefs(memory(JSON.stringify({ minimap: 'no', evil: true })))).toEqual(PREF_DEFAULTS)
  })

  it('una opción nueva de una versión futura toma su valor de fábrica', () => {
    expect(loadPrefs(memory(JSON.stringify({ hint: false }))).confirmExit).toBe(true)
  })
})
