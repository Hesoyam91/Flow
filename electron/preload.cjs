const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('flowFiles', {
  open: () => ipcRenderer.invoke('file:open'),
  save: (content, filePath) => ipcRenderer.invoke('file:save', { content, filePath }),
  export: (payload) => ipcRenderer.invoke('file:export', payload),
  logError: (message) => ipcRenderer.invoke('log:error', message),
  onCloseRequested: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('app:close-requested', listener)
    return () => ipcRenderer.removeListener('app:close-requested', listener)
  },
  ackClose: () => ipcRenderer.invoke('app:close-ack'),
  confirmClose: () => ipcRenderer.invoke('app:close-confirm'),
  cancelClose: () => ipcRenderer.invoke('app:close-cancel'),
})
