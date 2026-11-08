/** Android stability limits (npm test). */
import './_env'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MIN_CHROME, chromeMajor, cleanLimitSecs, lowMemory, maxPhotoSide } from '../src/lib/device'
import { photosToFree } from '../src/engine/player'
import { STORAGE_FULL, storageError } from '../src/lib/db'

test('device: small phones get lighter limits, computers the full ones', () => {
  assert.equal(lowMemory(true, 3), true)
  assert.equal(lowMemory(true, 4), true)
  assert.equal(lowMemory(true, 8), false)
  assert.equal(lowMemory(true, undefined), true)
  assert.equal(lowMemory(false, 2), false)
  assert.equal(cleanLimitSecs(true, 4), 300)
  assert.equal(cleanLimitSecs(true, 8), 600)
  assert.equal(cleanLimitSecs(false, 8), 3600)
  assert.equal(maxPhotoSide(true, 4), 3072)
  assert.equal(maxPhotoSide(true, 8), 4096)
  assert.equal(maxPhotoSide(false, undefined), 4096)
})

test('device: reads the WebView version', () => {
  const old = 'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/83.0.4103.106 Mobile Safari/537.36'
  const now = 'Mozilla/5.0 (Linux; Android 15; I2404; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.7390.122 Mobile Safari/537.36'
  assert.equal(chromeMajor(old), 83)
  assert.ok(chromeMajor(old)! < MIN_CHROME)
  assert.ok(chromeMajor(now)! >= MIN_CHROME)
  assert.equal(chromeMajor('Mozilla/5.0 (iPhone) Safari/605'), null)
})

test('preview: lets go of photos not shown for a while, keeps the recent ones', () => {
  const used = new Map<string, number>()
  for (let i = 0; i < 20; i++) used.set(`p${i}`, i * 1000) // p19 used last
  const now = 30000
  const free = photosToFree(used, now)
  // the 8 most recent (p12..p19) stay; of the rest, those idle over 10 s go
  assert.deepEqual(free.sort(), Array.from({ length: 12 }, (_, i) => `p${i}`).sort())
  assert.deepEqual(photosToFree(used, 12000), ['p1', 'p0'])
  assert.deepEqual(photosToFree(new Map([['a', 0]]), 1e9), [])
})

test('storage: a full disk gives the friendly message', () => {
  const quota = Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' })
  assert.equal(storageError(quota).message, STORAGE_FULL)
  assert.equal(storageError(new Error('other')).message, 'other')
})
