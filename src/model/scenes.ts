import type { AudioLayer, CaptionFramePreset, Clip, MediaSource, Project, TextLayer, WaveLayer, WaveStyle } from '../types'
import { uid } from '../lib/format'
import { layoutClips, newClip } from './timeline'
import { MIX_TRANSITIONS } from './slideshow'
import { defaultFrame, subtitleStyle } from '../engine/text'
import { newWave, subtitleLook } from './useEditor'
import { captionY, type AudioPart } from '../lib/audioScenes'
import type { MindScene } from '../lib/mindmap'
import { quizPlan, type QuizPlan, type QuizScene } from '../lib/quiz'
import { dataPlan, type DataScene } from '../lib/datachart'
import type { ArticlePic } from '../lib/article'

/**
 * Scene builder: every "something → video" input (slides, PDF pages, photos, and later scripts,
 * mind maps or quizzes) becomes a list of scenes, and one function lays them on the timeline as
 * ordinary clips, captions and voice tracks that stay fully editable.
 */
export interface Scene {
  id: string
  image: Blob // what is shown (a photo, a rendered PDF page or slide, a text card)
  name: string
  text: string // spoken by the AI voice and/or shown as captions
  duration: number | null // seconds on screen; null = automatic (voice length, or the default)
  card?: TextCard // when the image is a drawn text card: what is on it, so it can be redrawn
  mind?: MindScene // one step of a mind map: becomes an animated clip when the scenes are placed
  audio?: AudioPart // a chapter of an audio file: timed to the sound, captions follow the speech
  quiz?: QuizScene // a quiz question or flashcard: becomes an animated clip timed to its voice
  data?: DataScene // a step of a chart made from a table: becomes an animated clip timed to its voice
  art?: ArticlePic // an article's cover or one of its pictures: kept so it can be redrawn in another style
  media?: MovingMedia // a GIF or video clip: `image` is its first frame; it becomes a moving clip when placed
}

/** A GIF or a video clip the user gave. It is shown moving (looped to fit its scene), without its own sound under a voice. */
export interface MovingMedia {
  kind: 'gif' | 'video'
  file: Blob
  length: number // seconds of one play-through
}

/** What a text card shows: a big title, a titled list or paragraph, or a large quote. */
export interface TextCard {
  kind: 'title' | 'bullets' | 'text' | 'quote'
  title: string
  lines: string[] // bullet points, or the paragraph / quote as one line
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
  theme: string // look of text cards made from a script
  wave: WaveStyle | null // animated waveform over the user's own audio track
  waveColor: string
  waveColor2: string
  captionFrame: 'auto' | Exclude<CaptionFramePreset, 'custom' | 'left' | 'right'>
}

export const defaultSceneOptions = (): SceneOptions => ({
  seconds: 5, voice: 'none', lang: 'hi', captions: false, transition: 'fade', transitionDuration: 0.5, kenBurns: false, fill: false, theme: 'clean',
  wave: null, waveColor: '#ffffff', waveColor2: '#7dd3fc', captionFrame: 'auto',
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
  voice2?: MediaSource | null // a quiz answer, read when it appears
  sfx?: MediaSource | null // countdown ticks under a quiz question
}

/** When things happen in a quiz scene, once its voices are known. */
export const planOf = (b: BuiltScene): QuizPlan | null =>
  b.scene.quiz ? quizPlan(b.scene.quiz, b.voice?.duration ?? 0, b.voice2?.duration ?? 0) : null

/** How long an animated scene has to be (its quiz or chart plan), or null for the others. */
const fixedLength = (b: BuiltScene, voiced: boolean): number | null =>
  planOf(b)?.end ?? (b.scene.data ? dataPlan(b.scene.data, voiced ? b.voice?.duration ?? 0 : 0).end : null)

/** How long each scene stays on screen, before transition overlap is added. */
export function sceneLengths(built: BuiltScene[], o: SceneOptions, track: MediaSource | null): number[] {
  if (o.voice === 'track' && track) {
    // the user's own narration: share it out, but keep scenes they timed themselves
    const own = built.map((b) => fixedLength(b, false) ?? b.scene.duration)
    const fixed = own.reduce<number>((s, d) => s + (d ?? 0), 0)
    const free = own.filter((d) => d == null).length
    const each = free ? Math.max(1, (track.duration - fixed) / free) : 0
    return own.map((d) => d ?? each)
  }
  // a quiz scene is as long as its question, countdown and answer
  return built.map((b) => fixedLength(b, true) ?? b.scene.duration ?? (b.voice ? VOICE_LEAD + b.voice.duration + VOICE_TAIL : Math.max(o.seconds, readingTime(b.scene))))
}

/** Seconds needed to read a text card without a voice (about three words a second). */
export function readingTime(s: Scene) {
  if (!s.card) return 0
  const words = [s.card.title, ...s.card.lines].join(' ').split(/\s+/).filter(Boolean).length
  return Math.ceil(1.5 + words / 3)
}

/** How long the transition after each scene lasts (it overlaps the start of the next one). */
export function transitionLengths(lens: number[], o: SceneOptions): number[] {
  return lens.map((l, i) => (o.transition && i < lens.length - 1 ? Math.min(o.transitionDuration, l / 2, lens[i + 1] / 2) : 0))
}

/**
 * Appends scenes to the end of the timeline: one photo clip per scene, plus its voice and
 * captions placed under it. Returns the new project (the caller commits it as one undo step).
 */
export function placeScenes(p: Project, built: BuiltScene[], o: SceneOptions, track: MediaSource | null, ratio = 16 / 9): Project {
  if (!built.length) return p
  const lens = sceneLengths(built, o, track)
  const first = p.clips.length
  const trs = transitionLengths(lens, o)
  const trLen = (i: number) => trs[i]
  const withTrack = o.voice === 'track' && track
  const fresh: Clip[] = built.map((b, i) => {
    const type = o.transition === 'mix' ? MIX_TRANSITIONS[i % MIX_TRANSITIONS.length] : o.transition
    // a transition overlaps the next scene, so lengthen the clip to keep the scene's own time
    const len = lens[i] + trLen(i)
    return {
      ...newClip(b.source, uid()), out: len, fit: o.fill ? 'fill' : 'fit',
      transition: type && i < built.length - 1 ? { type, duration: trLen(i) } : null,
      kenBurns: o.kenBurns ? KB_SOFT[i % KB_SOFT.length] : null,
      // a video clip's own sound would talk over the narration
      volume: b.scene.media?.kind === 'video' && (b.voice || withTrack) ? 0 : 1,
    }
  })
  const clips = [...p.clips, ...fresh]
  const { items, total } = layoutClips(clips)

  const layers = [...p.layers]
  const trackStart = withTrack ? items[first].start + items[first].transIn : null
  // new captions match the ones already in the project; otherwise they keep clear of the waveform
  const look = subtitleLook(p.layers)
  const wave = withTrack ? o.wave : null
  const capY = look?.y ?? captionY(wave)
  const frame = look ? look.frame : o.captionFrame === 'auto' ? null : defaultFrame(o.captionFrame)
  const narrow = ratio < 1 // tall frames need smaller captions with shorter lines
  const lineLen = narrow ? 26 : 42
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
    const plan = planOf(b)
    if (plan && b.voice2) {
      const at = start + plan.voice2At
      layers.push({
        id: uid(), type: 'audio', sourceId: b.voice2.id, in: 0, start: at, end: Math.min(total, at + b.voice2.duration),
        volume: 1, fadeIn: 0, fadeOut: 0, label: `${b.scene.name} ✓`, kind: 'voice',
      })
    }
    if (plan && b.sfx) {
      const at = start + plan.timerStart
      layers.push({
        id: uid(), type: 'audio', sourceId: b.sfx.id, in: 0, start: at, end: Math.min(total, at + b.sfx.duration),
        volume: 0.5, fadeIn: 0, fadeOut: 0, label: b.sfx.name.replace(/\.[^.]+$/, ''), kind: 'sound',
      })
    }
    if (o.captions && b.scene.text.trim()) {
      const style = look ? { ...look.style } : subtitleStyle()
      if (!look && narrow) style.size = 0.03
      if (devanagari(b.scene.text)) style.font = 'Noto Sans Devanagari'
      const caption = (text: string, from: number, to: number): TextLayer => ({
        id: uid(), type: 'text', text, subtitle: true, start: from, end: Math.min(total, to), style,
        box: { x: 0.5, y: capY, scale: 1, rotation: 0, opacity: 1 }, animIn: 'none', animOut: 'none',
        frame: frame && { ...frame, rect: { ...frame.rect } },
      })
      const a = b.scene.audio
      if (a && a.cues.length && b.scene.text.trim() === a.heard.trim() && trackStart != null) {
        // speech recognised from the audio: each line shows while it is being said
        for (const c of a.cues) {
          // a long line is shown in parts, two short lines at a time
          const parts = captionChunks(c.text, lineLen)
          const weight = parts.reduce((s, x) => s + x.length, 0)
          let t = trackStart + c.start
          for (const x of parts) {
            const d = ((c.end - c.start) * x.length) / weight
            layers.push(caption(x, t, t + d))
            t += d
          }
        }
      } else {
        const spread = (text: string, from: number, len: number) => {
          const chunks = captionChunks(text, lineLen)
          const weight = chunks.reduce((s, c) => s + c.length, 0)
          let t = from
          for (const c of chunks) {
            const d = (len * c.length) / weight
            layers.push(caption(c, t, t + d))
            t += d
          }
        }
        // a quiz question's captions end when the countdown starts; the answer gets its own
        spread(b.scene.text, speechStart, plan && !b.voice ? Math.max(0.5, plan.timerStart - VOICE_LEAD) : speechLen)
        const q = b.scene.quiz
        if (plan && q?.say2.trim()) spread(q.say2, start + plan.voice2At, b.voice2?.duration ?? Math.max(1, plan.end - plan.voice2At))
      }
    }
  })

  if (withTrack && trackStart != null) {
    const end = Math.min(total, trackStart + track.duration)
    layers.push({
      id: uid(), type: 'audio', sourceId: track.id, in: 0, start: trackStart, end,
      volume: 1, fadeIn: 0, fadeOut: 0, label: track.name.replace(/\.[^.]+$/, ''), kind: 'voice',
    })
    if (wave) {
      const w: WaveLayer = { ...newWave(track.id, wave), start: trackStart, end, color: o.waveColor, color2: o.waveColor2 }
      layers.push(w)
    }
  }
  return { ...p, clips, layers }
}
