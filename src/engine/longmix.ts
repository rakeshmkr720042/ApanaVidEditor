import type { MediaSource, Project } from '../types'
import { MIX_RATE, mixInPieces } from './audiomix'

// A long timeline's sound is mixed two minutes at a time and squeezed with the
// browser's Opus encoder as it goes, so an hour of sound takes ~70 MB instead of
// the 650 MB a WAV file would (plus the same again while mixing it in one go).
// ffmpeg then reads the small Ogg file to make the AAC or Vorbis track.

export const canEncodeLong = async () => {
  if (typeof AudioEncoder === 'undefined') return false
  try { return !!(await AudioEncoder.isConfigSupported(CONFIG)).supported } catch { return false }
}

const CONFIG: AudioEncoderConfig = { codec: 'opus', sampleRate: MIX_RATE, numberOfChannels: 2, bitrate: 160_000 }

/** The project's whole sound as an Ogg Opus file, or null when it is silent. */
export async function mixToOgg(project: Project, sources: Record<string, MediaSource>, onProgress?: (p: number) => void): Promise<Uint8Array | null> {
  const packets: { data: Uint8Array; samples: number }[] = []
  let preSkip = 312 // libopus look-ahead at 48 kHz, used when the encoder does not say
  let err: unknown = null
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      const d = new Uint8Array(chunk.byteLength)
      chunk.copyTo(d)
      packets.push({ data: d, samples: Math.round(((chunk.duration ?? 20000) * MIX_RATE) / 1e6) })
      const desc = meta?.decoderConfig?.description
      if (desc) {
        const b = new Uint8Array(desc instanceof ArrayBuffer ? desc : (desc as ArrayBufferView).buffer)
        if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 8)) === 'OpusHead') preSkip = b[10] | (b[11] << 8)
      }
    },
    error: (e) => { err = e },
  })
  enc.configure(CONFIG)
  let any = false
  await mixInPieces(project, sources, MIX_RATE, 2, async (buf, from, to) => {
    if (err) throw err
    const frames = Math.round((to - from) * MIX_RATE)
    // a silent piece is still sent, as silence, so everything after it stays in time
    const planar = new Float32Array(frames * 2)
    if (buf) {
      any = true
      for (let c = 0; c < 2; c++) planar.set(buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)).subarray(0, frames), c * frames)
    }
    const data = new AudioData({ format: 'f32-planar', sampleRate: MIX_RATE, numberOfChannels: 2, numberOfFrames: frames, timestamp: Math.round(from * 1e6), data: planar })
    enc.encode(data)
    data.close()
    while (enc.encodeQueueSize > 2) await new Promise((r) => setTimeout(r, 20))
  }, onProgress)
  await enc.flush()
  enc.close()
  if (err) throw err
  return any ? oggOpus(packets, preSkip) : null
}

// ---------------------------------------------------------------- Ogg pages (RFC 3533 / 7845)

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    t[i] = r >>> 0
  }
  return t
})()

function page(body: Uint8Array, type: number, granule: bigint, serial: number, seq: number) {
  const lacing: number[] = []
  let n = body.length
  while (n >= 255) { lacing.push(255); n -= 255 }
  lacing.push(n)
  const p = new Uint8Array(27 + lacing.length + body.length)
  const v = new DataView(p.buffer)
  p.set([0x4f, 0x67, 0x67, 0x53]) // OggS
  p[5] = type
  v.setBigInt64(6, granule, true)
  v.setUint32(14, serial, true)
  v.setUint32(18, seq, true)
  p[26] = lacing.length
  p.set(lacing, 27)
  p.set(body, 27 + lacing.length)
  let crc = 0
  for (const b of p) crc = ((crc << 8) ^ CRC[((crc >>> 24) ^ b) & 0xff]) >>> 0
  v.setUint32(22, crc, true)
  return p
}

function oggOpus(packets: { data: Uint8Array; samples: number }[], preSkip: number) {
  const serial = 0x41564531
  const head = new Uint8Array(19)
  const hv = new DataView(head.buffer)
  head.set(new TextEncoder().encode('OpusHead'))
  head[8] = 1; head[9] = 2
  hv.setUint16(10, preSkip, true)
  hv.setUint32(12, MIX_RATE, true)
  const vendor = new TextEncoder().encode('ApanaVidEditor')
  const tags = new Uint8Array(8 + 4 + vendor.length + 4)
  tags.set(new TextEncoder().encode('OpusTags'))
  new DataView(tags.buffer).setUint32(8, vendor.length, true)
  tags.set(vendor, 12)
  const pages = [page(head, 2, 0n, serial, 0), page(tags, 0, 0n, serial, 1)]
  let granule = 0n
  packets.forEach((pk, i) => {
    granule += BigInt(pk.samples)
    pages.push(page(pk.data, i === packets.length - 1 ? 4 : 0, granule, serial, i + 2))
  })
  const out = new Uint8Array(pages.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of pages) { out.set(p, o); o += p.length }
  return out
}
