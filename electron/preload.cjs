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
  googleLogin: () => ipcRenderer.invoke('desktop:google-login'),
  googleRefresh: (opts) => ipcRenderer.invoke('desktop:google-refresh', opts),
  googleFetch: (req) => ipcRenderer.invoke('desktop:google-fetch', req),
  aiCheck: () => ipcRenderer.invoke('desktop:ai-check'),
  aiSetup: (model) => ipcRenderer.invoke('desktop:ai-setup', model),
  aiCancel: () => ipcRenderer.send('desktop:ai-cancel'),
  onAIProgress(cb) {
    const listener = (_e, p) => cb(p)
    ipcRenderer.on('desktop:ai-progress', listener)
    return () => ipcRenderer.removeListener('desktop:ai-progress', listener)
  },
  keepAwake: (on) => ipcRenderer.send('desktop:keep-awake', !!on),
  onHelp(cb) {
    const listener = (_e, topic) => cb(topic ?? null)
    ipcRenderer.on('desktop:help', listener)
    return () => ipcRenderer.removeListener('desktop:help', listener)
  },
})
