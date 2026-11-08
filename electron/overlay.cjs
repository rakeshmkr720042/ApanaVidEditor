// Bridge for the Smart annotate overlay (electron/overlay.html), see electron/annotate.js.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('overlay', {
  onState(cb) { ipcRenderer.on('overlay:state', (_e, s) => cb(s)) },
  stroke: (s) => ipcRenderer.send('overlay:stroke', s),
  tool: (tool, color) => ipcRenderer.send('overlay:tool', tool, color),
  done: () => ipcRenderer.send('overlay:done'),
})
