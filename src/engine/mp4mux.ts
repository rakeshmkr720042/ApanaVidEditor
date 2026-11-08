// A small MP4 writer for the export: H.264 video from WebCodecs (+ AAC sound) into an .mp4/.mov
// without handing the video to ffmpeg. ffmpeg.wasm keeps its output file in its own memory and
// then copies it out, so a 200 MB video needed 400+ MB at the very end of the export; on phones
// that is where long exports died. Here the file is a Blob made of slices of the encoded pieces
// (which the browser can keep on disk), with the sample tables written in front (fast start).

export interface VideoSample { size: number; key: boolean; pts: number } // pts in µs
export interface AacTrack { config: Uint8Array; sampleRate: number; channels: number; frames: Uint8Array[] }

/** Collects WebCodecs H.264 chunks ('avc' format: length-prefixed NAL units). */
export class AvcTrack {
  samples: VideoSample[] = []
  description: Uint8Array | null = null
  parts: Blob[] = []
  private pending: Uint8Array[] = []
  private pendingBytes = 0
  bytes = 0

  push(data: Uint8Array, key: boolean, pts: number, description?: AllowSharedBufferSource) {
    if (description && !this.description) {
      const v = ArrayBuffer.isView(description) ? description : null
      this.description = v ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice() : new Uint8Array(description as ArrayBuffer).slice()
    }
    this.samples.push({ size: data.length, key, pts })
    this.pending.push(data)
    this.pendingBytes += data.length
    this.bytes += data.length
    if (this.pendingBytes >= 8 << 20) this.flush()
  }
  private flush() {
    if (!this.pending.length) return
    this.parts.push(new Blob(this.pending as BlobPart[]))
    this.pending = []
    this.pendingBytes = 0
  }
  blob(): Blob { this.flush(); return new Blob(this.parts) }
}

// ---------------------------------------------------------------- AAC (ADTS) from ffmpeg

const RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]

/** Splits an ADTS stream (what `ffmpeg -c:a aac -f adts` writes) into raw AAC frames + the decoder config. */
export function parseAdts(d: Uint8Array): AacTrack | null {
  const frames: Uint8Array[] = []
  let config: Uint8Array | null = null, sampleRate = 0, channels = 0
  let p = 0
  while (p + 7 <= d.length) {
    if (d[p] !== 0xff || (d[p + 1] & 0xf6) !== 0xf0) { p++; continue }
    const noCrc = d[p + 1] & 1
    const profile = (d[p + 2] >> 6) & 3
    const fi = (d[p + 2] >> 2) & 15
    const ch = ((d[p + 2] & 1) << 2) | (d[p + 3] >> 6)
    const len = ((d[p + 3] & 3) << 11) | (d[p + 4] << 3) | (d[p + 5] >> 5)
    const head = noCrc ? 7 : 9
    if (len < head || p + len > d.length) break
    if (!config) {
      const ot = profile + 1
      config = new Uint8Array([(ot << 3) | (fi >> 1), ((fi & 1) << 7) | (ch << 3)])
      sampleRate = RATES[fi] ?? 48000
      channels = ch || 2
    }
    frames.push(d.subarray(p + head, p + len))
    p += len
  }
  return config && frames.length ? { config, sampleRate, channels, frames } : null
}

// ---------------------------------------------------------------- boxes

class W {
  private a: number[] = []
  u8(v: number) { this.a.push(v & 255); return this }
  u16(v: number) { return this.u8(v >> 8).u8(v) }
  u24(v: number) { return this.u8(v >> 16).u8(v >> 8).u8(v) }
  u32(v: number) { return this.u8(v >>> 24).u8(v >>> 16).u8(v >>> 8).u8(v) }
  u64(v: number) { return this.u32(Math.floor(v / 2 ** 32)).u32(v % 2 ** 32) }
  i32(v: number) { return this.u32(v < 0 ? v + 2 ** 32 : v) }
  str(s: string) { for (const c of s) this.u8(c.charCodeAt(0)); return this }
  bytes(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.a.push(b[i]); return this }
  zeros(n: number) { for (let i = 0; i < n; i++) this.a.push(0); return this }
  get out() { return this.a }
}

const box = (type: string, ...body: ArrayLike<number>[]): number[] => {
  const len = 8 + body.reduce((s, b) => s + b.length, 0)
  const w = new W().u32(len).str(type)
  for (const b of body) w.bytes(b)
  return w.out
}
const full = (type: string, version: number, flags: number, ...body: ArrayLike<number>[]) => box(type, new W().u8(version).u24(flags).out, ...body)
const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000]
const matrix = () => { const w = new W(); for (const m of MATRIX) w.u32(m); return w.out }

interface Chunk { track: 0 | 1; first: number; count: number; data: Blob; offset: number }

function tkhd(id: number, duration: number, w: number, h: number, audio: boolean) {
  return full('tkhd', 0, 3, new W().u32(0).u32(0).u32(id).u32(0).u32(duration).zeros(8).u16(0).u16(audio ? 1 : 0).u16(audio ? 0x0100 : 0).u16(0)
    .bytes(matrix()).u32(w * 65536).u32(h * 65536).out)
}
const mdhd = (scale: number, duration: number) => full('mdhd', 0, 0, new W().u32(0).u32(0).u32(scale).u32(duration).u16(0x55c4).u16(0).out)
const hdlr = (type: string, name: string) => full('hdlr', 0, 0, new W().u32(0).str(type).zeros(12).str(name).u8(0).out)
const dinf = () => box('dinf', full('dref', 0, 0, new W().u32(1).out, full('url ', 0, 1)))

function stco(offsets: number[], big: boolean) {
  const w = new W().u32(offsets.length)
  for (const o of offsets) big ? w.u64(o) : w.u32(o)
  return full(big ? 'co64' : 'stco', 0, 0, w.out)
}
function stsc(counts: number[]) {
  // one entry per change in samples-per-chunk
  const w = new W()
  const rows: [number, number][] = []
  counts.forEach((c, i) => { if (!rows.length || rows[rows.length - 1][1] !== c) rows.push([i + 1, c]) })
  w.u32(rows.length)
  for (const [first, c] of rows) w.u32(first).u32(c).u32(1)
  return full('stsc', 0, 0, w.out)
}
function stsz(sizes: number[]) {
  const w = new W().u32(0).u32(sizes.length)
  for (const s of sizes) w.u32(s)
  return full('stsz', 0, 0, w.out)
}

function esds(cfg: Uint8Array, bitrate: number) {
  const dsi = [5, cfg.length, ...cfg]
  const dcd = [4, 13 + dsi.length, 0x40, 0x15, 0, 0x18, 0, ...new W().u32(bitrate).u32(bitrate).out, ...dsi]
  const es = [3, 3 + dcd.length + 3, 0, 0, 0, ...dcd, 6, 1, 2]
  return full('esds', 0, 0, es)
}

function covr(jpeg: Uint8Array) {
  const data = box('data', new W().u32(13).u32(0).out, jpeg)
  return box('udta', full('meta', 0, 0, hdlr('mdir', ''), box('ilst', box('covr', data))))
}

/**
 * Puts the video (and sound) into one MP4/MOV Blob. `fps` is the export frame rate; every frame
 * lasts 1/fps. The sample data is never copied: the file is slices of the encoded Blobs.
 */
export function muxMp4(opts: { video: AvcTrack; width: number; height: number; fps: number; audio?: AacTrack | null; cover?: Uint8Array | null; mov?: boolean }): Blob {
  const { video, width, height, fps, audio, cover, mov } = opts
  if (!video.description) throw new Error('The video encoder gave no stream settings')
  const vs = video.samples
  if (!vs.length) throw new Error('No video frames were made')
  const vScale = Math.round(fps) * 100, vDelta = 100 // fps are whole numbers in the export
  const vDur = vs.length * vDelta
  const msDur = Math.round((vs.length / fps) * 1000)

  // composition offsets: only when the encoder reordered frames (B-frames)
  const ptsTicks = vs.map((s) => Math.round((s.pts * vScale) / 1e6))
  let reordered = false
  for (let i = 0; i < vs.length; i++) if (ptsTicks[i] !== i * vDelta) { reordered = true; break }
  // (loops, not Math.min(...array): an hour of video has more frames than a call can take as arguments)
  let minOff = 0, minPts = Infinity
  for (let i = 0; i < vs.length; i++) { minOff = Math.min(minOff, ptsTicks[i] - i * vDelta); minPts = Math.min(minPts, ptsTicks[i]) }

  // chunks of about half a second, video and sound taking turns
  const vBlob = video.blob()
  const aBlob = audio ? new Blob(audio.frames as BlobPart[]) : null
  const chunks: Chunk[] = []
  const perV = Math.max(1, Math.round(fps / 2))
  let vi = 0, ai = 0, vByte = 0, aByte = 0
  while (vi < vs.length || (audio && ai < audio.frames.length)) {
    if (vi < vs.length) {
      const n = Math.min(perV, vs.length - vi)
      let len = 0
      for (let k = 0; k < n; k++) len += vs[vi + k].size
      chunks.push({ track: 0, first: vi, count: n, data: vBlob.slice(vByte, vByte + len), offset: 0 })
      vi += n; vByte += len
    }
    if (audio && aBlob && ai < audio.frames.length) {
      // keep the sound in step with the video already written
      const until = vi >= vs.length ? audio.frames.length : Math.min(audio.frames.length, Math.ceil(((vi / fps) * audio.sampleRate) / 1024))
      const n = until - ai
      if (n > 0) {
        let len = 0
        for (let k = 0; k < n; k++) len += audio.frames[ai + k].length
        chunks.push({ track: 1, first: ai, count: n, data: aBlob.slice(aByte, aByte + len), offset: 0 })
        ai += n; aByte += len
      }
    }
  }
  const dataBytes = chunks.reduce((s, c) => s + c.data.size, 0)
  const big = dataBytes > 0xfffffff0 - 1e6
  const mdatHead = big ? 16 : 8

  const build = () => {
    const vChunks = chunks.filter((c) => c.track === 0), aChunks = chunks.filter((c) => c.track === 1)
    const stts = full('stts', 0, 0, new W().u32(1).u32(vs.length).u32(vDelta).out)
    const keys = vs.flatMap((s, i) => (s.key ? [i + 1] : []))
    const stss = keys.length === vs.length ? [] : full('stss', 0, 0, new W().u32(keys.length).bytes(keys.flatMap((k) => new W().u32(k).out)).out)
    let ctts: number[] = []
    if (reordered) {
      const w = new W().u32(vs.length)
      for (let i = 0; i < vs.length; i++) w.u32(1).i32(ptsTicks[i] - i * vDelta - minOff)
      ctts = full('ctts', 0, 0, w.out)
    }
    const avc1 = box('avc1', new W().zeros(6).u16(1).zeros(16).u16(width).u16(height).u32(0x00480000).u32(0x00480000).u32(0).u16(1)
      .zeros(32).u16(0x18).u16(0xffff).out, box('avcC', video.description!))
    const vStbl = box('stbl', full('stsd', 0, 0, new W().u32(1).out, avc1), stts, ctts, stss, stsc(vChunks.map((c) => c.count)), stsz(vs.map((s) => s.size)), stco(vChunks.map((c) => c.offset), big))
    // the first frame shown (smallest composition time) is the start of the video
    const startAt = reordered ? minPts - minOff : 0
    const edts = startAt > 0 ? box('edts', full('elst', 0, 0, new W().u32(1).u32(msDur).u32(startAt).u32(0x00010000).out)) : []
    const vTrak = box('trak', tkhd(1, msDur, width, height, false), edts,
      box('mdia', mdhd(vScale, vDur), hdlr('vide', 'VideoHandler'), box('minf', full('vmhd', 0, 1, new W().zeros(8).out), dinf(), vStbl)))
    let aTrak: number[] = []
    if (audio) {
      const n = audio.frames.length
      const mp4a = box('mp4a', new W().zeros(6).u16(1).zeros(8).u16(audio.channels).u16(16).u32(0).u32(audio.sampleRate * 65536).out,
        esds(audio.config, Math.round((aByte * 8) / Math.max(0.1, (n * 1024) / audio.sampleRate))))
      const aStbl = box('stbl', full('stsd', 0, 0, new W().u32(1).out, mp4a), full('stts', 0, 0, new W().u32(1).u32(n).u32(1024).out),
        stsc(aChunks.map((c) => c.count)), stsz(audio.frames.map((f) => f.length)), stco(aChunks.map((c) => c.offset), big))
      aTrak = box('trak', tkhd(2, Math.round(((n * 1024) / audio.sampleRate) * 1000), 0, 0, true),
        box('mdia', mdhd(audio.sampleRate, n * 1024), hdlr('soun', 'SoundHandler'), box('minf', full('smhd', 0, 0, new W().u32(0).out), dinf(), aStbl)))
    }
    const mvhd = full('mvhd', 0, 0, new W().u32(0).u32(0).u32(1000).u32(msDur).u32(0x00010000).u16(0x0100).zeros(10).bytes(matrix()).zeros(24).u32(audio ? 3 : 2).out)
    return box('moov', mvhd, vTrak, aTrak, cover?.length ? covr(cover) : [])
  }

  const ftyp = mov
    ? box('ftyp', new W().str('qt  ').u32(0x200).str('qt  ').out)
    : box('ftyp', new W().str('isom').u32(0x200).str('isomiso2avc1mp41').out)
  // offsets depend on the size of the tables in front, which does not change with the offsets themselves
  const moovSize = build().length
  let at = ftyp.length + moovSize + mdatHead
  for (const c of chunks) { c.offset = at; at += c.data.size }
  const moov = new Uint8Array(build())
  const mdat = big ? new W().u32(1).str('mdat').u64(dataBytes + 16).out : new W().u32(dataBytes + 8).str('mdat').out
  return new Blob([new Uint8Array(ftyp), moov, new Uint8Array(mdat), ...chunks.map((c) => c.data)], { type: mov ? 'video/quicktime' : 'video/mp4' })
}
