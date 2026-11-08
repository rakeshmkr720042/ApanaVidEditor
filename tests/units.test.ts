/**
 * Fast checks of the pure parts of new features (npm test). Runs in Node: no browser, no IndexedDB.
 */
import './_env'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseTrending } from '../src/lib/trending'
import { CARD_LOOKS, FESTIVAL_TITLES, SHAYARI, cardFrame, pickShayari } from '../src/lib/desi'
import { packProject, unpackProject } from '../src/lib/projectFile'
import type { MediaSource, Project } from '../src/types'

test('trending: rejects files that are not ours', () => {
  assert.equal(parseTrending(null), null)
  assert.equal(parseTrending({ version: 2 }), null)
  assert.equal(parseTrending('x'), null)
})

test('trending: keeps good looks, drops bad values', () => {
  const p = parseTrending({
    version: 1,
    captionLooks: [
      { name: 'Ok', words: { style: 'pop', color: '#ff0000', caps: true }, style: { font: 'Anton', color: '#fff', size: 9 } },
      { name: 'Bad font', words: null, style: { font: 'x"; }<script>', color: '#fff' } },
      { name: 'Bad word style', words: { style: 'explode', color: '#ff0000' }, style: { font: 'Anton', color: 'red' } },
      'junk',
    ],
    titles: [
      { name: 'T', text: 'Hi', style: { font: 'Poppins', fill: 'tiranga', background: 'rgba(0,0,0,0.5)' }, animIn: 'zoom', animOut: 'nope', loop: 'float' },
      { name: 'No text', style: { font: 'Poppins' } },
    ],
  })!
  assert.equal(p.captionLooks.length, 2)
  assert.deepEqual(p.captionLooks[0].words, { style: 'pop', color: '#ff0000', caps: true })
  assert.equal(p.captionLooks[0].style.size, 0.2) // clamped
  assert.equal(p.captionLooks[1].words, null) // unknown word style dropped
  assert.equal(p.captionLooks[1].style.color, undefined) // "red" is not #hex
  assert.equal(p.titles.length, 1)
  assert.equal(p.titles[0].animOut, 'fade')
  assert.equal(p.titles[0].style.fill, 'tiranga')
  assert.equal(p.titles[0].style.background, 'rgba(0,0,0,0.5)')
})

test('trending: caps list length', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ name: `L${i}`, words: null, style: { font: 'Anton' } }))
  assert.equal(parseTrending({ version: 1, captionLooks: many, titles: [] })!.captionLooks.length, 40)
})

test('desi: festival titles and shayari are filled in', () => {
  assert.ok(FESTIVAL_TITLES.length >= 15)
  for (const k of Object.keys(SHAYARI) as (keyof typeof SHAYARI)[]) assert.ok(SHAYARI[k].length >= 5, k)
  const a = SHAYARI.love[0]
  for (let i = 0; i < 20; i++) assert.notEqual(pickShayari('love', a), a)
})

test('desi: card fits inside the frame for every shape', () => {
  for (const aspect of [9 / 16, 1, 4 / 5, 16 / 9, 21 / 9]) for (const look of CARD_LOOKS) {
    const f = cardFrame(look, aspect)
    assert.ok(f.rect.x >= 0 && f.rect.y >= 0 && f.rect.x + f.rect.w <= 1 && f.rect.y + f.rect.h <= 1)
  }
})

const src = (id: string, bytes: number[], type: string): MediaSource => ({
  id, kind: 'video', file: new Blob([new Uint8Array(bytes)], { type }), url: 'blob:x', name: `${id}.mp4`, duration: 3, width: 10, height: 10, hasAudio: true, thumbs: ['data:,'],
})

test('project file v2: round trip keeps project and exact media bytes', async () => {
  const project = { clips: [{ id: 'c1', sourceId: 'a' }], layers: [], settings: { aspect: '9:16', background: 'black', fps: 30 } } as unknown as Project
  const sources = { a: src('a', [1, 2, 3, 4, 5], 'video/mp4'), b: src('b', [9, 8, 7], 'audio/mpeg'), e: src('e', [], 'image/png') }
  const blob = packProject('My ❤ project', project, sources)
  const out = await unpackProject(blob)
  assert.equal(out.name, 'My ❤ project')
  assert.deepEqual(out.project, project)
  assert.equal(out.media.length, 3)
  assert.deepEqual([...new Uint8Array(await out.media[0].blob.arrayBuffer())], [1, 2, 3, 4, 5])
  assert.deepEqual([...new Uint8Array(await out.media[1].blob.arrayBuffer())], [9, 8, 7])
  assert.equal(out.media[1].blob.type, 'audio/mpeg')
  assert.equal(out.media[2].blob.size, 0)
  assert.equal(out.media[0].meta.name, 'a.mp4')
  assert.ok(!('url' in out.media[0].meta) && !('file' in out.media[0].meta))
})

test('project file v2: a cut-off file is reported, not half opened', async () => {
  const project = { clips: [], layers: [], settings: {} } as unknown as Project
  const blob = packProject('x', project, { a: src('a', Array(100).fill(1), 'video/mp4') })
  await assert.rejects(unpackProject(blob.slice(0, blob.size - 10)), /incomplete/)
  await assert.rejects(unpackProject(new Blob(['{"app":"x"}'])), /not an Apna Editor/)
})
