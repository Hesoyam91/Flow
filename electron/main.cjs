const { app, BrowserWindow, crashReporter, dialog, ipcMain, session, shell } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const fs = require('fs/promises')
const fsSync = require('fs')
const { MAX_BYTES, isTrustedUrl, PathGrants, parseSavePayload, parseExportPayload, parseLogPayload, ensureExtension, isSafeExternalUrl } = require('./guards.cjs')

const isDev = process.argv.includes('--dev')
const URLS = { dev: isDev, devUrl: 'http://localhost:5173', appUrl: pathToFileURL(path.join(__dirname, '../dist/index.html')).href }
const FLOW_FILTERS = [{ name: app.getLocale().toLowerCase().startsWith('es') ? 'Proyecto Flow' : 'Flow project', extensions: ['flow'] }]
const grants = new PathGrants()

let mainWindow = null

// Cierre con confirmación: la interfaz decide si pregunta. Si no contesta (colgada o sin cargar),
// se ofrece un diálogo nativo para que nunca sea imposible cerrar la app.
const CLOSE_ACK_TIMEOUT = 5000
let allowClose = false
let quitRequested = false
let closeTimer = null

function finishClose() {
  clearTimeout(closeTimer)
  closeTimer = null
  allowClose = true
  if (quitRequested) app.quit()
  else mainWindow?.close()
}

function askRendererToClose(win) {
  if (closeTimer) return
  win.webContents.send('app:close-requested')
  closeTimer = setTimeout(async () => {
    closeTimer = null
    const es = app.getLocale().toLowerCase().startsWith('es')
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: es ? ['Cerrar de todos modos', 'Esperar'] : ['Close anyway', 'Wait'],
      defaultId: 1,
      cancelId: 1,
      message: es ? 'Flow no responde' : 'Flow is not responding',
      detail: es ? 'Si la cierras ahora, podrías perder los cambios más recientes.' : 'If you close it now, you may lose your most recent changes.',
    })
    if (response === 0) finishClose()
    else quitRequested = false
  }, CLOSE_ACK_TIMEOUT)
}

// Registro de diagnóstico (%APPDATA%/<app>/logs/flow.log): caídas de la interfaz o de procesos hijo, y errores de la UI.
// Se limita a 1 MB (el anterior pasa a flow.old.log) y nunca sale del equipo.
let rendererLogCount = 0
function logLine(kind, detail) {
  try {
    const dir = path.join(app.getPath('userData'), 'logs')
    fsSync.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'flow.log')
    if (fsSync.existsSync(file) && fsSync.statSync(file).size > 1024 * 1024) fsSync.renameSync(file, path.join(dir, 'flow.old.log'))
    fsSync.appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), kind, detail }) + '\n')
  } catch {
    /* el diagnóstico nunca debe romper la app */
  }
}

// Informes de fallo nativos, solo locales (uploadToServer: false).
crashReporter.start({ uploadToServer: false })

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Flow',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    },
  })

  allowClose = false
  const wc = mainWindow.webContents
  mainWindow.on('close', (event) => {
    if (allowClose || wc.isCrashed()) return
    event.preventDefault()
    askRendererToClose(mainWindow)
  })
  // Los enlaces externos se abren en el navegador; la ventana nunca navega fuera de la app.
  wc.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('render-process-gone', (_e, details) => logLine('render-process-gone', details))
  wc.on('unresponsive', () => logLine('unresponsive', 'la interfaz dejó de responder'))
  wc.on('responsive', () => logLine('responsive', 'la interfaz volvió a responder'))
  wc.on('did-fail-load', (_e, code, description) => logLine('did-fail-load', { code, description }))
  wc.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url, URLS)) event.preventDefault()
  })

  if (isDev) mainWindow.loadURL(URLS.devUrl)
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  mainWindow.on('closed', () => (mainWindow = null))
}

// IPC: solo atiende a nuestra página y valida todo lo que recibe.
function handle(channel, fn) {
  ipcMain.handle(channel, (event, payload) => {
    if (!isTrustedUrl(event.senderFrame?.url, URLS)) throw new Error('Origen no autorizado')
    return fn(payload)
  })
}

handle('app:close-ack', () => {
  clearTimeout(closeTimer)
  closeTimer = null
})
handle('app:close-confirm', () => finishClose())
handle('app:close-cancel', () => {
  quitRequested = false
})

handle('log:error', (payload) => {
  const message = parseLogPayload(payload)
  if (++rendererLogCount <= 100) logLine('renderer', message)
})

handle('file:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ filters: FLOW_FILTERS, properties: ['openFile'] })
  if (canceled || !filePaths[0]) return null
  const { size } = await fs.stat(filePaths[0])
  if (size > MAX_BYTES) throw new Error('Archivo demasiado grande')
  const content = await fs.readFile(filePaths[0], 'utf8')
  grants.add(filePaths[0])
  return { path: filePaths[0], content }
})

handle('file:save', async (payload) => {
  const { content, filePath } = parseSavePayload(payload)
  let target = filePath && grants.has(filePath) ? filePath : null
  if (!target) {
    const res = await dialog.showSaveDialog({ filters: FLOW_FILTERS, defaultPath: 'diagrama.flow' })
    if (res.canceled || !res.filePath) return null
    target = ensureExtension(res.filePath, 'flow')
    grants.add(target)
  }
  await fs.writeFile(target, content, 'utf8')
  return { path: target }
})

handle('file:export', async (payload) => {
  const { buffer, name, filters } = parseExportPayload(payload)
  const res = await dialog.showSaveDialog({ defaultPath: name, filters })
  if (res.canceled || !res.filePath) return null
  const ext = filters[0].extensions[0]
  const target = filters.some((f) => f.extensions.some((e) => res.filePath.toLowerCase().endsWith(`.${e}`))) ? res.filePath : ensureExtension(res.filePath, ext)
  await fs.writeFile(target, buffer)
  return { path: target }
})

// Una sola instancia: dos ventanas compartirían (y se pisarían) el autoguardado.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    // La app no necesita ningún permiso del navegador (cámara, micrófono, geolocalización...).
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)
    createWindow()
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
  })

  app.on('before-quit', () => {
    quitRequested = true
  })

  app.on('child-process-gone', (_e, details) => logLine('child-process-gone', details))

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (e) => e.preventDefault())
  })

  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
}
