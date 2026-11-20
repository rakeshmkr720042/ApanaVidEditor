/** Flower bloom reveal: the timing and the opening of the photo (pure maths, no canvas). */
import './_env'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FLOWERS, bloomLength, bloomMask, bloomOpening, bloomTimes, defaultBloom } from '../src/engine/bloom'

test('bloom: five flowers, only the rose is free', () => {
  assert.deepEqual(FLOWERS.map((f) => f.value), ['rose', 'lotus', 'sunflower', 'sakura', 'marigold'])
  assert.deepEqual(FLOWERS.filter((f) => f.free).map((f) => f.value), ['rose'])
})

test('bloom: parts happen in order and scale with the blooming time', () => {
  for (const open of [0.8, 2, 5]) {
    const tm = bloomTimes({ ...defaultBloom('rose'), open })
    assert.ok(tm.bud < tm.emerge && tm.emerge < tm.fall && tm.fall <= tm.full, JSON.stringify(tm))
  }
  const b = defaultBloom('rose')
  assert.ok(bloomLength(b) >= bloomTimes(b).fall + b.seconds)
})

test('bloom: the photo is hidden at first, then grows until it covers the frame', () => {
  const W = 1920, H = 1080, b = defaultBloom('lotus')
  const tm = bloomTimes(b)
  assert.equal(bloomOpening(b, 0, W / 2, H / 2, W, H).r, 0)
  assert.equal(bloomOpening(b, tm.emerge - 0.01, W / 2, H / 2, W, H).r, 0)
  let last = 0
  for (let t = tm.emerge + 0.05; t < tm.full; t += 0.05) {
    const r = bloomOpening(b, t, W / 2, H / 2, W, H).r
    assert.ok(r > 0)
    if (t > tm.emerge + tm.grow) { assert.ok(r >= last - 1e-6, `shrank at ${t}`); last = r }
  }
  assert.equal(bloomOpening(b, tm.full + 0.01, W / 2, H / 2, W, H).r, Infinity)
})

test('bloom: "stays inside the flower" never fills the frame', () => {
  const W = 1080, H = 1920, b = { ...defaultBloom('rose'), fill: false }
  const r = bloomOpening(b, 30, W / 2, H / 2, W, H).r
  assert.ok(Number.isFinite(r) && r > 0 && r < Math.min(W, H) / 2)
  const m = bloomMask(r, W, H)
  assert.equal(m.shape, 'ellipse')
  assert.ok(Math.abs(m.w * W - m.h * H) < 1e-6) // round, not stretched
})
