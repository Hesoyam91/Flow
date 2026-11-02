// Pruebas de extremo a extremo y de seguridad sobre la app real (proceso principal, preload, CSP).
const { launchApp, wait } = require('./cdp.cjs')

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? '  ✔' : '  ✘'} ${name}${!ok && detail ? `  -> ${detail}` : ''}`)
}

const MALICIOUS = {
  version: 2,
  activeId: 'b',
  boards: [
    {
      id: 'b',
      name: '<img src=x onerror=window.__pwned=1>',
      nodes: [
        { id: 'n1', type: 'sticky', position: { x: 0, y: 0 }, style: { width: 200, height: 100 }, data: { label: '<img src=x onerror=window.__pwned=1>', note: '<img src=x onerror="window.__pwned=2"><p>secreto</p>', color: 'red;background:url(http://127.0.0.1:9/css)' } },
        { id: 'n2', type: 'image', position: { x: 300, y: 0 }, style: { width: 100, height: 100 }, data: { image: 'http://127.0.0.1:9/track.png', note: '' } },
        { id: 'n3', type: 'evil', position: { x: 0, y: 0 }, data: {} },
        { id: 'n4', type: 'box', position: { x: 'a', y: 0 }, data: {} },
      ],
      edges: [{ id: 'e', source: 'n1', target: 'zzz' }],
    },
  ],
}

async function main() {
  const app = await launchApp()
  const problems = []
  let collecting = true // se pausa en las secciones que provocan errores a propósito
  const requests = []
  app.onEvent((method, p) => {
    if (!collecting) return
    if (method === 'Runtime.exceptionThrown') problems.push('excepción: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text))
    if (method === 'Runtime.consoleAPICalled' && p.type === 'error') problems.push('console.error: ' + p.args.map((a) => a.value || a.description).join(' ').slice(0, 200))
    if (method === 'Log.entryAdded' && p.entry.level === 'error') problems.push('log: ' + p.entry.text.slice(0, 200))
    if (method === 'Network.requestWillBeSent') requests.push(p.request.url)
  })
  // La escritura simulada solo funciona si la página tiene foco; así la prueba no depende de la ventana activa del sistema.
  await app.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await app.send('Runtime.enable')
  await app.send('Log.enable')
  await app.send('Network.enable')
  const ev = app.evaluate
  const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`)
  const count = (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`)
  const key = (k, extra = {}) => app.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, ...extra }).then(() => app.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, ...extra }))
  const menuItem = (text) => ev(`(() => { const b = [...document.querySelectorAll('.menu button')].find(x => x.textContent.includes(${JSON.stringify(text)})); b.click() })()`)
  const openMenu = (text) => ev(`[...document.querySelectorAll('.dropdown > button')].find(b => b.textContent.includes(${JSON.stringify(text)})).click()`)
  const topBtn = (text) => ev(`[...document.querySelectorAll('.topbar > button')].find(b => b.textContent.includes(${JSON.stringify(text)})).click()`)

  console.log('\nArranque y aislamiento')
  check('la app arranca y carga la interfaz', await app.waitFor(`!!document.querySelector('.react-flow')`))
  // Las pruebas usan textos en español: se fija el idioma de forma explícita y se recarga.
  await ev(`localStorage.setItem('flow:lang', 'es'); location.reload()`).catch(() => {})
  await wait(1500)
  await app.waitFor(`!!document.querySelector('.react-flow')`)
  check('hay una política CSP', await ev(`!!document.querySelector('meta[http-equiv="Content-Security-Policy"]')`))
  check('el renderer no tiene require ni process (aislado)', await ev(`typeof require === 'undefined' && typeof process === 'undefined'`))
  check('el preload expone solo open/save/export', JSON.stringify(await ev(`Object.keys(window.flowFiles).sort()`)) === JSON.stringify(['export', 'open', 'save']))

  console.log('\nCSP efectiva')
  collecting = false
  await ev(`document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="window.__cspbreak=1">'); 0`)
  await wait(400)
  check('un manejador inline (onerror) NO se ejecuta', (await ev(`window.__cspbreak === undefined`)) === true)
  check('fetch a internet está bloqueado', (await ev(`fetch('https://example.com').then(() => 'abierto', () => 'bloqueado')`)) === 'bloqueado')
  check('las imágenes remotas están bloqueadas', (await ev(`new Promise(r => { const i = new Image(); i.onload = () => r('carga'); i.onerror = () => r('bloqueada'); i.src = 'https://example.com/x.png' })`)) === 'bloqueada')

  collecting = true
  console.log('\nValidación de IPC (proceso principal)')
  const rejects = async (expr) => (await ev(`${expr}.then(() => 'aceptado', e => 'rechazado: ' + e.message)`)).startsWith('rechazado')
  check('export con extensión ejecutable (.exe) se rechaza', await rejects(`window.flowFiles.export({ defaultName: 'x.exe', filters: [{ name: 'x', extensions: ['exe'] }], data: 'AA', encoding: 'base64' })`))
  check('export con codificación inválida se rechaza', await rejects(`window.flowFiles.export({ defaultName: 'x.png', filters: [{ name: 'x', extensions: ['png'] }], data: 'AA', encoding: 'hex' })`))
  check('export sin datos se rechaza', await rejects(`window.flowFiles.export({ defaultName: 'x.png', filters: [{ name: 'x', extensions: ['png'] }] })`))
  check('guardar con contenido que no es texto se rechaza', await rejects(`window.flowFiles.save(12345, null)`))

  console.log('\nNavegación')
  await ev(`window.location.href = 'http://127.0.0.1:9/'; 0`).catch(() => {})
  await wait(800)
  check('la ventana no navega a una URL externa', (await ev(`location.protocol`)) === 'file:')
  await ev(`window.open('file:///C:/Windows/System32/calc.exe'); 0`)
  await wait(500)
  const targets = await (await fetch('http://127.0.0.1:9333/json')).json()
  check('window.open no crea ventanas nuevas', targets.filter((t) => t.type === 'page').length === 1)

  console.log('\nContenido malicioso en un .flow')
  collecting = false
  await ev(`localStorage.setItem('flow:autosave', ${JSON.stringify(JSON.stringify(MALICIOUS))}); 0`)
  await ev(`location.reload()`).catch(() => {})
  await wait(1500)
  await app.waitFor(`!!document.querySelector('.react-flow__node')`)
  await wait(600)
  check('ningún código del archivo se ejecutó', (await ev(`window.__pwned === undefined`)) === true)
  check('se descartaron nodos inválidos (quedan 2 de 4)', (await count('.react-flow__node')) === 2, String(await count('.react-flow__node')))
  check('no hay imágenes remotas en el DOM', (await count('img[src^="http"]')) === 0)
  check('no hubo peticiones a hosts externos', requests.filter((u) => u.includes('127.0.0.1:9') || u.includes('example.com')).length === 0, requests.filter((u) => u.includes('127.0.0.1')).join(','))
  check('el nombre del tablero se muestra como texto, no como HTML', (await count('.tab img')) === 0)
  await ev(`document.querySelector('.search input').focus()`)
  await app.send('Input.insertText', { text: 'secreto' })
  await wait(400)
  check('la búsqueda en notas no ejecuta su HTML y encuentra el texto', (await ev(`document.querySelector('.search-count')?.textContent`)) === '1' && (await ev(`window.__pwned === undefined`)))

  collecting = true
  console.log('\nFuncionamiento básico (autoguardado limpio)')
  await ev(`localStorage.removeItem('flow:autosave'); location.reload()`).catch(() => {})
  await wait(1500)
  await app.waitFor(`!!document.querySelector('.react-flow__node')`)
  // Tras recargar, la ventana de prueba puede quedar sin foco y eso cierra la edición en curso: se reafirma.
  await app.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  check('la página tiene foco para escribir', await app.waitFor('document.hasFocus()'))
  const initial = await count('.react-flow__node')
  check('arranca con el nodo de ejemplo', initial === 1, String(initial))

  await openMenu('Insertar')
  await menuItem('Caja')
  await wait(400)
  check('insertar crea un nodo en modo edición', (await count('.react-flow__node')) === 2 && (await ev(`!!document.querySelector('.react-flow__node textarea')`)))
  const stateBefore = await ev(`(() => { const a = document.activeElement; return [a?.tagName, !!document.querySelector('.react-flow__node textarea'), document.hasFocus(), document.querySelectorAll('.react-flow__node').length].join('/') })()`)
  await app.send('Input.insertText', { text: 'Hola mundo' })
  await wait(200)
  const typed = await ev(`document.querySelector('.react-flow__node textarea')?.value ?? 'SIN-TEXTAREA'`)
  check('el texto se actualiza en tiempo real mientras se escribe', typed === 'Hola mundo', `antes=${stateBefore} valor=${typed}`)
  await key('Enter', { code: 'Enter', windowsVirtualKeyCode: 13 })
  await wait(300)
  check('Enter confirma la edición', (await count('.react-flow__node textarea')) === 0 && (await ev(`document.body.textContent.includes('Hola mundo')`)))

  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }))`)
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true }))`)
  await wait(400)
  check('Ctrl+A y Ctrl+D duplican los elementos', (await count('.react-flow__node')) === 4, String(await count('.react-flow__node')))
  await topBtn('↶')
  await wait(300)
  check('deshacer revierte la duplicación', (await count('.react-flow__node')) === 2, String(await count('.react-flow__node')))
  await topBtn('↷')
  await wait(300)
  check('rehacer la vuelve a aplicar', (await count('.react-flow__node')) === 4)

  // Alineación: dos nodos seleccionados quedan con la misma X
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }))`)
  await wait(300)
  check('con varios seleccionados aparece el panel de alineación', (await count('.float-panel .seg button[title^="Alinear a la izq"]')) === 1)
  await click('.float-panel .seg button[title^="Alinear a la izq"]')
  await wait(300)
  const xs = await ev(`[...document.querySelectorAll('.react-flow__node')].map(n => Math.round(n.getBoundingClientRect().left))`)
  check('alinear a la izquierda iguala la X de los elementos', new Set(xs).size === 1, xs.join(','))

  // Dibujo con el ratón real
  await topBtn('Lápiz')
  await wait(200)
  const box = await ev(`(() => { const r = document.querySelector('.drawing-layer').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  await app.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 })
  for (let i = 1; i <= 15; i++) await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + i * 8, y: box.y + Math.sin(i / 2) * 25, button: 'left', buttons: 1 })
  await app.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 120, y: box.y, button: 'left', buttons: 0, clickCount: 1 })
  await wait(400)
  check('el lápiz crea un trazo', (await count('.react-flow__node-draw')) === 1)
  await key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 })
  await wait(200)
  check('Esc vuelve a la herramienta de selección', (await count('.drawing-layer')) === 0)

  // Pestañas
  await click('.tab-add')
  await wait(500)
  check('nueva pestaña: tablero vacío y 2 pestañas', (await count('.tab')) === 2 && (await count('.react-flow__node')) === 0)
  await key('Enter', { code: 'Enter', windowsVirtualKeyCode: 13 })
  await ev(`document.querySelectorAll('.tab')[0].click()`)
  await wait(500)
  check('volver a la primera pestaña conserva su contenido', (await count('.react-flow__node')) >= 4)

  // Sección con texto y lista
  await openMenu('Insertar')
  await menuItem('Sección')
  await wait(400)
  await key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 })
  await ev(`(() => { const s = document.querySelector('.react-flow__node-section .section-body'); s.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })()`)
  await wait(500)
  check('doble click en una sección activa la edición del cuerpo', await ev(`!!document.querySelector('.section-body.editing .ProseMirror[contenteditable="true"]')`))
  await app.send('Input.insertText', { text: 'Item uno' })
  await ev(`[...document.querySelectorAll('.section-toolbar button')].find(b => b.textContent.includes('• Lista')).click()`)
  await wait(300)
  check('se puede escribir y crear una lista dentro de la sección', await ev(`!!document.querySelector('.react-flow__node-section ul li') && document.querySelector('.react-flow__node-section').textContent.includes('Item uno')`))
  await key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 })

  // Editor de notas y enlaces
  await ev(`document.querySelector('.react-flow__node-box').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`)
  await wait(500)
  check('click derecho abre el editor de notas', (await count('.note-window')) === 1)
  await ev(`document.querySelector('.note-body .tiptap').focus()`)
  await app.send('Input.insertText', { text: 'texto con enlace' })
  await ev(`document.execCommand('selectAll')`)
  await ev(`[...document.querySelectorAll('.toolbar button')].find(b => b.textContent.includes('🔗')).click()`)
  await wait(300)
  check('el botón de enlace muestra un campo (no usa window.prompt)', (await count('.link-bar input')) === 1)
  await app.send('Input.insertText', { text: 'javascript:alert(1)' })
  await wait(200)
  check('un enlace javascript: no se puede aplicar', await ev(`document.querySelector('.link-bar button').disabled`))
  await ev(`(() => { const i = document.querySelector('.link-bar input'); i.select() })()`)
  await app.send('Input.insertText', { text: 'example.com' })
  await wait(200)
  await ev(`document.querySelector('.link-bar button').click()`)
  await wait(400)
  check('un enlace válido se aplica con https', await ev(`document.querySelector('.note-body .tiptap a')?.getAttribute('href') === 'https://example.com/'`))
  await ev(`document.querySelector('.note-body .tiptap').focus()`)
  await key('Backspace', { code: 'Backspace', windowsVirtualKeyCode: 8 })
  check('Backspace dentro del editor no borra el elemento de atrás', (await count('.react-flow__node-box')) >= 1)
  await key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 })

  console.log('\nTema y filtros')
  const before = await ev(`document.documentElement.dataset.theme`)
  await topBtn(before === 'dark' ? '🌇' : '🌙')
  await wait(300)
  check('el botón de tema alterna claro/oscuro', (await ev(`document.documentElement.dataset.theme`)) !== before)
  check('en modo oscuro hay estrellas', (await ev(`document.documentElement.dataset.theme`)) !== 'dark' || (await count('.stars i')) > 20)

  console.log('\nIdiomas y atribución')
  check('la interfaz está en español', (await ev(`document.documentElement.lang`)) === 'es' && (await ev(`document.body.textContent.includes('Guardar')`)))
  check('no se muestra la atribución "React Flow"', (await count('.react-flow__attribution')) === 0 && !(await ev(`document.body.textContent.includes('React Flow')`)))
  await topBtn('🌐')
  await wait(400)
  check('el botón de idioma cambia a inglés', (await ev(`document.documentElement.lang`)) === 'en' && (await ev(`document.body.textContent.includes('Save') && document.body.textContent.includes('Open') && !document.body.textContent.includes('Guardar')`)))
  check('el menú Insertar está en inglés', await (async () => { await openMenu('Insert'); await wait(200); const ok = await ev(`[...document.querySelectorAll('.menu button')].map(b => b.textContent).join('|').includes('Sticky note')`); await ev(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`); return ok })())
  check('el idioma elegido se recuerda', (await ev(`localStorage.getItem('flow:lang')`)) === 'en')
  await topBtn('🌐')
  await wait(300)
  check('vuelve a español', (await ev(`document.documentElement.lang`)) === 'es')

  console.log('\nRendimiento')
  const big = { version: 2, activeId: 'p', boards: [{ id: 'p', name: 'Carga', nodes: Array.from({ length: 800 }, (_, i) => ({ id: `n${i}`, type: 'sticky', position: { x: (i % 40) * 220, y: Math.floor(i / 40) * 140 }, style: { width: 200, height: 100 }, data: { label: `Nota ${i}`, note: '<p>texto</p>', color: '#fde68a' } })), edges: [] }] }
  await ev(`localStorage.setItem('flow:autosave', ${JSON.stringify(JSON.stringify(big))}); 0`)
  const t0 = Date.now()
  await ev(`location.reload()`).catch(() => {})
  await wait(800)
  const loaded = await app.waitFor(`document.querySelectorAll('.react-flow__node').length > 0`, 15000)
  const ms = Date.now() - t0
  check(`un tablero con 800 notas carga en < 8 s (${ms} ms)`, loaded && ms < 8000)

  console.log('\nErrores de consola durante toda la sesión')
  const relevant = problems.filter((p) => !/Autofill|favicon/i.test(p))
  check('sin excepciones ni errores de consola/CSP', relevant.length === 0, relevant.slice(0, 3).join(' | '))

  await app.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((err) => {
  console.error('Fallo en el test:', err)
  process.exit(2)
})
