import type { Scene } from '../model/scenes'
import { fillInOrder, matchByWords, planPictures, type Leftover, type Pic, type Plan } from './rawMedia'

/**
 * What a user brings for a video, by mode: the main file the video is made from (a script, an
 * audio, an article…) and extra material beside it (photos, slides, GIFs, clips, music). The
 * coverage meter counts how many scenes the extra material fills; the editor makes the rest.
 */

export type BuilderMode = 'files' | 'text' | 'mindmap' | 'audio' | 'quiz' | 'data' | 'article'
export type AuxKind = 'photo' | 'slide' | 'gif' | 'clip' | 'music'

export const AUX: Record<AuxKind, { label: string; icon: string; accept: string }> = {
  photo: { label: 'Photos', icon: '🖼', accept: 'image/png,image/jpeg,image/webp,image/avif,image/bmp,image/heic,.jpg,.jpeg,.png,.webp' },
  slide: { label: 'Slides', icon: '📑', accept: 'application/pdf,.pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx' },
  gif: { label: 'GIF / animation', icon: '✨', accept: 'image/gif,.gif' },
  clip: { label: 'Video clips', icon: '🎬', accept: 'video/*,.mp4,.webm,.mov,.m4v' },
  music: { label: 'Music', icon: '♪', accept: 'audio/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac' },
}

const PICTURES: AuxKind[] = ['photo', 'slide', 'gif', 'clip', 'music']

/** The extra material each mode can use. Where the editor draws the whole picture itself (maps, quizzes, charts) only music fits. */
export function auxFor(mode: BuilderMode): AuxKind[] {
  return mode === 'text' || mode === 'audio' || mode === 'article' ? PICTURES : ['music']
}

/** Which box a picture belongs in. */
export const kindOf = (p: Pic): Exclude<AuxKind, 'music'> => (p.slide ? 'slide' : p.media?.kind === 'gif' ? 'gif' : p.media?.kind === 'video' ? 'clip' : 'photo')

// ---------------------------------------------------------------- coverage

export interface Part { name: string; seconds: number; covered: boolean }

export interface Coverage {
  total: number
  covered: number
  pct: number // 0..100, rounded down so 100 means every scene
  empty: number[] // indexes of the scenes the editor fills
  long: number[] // empty scenes long enough that a picture would help most there
}

/** An empty scene longer than this many seconds is pointed out. */
export const LONG_EMPTY = 20

export function coverageOf(parts: Part[]): Coverage {
  const covered = parts.filter((p) => p.covered).length
  const empty = parts.map((p, i) => (p.covered ? -1 : i)).filter((i) => i >= 0)
  return {
    total: parts.length, covered, pct: parts.length ? Math.floor((covered * 100) / parts.length) : 0,
    empty, long: empty.filter((i) => parts[i].seconds >= LONG_EMPTY),
  }
}

/** Which part gets which picture, worked out quickly by words for the live meter (Local AI is asked only when scenes are made). Each picture is counted once. */
export function livePlan(texts: string[], pics: Pic[]): Plan {
  if (!pics.length) return texts.map(() => null)
  const spoken = texts.some((x) => x.trim()) && pics.some((p) => p.words)
  return fillInOrder(spoken ? matchByWords(texts, pics) : texts.map(() => null), pics.length, 'card')
}

/** Whether a made scene shows the user's own material rather than something the editor drew. */
export function isOwn(s: Scene): boolean {
  if (s.audio) return s.audio.look === 'photos'
  if (s.card) return !!s.own
  if (s.art) return s.art.kind === 'image' && !!s.art.image
  return !s.mind && !s.quiz && !s.data
}

/**
 * Puts the user's pictures on drawn card scenes: each goes on the scene that talks about it (by
 * Local AI when it is on, else by words), the rest in order. The card is kept, so the picture can be
 * swapped back. Other scenes are left as they are.
 */
export async function dressScenes(scenes: Scene[], pics: Pic[], leftover: Leftover): Promise<{ scenes: Scene[]; matched: number; byAI: boolean; dressed: number }> {
  const cards = scenes.filter((s) => s.card && !s.own)
  if (!pics.length || !cards.length) return { scenes, matched: 0, byAI: false, dressed: 0 }
  const { plan, matched, byAI } = await planPictures(cards.map((s) => s.text), pics, leftover)
  const put = new Map<string, Pic>()
  cards.forEach((s, i) => { if (plan[i] != null) put.set(s.id, pics[plan[i]!]) })
  return {
    matched, byAI, dressed: put.size,
    scenes: scenes.map((s) => {
      const p = put.get(s.id)
      // the scene keeps its own length (its voice), not a clip's
      return p ? { ...s, image: p.image, media: p.media, own: p.id } : s
    }),
  }
}
