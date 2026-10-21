// Electron main process for the Windows desktop app. The built Vite app (dist/) is served
// from a privileged app:// scheme so it gets a secure origin with cross-origin isolation
// headers (COOP/COEP, needed for SharedArrayBuffer) and a CSP, like the hosted web app.
import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, net, powerSaveBlocker, protocol, safeStorage, session, shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
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
  // everything ships with the app; ffmpeg and onnxruntime compile wasm
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob: mediastream:",
  "font-src 'self' data: blob:",
  // optional online parts: AI model downloads (Hugging Face), the MyMemory translation API,
  // article links, voice cloning, YouTube upload, and Local AI
  // (the user's own Ollama server, usually http://localhost:11434)
  "connect-src 'self' data: blob: https: http:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  // credentialless (not require-corp) keeps the optional model downloads working
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

// Exports run frame by frame in the page, so keep it at full speed while the window is
// minimised, covered by another window or in the background.
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

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
      backgroundThrottling: false,
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

// Screen recording: Electron has no built-in screen picker, so the screens and windows are sent to
// the app, which shows its own picker and answers with the chosen id (or null to cancel).
let screenPick = null
function handleDisplayMedia() {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!win) return callback(null)
    let sources
    try {
      sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } })
    } catch {
      return callback(null)
    }
    screenPick?.(null)
    screenPick = (id) => {
      screenPick = null
      const s = sources.find((x) => x.id === id)
      if (!s) return callback(null)
      // system sound can only be captured on Windows
      callback({ video: s, ...(request.audioRequested && process.platform === 'win32' ? { audio: 'loopback' } : {}) })
    }
    win.webContents.send('desktop:pick-screen', sources.map((s) => ({
      id: s.id, name: s.name, thumb: s.thumbnail.toDataURL(), screen: s.id.startsWith('screen:'),
    })))
  })
}

ipcMain.on('desktop:picked-screen', (e, id) => {
  if (e.sender !== win?.webContents) return
  screenPick?.(typeof id === 'string' ? id : null)
})

// Article to video: the page is read here, where browser CORS rules don't apply
const FETCH_LIMIT = 25 * 1024 * 1024
ipcMain.handle('desktop:fetch', async (e, url) => {
  if (e.sender !== win?.webContents) throw new Error('Not allowed')
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Only web links can be opened')
  const res = await net.fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) })
  const size = Number(res.headers.get('content-length') || 0)
  if (size > FETCH_LIMIT) throw new Error('This file is too big')
  const data = new Uint8Array(await res.arrayBuffer())
  if (data.byteLength > FETCH_LIMIT) throw new Error('This file is too big')
  return { ok: res.ok, status: res.status, type: res.headers.get('content-type') || '', url: res.url, data }
})

// YouTube upload: Google sign-in with the loopback + PKCE flow for "Desktop app" OAuth clients.
// The consent page opens in the default browser and comes back to a one-time server on 127.0.0.1.
// The refresh token is handed to the page encrypted with Windows' own data protection.
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const seal = (s) => safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(s).toString('base64')}` : `raw:${s}`
const unseal = (s) => s.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')) : s.replace(/^raw:/, '')

async function googleToken(params) {
  const res = await net.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString(),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.access_token) throw new Error(`Google sign-in failed: ${j.error_description || j.error || res.status}`)
  return j
}

let cancelSignIn = null
const page = (msg) => `<!doctype html><meta charset="utf-8"><title>ApanaVidEditor</title><body style="font:16px system-ui;padding:40px;background:#0f1115;color:#eee">${msg}`

ipcMain.handle('desktop:google-signin', async (e, { clientId, clientSecret, scope }) => {
  if (e.sender !== win?.webContents) throw new Error('Not allowed')
  if (typeof clientId !== 'string' || !clientId || typeof scope !== 'string') throw new Error('Add your OAuth client ID first.')
  cancelSignIn?.()
  const verifier = b64url(randomBytes(32))
  const state = b64url(randomBytes(16))
  const server = createServer()
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok) })
  const redirect = `http://127.0.0.1:${server.address().port}`
  try {
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Sign-in took too long. Try again.')), 5 * 60_000)
      cancelSignIn = () => { clearTimeout(timer); reject(new Error('Sign-in was cancelled.')) }
      server.on('request', (req, res) => {
        const q = new URL(req.url, redirect).searchParams
        if (q.get('state') !== state) { res.writeHead(404).end(); return }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        clearTimeout(timer)
        if (q.get('code')) {
          res.end(page('Signed in to ApanaVidEditor. You can close this tab and go back to the app.'))
          resolve(q.get('code'))
        } else {
          res.end(page('Sign-in was not finished. You can close this tab.'))
          reject(new Error(q.get('error') === 'access_denied' ? 'Sign-in was cancelled.' : `Google sign-in failed (${q.get('error')}).`))
        }
      })
      shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: clientId, redirect_uri: redirect, response_type: 'code', scope, state, access_type: 'offline', prompt: 'consent',
        code_challenge: b64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
      })).catch(reject)
    })
    win?.focus()
    const j = await googleToken({
      client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}), code, code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code',
    })
    return { access: j.access_token, expiresIn: j.expires_in, refresh: j.refresh_token ? seal(j.refresh_token) : undefined }
  } finally {
    cancelSignIn = null
    server.close()
  }
})

ipcMain.on('desktop:google-cancel', (e) => { if (e.sender === win?.webContents) cancelSignIn?.() })

ipcMain.handle('desktop:google-refresh', async (e, { clientId, clientSecret, refresh }) => {
  if (e.sender !== win?.webContents) throw new Error('Not allowed')
  const j = await googleToken({ client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}), refresh_token: unseal(refresh), grant_type: 'refresh_token' })
  return { access: j.access_token, expiresIn: j.expires_in }
})

// YouTube API calls (the upload pieces come straight from the exported video in memory)
ipcMain.handle('desktop:google-fetch', async (e, { url, method, headers, body }) => {
  if (e.sender !== win?.webContents) throw new Error('Not allowed')
  if (typeof url !== 'string' || !url.startsWith('https://www.googleapis.com/')) throw new Error('Not allowed')
  const res = await net.fetch(url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(10 * 60_000) })
  return { status: res.status, location: res.headers.get('location'), range: res.headers.get('range'), text: await res.text() }
})

// Keeps the computer awake (the screen may still turn off) while an export runs.
let awakeId = null
ipcMain.on('desktop:keep-awake', (e, on) => {
  if (e.sender !== win?.webContents) return
  if (on && awakeId === null) awakeId = powerSaveBlocker.start('prevent-app-suspension')
  else if (!on && awakeId !== null) { powerSaveBlocker.stop(awakeId); awakeId = null }
})

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
    handleDisplayMedia()
    buildMenu()
    createWindow()
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
  })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
