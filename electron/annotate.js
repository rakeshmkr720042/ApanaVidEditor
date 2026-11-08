// Smart annotate for screen recordings (Windows app): while recording, collects where the cursor is, clicks and
// shortcuts (through a small helper, electron/native/inputhook.cs), and lets the presenter draw on the screen
// through a see-through overlay that is kept out of the recording. Everything is sent to the app as data with
// times, and becomes an editable Annotate item in the editor. Without the helper only the cursor is followed.
import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// the helper sits next to this file in development and in app.asar.unpacked once installed
const helperPath = () => join(here, 'bin', 'inputhook.exe').replace(`app.asar${process.platform === 'win32' ? '\\' : '/'}`, `app.asar.unpacked${process.platform === 'win32' ? '\\' : '/'}`)

export const HOTKEYS = {
  draw: 'Alt+Shift+D',
  laser: 'Alt+Shift+L',
  spotlight: 'Alt+Shift+S',
  zoom: 'Alt+Shift+Z',
  hide: 'Alt+Shift+H',
}
const HOTKEY_TEXT = new Set(Object.values(HOTKEYS))

/** The screen or window chosen in the screen picker (set by main.js). */
let picked = null
export function setPickedSource(source) {
  picked = source ? { id: source.id, displayId: source.display_id ?? '' } : null
}

let run = null // the running session

function displayOf(id) {
  const all = screen.getAllDisplays()
  return all.find((d) => String(d.id) === String(id)) ?? screen.getPrimaryDisplay()
}

/** Physical pixels of a DIP rectangle (Windows mixes scale factors between screens). */
const toPx = (r, d) => (process.platform === 'win32' ? screen.dipToScreenRect(null, r) : { x: r.x * d.scaleFactor, y: r.y * d.scaleFactor, width: r.width * d.scaleFactor, height: r.height * d.scaleFactor })
const toDip = (r) => (process.platform === 'win32' ? screen.screenToDipRect(null, r) : r)

function start(sender, opts) {
  stop()
  const src = picked
  const windowId = src && src.id.startsWith('window:') ? src.id.split(':')[1] : null
  const display = src && !windowId ? displayOf(src.displayId) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const r = {
    sender,
    display,
    windowId,
    // what the recording shows, in DIP and in physical pixels (a window's edges come from the helper)
    dip: windowId ? null : { ...display.bounds },
    px: windowId ? null : toPx(display.bounds, display),
    queue: [],
    modes: { draw: false, laser: false, spotlight: false, zoom: false, hide: false },
    tool: 'auto',
    color: '#ff3b30',
    helper: null,
    poll: null,
    flush: null,
    overlay: null,
    clicks: false,
    keys: false,
  }
  run = r
  const push = (e) => { e.at = Date.now(); r.queue.push(e) }
  r.push = push
  r.flush = setInterval(() => {
    if (!r.queue.length || r.sender.isDestroyed()) return
    r.sender.send('desktop:anno', r.queue)
    r.queue = []
  }, 50)

  const norm = (x, y) => (r.px ? [(x - r.px.x) / r.px.width, (y - r.px.y) / r.px.height] : null)

  // the helper: cursor, clicks, keys
  const exe = process.platform === 'win32' ? helperPath() : null
  if (exe && existsSync(exe)) {
    try {
      const child = spawn(exe, windowId ? [windowId] : [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
      r.helper = child
      r.clicks = r.keys = true
      let buf = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        buf += chunk
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim()
          buf = buf.slice(i + 1)
          if (line) helperLine(r, line, norm, push)
        }
      })
      child.on('error', () => { r.helper = null; startPolling(r, push) })
      child.on('exit', () => { if (run === r && r.helper === child) { r.helper = null; startPolling(r, push) } })
    } catch {
      r.helper = null
    }
  }
  if (!r.helper) startPolling(r, push)

  if (opts?.overlay !== false) openOverlay(r)
  if (opts?.hotkeys !== false) {
    for (const [mode, acc] of Object.entries(HOTKEYS)) {
      try { globalShortcut.register(acc, () => toggle(mode)) } catch { /* taken by another app */ }
    }
  }
  return { cursor: true, clicks: r.clicks, keys: r.keys, hotkeys: HOTKEYS, window: !!windowId }
}

function helperLine(r, line, norm, push) {
  const p = line.split(' ')
  if (p[0] === 'm') {
    const n = norm(+p[1], +p[2])
    if (n) push({ k: 'm', x: n[0], y: n[1] })
  } else if (p[0] === 'd' && !r.modes.draw) {
    const n = norm(+p[2], +p[3])
    if (n && n[0] >= 0 && n[0] <= 1 && n[1] >= 0 && n[1] <= 1) push({ k: 'click', x: n[0], y: n[1], right: p[1] === 'R' })
  } else if (p[0] === 'k') {
    const text = line.slice(2)
    if (!HOTKEY_TEXT.has(text) && !r.modes.draw) push({ k: 'key', text })
  } else if (p[0] === 'w') {
    if (p[1] === 'gone') return
    const px = { x: +p[1], y: +p[2], width: +p[3] - +p[1], height: +p[4] - +p[2] }
    if (px.width > 0 && px.height > 0) { r.px = px; r.dip = toDip(px) }
  }
}

/** Without the helper: the cursor only, read 30 times a second (no clicks or keys). */
function startPolling(r, push) {
  if (r.poll || run !== r) return
  r.poll = setInterval(() => {
    if (!r.dip) return
    const c = screen.getCursorScreenPoint()
    push({ k: 'm', x: (c.x - r.dip.x) / r.dip.width, y: (c.y - r.dip.y) / r.dip.height })
  }, 33)
}

function openOverlay(r) {
  const b = r.display.bounds
  try {
    const ov = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height,
      frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, hasShadow: false, focusable: false, show: false, alwaysOnTop: true,
      backgroundColor: '#00000000',
      webPreferences: { preload: join(here, 'overlay.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    // kept out of the recording: the drawing is added in the editor, where it can still be changed
    ov.setContentProtection(true)
    ov.setAlwaysOnTop(true, 'screen-saver')
    ov.setIgnoreMouseEvents(true)
    ov.setBounds(b)
    ov.loadFile(join(here, 'overlay.html')).then(() => { if (run === r && !ov.isDestroyed()) { ov.showInactive(); sendState(r) } }).catch(() => {})
    r.overlay = ov
  } catch {
    r.overlay = null
  }
}

function sendState(r) {
  const state = { modes: r.modes, tool: r.tool, color: r.color, hotkeys: HOTKEYS }
  if (r.overlay && !r.overlay.isDestroyed()) r.overlay.webContents.send('overlay:state', state)
  if (!r.sender.isDestroyed()) r.sender.send('desktop:anno-state', state)
}

function toggle(mode, on) {
  const r = run
  if (!r || !(mode in r.modes)) return
  const next = on ?? !r.modes[mode]
  if (next === r.modes[mode]) return
  r.modes[mode] = next
  const ov = r.overlay && !r.overlay.isDestroyed() ? r.overlay : null
  if (mode === 'draw') {
    if (ov) {
      ov.setIgnoreMouseEvents(!next)
      ov.setFocusable(next)
      if (next) { ov.showInactive(); ov.focus() } else ov.blur()
    }
  } else r.push({ k: 'mode', mode, on: next })
  sendState(r)
}

function stop() {
  const r = run
  if (!r) return
  run = null
  clearInterval(r.poll)
  clearInterval(r.flush)
  if (r.queue.length && !r.sender.isDestroyed()) r.sender.send('desktop:anno', r.queue)
  for (const acc of Object.values(HOTKEYS)) { try { globalShortcut.unregister(acc) } catch { /* not ours */ } }
  if (r.helper) { try { r.helper.stdin.write('q\n'); r.helper.stdin.end() } catch { /* gone */ } setTimeout(() => { try { r.helper?.kill() } catch { /* gone */ } }, 500) }
  if (r.overlay && !r.overlay.isDestroyed()) r.overlay.destroy()
}

/** A stroke drawn on the overlay (x, y pairs of the overlay = the screen), turned into the recording's own 0..1. */
function onStroke(r, stroke) {
  if (!Array.isArray(stroke?.pts) || !r.dip) return
  const b = r.display.bounds
  const pts = []
  for (let i = 0; i + 1 < stroke.pts.length && i < 4000; i += 2) {
    const x = b.x + stroke.pts[i] * b.width, y = b.y + stroke.pts[i + 1] * b.height
    pts.push((x - r.dip.x) / r.dip.width, (y - r.dip.y) / r.dip.height)
  }
  r.push({ k: 'stroke', tool: String(stroke.tool || 'auto'), color: typeof stroke.color === 'string' ? stroke.color : null, pts, ar: r.dip.width / r.dip.height })
}

export function registerAnnotate(isMain) {
  ipcMain.handle('desktop:anno-start', (e, opts) => (isMain(e.sender) ? start(e.sender, opts) : null))
  ipcMain.on('desktop:anno-stop', (e) => { if (isMain(e.sender)) stop() })
  ipcMain.on('desktop:anno-mode', (e, mode, on) => { if (isMain(e.sender)) toggle(mode, typeof on === 'boolean' ? on : undefined) })
  // from the overlay window
  const fromOverlay = (e) => run?.overlay && !run.overlay.isDestroyed() && e.sender === run.overlay.webContents
  ipcMain.on('overlay:stroke', (e, stroke) => { if (fromOverlay(e)) onStroke(run, stroke) })
  ipcMain.on('overlay:tool', (e, tool, color) => {
    if (!fromOverlay(e)) return
    if (typeof tool === 'string') run.tool = tool
    if (typeof color === 'string') run.color = color
    sendState(run)
  })
  ipcMain.on('overlay:done', (e) => { if (fromOverlay(e)) toggle('draw', false) })
}

export const stopAnnotate = stop
