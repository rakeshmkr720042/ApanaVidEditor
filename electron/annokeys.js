// Smart annotate hotkeys (used by electron/annotate.js, tested in tests/annokeys.test.ts).
// People press Ctrl+Shift+… as often as Alt+Shift+…, so both work by default while recording. A key another
// app already holds cannot be taken; those are reported back so the recorder can say so.

export const MODES = ['draw', 'laser', 'spotlight', 'zoom', 'hide']
const LETTER = { draw: 'D', laser: 'L', spotlight: 'S', zoom: 'Z', hide: 'H' }
export const KEY_STYLES = ['both', 'alt', 'ctrl']

/** The shortcuts to register for a style: [mode, accelerator] pairs, the main one of each mode first. */
export function hotkeyList(style) {
  const s = KEY_STYLES.includes(style) ? style : 'both'
  const out = []
  for (const mode of MODES) {
    if (s !== 'ctrl') out.push([mode, `Alt+Shift+${LETTER[mode]}`])
    if (s !== 'alt') out.push([mode, `Ctrl+Shift+${LETTER[mode]}`])
  }
  return out
}

/**
 * Registers the shortcuts with `register(acc, fn)` (Electron's globalShortcut.register, which returns false
 * when another app holds the key). Returns what each mode can be switched with and what could not be taken.
 */
export function registerHotkeys(style, register, onMode) {
  const hotkeys = {}
  const taken = []
  const failed = []
  for (const [mode, acc] of hotkeyList(style)) {
    let ok = false
    try { ok = register(acc, () => onMode(mode)) !== false } catch { ok = false }
    if (ok) {
      taken.push(acc)
      hotkeys[mode] = hotkeys[mode] ? `${hotkeys[mode]} / ${acc}` : acc
    } else failed.push(acc)
  }
  return { hotkeys, taken, failed }
}

/** The keys that minimize / bring back the app window while screen recording (M, same Alt / Ctrl style). */
export function minimizeList(style) {
  const s = KEY_STYLES.includes(style) ? style : 'both'
  return [...(s !== 'ctrl' ? ['Alt+Shift+M'] : []), ...(s !== 'alt' ? ['Ctrl+Shift+M'] : [])]
}

/** Registers the minimize keys; returns the text to show ('' when none could be taken) and what was refused. */
export function registerMinimize(style, register, onPress) {
  const taken = []
  const failed = []
  for (const acc of minimizeList(style)) {
    let ok = false
    try { ok = register(acc, onPress) !== false } catch { ok = false }
    ;(ok ? taken : failed).push(acc)
  }
  return { keys: taken.join(' / '), taken, failed }
}

/** Every shortcut a style can use, so the helper does not show them as pressed keys. */
export function hotkeyTexts() {
  return new Set([...hotkeyList('both').map(([, acc]) => acc), ...minimizeList('both')])
}
