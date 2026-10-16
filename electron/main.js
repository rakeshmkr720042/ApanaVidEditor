// Electron main process for the Windows desktop app. The built Vite app (dist/) is served
// from a privileged app:// scheme so it gets a secure origin with cross-origin isolation
// headers (COOP/COEP, needed for SharedArrayBuffer) and a CSP, like the hosted web app.
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const devUrl = process.env.ELECTRON_DEV_URL // set by `npm run electron:dev`
const appUrl = 'app://bundle/index.html'
const videoExts = ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi']
const mediaExts = [...videoExts, 'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp3', 'wav', 'm4a', 'aac', 'ogg']

const csp = [
  "default-src 'self'",
  // transformers.js (AI Dub) is loaded from jsDelivr; ffmpeg and onnxruntime compile wasm
  "script-src 'self' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob: mediastream:",
  "font-src 'self' data: blob:",
  // model downloads (Hugging Face, jsDelivr) and the MyMemory translation API
  "connect-src 'self' data: blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  // credentialless (not require-corp) keeps the CDN model downloads working
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
])

const mimeTypes = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
}

function serveDist() {
  protocol.handle('app', async (req) => {
    const { pathname } = new URL(req.url)
    const file = normalize(join(distDir, decodeURIComponent(pathname)))
    if (!file.startsWith(distDir + sep)) return new Response('Forbidden', { status: 403 })
    const res = await net.fetch(pathToFileURL(file).toString()).catch(() => null)
    if (!res?.ok) return new Response('Not found', { status: 404 })
    const headers = new Headers(isolationHeaders)
    headers.set('Content-Type', mimeTypes[extname(file).toLowerCase()] ?? res.headers.get('Content-Type') ?? 'application/octet-stream')
    if (file.endsWith('.html')) headers.set('Content-Security-Policy', csp)
    return new Response(res.body, { status: 200, headers })
  })
}

/** @type {BrowserWindow | null} */
let win = null
let rendererReady = false
/** @type {string[]} */
let pendingPaths = []

const mediaArgs = (argv) => argv.slice(1).filter((a) => !a.startsWith('-') && mediaExts.includes(extname(a).slice(1).toLowerCase()))

async function sendFiles(paths) {
  if (!paths.length) return
  if (!win || !rendererReady) { pendingPaths.push(...paths); return }
  const files = []
  for (const p of paths) {
    try { files.push({ name: basename(p), data: await readFile(p) }) } catch (e) {
      dialog.showErrorBox('Could not open file', `${p}\n${e.message}`)
    }
  }
  if (files.length) win.webContents.send('desktop:open-files', files)
}

async function openVideoDialog() {
  if (!win) return
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Open video',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Videos', extensions: videoExts },
      { name: 'All media', extensions: mediaExts },
    ],
  })
  if (!canceled) sendFiles(filePaths)
}

function buildMenu() {
  const about = () => dialog.showMessageBox(win, {
    type: 'info', title: 'About ApanaVidEditor', message: `ApanaVidEditor ${app.getVersion()}`,
    detail: 'Lightweight offline video editor.\nEverything runs on your computer; nothing is uploaded.',
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: '&File',
      submenu: [
        { label: 'Open Video…', accelerator: 'CmdOrCtrl+O', click: openVideoDialog },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: '&View',
      submenu: [
        { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: 'Website', click: () => shell.openExternal('https://rakeshmkr720042.github.io/ApanaVidEditor/') },
        { label: 'About ApanaVidEditor', click: about },
      ],
    },
  ]))
}

function createWindow() {
  rendererReady = false
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#0f1115',
    title: 'ApanaVidEditor',
    icon: join(here, 'icon.png'),
    show: false,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => { win = null })
  win.webContents.on('did-start-loading', () => { rendererReady = false })
  // links that open a new window (help pages, model cards) go to the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith('app://bundle/')
    if (!allowed) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url) }
  })
  win.loadURL(devUrl ?? appUrl)
}

ipcMain.on('desktop:ready', (e) => {
  if (e.sender !== win?.webContents) return
  rendererReady = true
  const paths = pendingPaths
  pendingPaths = []
  sendFiles(paths)
})

// one window only: opening a file from Explorer while running hands it to that window
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  pendingPaths = mediaArgs(process.argv)
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
    sendFiles(mediaArgs(argv))
  })
  app.whenReady().then(() => {
    serveDist()
    buildMenu()
    createWindow()
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
  })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
