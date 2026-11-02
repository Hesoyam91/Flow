import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { isTrustedUrl, PathGrants, parseSavePayload, parseExportPayload, ensureExtension, isSafeExternalUrl } = require('../electron/guards.cjs')

const prod = { dev: false, devUrl: 'http://localhost:5173', appUrl: 'file:///D:/Flow/dist/index.html' }
const dev = { ...prod, dev: true }

describe('isTrustedUrl', () => {
  it('acepta solo la página de la app', () => {
    expect(isTrustedUrl('file:///D:/Flow/dist/index.html', prod)).toBe(true)
    expect(isTrustedUrl('file:///D:/Flow/dist/index.html#x', prod)).toBe(true)
    expect(isTrustedUrl('file:///D:/otra/cosa.html', prod)).toBe(false)
    expect(isTrustedUrl('https://evil.example/', prod)).toBe(false)
    expect(isTrustedUrl('http://localhost:5173/', prod)).toBe(false)
    expect(isTrustedUrl(undefined, prod)).toBe(false)
  })

  it('en desarrollo acepta el servidor de Vite y no prefijos engañosos', () => {
    expect(isTrustedUrl('http://localhost:5173/', dev)).toBe(true)
    expect(isTrustedUrl('http://localhost:5173', dev)).toBe(true)
    expect(isTrustedUrl('http://localhost:51730/', dev)).toBe(false)
    expect(isTrustedUrl('http://localhost:5173.evil.com/', dev)).toBe(false)
  })
})

describe('PathGrants', () => {
  it('solo reconoce rutas concedidas', () => {
    const g = new PathGrants()
    g.add('/tmp/a.flow')
    expect(g.has('/tmp/a.flow')).toBe(true)
    expect(g.has('/tmp/../tmp/a.flow')).toBe(true) // se normaliza
    expect(g.has('/etc/passwd')).toBe(false)
    expect(g.has(null)).toBe(false)
    expect(g.has({ toString: () => '/tmp/a.flow' })).toBe(false)
  })
})

describe('parseSavePayload', () => {
  it('exige contenido de texto', () => {
    expect(() => parseSavePayload(null)).toThrow()
    expect(() => parseSavePayload({ content: 5 })).toThrow()
    expect(parseSavePayload({ content: '{}', filePath: 'x.flow' })).toEqual({ content: '{}', filePath: 'x.flow' })
    expect(parseSavePayload({ content: '{}', filePath: { a: 1 } }).filePath).toBeNull()
  })
})

describe('parseExportPayload', () => {
  const ok = { defaultName: 'a.png', filters: [{ name: 'PNG', extensions: ['png'] }], data: 'AAAA', encoding: 'base64' }

  it('acepta un export válido', () => {
    const p = parseExportPayload(ok)
    expect(p.name).toBe('a.png')
    expect(p.buffer.length).toBe(3)
  })

  it('rechaza codificaciones y datos inválidos', () => {
    expect(() => parseExportPayload({ ...ok, encoding: 'hex' })).toThrow()
    expect(() => parseExportPayload({ ...ok, data: 123 })).toThrow()
    expect(() => parseExportPayload(null)).toThrow()
  })

  it('solo permite extensiones png, svg y pdf (nada ejecutable)', () => {
    expect(() => parseExportPayload({ ...ok, filters: [{ name: 'x', extensions: ['exe', 'bat', 'lnk'] }] })).toThrow()
    const p = parseExportPayload({ ...ok, filters: [{ name: 'x', extensions: ['exe', 'pdf'] }] })
    expect(p.filters[0].extensions).toEqual(['pdf'])
  })

  it('quita rutas y caracteres peligrosos del nombre', () => {
    expect(parseExportPayload({ ...ok, defaultName: '../../Windows/System32/evil.png' }).name).toBe('evil.png')
    expect(parseExportPayload({ ...ok, defaultName: 'a<b>:c.png' }).name).toBe('a_b__c.png')
    expect(parseExportPayload({ ...ok, defaultName: '' }).name).toBe('export')
  })
})

describe('ensureExtension / isSafeExternalUrl', () => {
  it('añade la extensión si falta', () => {
    expect(ensureExtension('a', 'flow')).toBe('a.flow')
    expect(ensureExtension('a.FLOW', 'flow')).toBe('a.FLOW')
  })

  it('solo abre http, https y mailto', () => {
    expect(isSafeExternalUrl('https://example.com')).toBe(true)
    expect(isSafeExternalUrl('mailto:a@b.c')).toBe(true)
    expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('ms-msdt:/id')).toBe(false)
    expect(isSafeExternalUrl('no es url')).toBe(false)
  })
})
