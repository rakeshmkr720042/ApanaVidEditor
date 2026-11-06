import type { MediaSource, Project } from '../types'
import { exportProject, type Resolution } from '../engine/exporter'
import { loadSource } from './media'

/**
 * Compound clips ("Nest" in Premiere, "Compound clip" in Resolve): several main-video clips are made into one
 * video (with their transitions, looks, speed and sound), which then moves, trims and gets effects as one clip.
 * The original clips stay inside it, so it can be broken apart again.
 */

const playsMp4 = () => { try { return document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"') !== '' } catch { return false } }

/** The video of main-video clips `from`..`to` (indexes), read back as a new file. */
export async function renderClips(p: Project, sources: Record<string, MediaSource>, from: number, to: number, onProgress: (p: number, label: string) => void, signal?: AbortSignal): Promise<MediaSource> {
  const parts = p.clips.slice(from, to + 1).map((c, i, a) => ({ ...c, ...(i === 0 ? { gap: undefined } : {}), ...(i === a.length - 1 ? { transition: null } : {}) }))
  // only the clips: track items, watermark and presenter stay on the timeline as they are
  const sub: Project = { ...p, clips: parts, layers: [], tracks: [], main: undefined, markers: [], watermark: null, presenter: null, beatFx: null }
  const short = Math.max(...parts.map((c) => { const s = sources[c.sourceId]; return s ? Math.min(s.width, s.height) : 0 }))
  const resolution: Resolution = short > 720 ? '1080' : '720'
  const out = await exportProject(sub, sources, {
    format: playsMp4() ? 'mp4' : 'webm', resolution, fps: p.settings.fps || 30, watermark: null, cover: null, size: 'high',
  }, onProgress, signal)
  const name = `${'Joined'} ${from + 1}-${to + 1}.${out.ext}`
  return loadSource(new File([out.blob], name, { type: out.blob.type || (out.ext === 'mp4' ? 'video/mp4' : 'video/webm') }), name)
}
