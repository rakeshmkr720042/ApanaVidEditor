// Exposes a tiny, typed bridge to the web app (see src/lib/desktop.ts).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  onOpenFiles(cb) {
    const listener = (_e, files) => cb(files)
    ipcRenderer.on('desktop:open-files', listener)
    return () => ipcRenderer.removeListener('desktop:open-files', listener)
  },
  ready: () => ipcRenderer.send('desktop:ready'),
  onPickScreen(cb) {
    const listener = (_e, sources) => cb(sources)
    ipcRenderer.on('desktop:pick-screen', listener)
    return () => ipcRenderer.removeListener('desktop:pick-screen', listener)
  },
  pickScreen: (id) => ipcRenderer.send('desktop:picked-screen', id),
  fetchUrl: (url) => ipcRenderer.invoke('desktop:fetch', url),
  googleSignIn: (opts) => ipcRenderer.invoke('desktop:google-signin', opts),
  googleCancel: () => ipcRenderer.send('desktop:google-cancel'),
  googleRefresh: (opts) => ipcRenderer.invoke('desktop:google-refresh', opts),
  googleFetch: (req) => ipcRenderer.invoke('desktop:google-fetch', req),
  keepAwake: (on) => ipcRenderer.send('desktop:keep-awake', !!on),
})
