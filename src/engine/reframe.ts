/**
 * Face looks for Auto reframe: where the person is, every half second of the parts of each video the main clips
 * use (src/model/reframe.ts turns them into camera moves). Uses the AI cutout model (MediaPipe, on this device).
 */
import type { MediaSource } from '../types'
import type { Look } from '../model/reframe'
import { loadCutout, personSpot } from './cutout'
import { openReader } from './frames'

const cache = new Map<string, Map<number, { x: number; y: number } | null>>()

function loadImage(url: string) {
  return new Promise<HTMLImageElement | null>((res) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = url
  })
}

/**
 * Looks at each source at the given source seconds. False when the face model can't run here (then everything
 * is framed in the middle). `stop` cancels part-way.
 */
export async function findLooks(sources: Record<string, MediaSource>, times: Record<string, number[]>,
  onProgress?: (p: number) => void, stop?: () => boolean): Promise<{ ok: boolean; looks: Record<string, Look[]> }> {
  const ok = await loadCutout().catch(() => false)
  const looks: Record<string, Look[]> = {}
  const total = Object.values(times).reduce((a, t) => a + t.length, 0) || 1
  let done = 0
  for (const [id, ts] of Object.entries(times)) {
    const s = sources[id]
    const seen = cache.get(id) ?? new Map()
    cache.set(id, seen)
    const list: Look[] = []
    if (ok && s?.kind === 'image') {
      const img = await loadImage(s.url)
      const bmp = img ? await createImageBitmap(img).catch(() => null) : null
      const spot = bmp ? personSpot(bmp) : null
      bmp?.close()
      list.push({ t: 0, x: spot?.x ?? null, y: spot?.y ?? null })
      done += ts.length
    } else if (ok && s?.kind === 'video') {
      const todo = ts.filter((t) => !seen.has(t))
      const reader = todo.length ? await openReader(s, false).catch(() => null) : null
      try {
        for (const t of ts) {
          if (stop?.()) break
          if (!seen.has(t) && reader) {
            const f = await reader.get(t)
            seen.set(t, f ? personSpot(f.image as HTMLVideoElement) : null)
          }
          const spot = seen.get(t) ?? null
          list.push({ t, x: spot?.x ?? null, y: spot?.y ?? null })
          onProgress?.(++done / total)
        }
      } finally { reader?.close() }
    }
    looks[id] = list
  }
  return { ok: !!ok, looks }
}
