const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('flowFiles', {
  open: () => ipcRenderer.invoke('file:open'),
  save: (content, filePath) => ipcRenderer.invoke('file:save', { content, filePath }),
  export: (payload) => ipcRenderer.invoke('file:export', payload),
})
