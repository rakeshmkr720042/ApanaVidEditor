/**
 * Smart cut: listens to the main video's sound on the device and finds the parts to take out (pauses and "umm /
 * aaa" sounds), and the best moments of a long video for a Short. The sound is read once per file at 8 kHz and
 * turned into a loudness and a "how fast the sound changes" curve, 100 values a second.
 */
import type { MediaSource, Project, TextLayer } from '../types'
import { decodeMono } from './visualizer'
import { layoutClips } from '../model/timeline'
import { ask, localAI } from '../lib/localai'

const RATE = 8000
const HOP = 80 // 100 frames a second
const FFT = 256
export const FPS = 100

export interface SoundMap {
  db: Float32Array // loudness per frame, dB
  flux: Float32Array // how much the spectrum changes from the frame before (speech changes all the time; "aaa" doesn't)
  floor: number // background level (quiet parts), dB
  speech: number // level of the speaking parts, dB
}

const cache = new Map<string, Promise<SoundMap | null>>()

/** The sound map of a file (cached). Null when the file has no sound or can't be read. */
export function soundMap(src: MediaSource, onProgress?: (p: number) => void): Promise<SoundMap | null> {
  let p = cache.get(src.id)
  if (!p) {
    p = decodeMono(src.file, RATE, src.duration, onProgress).then((pcm) => (pcm && pcm.length > FFT ? analyse(pcm) : null)).catch(() => null)
    cache.set(src.id, p)
  }
  return p
}

function analyse(pcm: Float32Array): SoundMap {
  const n = Math.floor((pcm.length - FFT) / HOP)
  const db = new Float32Array(n), flux = new Float32Array(n)
  const win = new Float32Array(FFT).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT - 1)))
  const re = new Float32Array(FFT), im = new Float32Array(FFT)
  const top = 64 // up to 2 kHz: where voices have most of their changes
  let prev = new Float32Array(top), cur = new Float32Array(top)
  for (let f = 0; f < n; f++) {
    const off = f * HOP
    let e = 0
    for (let i = 0; i < FFT; i++) { const v = pcm[off + i]; e += v * v; re[i] = v * win[i]; im[i] = 0 }
    db[f] = 10 * Math.log10(e / FFT + 1e-10)
    fft(re, im)
    // change relative to how loud the frame is, on a squashed scale so background hiss counts for little
    let d = 0, s = 0
    for (let k = 2; k < top; k++) {
      const m = Math.log1p(30 * Math.hypot(re[k], im[k]))
      cur[k] = m
      d += Math.abs(m - prev[k])
      s += m + prev[k]
    }
    flux[f] = s > 0 ? (2 * d) / s : 0
    ;[prev, cur] = [cur, prev]
  }
  const sorted = Float32Array.from(db).sort()
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? -100
  return { db, flux, floor: at(0.1), speech: at(0.9) }
}

export interface CutSettings {
  minPause: number // seconds: shorter pauses stay
  pad: number // seconds of quiet kept next to speech, so words aren't clipped
  level: number // 0..1: higher counts louder sound as quiet
  fillers: boolean // also take out "umm / aaa" sounds
}

export const DEFAULT_CUT: CutSettings = { minPause: 0.6, pad: 0.15, level: 0.5, fillers: true }

/** A part to take out of a main-video clip. */
export interface FoundCut {
  clipId: string
  from: number // source seconds
  to: number
  t: number // where it starts on the timeline now
  len: number // timeline seconds it takes now
  kind: 'pause' | 'filler'
  on: boolean
  text?: string // the caption, when a filler was found from the captions
}

/** dB below which a frame counts as quiet. */
export const quietLevel = (m: SoundMap, level: number) => m.floor + Math.max(4, (m.speech - m.floor) * (0.2 + 0.35 * level))

/** Runs of quiet frames at least `min` frames long, as [first, last + 1). */
function quietRuns(m: SoundMap, thr: number, a: number, b: number, min: number): [number, number][] {
  const runs: [number, number][] = []
  let s = -1
  for (let f = a; f <= b; f++) {
    const q = f < b && m.db[f] < thr
    if (q && s < 0) s = f
    else if (!q && s >= 0) { if (f - s >= min) runs.push([s, f]); s = -1 }
  }
  return runs
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const fillerFlux = new Map<SoundMap, number>()

/**
 * The usual "how fast the sound changes" of the speech in a file: the median over its short sounds (0.25–1.5 s
 * between little pauses). A "umm" or "aaa" is a held sound and changes much less than words do.
 */
function typicalFlux(m: SoundMap, thr: number) {
  const key = fillerFlux.get(m)
  if (key !== undefined) return key
  const runs = quietRuns(m, thr, 0, m.db.length, 15)
  const vals: number[] = []
  for (let i = 0; i + 1 < runs.length; i++) {
    const s = runs[i][1], e = runs[i + 1][0]
    if (e - s < 10) continue
    let sum = 0
    for (let f = s; f < e; f++) sum += m.flux[f]
    vals.push(sum / (e - s))
  }
  const v = median(vals)
  fillerFlux.set(m, v)
  return v
}

const FILLER_WORDS = new Set(['um', 'uh', 'uhm', 'hm', 'm', 'ah', 'a', 'aa', 'er', 'erm', 'eh', 'oh', 'like', 'अं', 'अम', 'उम', 'हम', 'आ', 'आं', 'एं', 'अ', 'ह'])
/** True when a caption is only filler sounds (umm, uh, hmm, अं…). */
export function isFillerText(text: string) {
  const words = text.toLowerCase().replace(/[.,!?…।'"()-]/g, ' ').split(/\s+/).filter(Boolean)
  return words.length > 0 && words.length <= 4 && words.every((w) => FILLER_WORDS.has(w.replace(/(.)\1+/gu, '$1').replace(/्$/, '')))
}

/**
 * Finds what to take out of the main video: pauses longer than `minPause` (keeping `pad` of quiet by the speech),
 * and with `fillers` the held "umm / aaa" sounds between pauses and captions that are only filler words.
 * Clips with a speed ramp, photos and clips without sound are left alone.
 */
export function findCuts(p: Project, sources: Record<string, MediaSource>, maps: Record<string, SoundMap | null>, s: CutSettings): FoundCut[] {
  const out: FoundCut[] = []
  const subs = p.layers.filter((l): l is TextLayer => l.type === 'text' && l.subtitle)
  for (const it of layoutClips(p.clips).items) {
    const c = it.clip
    const src = sources[c.sourceId]
    const m = maps[c.sourceId]
    if (!src || src.kind === 'image' || !m || c.ramp || c.volume === 0) continue
    const sp = c.speed
    const a = c.in + it.transIn * sp, b = c.out - it.transOut * sp
    if (b - a < 0.5) continue
    const fa = Math.max(0, Math.ceil(a * FPS)), fb = Math.min(m.db.length, Math.floor(b * FPS))
    const thr = quietLevel(m, s.level)
    const toCut = (from: number, to: number, kind: FoundCut['kind'], text?: string): FoundCut => ({
      clipId: c.id, from, to, t: it.start + (from - c.in) / sp, len: (to - from) / sp, kind, on: true, ...(text ? { text } : {}),
    })
    const list: FoundCut[] = []
    // pauses
    const runs = quietRuns(m, thr, fa, fb, Math.round(s.minPause * FPS))
    for (const [rs, re] of runs) {
      const from = rs <= fa ? a : rs / FPS + s.pad
      const to = re >= fb ? b : re / FPS - s.pad
      if (to - from >= 0.1) list.push(toCut(from, to, 'pause'))
    }
    if (s.fillers) {
      // held sounds alone between two short pauses
      const typ = typicalFlux(m, thr)
      const gaps = quietRuns(m, thr, fa, fb, 12)
      for (let i = 0; i + 1 < gaps.length; i++) {
        const is = gaps[i][1], ie = gaps[i + 1][0]
        const d = (ie - is) / FPS
        if (d < 0.25 || d > 1.5) continue
        let sum = 0, loud = -Infinity
        for (let f = is; f < ie; f++) { sum += m.flux[f]; loud = Math.max(loud, m.db[f]) }
        if (sum / (ie - is) > typ * 0.6 || loud < thr + 3) continue
        // take the sound and the pauses round it, keeping `pad` next to the words on each side
        const from = Math.max(a, gaps[i][0] / FPS + Math.min(s.pad, (is - gaps[i][0]) / FPS / 2))
        const to = Math.min(b, gaps[i + 1][1] / FPS - Math.min(s.pad, (gaps[i + 1][1] - ie) / FPS / 2))
        if (to > from) list.push(toCut(from, to, 'filler'))
      }
      // captions that are only filler words
      for (const l of subs) {
        if (!isFillerText(l.text)) continue
        const s0 = Math.max(l.start, it.start + it.transIn), e0 = Math.min(l.end, it.start + it.dur - it.transOut)
        if (e0 - s0 < 0.1) continue
        list.push(toCut(c.in + (s0 - it.start) * sp, c.in + (e0 - it.start) * sp, 'filler', l.text))
      }
    }
    // merge overlaps (a filler swallows the pauses round it)
    list.sort((x, y) => x.from - y.from)
    for (const cut of list) {
      const last = out[out.length - 1]
      if (last && last.clipId === c.id && cut.from <= last.to + 0.02) {
        last.to = Math.max(last.to, cut.to)
        last.len = (last.to - last.from) / sp
        if (cut.kind === 'filler') { last.kind = 'filler'; if (cut.text) last.text = cut.text }
      } else out.push({ ...cut })
    }
  }
  return out
}

/** Loudness of the timeline, 10 values a second (dB above the file's background level, 0 where there's no sound). */
function timelineLevels(p: Project, maps: Record<string, SoundMap | null>) {
  const { items, total } = layoutClips(p.clips)
  const n = Math.ceil(total * 10)
  const lv = new Float32Array(n), talk = new Uint8Array(n)
  for (const it of items) {
    const m = maps[it.clip.sourceId]
    if (!m || it.clip.ramp) continue
    const thr = quietLevel(m, 0.5)
    for (let i = Math.ceil(it.start * 10); i < Math.min(n, (it.start + it.dur) * 10); i++) {
      const f = Math.floor((it.clip.in + (i / 10 - it.start) * it.clip.speed) * FPS)
      if (f < 0 || f >= m.db.length) continue
      let mx = -200
      for (let k = f; k < Math.min(m.db.length, f + 10); k++) mx = Math.max(mx, m.db[k])
      lv[i] = Math.max(0, mx - m.floor)
      talk[i] = mx > thr ? 1 : 0
    }
  }
  return { lv, talk, total }
}

/** A stretch of the video that would make a good Short. */
export interface Moment { from: number; to: number; score: number; text: string; byAI?: boolean }

/**
 * The best `count` stretches of about `len` seconds: lots of speech, lively (loudness that rises and falls,
 * questions and exclamations in the captions), starting and ending in a pause so no sentence is cut in half.
 */
export function findMoments(p: Project, maps: Record<string, SoundMap | null>, len: number, count = 3): Moment[] {
  const { lv, talk, total } = timelineLevels(p, maps)
  const subs = p.layers.filter((l): l is TextLayer => l.type === 'text' && l.subtitle)
  if (total < len * 1.3) return total > 3 ? [{ from: 0, to: total, score: 1, text: captionText(subs, 0, total) }] : []
  const w = Math.round(len * 10)
  let maxLv = 1
  for (const v of lv) maxLv = Math.max(maxLv, v)
  const cands: Moment[] = []
  for (let s = 0; s + w <= lv.length; s += 10) {
    let talkN = 0, sum = 0, sq = 0
    for (let i = s; i < s + w; i++) { talkN += talk[i]; const v = lv[i] / maxLv; sum += v; sq += v * v }
    const mean = sum / w, sd = Math.sqrt(Math.max(0, sq / w - mean * mean))
    const from = s / 10, to = (s + w) / 10
    const text = captionText(subs, from, to)
    const lively = Math.min(6, (text.match(/[?!]/g) ?? []).length) * 0.03
    cands.push({ from, to, score: (talkN / w) * (0.5 + mean) + sd * 0.8 + lively, text })
  }
  cands.sort((x, y) => y.score - x.score)
  const picked: Moment[] = []
  for (const c of cands) {
    if (picked.length >= count) break
    if (picked.some((q) => c.from < q.to && c.to > q.from)) continue
    picked.push(snapToPauses(c, talk, total, subs))
  }
  return picked.sort((x, y) => x.from - y.from)
}

/** Moves the start and end (up to 3 s) into the nearest pause, or a caption's edge. */
function snapToPauses(m: Moment, talk: Uint8Array, total: number, subs: TextLayer[]): Moment {
  const near = (t: number, dir: -1 | 1) => {
    const edges = subs.flatMap((l) => (dir < 0 ? [l.start] : [l.end]))
    let best = t, bestD = Infinity
    for (let d = 0; d <= 30; d++) {
      for (const sgn of [-1, 1]) {
        const i = Math.round(t * 10) + sgn * d
        if (i < 1 || i >= talk.length - 1) continue
        if (!talk[i] && !talk[i - 1] && !talk[i + 1] && d < bestD) { best = i / 10; bestD = d }
      }
      if (bestD < Infinity) break
    }
    for (const e of edges) if (Math.abs(e - t) <= 3 && Math.abs(e - t) * 10 < bestD) { best = e; bestD = Math.abs(e - t) * 10 }
    return best
  }
  const from = Math.max(0, near(m.from, -1)), to = Math.min(total, near(m.to, 1))
  return { ...m, from, to, text: captionText(subs, from, to) }
}

function captionText(subs: TextLayer[], from: number, to: number) {
  return subs.filter((l) => l.end > from && l.start < to).map((l) => l.text.replace(/\s+/g, ' ').trim()).join(' ')
}

/**
 * With Local AI and captions: the model picks the moments that would hook a viewer from the best candidates.
 * Falls back to the sound-based choice when it can't answer.
 */
export async function pickWithAI(p: Project, maps: Record<string, SoundMap | null>, len: number, count = 3): Promise<Moment[] | null> {
  if (!localAI()) return null
  const cands = findMoments(p, maps, len, 10).filter((m) => m.text.length > 20)
  if (cands.length <= count) return null
  const list = cands.map((m, i) => `${i + 1}. ${m.text.slice(0, 600)}`).join('\n\n')
  const out = await ask(
    `You pick parts of a long video to post as Shorts/Reels. Each numbered part is what is said in about ${len} seconds. `
    + `Choose the ${count} parts most likely to hook a viewer on their own: a strong opening line, a clear point, a surprise, emotion or a useful tip. `
    + 'Reply with only the numbers, best first, separated by commas.',
    list,
  )
  const nums = [...new Set((out.match(/\d+/g) ?? []).map(Number).filter((n) => n >= 1 && n <= cands.length))].slice(0, count)
  if (!nums.length) return null
  return nums.map((n) => ({ ...cands[n - 1], byAI: true }))
}

/** In-place radix-2 FFT. */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr; im[b] = im[a] - ti
        re[a] += tr; im[a] += ti
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
}
