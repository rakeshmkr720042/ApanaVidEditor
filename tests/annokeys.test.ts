/** Smart annotate hotkeys while screen recording (npm test). Ctrl+Shift and Alt+Shift both work by default. */
import './_env'
import assert from 'node:assert/strict'
import { test } from 'node:test'
// @ts-expect-error plain JS module of the Windows app
import { hotkeyList, hotkeyTexts, registerHotkeys } from '../electron/annokeys.js'
import { keysFor, modeForKey } from '../src/lib/annokeys'

const key = (k: string, o: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) => ({
  key: k, code: /^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : k, ctrlKey: !!o.ctrl, altKey: !!o.alt, shiftKey: !!o.shift, metaKey: !!o.meta,
})

test('annokeys: both Alt+Shift and Ctrl+Shift are registered by default', () => {
  const accs = hotkeyList('both').map(([, a]: [string, string]) => a)
  for (const l of 'DLSZH') {
    assert.ok(accs.includes(`Alt+Shift+${l}`))
    assert.ok(accs.includes(`Ctrl+Shift+${l}`))
  }
  assert.equal(hotkeyList(undefined).length, 10)
  assert.deepEqual(hotkeyList('alt').map(([, a]: [string, string]) => a), ['Alt+Shift+D', 'Alt+Shift+L', 'Alt+Shift+S', 'Alt+Shift+Z', 'Alt+Shift+H'])
  assert.deepEqual(hotkeyList('ctrl').map(([, a]: [string, string]) => a), ['Ctrl+Shift+D', 'Ctrl+Shift+L', 'Ctrl+Shift+S', 'Ctrl+Shift+Z', 'Ctrl+Shift+H'])
  assert.ok(hotkeyTexts().has('Ctrl+Shift+H'))
})

test('annokeys: a key another app holds is reported, the rest still switch modes', () => {
  const fns = new Map<string, () => void>()
  // globalShortcut.register returns false (no throw) when the key is taken
  const register = (acc: string, fn: () => void) => { if (acc === 'Ctrl+Shift+S') return false; if (acc === 'Alt+Shift+Z') throw new Error('bad'); fns.set(acc, fn); return true }
  const seen: string[] = []
  const r = registerHotkeys('both', register, (m: string) => seen.push(m))
  assert.deepEqual(r.failed, ['Ctrl+Shift+S', 'Alt+Shift+Z'])
  assert.equal(r.taken.length, 8)
  assert.equal(r.hotkeys.hide, 'Alt+Shift+H / Ctrl+Shift+H')
  assert.equal(r.hotkeys.spotlight, 'Alt+Shift+S')
  assert.equal(r.hotkeys.zoom, 'Ctrl+Shift+Z')
  fns.get('Ctrl+Shift+H')!()
  fns.get('Alt+Shift+L')!()
  fns.get('Ctrl+Shift+Z')!()
  assert.deepEqual(seen, ['hide', 'laser', 'zoom'])
  // nothing could be taken: no keys shown, all reported
  const none = registerHotkeys('alt', () => false, () => {})
  assert.deepEqual(none.hotkeys, {})
  assert.equal(none.failed.length, 5)
})

test('annokeys: key presses in the app window switch the same modes', () => {
  assert.equal(modeForKey(key('H', { ctrl: true, shift: true }), 'both'), 'hide')
  assert.equal(modeForKey(key('Z', { ctrl: true, shift: true }), 'both'), 'zoom')
  assert.equal(modeForKey(key('S', { alt: true, shift: true }), 'both'), 'spotlight')
  assert.equal(modeForKey(key('D', { ctrl: true, shift: true }), 'ctrl'), 'draw')
  assert.equal(modeForKey(key('L', { alt: true, shift: true }), 'alt'), 'laser')
  // the other set when only one is chosen, plain typing, Ctrl+Z, Ctrl+Alt+Shift, other letters: left alone
  assert.equal(modeForKey(key('H', { ctrl: true, shift: true }), 'alt'), null)
  assert.equal(modeForKey(key('H', { alt: true, shift: true }), 'ctrl'), null)
  assert.equal(modeForKey(key('h'), 'both'), null)
  assert.equal(modeForKey(key('z', { ctrl: true }), 'both'), null)
  assert.equal(modeForKey(key('H', { ctrl: true, alt: true, shift: true }), 'both'), null)
  assert.equal(modeForKey(key('K', { ctrl: true, shift: true }), 'both'), null)
  // Hindi keyboard: e.key is not the Latin letter, the physical key still is
  assert.equal(modeForKey({ key: 'ह', code: 'KeyH', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }, 'both'), 'hide')
})

test('annokeys: the recording window shows the chosen keys', () => {
  assert.equal(keysFor('both').hide, 'Alt+Shift+H / Ctrl+Shift+H')
  assert.equal(keysFor('alt').zoom, 'Alt+Shift+Z')
  assert.equal(keysFor('ctrl').draw, 'Ctrl+Shift+D')
})
