// While screen recording (Windows app): Alt+Shift+M / Ctrl+Shift+M minimize the app window out of the way and
// bring it back, so the presenter never has to reach the window's own – button (which an overlay can cover).
// Works with or without Smart annotate. The keys are given back as soon as the recorder closes.
import { BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { registerMinimize } from './annokeys.js'
import { endDraw } from './annotate.js'

let held = []

function release() {
  for (const acc of held) { try { globalShortcut.unregister(acc) } catch { /* not ours */ } }
  held = []
}

/** Minimized → back in front; otherwise out of the way (drawing ends first, so clicks reach other windows). */
function flip(win) {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized() || !win.isVisible()) {
    win.restore()
    win.show()
    win.focus()
  } else {
    endDraw()
    win.minimize()
  }
}

export function registerRecKeys(isMain) {
  ipcMain.handle('desktop:rec-keys', (e, on, style) => {
    if (!isMain(e.sender)) return null
    release()
    if (!on) return null
    const win = BrowserWindow.fromWebContents(e.sender)
    const got = registerMinimize(style, (acc, fn) => globalShortcut.register(acc, fn), () => flip(win))
    held = got.taken
    return { keys: got.keys, failed: got.failed }
  })
  // the same keys pressed inside the app when Windows would not give them to us
  ipcMain.on('desktop:rec-minimize', (e) => { if (isMain(e.sender)) flip(BrowserWindow.fromWebContents(e.sender)) })
}

export const releaseRecKeys = release
