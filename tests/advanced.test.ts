/**
 * Advanced features batch 1 (auto reframe, karaoke, camera presets, liquid transitions, follow tags): pure parts.
 */
import './_env'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Clip, MediaSource, Project } from '../src/types'
import { centreOn, holdPath, lookTimes, pictureSize, reframeKeys, reframeProject, simplify, type Look } from '../src/model/reframe'
import { posAt } from '../src/model/clipKeys'

const clip = (p: Partial<Clip> = {}): Clip => ({
  id: 'c1', sourceId: 'v', in: 0, out: 10, speed: 1, ramp: null, volume: 1, fadeIn: 0, fadeOut: 0, rotate: 0, flipH: false, flipV: false,
  crop: null, fit: 'fit', filter: null, filterAmount: 1, adjust: {} as Clip['adjust'], transition: null, ...p,
})
const wide = { id: 'v', kind: 'video', width: 1920, height: 1080, duration: 10 } as MediaSource

test('reframe: 16:9 picture in a 9:16 frame is ~3.16 frames wide', () => {
  const s = pictureSize(clip(), wide, 9 / 16)!
  assert.ok(Math.abs(s.pw - (16 / 9) / (9 / 16)) < 1e-6)
  assert.equal(s.ph, 1)
})

test('reframe: centring never shows an edge', () => {
  const s = pictureSize(clip(), wide, 9 / 16)!
  for (const fx of [0, 0.1, 0.5, 0.9, 1]) {
    const p = centreOn(clip(), fx, 0.4, s, 1)
    assert.ok(Math.abs(p.x) <= (s.pw - 1) / 2 + 1e-9)
    assert.equal(p.y, 0) // no room to move up/down at zoom 1
  }
  // a face on the right moves the picture left
  assert.ok(centreOn(clip(), 0.7, 0.4, s, 1).x < 0)
  // flipped: the other way
  assert.ok(centreOn(clip({ flipH: true }), 0.7, 0.4, s, 1).x > 0)
})

test('reframe: steady camera holds inside the zone', () => {
  const ts = Array.from({ length: 20 }, (_, i) => i * 0.5)
  const v = ts.map((t) => (t < 5 ? 0.5 + (t % 1 ? 0.03 : -0.03) : 0.8))
  const h = holdPath(ts, v, 0.1)
  assert.equal(new Set(h.slice(0, 10)).size, 1)
  assert.equal(h[h.length - 1], 0.8)
})

test('reframe: simplify keeps a straight line as two points', () => {
  const pts = Array.from({ length: 50 }, (_, i) => ({ t: i, x: i * 0.01, y: 0 }))
  assert.equal(simplify(pts, 0.001).length, 2)
})

test('reframe: follows a person walking left to right', () => {
  const looks: Look[] = Array.from({ length: 21 }, (_, i) => ({ t: i * 0.5, x: 0.2 + 0.03 * i, y: 0.35 }))
  const { keys } = reframeKeys(clip(), wide, looks, { aspect: '9:16', style: 'follow', zoom: 1 })
  assert.ok(keys.length >= 2)
  assert.ok(keys.every((k) => k.lin))
  const a = posAt(clip({ keys }), 1).x, b = posAt(clip({ keys }), 9).x
  assert.ok(a > b, `camera pans right: ${a} > ${b}`)
})

test('reframe: no face anywhere = framed in the middle, no keyframes', () => {
  const looks: Look[] = [0, 1, 2].map((t) => ({ t, x: null, y: null }))
  const r = reframeKeys(clip(), wide, looks, { aspect: '9:16', style: 'follow', zoom: 1 })
  assert.equal(r.keys.length, 0)
  assert.ok(Math.abs(r.pos!.x) < 1e-9)
})

test('reframe: project gets the new shape and fill', () => {
  const p = { clips: [clip()], layers: [], settings: { aspect: '16:9', background: 'black', fps: 30 } } as unknown as Project
  const looks = { v: [{ t: 0, x: 0.3, y: 0.4 }, { t: 10, x: 0.3, y: 0.4 }] }
  const q = reframeProject(p, { v: wide }, looks, { aspect: '9:16', style: 'steady', zoom: 1.2 })
  assert.equal(q.settings.aspect, '9:16')
  assert.equal(q.clips[0].fit, 'fill')
  assert.equal(p.settings.aspect, '16:9') // the old one is untouched
  const times = lookTimes(p, { v: wide })
  assert.equal(times.v[0], 0)
  assert.equal(times.v[times.v.length - 1], 10)
})

test('reframe: a cut in the video makes the camera jump, not glide', () => {
  const looks: Look[] = Array.from({ length: 17 }, (_, i) => ({ t: i * 0.5, x: i < 8 ? 0.3 : 0.75, y: 0.4 }))
  const { keys } = reframeKeys(clip({ out: 8 }), wide, looks, { aspect: '9:16', style: 'follow', zoom: 1 })
  const c = clip({ out: 8, keys })
  const before = posAt(c, 3.7).x, after = posAt(c, 3.8).x
  assert.ok(Math.abs(posAt(c, 1).x - before) < 0.01, 'holds until the cut')
  assert.ok(Math.abs(posAt(c, 6).x - after) < 0.01, 'jumped by the cut')
  assert.ok(before > 0 && after < 0)
})

test('reframe: smoothing keeps a steady walk on its line, also at the ends', async () => {
  const { smooth } = await import('../src/model/reframe')
  const ts = [0, 0.5, 1, 1.5, 2], v = ts.map((t) => 0.2 + 0.1 * t)
  smooth(ts, v, 0.8).forEach((x, i) => assert.ok(Math.abs(x - v[i]) < 1e-9))
})
