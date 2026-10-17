import type { AudioLayer, Clip, MediaSource, Project, TextLayer } from '../types'
import { uid } from '../lib/format'
import { layoutClips, newClip } from './timeline'
import { MIX_TRANSITIONS } from './slideshow'
import { subtitleStyle } from '../engine/text'

/**
 * Scene builder: every "something → video" input (slides, PDF pages, photos, and later scripts,
 * mind maps or quizzes) becomes a list of scenes, and one function lays them on the timeline as
 * ordinary clips, captions and voice tracks that stay fully editable.
 */
export interface Scene {
  id: string
  image: Blob // what is shown (a photo, a rendered PDF page or slide)
  name: string
  text: string // spoken by the AI voice and/or shown as captions
  duration: number | null // seconds on screen; null = automatic (voice length, or the default)
}

export type VoiceMode = 'none' | 'ai' | 'track'

export interface SceneOptions {
  seconds: number // per scene when there is no voice to fit to
  voice: VoiceMode
  lang: string // AI voice language
  captions: boolean // show each scene's text as subtitles
  transition: string | null // transition id, 'mix', or null for cuts
  transitionDuration: number
  kenBurns: boolean
  fill: boolean // crop to fill the frame (off keeps whole slides visible)
}

export const defaultSceneOptions = (): SceneOptions => ({
  seconds: 5, voice: 'none', lang: 'hi', captions: false, transition: 'fade', transitionDuration: 0.5, kenBurns: false, fill: false,
})

const KB_SOFT = ['zoom-in', 'zoom-out'] as const
const VOICE_LEAD = 0.3 // pause before a scene's voice starts
const VOICE_TAIL = 0.6 // pause after it ends

/** Tidies extracted text into something a voice can read: no hyphen breaks, single spaces. */
export function cleanText(s: string, max = 600) {
  const text = s.replace(/-\s*\n\s*/g, '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('। '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
  return (end > max / 3 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '')).trim()
}

/** Breaks text into caption-sized pieces of up to two short lines each. */
export function captionChunks(text: string, lineLen = 42): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > lineLen) { lines.push(cur); cur = w } else cur = cur ? `${cur} ${w}` : w
    if (/[.!?।]$/.test(cur) && cur.length > lineLen / 2) { lines.push(cur); cur = '' }
  }
  if (cur) lines.push(cur)
  const chunks: string[] = []
  for (let i = 0; i < lines.length; i += 2) chunks.push(lines.slice(i, i + 2).join('\n'))
  return chunks
}

export interface BuiltScene {
  scene: Scene
  source: MediaSource // the scene's image, already added to the editor
  voice: MediaSource | null // its spoken text, when the AI voice is used
}

/** How long each scene stays on screen, before transition overlap is added. */
export function sceneLengths(built: BuiltScene[], o: SceneOptions, track: MediaSource | null): number[] {
  if (o.voice === 'track' && track) {
    // the user's own narration: share it out, but keep scenes they timed themselves
    const fixed = built.reduce((s, b) => s + (b.scene.duration ?? 0), 0)
    const free = built.filter((b) => b.scene.duration == null).length
    const each = free ? Math.max(1, (track.duration - fixed) / free) : 0
    return built.map((b) => b.scene.duration ?? each)
  }
  return built.map((b) => b.scene.duration ?? (b.voice ? VOICE_LEAD + b.voice.duration + VOICE_TAIL : o.seconds))
}

/**
 * Appends scenes to the end of the timeline: one photo clip per scene, plus its voice and
 * captions placed under it. Returns the new project (the caller commits it as one undo step).
 */
export function placeScenes(p: Project, built: BuiltScene[], o: SceneOptions, track: MediaSource | null): Project {
  if (!built.length) return p
  const lens = sceneLengths(built, o, track)
  const first = p.clips.length
  const trLen = (i: number) => (o.transition && i < built.length - 1 ? Math.min(o.transitionDuration, lens[i] / 2, lens[i + 1] / 2) : 0)
  const fresh: Clip[] = built.map((b, i) => {
    const type = o.transition === 'mix' ? MIX_TRANSITIONS[i % MIX_TRANSITIONS.length] : o.transition
    // a transition overlaps the next scene, so lengthen the clip to keep the scene's own time
    const len = lens[i] + trLen(i)
    return {
      ...newClip(b.source, uid()), out: len, fit: o.fill ? 'fill' : 'fit',
      transition: type && i < built.length - 1 ? { type, duration: trLen(i) } : null,
      kenBurns: o.kenBurns ? KB_SOFT[i % KB_SOFT.length] : null,
    }
  })
  const clips = [...p.clips, ...fresh]
  const { items, total } = layoutClips(clips)

  const layers = [...p.layers]
  const devanagari = (s: string) => /[ऀ-ॿ]/.test(s)
  built.forEach((b, i) => {
    const it = items[first + i]
    const start = it.start + it.transIn
    const shown = lens[i]
    let speechStart = start
    let speechLen = shown
    if (b.voice) {
      speechStart = start + VOICE_LEAD
      speechLen = Math.min(b.voice.duration, Math.max(0.5, shown - VOICE_LEAD))
      const l: AudioLayer = {
        id: uid(), type: 'audio', sourceId: b.voice.id, in: 0, start: speechStart, end: Math.min(total, speechStart + speechLen),
        volume: 1, fadeIn: 0, fadeOut: 0, label: `${b.scene.name}`, kind: 'voice',
      }
      layers.push(l)
    }
    if (o.captions && b.scene.text.trim()) {
      const chunks = captionChunks(b.scene.text)
      const weight = chunks.reduce((s, c) => s + c.length, 0)
      let t = speechStart
      const style = subtitleStyle()
      if (devanagari(b.scene.text)) style.font = 'Noto Sans Devanagari'
      for (const c of chunks) {
        const d = (speechLen * c.length) / weight
        const l: TextLayer = {
          id: uid(), type: 'text', text: c, subtitle: true, start: t, end: Math.min(total, t + d), style,
          box: { x: 0.5, y: 0.86, scale: 1, rotation: 0, opacity: 1 }, animIn: 'none', animOut: 'none',
        }
        layers.push(l)
        t += d
      }
    }
  })

  if (o.voice === 'track' && track) {
    const start = items[first].start + items[first].transIn
    layers.push({
      id: uid(), type: 'audio', sourceId: track.id, in: 0, start, end: Math.min(total, start + track.duration),
      volume: 1, fadeIn: 0, fadeOut: 0, label: track.name.replace(/\.[^.]+$/, ''), kind: 'voice',
    })
  }
  return { ...p, clips, layers }
}
