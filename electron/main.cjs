const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const fs = require('fs/promises')
const { MAX_BYTES, isTrustedUrl, PathGrants, parseSavePayload, parseExportPayload, ensureExtension, isSafeExternalUrl } = require('./guards.cjs')

const isDev = process.argv.includes('--dev')
const URLS = { dev: isDev, devUrl: 'http://localhost:5173', appUrl: pathToFileURL(path.join(__dirname, '../dist/index.html')).href }
const FLOW_FILTERS = [{ name: app.getLocale().toLowerCase().startsWith('es') ? 'Proyecto Flow' : 'Flow project', extensions: ['flow'] }]
const grants = new PathGrants()

let mainWindow = null

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

  const wc = mainWindow.webContents
  // Los enlaces externos se abren en el navegador; la ventana nunca navega fuera de la app.
  wc.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
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

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (e) => e.preventDefault())
  })

  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
}
