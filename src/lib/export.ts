import { fetchFile } from '@ffmpeg/util'
import type { MediaSource, Project } from '../types'
import { isNeutral } from '../model/timeline'
import { getFFmpeg, runFFmpeg } from './ffmpeg'

const ext = (name: string) => (name.split('.').pop() || 'mp4').toLowerCase()
const t = (n: number) => n.toFixed(3)

/** True when the project is only cuts of videos, so it can be exported without re-encoding. */
export function isSimpleProject(p: Project, sources: Record<string, MediaSource>) {
  if (!p.clips.length || p.layers.length || p.watermark?.enabled || p.settings.aspect !== 'original') return false
  const first = sources[p.clips[0].sourceId]
  return p.clips.every((c) => {
    const s = sources[c.sourceId]
    return s?.kind === 'video' && s.width === first.width && s.height === first.height && ext(s.name) === ext(first.name) &&
      c.speed === 1 && !c.ramp && c.volume === 1 && !c.fadeIn && !c.fadeOut && !c.rotate && !c.flipH && !c.flipV &&
      !c.crop && !c.filter && isNeutral(c.adjust) && !c.transition && !c.kenBurns && !c.denoise
  })
}

/** Stream-copy export: original quality and very fast, cuts snap to the nearest keyframe. */
export async function exportFast(p: Project, sources: Record<string, MediaSource>, onProgress: (p: number, label: string) => void) {
  const ff = await getFFmpeg()
  const clips = p.clips
  const used = [...new Set(clips.map((c) => c.sourceId))]
  const inputName: Record<string, string> = {}
  for (const [i, id] of used.entries()) {
    onProgress(0, 'Loading video…')
    const name = `in${i}.${ext(sources[id].name)}`
    await ff.writeFile(name, await fetchFile(sources[id].file))
    inputName[id] = name
  }
  const outExt = used.every((id) => ext(sources[id].name) === 'webm') ? 'webm' : 'mp4'
  const parts: string[] = []
  const cleanup = [...Object.values(inputName)]
  try {
    for (const [i, c] of clips.entries()) {
      const part = `part${i}.${outExt}`
      cleanup.push(part)
      const { code } = await runFFmpeg(
        ['-ss', t(c.in), '-i', inputName[c.sourceId], '-t', t(c.out - c.in), '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-avoid_negative_ts', 'make_zero', part],
        (q) => onProgress(Math.min(0.95, (i + Math.max(0, Math.min(1, q))) / clips.length), 'Cutting…'),
      )
      if (code !== 0) throw new Error('Fast export is not possible for this file. Use a normal export.')
      parts.push(part)
    }
    const out = `fast.${outExt}`
    cleanup.push(out, 'list.txt')
    if (parts.length === 1) await ff.rename(parts[0], out)
    else {
      await ff.writeFile('list.txt', parts.map((x) => `file '${x}'`).join('\n'))
      const { code } = await runFFmpeg(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', out])
      if (code !== 0) throw new Error('Joining failed. Use a normal export.')
    }
    const data = (await ff.readFile(out)) as Uint8Array
    onProgress(1, 'Done')
    return { blob: new Blob([data.slice().buffer], { type: outExt === 'webm' ? 'video/webm' : 'video/mp4' }), ext: outExt }
  } finally {
    for (const f of cleanup) await ff.deleteFile(f).catch(() => {})
  }
}
