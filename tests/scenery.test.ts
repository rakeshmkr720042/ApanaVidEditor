/** Scenes behind / in front (engine/scenery.ts): the pure rules. */
import './_env'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SCENE_PACKS, defaultScene, sceneBehind, sceneCamera, sceneFocus, sceneFront, scenePremium, sideShift } from '../src/engine/scenery'

test('scenes: seven packs, two free', () => {
  assert.equal(SCENE_PACKS.length, 7)
  assert.deepEqual(SCENE_PACKS.filter((p) => p.free).map((p) => p.id), ['garden', 'hill'])
})

test('scenes: which modes need the person and the front frame', () => {
  assert.equal(sceneBehind(defaultScene('paris', 'front')), false)
  assert.equal(sceneFront(defaultScene('paris', 'front')), true)
  assert.equal(sceneFront(defaultScene('paris', 'behind')), false)
  assert.equal(sceneBehind(defaultScene('paris', 'sandwich')) && sceneFront(defaultScene('paris', 'sandwich')), true)
  assert.equal(sceneBehind(null), false)
})

test('scenes: free and premium', () => {
  assert.equal(scenePremium({ pack: 'paris', mode: 'front' }), false)
  assert.equal(scenePremium({ pack: 'garden', mode: 'behind' }), false)
  assert.equal(scenePremium({ pack: 'paris', mode: 'behind' }), true)
  assert.equal(scenePremium({ pack: 'garden', mode: 'sandwich' }), true)
  assert.equal(scenePremium({ pack: 'garden', mode: 'side' }), true)
})

test('scenes: camera move stays inside the picture', () => {
  for (const move of ['none', 'push', 'pan'] as const) {
    const s = { ...defaultScene('hill'), move }
    for (const p of [0, 0.5, 1]) {
      const c = sceneCamera(s, p)
      assert.ok(c.zoom >= 1 && c.zoom <= 1.1)
      // the nearest layer is zoomed by pad: its spare edge covers the shift
      assert.ok(Math.abs(c.dx) <= c.pad / 2 + 1e-9)
    }
  }
})

test('scenes: side by side puts the landmark across from the person, who stays in the picture', () => {
  const s = { ...defaultScene('paris', 'side'), side: 'left' as const }
  assert.equal(sceneFocus(s), 0.7)
  assert.equal(sceneFocus({ ...s, side: 'right' }), 0.3)
  const box = { x0: 0.3, x1: 0.7, y0: 0.2, y1: 1, cx: 0.5, area: 0.2 }
  assert.ok(Math.abs(sideShift(s, box) + 0.2) < 1e-9)
  const wide = { x0: 0.1, x1: 0.9, y0: 0.2, y1: 1, cx: 0.5, area: 0.3 }
  assert.ok(Math.abs(sideShift(s, wide) + 0.1) < 1e-9) // never pushed out of the picture
  assert.equal(sideShift(defaultScene('paris', 'sandwich'), box), 0)
})
