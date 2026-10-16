import { createFile, DataStream } from 'mp4box'
import type { MediaSource } from '../types'
import type { FrameImage } from './renderer'

/**
 * Frame access for export. MP4/MOV sources are decoded with WebCodecs straight from the
 * file (fast, hardware accelerated, sequential); anything else falls back to seeking a
 * hidden <video>.
 */
export interface FrameReader {
  get(time: number): Promise<FrameImage | null>
  close(): void
}

interface Sample { offset: number; size: number; cts: number; dts: number; duration: number; is_sync: boolean; timescale: number }

interface Demuxed {
  config: VideoDecoderConfig
  samples: Sample[]
  rotation: number
  width: number
  height: number
}

const demuxCache = new WeakMap<Blob, Promise<Demuxed | null>>()

async function topBoxes(file: Blob) {
  const boxes: { type: string; pos: number; size: number }[] = []
  let pos = 0
  while (pos + 8 <= file.size && boxes.length < 64) {
    const head = new DataView(await file.slice(pos, pos + 16).arrayBuffer())
    let size = head.getUint32(0)
    const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7))
    if (size === 1) size = Number(head.getBigUint64(8))
    else if (size === 0) size = file.size - pos
    if (size < 8) break
    boxes.push({ type, pos, size })
    pos += size
  }
  return boxes
}

function description(trak: any): Uint8Array | undefined { // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C
    if (box) {
      const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN)
      box.write(stream)
      return new Uint8Array(stream.buffer, 8)
    }
  }
  return undefined
}

async function demux(file: Blob): Promise<Demuxed | null> {
  if (typeof VideoDecoder === 'undefined') return null
  const boxes = await topBoxes(file)
  const moov = boxes.find((b) => b.type === 'moov')
  if (!moov || boxes.some((b) => b.type === 'moof')) return null
  const mp4 = createFile()
  let info: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
  mp4.onReady = (i: unknown) => { info = i }
  for (const b of boxes.filter((x) => x.type === 'ftyp' || x.type === 'moov')) {
    const buf = (await file.slice(b.pos, b.pos + b.size).arrayBuffer()) as ArrayBuffer & { fileStart: number }
    buf.fileStart = b.pos
    mp4.appendBuffer(buf)
  }
  mp4.flush()
  const track = info?.videoTracks?.[0]
  if (!track) return null
  const trak = mp4.getTrackById(track.id)
  const samples: Sample[] = trak.samples
  if (!samples?.length) return null
  const config: VideoDecoderConfig = {
    codec: track.codec.startsWith('vp08') ? 'vp8' : track.codec,
    codedWidth: track.video.width,
    codedHeight: track.video.height,
    description: description(trak),
    hardwareAcceleration: 'no-preference',
  }
  const support = await VideoDecoder.isConfigSupported(config).catch(() => ({ supported: false }))
  if (!support.supported) return null
  const m: number[] = track.matrix ?? [65536, 0, 0, 0, 65536, 0, 0, 0, 1 << 30]
  const rotation = (Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI / 90) * 90 + 360) % 360
  return { config, samples, rotation, width: track.video.width, height: track.video.height }
}

class DecoderReader implements FrameReader {
  private d: Demuxed
  private file: Blob
  private decoder: VideoDecoder | null = null
  private next = 0 // next sample index to feed
  private queue: VideoFrame[] = []
  private current: VideoFrame | null = null
  private lastTime = -1
  private waiters: (() => void)[] = []
  private canvas: OffscreenCanvas | HTMLCanvasElement
  private error: unknown = null

  constructor(d: Demuxed, file: Blob) {
    this.d = d
    this.file = file
    const rot = d.rotation % 180 !== 0
    const w = rot ? d.height : d.width, h = rot ? d.width : d.height
    this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
  }

  private reset(time: number) {
    this.decoder?.close()
    for (const f of this.queue) f.close()
    this.queue = []
    this.decoder = new VideoDecoder({
      output: (f) => { this.queue.push(f); this.wake() },
      error: (e) => { this.error = e; this.wake() },
    })
    this.decoder.configure(this.d.config)
    // start from the last keyframe at or before `time`
    const t = time * this.d.samples[0].timescale
    let k = 0
    for (let i = 0; i < this.d.samples.length; i++) {
      const s = this.d.samples[i]
      if (s.is_sync && s.cts <= t + 1) k = i
      if (s.dts > t) break
    }
    this.next = k
  }

  private wake() { const w = this.waiters; this.waiters = []; w.forEach((f) => f()) }

  private async feed(count: number) {
    const dec = this.decoder!
    const ss = this.d.samples
    let fed = 0
    while (fed < count && this.next < ss.length) {
      const s = ss[this.next++]
      const data = new Uint8Array(await this.file.slice(s.offset, s.offset + s.size).arrayBuffer())
      dec.decode(new EncodedVideoChunk({
        type: s.is_sync ? 'key' : 'delta',
        timestamp: (s.cts * 1e6) / s.timescale,
        duration: (s.duration * 1e6) / s.timescale,
        data,
      }))
      fed++
    }
    if (this.next >= ss.length) await dec.flush().catch(() => {})
  }

  async get(time: number): Promise<FrameImage | null> {
    if (this.error) throw this.error
    if (!this.decoder || time < this.lastTime - 1e-3 || time > this.lastTime + 3) this.resetFrom(time)
    this.lastTime = time
    const target = time * 1e6 + 1000 // µs, with a little tolerance
    for (let guard = 0; guard < 2000; guard++) {
      // advance through decoded frames while the next one is not past the target
      while (this.queue.length && this.queue[0].timestamp <= target) {
        this.current?.close()
        this.current = this.queue.shift()!
      }
      if (this.queue.length || this.next >= this.d.samples.length && this.decoder!.decodeQueueSize === 0) break
      if (this.decoder!.decodeQueueSize < 8) await this.feed(4)
      else await new Promise<void>((r) => { this.waiters.push(r); setTimeout(r, 50) })
      if (this.error) throw this.error
    }
    if (!this.current && this.queue.length) this.current = this.queue.shift()!
    if (!this.current) return null
    return this.upright(this.current)
  }

  private resetFrom(time: number) {
    this.current?.close()
    this.current = null
    this.reset(time)
  }

  private upright(f: VideoFrame): FrameImage {
    const c = this.canvas
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    const w = f.displayWidth, h = f.displayHeight
    const rot = this.d.rotation
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate((rot * Math.PI) / 180)
    ctx.drawImage(f, -w / 2, -h / 2, w, h)
    return { image: c, width: c.width, height: c.height }
  }

  close() {
    this.current?.close()
    for (const f of this.queue) f.close()
    this.queue = []
    try { this.decoder?.close() } catch { /* already closed */ }
  }
}

class ElementReader implements FrameReader {
  private v: HTMLVideoElement
  private ready: Promise<void>
  constructor(src: MediaSource) {
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'auto'
    v.playsInline = true
    v.src = src.url
    this.v = v
    this.ready = new Promise((r) => { v.addEventListener('loadeddata', () => r(), { once: true }); v.addEventListener('error', () => r(), { once: true }) })
  }
  async get(time: number): Promise<FrameImage | null> {
    await this.ready
    const v = this.v
    if (!v.videoWidth) return null
    if (Math.abs(v.currentTime - time) > 1e-3) {
      await new Promise<void>((r) => {
        const done = () => { clearTimeout(to); r() }
        const to = setTimeout(done, 3000)
        v.addEventListener('seeked', done, { once: true })
        v.currentTime = time
      })
      // make sure the decoded frame is presented before drawing
      if ('requestVideoFrameCallback' in v) {
        await new Promise<void>((r) => { const to = setTimeout(r, 40); v.requestVideoFrameCallback(() => { clearTimeout(to); r() }) })
      }
    }
    return { image: v, width: v.videoWidth, height: v.videoHeight }
  }
  close() { this.v.removeAttribute('src'); this.v.load() }
}

class ImageReader implements FrameReader {
  private img: Promise<HTMLImageElement>
  constructor(src: MediaSource) {
    this.img = new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(i); i.src = src.url })
  }
  async get(): Promise<FrameImage | null> {
    const i = await this.img
    return i.naturalWidth ? { image: i, width: i.naturalWidth, height: i.naturalHeight } : null
  }
  close() {}
}

export async function openReader(src: MediaSource, preferDecoder = true): Promise<FrameReader> {
  if (src.kind === 'image') return new ImageReader(src)
  if (preferDecoder && /\.(mp4|m4v|mov|3gp)$/i.test(src.name) || src.file.type === 'video/mp4' || src.file.type === 'video/quicktime') {
    let p = demuxCache.get(src.file)
    if (!p) { p = demux(src.file).catch(() => null); demuxCache.set(src.file, p) }
    const d = await p
    if (d && preferDecoder) return new DecoderReader(d, src.file)
  }
  return new ElementReader(src)
}
