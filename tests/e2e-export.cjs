// Verifica la exportación (PNG, SVG, PDF) con la CSP real de la compilación, sin diálogos.
const { app, BrowserWindow } = require('electron')
const path = require('path')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const doc = {
  version: 2,
  activeId: 'b1',
  boards: [{
    id: 'b1', name: 'Eventos',
    nodes: [
      { id: 's1', type: 'section', zIndex: -1, position: { x: -60, y: -80 }, style: { width: 520, height: 330 }, data: { label: 'Main events', color: '#fed7aa', body: '<p>hola</p>' } },
      { id: 'a', type: 'sticky', position: { x: 0, y: 0 }, style: { width: 180, height: 110 }, data: { label: 'The Intruder', color: '#fde68a', note: '<p>In code: intro</p>' } },
      { id: 'b', type: 'box', position: { x: 260, y: 10 }, style: { width: 170, height: 90 }, data: { label: 'Decisión', color: '#bfdbfe', shape: 'diamond' } },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left', data: { path: 'smoothstep', arrow: 'both', label: 'sí' } }],
  }],
}

const results = []
const check = (name, ok, detail = '') => {
  results.push(!!ok)
  console.log(`${ok ? '  ✔' : '  ✘'} ${name}${!ok && detail ? `  -> ${detail}` : ''}`)
}

app.setPath('userData', require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'flow-exp-')))
app.whenReady().then(async () => {
  console.log('\nExportación con CSP activa')
  const win = new BrowserWindow({ width: 1200, height: 800, show: false, webPreferences: { contextIsolation: true, sandbox: true, offscreen: true } })
  const wc = win.webContents
  const errors = []
  wc.on('console-message', (_e, level, msg) => level >= 2 && !msg.includes('Security Warning') && errors.push(msg.slice(0, 200)))
  const ev = (s) => Promise.race([wc.executeJavaScript(s), wait(10000).then(() => 'EV-TIMEOUT')])
  const index = path.join(__dirname, '../dist/index.html')

  await win.loadFile(index)
  await ev(`localStorage.setItem('flow:autosave', ${JSON.stringify(JSON.stringify(doc))}); localStorage.setItem('flow:lang', 'es'); 0`)
  await win.loadFile(index)
  await wait(1500)
  await ev(`window.flowFiles = { export: async (p) => { (window.__exports ||= []).push({ name: p.defaultName, enc: p.encoding, data: p.data }); return { path: 'sim' } } }; 0`)

  const kinds = [['Imagen PNG', 'png', (b) => b.subarray(1, 4).toString() === 'PNG'], ['Imagen SVG', 'svg', (b) => b.subarray(0, 4).toString() === '<svg'], ['Documento PDF', 'pdf', (b) => b.subarray(0, 4).toString() === '%PDF']]
  for (const [i, [label, ext, magic]] of kinds.entries()) {
    await ev(`[...document.querySelectorAll('.dropdown > button')].find(b => b.textContent.includes('Exportar')).click()`)
    await wait(200)
    await ev(`[...document.querySelectorAll('.menu button')].find(b => b.textContent.includes('${label}')).click()`)
    for (let k = 0; k < 30; k++) {
      await wait(500)
      if ((await ev('(window.__exports||[]).length')) > i) break
    }
    const exp = (await ev(`window.__exports || []`))[i]
    const buf = exp ? Buffer.from(exp.data, exp.enc) : Buffer.alloc(0)
    check(`${label}: se genera un archivo .${ext} válido (${buf.length} bytes)`, exp && exp.name === `Eventos.${ext}` && buf.length > 500 && magic(buf), exp?.name)
  }
  check('sin errores de consola ni violaciones de CSP', errors.length === 0, errors.slice(0, 2).join(' | '))

  const failed = results.filter((r) => !r).length
  console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas`)
  app.exit(failed ? 1 : 0)
})
