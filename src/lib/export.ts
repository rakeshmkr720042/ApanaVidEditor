import { fetchFile } from '@ffmpeg/util'
import type { Clip, MediaSource } from '../types'
import { clipLen } from '../types'
import { getFFmpeg, runFFmpeg } from './ffmpeg'

export type ExportMode = 'fast' | 'accurate'
export type Resolution = 'original' | '1080' | '720' | '480'

export interface ExportOptions {
  mode: ExportMode
  resolution: Resolution
}

export interface ExportResult { blob: Blob; ext: string }

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
const ext = (name: string) => (name.split('.').pop() || 'mp4').toLowerCase()
const t = (n: number) => n.toFixed(3)

/**
 * Renders the timeline to a single file.
 * fast: stream copy (no quality loss, very quick, cuts snap to keyframes).
 * accurate: re-encodes with x264 (frame-exact cuts, mixes sizes, slower).
 */
export async function exportTimeline(
  clips: Clip[],
  sources: Record<string, MediaSource>,
  opts: ExportOptions,
  onProgress: (p: number, label: string) => void,
): Promise<ExportResult> {
  const ff = await getFFmpeg()
  const used = [...new Set(clips.map((c) => c.sourceId))]
  const inputName: Record<string, string> = {}
  for (const [i, id] of used.entries()) {
    onProgress(0, 'Loading video…')
    const name = `in${i}.${ext(sources[id].name)}`
    await ff.writeFile(name, await fetchFile(sources[id].file))
    inputName[id] = name
  }

  const total = clips.reduce((s, c) => s + clipLen(c), 0)
  let done = 0
  const step = (c: Clip) => (p: number) =>
    onProgress(Math.min(0.99, (done + Math.max(0, Math.min(1, p)) * clipLen(c)) / total), 'Rendering…')

  const outExt = opts.mode === 'fast' && used.every((id) => ext(sources[id].name) === 'webm') ? 'webm' : 'mp4'
  const parts: string[] = []
  const cleanup = [...Object.values(inputName)]

  try {
    if (opts.mode === 'fast') {
      for (const [i, c] of clips.entries()) {
        const part = `part${i}.${outExt}`
        const { code } = await runFFmpeg(
          ['-ss', t(c.in), '-i', inputName[c.sourceId], '-t', t(clipLen(c)),
            '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-avoid_negative_ts', 'make_zero', part],
          step(c),
        )
        if (code !== 0) throw new Error('Fast export failed for this file. Try "Accurate" mode.')
        parts.push(part)
        done += clipLen(c)
      }
    } else {
      const first = sources[clips[0].sourceId]
      let w = first.width, h = first.height
      if (opts.resolution !== 'original') {
        const target = Number(opts.resolution)
        const scale = Math.min(1, target / Math.min(w, h))
        w *= scale; h *= scale
      }
      w = even(w); h = even(h)
      const audio: Record<string, boolean> = {}
      for (const id of used) {
        const { logs } = await runFFmpeg(['-hide_banner', '-i', inputName[id]])
        audio[id] = logs.some((l) => /Stream #.*Audio:/.test(l))
      }
      for (const [i, c] of clips.entries()) {
        const part = `part${i}.mp4`
        const hasA = audio[c.sourceId]
        const { code } = await runFFmpeg(
          [
            '-ss', t(c.in), '-i', inputName[c.sourceId],
            ...(hasA ? [] : ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100']),
            '-t', t(clipLen(c)),
            '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,
            '-map', '0:v:0', '-map', hasA ? '0:a:0' : '1:a:0',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
            part,
          ],
          step(c),
        )
        if (code !== 0) throw new Error('Rendering failed. The video format may not be supported.')
        parts.push(part)
        done += clipLen(c)
      }
    }
    cleanup.push(...parts)

    const out = `out.${outExt}`
    if (parts.length === 1) {
      await ff.rename(parts[0], out)
      cleanup.splice(cleanup.indexOf(parts[0]), 1)
    } else {
      onProgress(0.99, 'Joining clips…')
      await ff.writeFile('list.txt', parts.map((p) => `file '${p}'`).join('\n'))
      cleanup.push('list.txt')
      const { code } = await runFFmpeg(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', out])
      if (code !== 0) throw new Error('Joining failed. Clips with different formats need "Accurate" mode.')
    }
    cleanup.push(out)
    const data = (await ff.readFile(out)) as Uint8Array
    onProgress(1, 'Done')
    return { blob: new Blob([data.slice().buffer], { type: outExt === 'webm' ? 'video/webm' : 'video/mp4' }), ext: outExt }
  } finally {
    for (const f of cleanup) await ff.deleteFile(f).catch(() => {})
  }
}
