// Pruebas de extremo a extremo y de seguridad sobre la app real (proceso principal, preload, CSP).
const { execFileSync } = require('child_process')
const { launchApp, wait } = require('./cdp.cjs')

// Envía a la ventana el mismo mensaje que la X de Windows (window.close() desde la página no pasa por el evento 'close').
function pressCloseButton(pid) {
  const script = `Add-Type -Name W -Namespace N -MemberDefinition '[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);'; [N.W]::PostMessage((Get-Process -Id ${pid}).MainWindowHandle, 16, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null`
  execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' })
}

const results = []
const visible2 = (ev, sel) => ev('!!document.querySelector(' + JSON.stringify(sel) + ')')
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
  check('la barra superior cabe en una sola fila', (await ev(`document.querySelector('.topbar').getBoundingClientRect().height`)) < 62, String(await ev(`document.querySelector('.topbar').getBoundingClientRect().height`)))
  check('hay una política CSP', await ev(`!!document.querySelector('meta[http-equiv="Content-Security-Policy"]')`))
  check('el renderer no tiene require ni process (aislado)', await ev(`typeof require === 'undefined' && typeof process === 'undefined'`))
  check('el preload expone solo las funciones previstas', JSON.stringify(await ev(`Object.keys(window.flowFiles).sort()`)) === JSON.stringify(['ackClose', 'cancelClose', 'confirmClose', 'export', 'logError', 'onCloseRequested', 'open', 'save']))

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
  await openMenu('Herramientas')
  await menuItem('Lápiz')
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

  console.log('\nTarjeta y ventana de clic derecho independientes')
  await openMenu('Insertar')
  await menuItem('Nota adhesiva')
  await wait(500)
  await app.send('Input.insertText', { text: 'Hito 1' })
  await key('Enter', { code: 'Enter', windowsVirtualKeyCode: 13 })
  await wait(300)
  const stickyBox = `[...document.querySelectorAll('.react-flow__node-sticky')].find(n => n.textContent.includes('Hito 1'))`
  check('la tarjeta nueva muestra el título escrito en el lienzo', await ev(`!!(${stickyBox})`))
  await ev(`(${stickyBox}).querySelector('.sticky-desc').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await wait(500)
  check('doble click en la descripción la deja editable (con foco)', await ev(`document.activeElement?.tagName === 'TEXTAREA' && !!(${stickyBox}).querySelector('textarea')`))
  await app.send('Input.insertText', { text: 'Resumen corto de la tarjeta' })
  await key('Enter', { code: 'Enter', windowsVirtualKeyCode: 13 })
  await wait(300)
  check('la descripción se ve en la tarjeta', await ev(`(${stickyBox}).textContent.includes('Resumen corto de la tarjeta')`))
  await ev(`(${stickyBox}).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`)
  await wait(500)
  check('click derecho abre la ventana con su propio título vacío (placeholder = título de la tarjeta)', (await ev(`document.querySelector('.note-title').value`)) === '' && (await ev(`document.querySelector('.note-title').placeholder`)) === 'Hito 1')
  await ev(`document.querySelector('.note-title').focus()`)
  await app.send('Input.insertText', { text: 'Todo lo que pasa en el evento' })
  await ev(`document.querySelector('.note-body .tiptap').focus()`)
  await app.send('Input.insertText', { text: 'Detalle largo del evento' })
  await wait(300)
  await key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 })
  await wait(400)
  check('lo escrito en la ventana NO aparece en la tarjeta', await ev(`(() => { const t = (${stickyBox}).textContent; return t.includes('Hito 1') && t.includes('Resumen corto de la tarjeta') && !t.includes('Detalle largo') && !t.includes('Todo lo que pasa') })()`))
  await wait(700)
  const saved = await ev(`(() => { const d = JSON.parse(localStorage.getItem('flow:autosave')); const all = d.boards.flatMap((b) => b.nodes); const n = all.find((x) => x.data.label === 'Hito 1'); return n ? { desc: n.data.desc, noteTitle: n.data.noteTitle, note: n.data.note } : null })()`)
  check('se guardan los cuatro campos por separado', saved && saved.desc === 'Resumen corto de la tarjeta' && saved.noteTitle === 'Todo lo que pasa en el evento' && saved.note.includes('Detalle largo del evento'), JSON.stringify(saved))
  check('la tarjeta con contenido ampliado muestra la insignia', await ev(`!!(${stickyBox}).querySelector('.note-badge')`))

  console.log('\nHerramientas y plantillas')
  await openMenu('Herramientas')
  await wait(150)
  check('el menú Herramientas agrupa lápiz y borrador', await ev("(() => { const m = [...document.querySelectorAll('.menu button')].map(b => b.textContent).join('|'); return m.includes('Lápiz') && m.includes('Borrador') })()"))
  await menuItem('Borrador')
  await wait(200)
  check('elegir una herramienta la activa y el menú lo muestra', (await count('.drawing-layer.eraser')) === 1 && (await count('.dropdown > button.active')) === 1)
  await key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 })
  await wait(200)

  await topBtn('Plantillas')
  await wait(300)
  check('Plantillas abre una ventana dentro de la app con 5 plantillas y sus miniaturas', (await count('.templates-window .template-card')) === 5 && (await count('.template-card svg.template-preview')) === 5)
  await key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 })
  await wait(200)
  check('Esc cierra la ventana de plantillas', (await count('.templates-window')) === 0)
  const tabsBefore = await count('.tab')
  await topBtn('Plantillas')
  await wait(200)
  await ev("[...document.querySelectorAll('.template-card')].find(c => c.textContent.includes('Scrum')).click()")
  await wait(1000)
  check('la plantilla abre una pestaña nueva con su nombre (no pisa el tablero actual)', (await count('.tab')) === tabsBefore + 1 && (await ev("document.querySelector('.tab.active').textContent.includes('Tablero Scrum')")))
  check('el tablero Scrum tiene 3 columnas y 5 tarjetas', (await count('.column-node')) === 3 && (await count('.kanban-card')) === 5)

  console.log('\nTablero tipo Trello (arrastre con ratón real)')
  const counts = () => ev("[...document.querySelectorAll('.column-node')].map(c => c.querySelector('.column-title').textContent + '=' + c.querySelector('.column-count').textContent).join(' ')")
  const rectOf = (expr) => ev('(() => { const r = (' + expr + ').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } })()')
  const cardEl = (text) => "[...document.querySelectorAll('.react-flow__node-sticky')].find(n => n.textContent.includes('" + text + "'))"
  const columnEl = (title) => "[...document.querySelectorAll('.react-flow__node-column')].find(n => n.querySelector('.column-title').textContent === '" + title + "')"
  const mouse = (type, x, y, buttons = 1) => app.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 })
  const dragTo = async (from, to, pause) => {
    await mouse('mouseMoved', from.x, from.y, 0)
    await mouse('mousePressed', from.x, from.y)
    for (let i = 1; i <= 12; i++) {
      await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12)
      await wait(16)
    }
    await wait(200)
    if (pause) await pause()
    await mouse('mouseReleased', to.x, to.y, 0)
    await wait(500)
  }
  const stored = async (label) => { await wait(600); return ev("(() => { const d = JSON.parse(localStorage.getItem('flow:autosave')); const n = d.boards.flatMap(b => b.nodes).find(x => x.data.label === '" + label + "'); const c = n && d.boards.flatMap(b => b.nodes).find(x => x.id === n.data.columnId); return c ? c.data.label : null })()") }

  // Soltar cerca del borde desplaza la vista (auto-pan): se reencuadra para que todo siga dibujado y a la vista.
  const fit = async () => { await ev("document.querySelector('.react-flow__controls-fitview').click()"); await wait(500) }
  const doneRect = await rectOf(columnEl('Done'))
  const heightBefore = doneRect.height
  let during = {}
  await dragTo(await rectOf(cardEl('Diseñar la pantalla')), { x: doneRect.x, y: doneRect.top + 40 }, async () => {
    during = {
      tilted: await ev("!!document.querySelector('.react-flow__node.dragging > .kanban-card')"),
      opened: await ev("(() => { const d = " + columnEl('Done') + "; const c = [...d.parentElement.querySelectorAll('.react-flow__node-sticky')].find(n => n.textContent.includes('Preparar el proyecto')); return c.getBoundingClientRect().top - d.getBoundingClientRect().top })()"),
    }
  })
  check('la tarjeta arrastrada se inclina como en Trello', during.tilted)
  check('al pasar sobre una columna se abre el hueco antes de soltar', during.opened > 80, String(during.opened))
  check('soltar mueve la tarjeta de To Do a Done', (await counts()) === 'To Do=2 In Progress=1 Done=2', await counts())
  const moved = await rectOf(cardEl('Diseñar la pantalla'))
  const doneAfter = await rectOf(columnEl('Done'))
  check('la tarjeta queda encajada dentro de la columna', moved.left > doneAfter.left && moved.right < doneAfter.right, JSON.stringify([moved.left, doneAfter.left]))
  check('quedó en la posición donde se soltó (encima de la otra tarjeta)', moved.top < (await rectOf(cardEl('Preparar el proyecto'))).top)
  check('la columna crece para contenerla', doneAfter.height > heightBefore - 1 && doneAfter.bottom > (await rectOf(cardEl('Preparar el proyecto'))).bottom)
  check('el cambio de columna se guarda', (await stored('Diseñar la pantalla principal')) === 'Done')

  await topBtn('↶')
  await wait(500)
  check('deshacer devuelve la tarjeta a su columna', (await counts()) === 'To Do=3 In Progress=1 Done=1', await counts())
  await topBtn('↷')
  await wait(500)

  // Reordenar dentro de la misma columna
  const firstCard = await rectOf(cardEl('Definir el backlog'))
  const lastCard = await rectOf(cardEl('Revisar con el equipo'))
  await dragTo(firstCard, { x: lastCard.x, y: lastCard.bottom + 30 })
  check('se pueden reordenar tarjetas dentro de una columna', (await rectOf(cardEl('Definir el backlog'))).top > (await rectOf(cardEl('Revisar con el equipo'))).top)

  // Añadir tarjeta
  await ev(columnEl('In Progress') + ".querySelector('.column-add').click()")
  await wait(500)
  await app.send('Input.insertText', { text: 'Tarea nueva' })
  await key('Enter', { code: 'Enter', windowsVirtualKeyCode: 13 })
  await wait(400)
  check('el botón Añadir tarjeta crea una tarjeta y la deja lista para escribir', (await counts()) === 'To Do=2 In Progress=2 Done=2' && (await ev(columnEl('In Progress') + " !== undefined && !!" + cardEl('Tarea nueva'))), await counts())

  // La tarjeta crece con su descripción y empuja a las demás
  const growBefore = await rectOf(cardEl('Tarea nueva'))
  await ev(cardEl('Tarea nueva') + ".querySelector('.sticky-desc').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))")
  await wait(400)
  await app.send('Input.insertText', { text: 'Descripción bastante larga de esta tarea. '.repeat(10) })
  await key('Enter', { code: 'Enter', windowsVirtualKeyCode: 13 })
  await wait(600)
  const grown = await rectOf(cardEl('Tarea nueva'))
  const columnGrown = await rectOf(columnEl('In Progress'))
  check('la tarjeta crece con su descripción sin cortar el texto', grown.height > growBefore.height + 40, grown.height + ' vs ' + growBefore.height)
  check('la columna crece con la tarjeta', columnGrown.bottom > grown.bottom)

  // Sacar una tarjeta al lienzo y volver a meterla
  const todoRect = await rectOf(columnEl('To Do'))
  await dragTo(await rectOf(cardEl('Revisar con el equipo')), { x: Math.max(70, todoRect.left - 90), y: todoRect.top + 60 })
  await fit()
  check('soltar fuera de las columnas la convierte en una nota libre', (await counts()) === 'To Do=1 In Progress=2 Done=2' && !(await ev(cardEl('Revisar con el equipo') + ".querySelector('.kanban-card')")), await counts())
  const freeRect = await rectOf(cardEl('Revisar con el equipo'))
  await dragTo(freeRect, { x: (await rectOf(columnEl('In Progress'))).x, y: (await rectOf(columnEl('In Progress'))).top + 40 })
  await fit()
  check('una nota libre se puede soltar dentro de una columna', (await counts()) === 'To Do=1 In Progress=3 Done=2', await counts())

  // Mover la columna por su cabecera
  const header = await rectOf(columnEl('Done') + ".querySelector('.column-header')")
  const cardBefore = await rectOf(cardEl('Preparar el proyecto'))
  await dragTo(header, { x: header.x + 60, y: header.y + 90 })
  const cardMoved = await rectOf(cardEl('Preparar el proyecto'))
  // (se compara antes de reencuadrar)
  check('arrastrar la cabecera mueve la columna con sus tarjetas', cardMoved.left - cardBefore.left > 20 && cardMoved.top - cardBefore.top > 20, JSON.stringify([cardMoved.left - cardBefore.left, cardMoved.top - cardBefore.top]))

  await fit()

  // Clic derecho en una tarjeta
  await ev(cardEl('Preparar el proyecto') + ".dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))")
  await wait(400)
  check('clic derecho en una tarjeta abre su ventana', (await count('.note-window')) === 1)
  await key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 })
  await wait(300)

  // Borrar una columna no borra sus tarjetas
  await ev(columnEl('To Do') + ".dispatchEvent(new MouseEvent('click', { bubbles: true }))")
  await wait(200)
  await key('Delete', { code: 'Delete', windowsVirtualKeyCode: 46 })
  await wait(500)
  check('borrar una columna conserva sus tarjetas como notas libres', (await count('.column-node')) === 2 && (await ev('!!' + cardEl('Definir el backlog') + " && !" + cardEl('Definir el backlog') + ".querySelector('.kanban-card')")))

  // Un tablero se conserva al recargar
  await wait(600)
  await ev('location.reload()').catch(() => {})
  await wait(1800)
  await app.waitFor("!!document.querySelector('.react-flow')")
  await app.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await wait(800)
  check('el tablero se conserva al recargar', (await count('.column-node')) === 2 && (await counts()) === 'In Progress=3 Done=2', await counts())

  console.log('\nTema y filtros')
  const before = await ev(`document.documentElement.dataset.theme`)
  await topBtn(before === 'dark' ? '☀' : '🌙')
  await wait(300)
  check('el botón de tema alterna claro/oscuro', (await ev(`document.documentElement.dataset.theme`)) !== before)
  check('en modo oscuro hay estrellas', (await ev(`document.documentElement.dataset.theme`)) !== 'dark' || (await count('.stars i')) > 20)

  console.log('\nIdiomas y atribución')
  check('la interfaz está en español', (await ev(`document.documentElement.lang`)) === 'es' && (await ev(`document.body.textContent.includes('Guardar')`)))
  check('no se muestra la atribución "React Flow"', (await count('.react-flow__attribution')) === 0 && !(await ev(`document.body.textContent.includes('React Flow')`)))
  const pickLanguage = async (button, name) => {
    await topBtn(button)
    await wait(250)
    await ev("[...document.querySelectorAll('.prefs-window .seg button')].find(b => b.textContent === '" + name + "').click()")
    await wait(250)
    await key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 })
    await wait(250)
  }
  await pickLanguage('Preferencias', 'English')
  check('en inglés la barra también cabe en una fila', (await ev(`document.querySelector('.topbar').getBoundingClientRect().height`)) < 62)
  check('Preferencias cambia la interfaz a inglés', (await ev(`document.documentElement.lang`)) === 'en' && (await ev(`document.body.textContent.includes('Save') && document.body.textContent.includes('Open') && !document.body.textContent.includes('Guardar')`)))
  check('el menú Insertar está en inglés', await (async () => { await openMenu('Insert'); await wait(200); const ok = await ev(`[...document.querySelectorAll('.menu button')].map(b => b.textContent).join('|').includes('Sticky note')`); await ev(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`); return ok })())
  check('el idioma elegido se recuerda', (await ev(`localStorage.getItem('flow:lang')`)) === 'en')
  await pickLanguage('Preferences', 'Español')
  check('vuelve a español', (await ev(`document.documentElement.lang`)) === 'es')

  console.log('\nPreferencias')
  await ev("document.querySelector('.tab').click()")
  await wait(500)
  const visible = (sel) => ev('!!document.querySelector(' + JSON.stringify(sel) + ')')
  check('al inicio se ven minimapa, controles, instrucciones y puntos', (await visible('.react-flow__minimap')) && (await visible('.react-flow__controls')) && (await visible('.hint')) && (await visible('.react-flow__background')))
  await topBtn('Preferencias')
  await wait(300)
  check('el botón abre la ventana de preferencias', await visible('.prefs-window'))
  const togglePref = async (key) => { await ev('document.querySelector(\'[data-pref="' + key + '"]\').click()'); await wait(150) }
  for (const key of ['minimap', 'hint', 'controls', 'grid']) await togglePref(key)
  check('se puede ocultar el minimapa', !(await visible('.react-flow__minimap')))
  check('se pueden ocultar las instrucciones', !(await visible('.hint')))
  check('se pueden ocultar los controles de zoom y los puntos', !(await visible('.react-flow__controls')) && !(await visible('.react-flow__background')))
  await ev("[...document.querySelectorAll('.prefs-window .seg button')].find(b => b.textContent === 'Noche').click()")
  await wait(200)
  check('el tema se puede elegir desde preferencias', (await ev('document.documentElement.dataset.theme')) === 'dark')
  await togglePref('stars')
  check('se pueden desactivar las estrellas', (await count('.stars i')) === 0)
  await key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 })
  await wait(700)
  await ev('location.reload()').catch(() => {})
  await wait(1800)
  await app.waitFor("!!document.querySelector('.react-flow')")
  await app.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  check('las preferencias se recuerdan al reiniciar', !(await visible('.react-flow__minimap')) && !(await visible('.hint')))
  await topBtn('Preferencias')
  await wait(300)
  await ev("[...document.querySelectorAll('.prefs-footer button')][0].click()")
  await wait(300)
  await key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 })
  await wait(300)
  check('restablecer vuelve a mostrar todo', (await visible('.react-flow__minimap')) && (await visible('.hint')) && (await visible('.react-flow__controls')))

  console.log('\nRendimiento')
  const big = { version: 2, activeId: 'p', boards: [{ id: 'p', name: 'Carga', nodes: Array.from({ length: 800 }, (_, i) => ({ id: `n${i}`, type: 'sticky', position: { x: (i % 40) * 220, y: Math.floor(i / 40) * 140 }, style: { width: 200, height: 100 }, data: { label: `Nota ${i}`, note: '<p>texto</p>', color: '#fde68a' } })), edges: [] }] }
  await ev(`localStorage.setItem('flow:autosave', ${JSON.stringify(JSON.stringify(big))}); 0`)
  const t0 = Date.now()
  await ev(`location.reload()`).catch(() => {})
  await wait(800)
  const loaded = await app.waitFor(`document.querySelectorAll('.react-flow__node').length > 0`, 15000)
  const ms = Date.now() - t0
  check(`un tablero con 800 notas carga en < 8 s (${ms} ms)`, loaded && ms < 8000)
  await wait(1500)
  const domTotal = await ev(`document.querySelectorAll('*').length`)
  check(`con muchos elementos alejados se activa el modo ligero (${await count('.lod')} elementos)`, (await count('.lod')) > 100)
  check(`el DOM se mantiene acotado con 800 notas (${domTotal} nodos; antes ≈ 17 000)`, domTotal < 9000, String(domTotal))

  console.log('\nErrores de consola durante toda la sesión')
  const relevant = problems.filter((p) => !/Autofill|favicon/i.test(p))
  check('sin excepciones ni errores de consola/CSP', relevant.length === 0, relevant.slice(0, 3).join(' | '))

  console.log('\nConfirmación al salir')
  await ev("localStorage.removeItem('flow:autosave'); localStorage.removeItem('flow:dirty'); location.reload()").catch(() => {})
  await wait(1800)
  await app.waitFor("!!document.querySelector('.react-flow__node')")
  await app.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  const isOpen = async (port = 9333) => (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).some((t) => t.type === 'page')
  await openMenu('Insertar')
  await menuItem('Caja')
  await wait(500)
  await key('Enter', { code: 'Enter', windowsVirtualKeyCode: 13 })
  await wait(300)
  pressCloseButton(app.pid)
  await wait(1000)
  check('con cambios sin guardar, cerrar muestra la ventana de confirmación', await visible2(ev, '.confirm-window'))
  await ev("[...document.querySelectorAll('.confirm-actions button')].find(b => b.textContent === 'Cancelar').click()")
  await wait(500)
  check('Cancelar mantiene la app abierta y sin la ventana', (await isOpen()) && !(await visible2(ev, '.confirm-window')))
  pressCloseButton(app.pid)
  await wait(1000)
  await key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 })
  await wait(400)
  check('Esc también cancela la salida', (await isOpen()) && !(await visible2(ev, '.confirm-window')))
  pressCloseButton(app.pid)
  await wait(1000)
  await ev("[...document.querySelectorAll('.confirm-actions button')].find(b => b.textContent === 'Salir sin guardar').click()").catch(() => {})
  await wait(1500)
  let closed = false
  try { closed = !(await isOpen()) } catch { closed = true }
  check('Salir sin guardar cierra la app', closed)

  // Sin cambios no debe preguntar nada
  const fresh = await launchApp({ port: 9334 })
  await fresh.waitFor("!!document.querySelector('.react-flow__node')")
  await wait(800)
  pressCloseButton(fresh.pid)
  await wait(1800)
  let freshClosed = false
  try { freshClosed = !(await isOpen(9334)) } catch { freshClosed = true }
  check('sin cambios, la X cierra sin preguntar', freshClosed)
  await fresh.close()

  await app.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((err) => {
  console.error('Fallo en el test:', err)
  process.exit(2)
})
