import { useEffect, useState } from 'react'

/**
 * Tester tools: Testing notes and the Blackbox log are hidden from normal users. Ctrl+H (or five
 * quick taps on the Apna Editor logo on Home, for phones) opens a small hidden panel with both.
 * Typing the install password in that panel shows their buttons again on this device.
 */

// Same FNV-1a style hashes as PWD_HASH_A/B in electron/installer.nsh (made by
// scripts/install-password-hash.mjs). Change both places together.
const PWD_HASH_A = 464077357
const PWD_HASH_B = 1231088143

const KEY = 'tester-tools-v1'
const OPEN_EVENT = 'apna-tester-open'
const CHANGE_EVENT = 'apna-tester-change'

const fnv = (s: string, basis: number, prime: number) => {
  let h = basis | 0
  for (const ch of s) {
    let c = ch.charCodeAt(0)
    if (c < 32 || c > 126) c = 255
    h = Math.imul(h ^ c, prime) | 0
  }
  return h
}

/** True when the text is the install password (the same check the Windows installer does). */
export const isInstallPassword = (pw: string) => fnv(pw, 0x811C9DC5, 16777619) === PWD_HASH_A && fnv(pw, 777777777, 1540483477) === PWD_HASH_B

/** Notes and Blackbox buttons are shown (the install password was typed on this device). */
export function testerUnlocked(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

/** Returns false when the password is wrong. */
export function unlockTester(pw: string): boolean {
  if (!isInstallPassword(pw)) return false
  try { localStorage.setItem(KEY, '1') } catch { /* storage off: shown for this session only */ }
  window.dispatchEvent(new Event(CHANGE_EVENT))
  return true
}

/** Hides the buttons again (Ctrl+H still opens the panel). */
export function lockTester() {
  try { localStorage.removeItem(KEY) } catch { /* storage off */ }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export const openTesterPanel = () => window.dispatchEvent(new Event(OPEN_EVENT))
export function onTesterOpen(fn: () => void) { window.addEventListener(OPEN_EVENT, fn); return () => window.removeEventListener(OPEN_EVENT, fn) }

/** Re-renders when the buttons are shown or hidden. */
export function useTesterUnlocked(): boolean {
  const [on, setOn] = useState(testerUnlocked)
  useEffect(() => {
    const f = () => setOn(testerUnlocked())
    window.addEventListener(CHANGE_EVENT, f)
    window.addEventListener('storage', f)
    return () => { window.removeEventListener(CHANGE_EVENT, f); window.removeEventListener('storage', f) }
  }, [])
  return on
}

/** Ctrl+H (Cmd+H on a Mac) opens the hidden panel anywhere, even while typing. */
export function startTesterKeys() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'h') { e.preventDefault(); openTesterPanel() }
  }, true)
}

/** Five quick taps (within 2 s) open the panel: the phone way, with no keyboard. */
export function tapCounter(n = 5, ms = 2000) {
  let taps: number[] = []
  return () => {
    const now = Date.now()
    taps = [...taps.filter((x) => now - x < ms), now]
    if (taps.length >= n) { taps = []; openTesterPanel() }
  }
}
