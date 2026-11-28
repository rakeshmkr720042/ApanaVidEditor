import type { AnnoChipSpot, AnnoModeName } from './desktop'

/** Which Smart annotate hotkeys to use while recording (the Windows app registers them, electron/annokeys.js). */
export type AnnoKeyStyle = 'both' | 'alt' | 'ctrl'
export const ANNO_KEY_STYLES: AnnoKeyStyle[] = ['both', 'alt', 'ctrl']
const LETTER: Record<AnnoModeName, string> = { draw: 'D', laser: 'L', spotlight: 'S', zoom: 'Z', hide: 'H' }
const BY_LETTER: Record<string, AnnoModeName> = { d: 'draw', l: 'laser', s: 'spotlight', z: 'zoom', h: 'hide' }

export function loadKeyStyle(): AnnoKeyStyle {
  try { const v = localStorage.getItem('anno-keys'); return ANNO_KEY_STYLES.includes(v as AnnoKeyStyle) ? (v as AnnoKeyStyle) : 'both' } catch { return 'both' }
}
export function saveKeyStyle(s: AnnoKeyStyle) {
  try { localStorage.setItem('anno-keys', s) } catch { /* private mode */ }
}

/** The keys shown before recording starts, for a style. */
export function keysFor(style: AnnoKeyStyle): Record<AnnoModeName, string> {
  const out = {} as Record<AnnoModeName, string>
  for (const [mode, l] of Object.entries(LETTER) as [AnnoModeName, string][]) {
    out[mode] = style === 'alt' ? `Alt+Shift+${l}` : style === 'ctrl' ? `Ctrl+Shift+${l}` : `Alt+Shift+${l} / Ctrl+Shift+${l}`
  }
  return out
}

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>

/**
 * The mode a key press in the app's own window asks for, or null. Used when the app is in front: the same
 * hotkeys then also work if Windows could not give them to the app (another app holds them), and they no
 * longer reach the editor's own Ctrl+Shift shortcuts (redo, blackbox…) by mistake.
 */
export function modeForKey(e: KeyLike, style: AnnoKeyStyle): AnnoModeName | null {
  if (!e.shiftKey || e.metaKey) return null
  const alt = e.altKey && !e.ctrlKey, ctrl = e.ctrlKey && !e.altKey
  if (!(alt && style !== 'ctrl') && !(ctrl && style !== 'alt')) return null
  // with Alt or a Hindi keyboard, e.key may not be the letter; e.code is the physical key
  const letter = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key.length === 1 ? e.key.toLowerCase() : ''
  return BY_LETTER[letter] ?? null
}

/** The keys that minimize / bring back the app window while recording, for a style (electron/annokeys.js). */
export function minimizeKeysFor(style: AnnoKeyStyle): string {
  return style === 'alt' ? 'Alt+Shift+M' : style === 'ctrl' ? 'Ctrl+Shift+M' : 'Alt+Shift+M / Ctrl+Shift+M'
}

/** True when a key press in the app is the minimize key of a style (Alt+Shift+M / Ctrl+Shift+M). */
export function isMinimizeKey(e: KeyLike, style: AnnoKeyStyle): boolean {
  if (!e.shiftKey || e.metaKey) return false
  const alt = e.altKey && !e.ctrlKey, ctrl = e.ctrlKey && !e.altKey
  if (!(alt && style !== 'ctrl') && !(ctrl && style !== 'alt')) return false
  return e.code === 'KeyM' || (!/^Key[A-Z]$/.test(e.code) && e.key.toLowerCase() === 'm')
}

export const ANNO_CHIP_SPOTS: AnnoChipSpot[] = ['bottom', 'bottom-left', 'bottom-right', 'off']
export function loadChipSpot(): AnnoChipSpot {
  try { const v = localStorage.getItem('anno-chip'); return ANNO_CHIP_SPOTS.includes(v as AnnoChipSpot) ? (v as AnnoChipSpot) : 'bottom' } catch { return 'bottom' }
}
export function saveChipSpot(s: AnnoChipSpot) {
  try { localStorage.setItem('anno-chip', s) } catch { /* private mode */ }
}
