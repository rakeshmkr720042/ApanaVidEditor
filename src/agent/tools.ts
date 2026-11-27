/**
 * The chat agent's tools: every editor action it can do, as a typed, checked, pure function on a copy of the
 * project. The AI (or the no-AI quick parser) only picks tools and fills their arguments; nothing here trusts
 * those arguments (src/agent/schema.ts checks and tidies them first, and each tool checks its targets).
 *
 * Adding a feature to the editor? Add a tool here (or an 'open' entry in OPENABLE) so the chat can use it.
 * tests/agent.test.ts fails when a main toolbar tool is neither covered nor listed in NOT_FOR_CHAT.
 */
import type { AspectRatio, Clip, KenBurns, Layer, Project, TextAnim, TextFill, TextLayer, TextStyle, WordFxStyle } from '../types'
import { MIN_CLIP } from '../types'
import { uid } from '../lib/format'
import { defaultAdjust, layoutClips } from '../model/timeline'
import { selectedIds } from '../model/useEditor'
import { defaultTextStyle } from '../engine/text'
import { FILTERS } from '../engine/filters'
import { EFFECTS } from '../engine/effects'
import { TRANSITIONS } from '../engine/transitions'
import { CAMERA_PRESETS, cameraKeys, type CameraId } from '../model/camera'
import { applyCuts, type CutRange } from '../model/smartcut'
import { AgentError, type AgentCtx, type AgentTool, type Both } from './types'
import type { S } from './schema'
import { findNamed } from './find'

// ---------- argument shapes shared by many tools ----------

const CLIP_WORDS = ['all', 'selected', 'first', 'last', 'current'] as const
/** Which main-video clips. */
export const CLIPS: S = {
  anyOf: [{ type: 'string', enum: CLIP_WORDS }, { type: 'array', items: { type: 'integer', min: 1, max: 9999 }, maxItems: 500 }],
  desc: '"all", "selected", "first", "last", "current" (under the playhead) or clip numbers like [1,3]',
}
/** Which text items. */
const TEXTS: S = { type: 'string', desc: '"all", "subtitles", "titles" (non-subtitle text), "selected", or words the text contains' }
const SEC = (desc: string, max = 36000): S => ({ type: 'number', min: 0, max, desc })
const AT: S = { anyOf: [{ type: 'number', min: 0, max: 36000 }, { type: 'string', enum: ['playhead', 'start', 'end'] }], desc: 'seconds on the timeline, or "playhead", "start", "end"' }
const ASPECTS: AspectRatio[] = ['original', '16:9', '9:16', '1:1', '4:5', '4:3', '3:4', '21:9']
const ANIMS: TextAnim[] = ['none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'pop', 'typewriter', 'zoom', 'bounce', 'blur', 'spin', 'drop', 'wipe', 'letters']
const FILLS: TextFill[] = ['gold', 'rose-gold', 'silver', 'royal', 'sunset', 'love', 'rainbow', 'tiranga']
const WORD_STYLES: WordFxStyle[] = ['color', 'box', 'pop', 'karaoke', 'reveal', 'one', 'bounce', 'glow', 'underline']
const BURNS: KenBurns[] = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down']
const COLORS: Record<string, string> = {
  white: '#ffffff', black: '#000000', red: '#ff3b30', orange: '#ff9500', yellow: '#ffcc00', green: '#34c759', blue: '#007aff', sky: '#30b0ff',
  purple: '#af52de', pink: '#ff2d55', gold: '#ffd700', grey: '#8e8e93', gray: '#8e8e93', brown: '#a2845e',
  safed: '#ffffff', kala: '#000000', laal: '#ff3b30', lal: '#ff3b30', peela: '#ffcc00', hara: '#34c759', neela: '#007aff', gulabi: '#ff2d55', baingani: '#af52de', sunehra: '#ffd700',
  'सफ़ेद': '#ffffff', 'काला': '#000000', 'लाल': '#ff3b30', 'पीला': '#ffcc00', 'हरा': '#34c759', 'नीला': '#007aff', 'गुलाबी': '#ff2d55',
}

const L = (en: string, hi: string): Both => ({ en, hi })
const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s * 10) / 10}s`)

/** A colour from a name ("laal", "red") or #hex; null when it isn't one. */
export function colorOf(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(s) || /^#[0-9a-f]{3}$/.test(s)) return s
  return COLORS[s] ?? null
}

// ---------- finding targets ----------

const isAudioClip = (c: Clip, ctx: AgentCtx) => ctx.sources[c.sourceId]?.kind === 'audio'

/** The ids of the main-video clips a target names. Throws (with a clear reason) when there are none. */
export function resolveClips(p: Project, spec: unknown, ctx: AgentCtx): string[] {
  const clips = p.clips
  if (!clips.length) throw new AgentError('There are no clips in the video yet. Add a video first.', 'वीडियो में अभी कोई क्लिप नहीं है। पहले वीडियो जोड़ें।')
  const at = () => {
    const { items } = layoutClips(clips)
    const t = ctx.playhead
    return (items.find((x) => t >= x.start && t < x.start + x.dur) ?? (t >= (items.at(-1)?.start ?? 0) ? items.at(-1) : items[0]))!.clip.id
  }
  if (spec == null || spec === 'all') return clips.map((c) => c.id)
  if (spec === 'first') return [clips[0].id]
  if (spec === 'last') return [clips[clips.length - 1].id]
  if (spec === 'current') return [at()]
  if (spec === 'selected') {
    const ids = ctx.sel?.type === 'clip' ? selectedIds(p, ctx.sel).filter((id) => clips.some((c) => c.id === id)) : []
    return ids.length ? ids : [at()]
  }
  if (Array.isArray(spec)) {
    const ids: string[] = []
    for (const n of spec as number[]) {
      const c = clips[n - 1]
      if (!c) throw new AgentError(`There is no clip ${n}: the video has ${clips.length} clip${clips.length === 1 ? '' : 's'}.`, `क्लिप ${n} नहीं है: वीडियो में ${clips.length} क्लिप हैं।`)
      if (!ids.includes(c.id)) ids.push(c.id)
    }
    if (ids.length) return ids
  }
  throw new AgentError('Which clips? Say "all clips", "clip 2" or select one.', 'कौन सी क्लिप? "सारी क्लिप", "क्लिप 2" लिखें या एक क्लिप चुनें।')
}

/** Text items a target names ("all", "subtitles", "titles", "selected", or words the text contains). */
export function resolveTexts(p: Project, spec: unknown, ctx: AgentCtx): TextLayer[] {
  const texts = p.layers.filter((l): l is TextLayer => l.type === 'text')
  const s = typeof spec === 'string' ? spec.trim().toLowerCase() : 'all'
  let out: TextLayer[]
  if (s === 'all' || s === '') out = texts
  else if (s === 'subtitles' || s === 'captions') out = texts.filter((l) => l.subtitle)
  else if (s === 'titles' || s === 'text') out = texts.filter((l) => !l.subtitle)
  else if (s === 'selected') {
    const ids = ctx.sel?.type === 'layer' ? new Set(selectedIds(p, ctx.sel)) : new Set<string>()
    out = texts.filter((l) => ids.has(l.id))
  } else out = texts.filter((l) => l.text.toLowerCase().includes(s))
  if (!out.length) throw new AgentError(texts.length ? `No text matches "${spec}".` : 'There is no text in the video yet.', texts.length ? `"${spec}" वाला कोई टेक्स्ट नहीं मिला।` : 'वीडियो में अभी कोई टेक्स्ट नहीं है।')
  return out
}

const total = (p: Project) => layoutClips(p.clips).total
/** A time argument → timeline seconds, kept inside the video. */
export function timeOf(p: Project, v: unknown, ctx: AgentCtx): number {
  const tot = total(p)
  const t = v === 'start' ? 0 : v === 'end' ? tot : v === 'playhead' || v == null ? ctx.playhead : Number(v)
  if (!isFinite(t)) throw new AgentError('That time is not clear.', 'समय साफ़ नहीं है।')
  return Math.max(0, Math.min(tot, t))
}

const mapClips = (p: Project, ids: string[], f: (c: Clip) => Partial<Clip>, ctx?: AgentCtx, visualOnly = false): Project => {
  if (p.main?.locked) throw new AgentError('The main video row is locked. Unlock it first.', 'मुख्य वीडियो की पंक्ति लॉक है। पहले अनलॉक करें।')
  const set = new Set(ids)
  return { ...p, clips: p.clips.map((c) => (set.has(c.id) && !(visualOnly && ctx && isAudioClip(c, ctx)) ? { ...c, ...f(c) } : c)) }
}
const clipsSay = (spec: unknown): Both => {
  if (spec === 'all' || spec == null) return L('all clips', 'सारी क्लिप')
  if (spec === 'first') return L('the first clip', 'पहली क्लिप')
  if (spec === 'last') return L('the last clip', 'आख़िरी क्लिप')
  if (spec === 'current') return L('the clip at the playhead', 'प्लेहेड वाली क्लिप')
  if (spec === 'selected') return L('the selected clip', 'चुनी हुई क्लिप')
  const n = (spec as number[]).join(', ')
  return L(`clip ${n}`, `क्लिप ${n}`)
}
const unlockedLayers = (p: Project) => (l: Layer) => !p.tracks?.find((t) => t.id === l.track)?.locked

// ---------- the tools ----------

const ADJ_KEYS = ['brightness', 'contrast', 'saturation', 'exposure', 'temperature', 'vibrance', 'highlights', 'shadows', 'tint', 'fade', 'vignette', 'grain', 'sharpen'] as const

export const TOOLS: AgentTool[] = [
  {
    name: 'set_filter', group: 'look', covers: ['Filters'],
    say: 'Put a colour filter (look) on clips; name "none" removes it.',
    words: ['filter', 'look', 'lut', 'colour', 'color', 'warm', 'cool', 'vintage', 'black and white', 'cinematic', 'फ़िल्टर', 'फिल्टर', 'rang', 'रंग'],
    params: { type: 'object', props: { clips: CLIPS, name: { type: 'string', desc: 'filter name, e.g. warm, vintage, black and white, teal orange, none' }, amount: { type: 'number', min: 0, max: 1, desc: 'strength 0..1, default 1' } }, required: ['name'] },
    run(p, a, ctx) {
      const none = /^(none|off|no|remove|hatao|koi nahi)$/i.test(String(a.name))
      const f = none ? null : findNamed(FILTERS, String(a.name))
      if (!none && (!f || f.score < 0.4)) throw new AgentError(`No filter called "${a.name}".`, `"${a.name}" नाम का कोई फ़िल्टर नहीं है।`)
      return mapClips(p, resolveClips(p, a.clips, ctx), () => ({ filter: f?.item.id ?? null, filterAmount: (a.amount as number) ?? 1 }), ctx, true)
    },
    describe(a) {
      const f = findNamed(FILTERS, String(a.name))
      const c = clipsSay(a.clips)
      if (!f || /^(none|off)$/i.test(String(a.name))) return L(`Remove the filter from ${c.en}`, `${c.hi} से फ़िल्टर हटाएँ`)
      const pc = Math.round(((a.amount as number) ?? 1) * 100)
      return L(`Filter "${f.item.name}" (${pc}%) on ${c.en}`, `${c.hi} पर "${f.item.name}" फ़िल्टर (${pc}%)`)
    },
  },
  {
    name: 'set_effect', group: 'look', covers: ['Effects'],
    say: 'Put a video effect on clips (glow, VHS, glitch, cartoon, smooth skin, cinema bars, shake…); "none" removes it.',
    words: ['effect', 'glow', 'vhs', 'glitch', 'cartoon', 'anime', 'sketch', 'shake', 'bokeh', 'sparkle', 'snow', 'beauty', 'skin', 'cinema bars', 'इफ़ेक्ट', 'effects'],
    params: { type: 'object', props: { clips: CLIPS, name: { type: 'string', desc: 'effect name' }, amount: { type: 'number', min: 0, max: 1 } }, required: ['name'] },
    run(p, a, ctx) {
      const none = /^(none|off|no|remove)$/i.test(String(a.name))
      const f = none ? null : findNamed(EFFECTS, String(a.name))
      if (!none && (!f || f.score < 0.4)) throw new AgentError(`No effect called "${a.name}".`, `"${a.name}" नाम का कोई इफ़ेक्ट नहीं है।`)
      return mapClips(p, resolveClips(p, a.clips, ctx), () => ({ effect: f ? { id: f.item.id, amount: (a.amount as number) ?? 0.7 } : null }), ctx, true)
    },
    describe(a) {
      const f = findNamed(EFFECTS, String(a.name)), c = clipsSay(a.clips)
      return f ? L(`Effect "${f.item.name}" on ${c.en}`, `${c.hi} पर "${f.item.name}" इफ़ेक्ट`) : L(`Remove effects from ${c.en}`, `${c.hi} से इफ़ेक्ट हटाएँ`)
    },
  },
  {
    name: 'adjust', group: 'look', covers: ['Adjust'],
    say: 'Change brightness, contrast, saturation, exposure, temperature (warmth), vibrance, highlights, shadows, vignette, grain, sharpen. Values -1..1; mode "add" changes from the current value.',
    words: ['bright', 'brightness', 'dark', 'contrast', 'saturation', 'exposure', 'warmth', 'temperature', 'vignette', 'sharp', 'sharpen', 'grain', 'shadows', 'highlights', 'roshni', 'ujala', 'andhera', 'chamak', 'रोशनी', 'उजाला', 'adjust'],
    params: {
      type: 'object',
      props: { clips: CLIPS, mode: { type: 'string', enum: ['add', 'set'], desc: 'add (default) or set' }, ...Object.fromEntries(ADJ_KEYS.map((k) => [k, { type: 'number', min: -1, max: 1 } as S])) },
    },
    run(p, a, ctx) {
      const keys = ADJ_KEYS.filter((k) => typeof a[k] === 'number')
      if (!keys.length) throw new AgentError('What should change: brightness, contrast, saturation…?', 'क्या बदलना है: ब्राइटनेस, कॉन्ट्रास्ट, सैचुरेशन…?')
      const add = a.mode !== 'set'
      return mapClips(p, resolveClips(p, a.clips, ctx), (c) => {
        const adj = { ...defaultAdjust(), ...c.adjust }
        for (const k of keys) {
          const lo = k === 'fade' || k === 'vignette' || k === 'grain' || k === 'sharpen' ? 0 : -1
          adj[k] = Math.max(lo, Math.min(1, (add ? adj[k] : 0) + (a[k] as number)))
        }
        return { adjust: adj }
      }, ctx, true)
    },
    describe(a) {
      const parts = ADJ_KEYS.filter((k) => typeof a[k] === 'number').map((k) => `${k} ${(a[k] as number) > 0 && a.mode !== 'set' ? '+' : ''}${Math.round((a[k] as number) * 100)}`)
      const c = clipsSay(a.clips)
      return L(`Adjust ${parts.join(', ')} on ${c.en}`, `${c.hi} पर ${parts.join(', ')}`)
    },
  },
  {
    name: 'reset_look', group: 'look',
    say: 'Remove filter, effect and adjustments from clips (back to the original look).',
    words: ['reset', 'original', 'normal', 'saaf', 'hatao', 'pehle jaisa'],
    params: { type: 'object', props: { clips: CLIPS } },
    run: (p, a, ctx) => mapClips(p, resolveClips(p, a.clips, ctx), () => ({ filter: null, effect: null, adjust: defaultAdjust(), grade: null }), ctx, true),
    describe: (a) => { const c = clipsSay(a.clips); return L(`Original look on ${c.en}`, `${c.hi} का असली रूप वापस`) },
  },
  {
    name: 'set_transition', group: 'look', covers: ['Transition'],
    say: 'Transition between clips. "after" = clip numbers whose join with the next clip gets it, or "all". name "none" removes.',
    words: ['transition', 'fade', 'dissolve', 'wipe', 'slide', 'zoom', 'whip', 'ट्रांज़िशन', 'transition', 'jodna', 'beech me'],
    params: {
      type: 'object',
      props: {
        after: { anyOf: [{ type: 'string', enum: ['all'] }, { type: 'array', items: { type: 'integer', min: 1, max: 9999 } }], desc: '"all" or clip numbers' },
        name: { type: 'string', desc: 'fade, dissolve, zoomin, slideleft, wipeleft, glitch, heart, ink, none…' },
        duration: { type: 'number', min: 0.1, max: 3, desc: 'seconds, default 0.6' },
      }, required: ['name'],
    },
    run(p, a, ctx) {
      if (p.clips.length < 2) throw new AgentError('A transition needs at least two clips.', 'ट्रांज़िशन के लिए कम से कम दो क्लिप चाहिए।')
      const none = /^(none|off|remove|hatao)$/i.test(String(a.name))
      const f = none ? null : findNamed(TRANSITIONS, String(a.name))
      if (!none && (!f || f.score < 0.4)) throw new AgentError(`No transition called "${a.name}".`, `"${a.name}" नाम का कोई ट्रांज़िशन नहीं है।`)
      const ids = a.after == null || a.after === 'all' ? p.clips.slice(0, -1).map((c) => c.id) : resolveClips(p, a.after, ctx)
      const dur = (a.duration as number) ?? 0.6
      // the transition can't be longer than the clips it joins
      return mapClips(p, ids, (c) => {
        const i = p.clips.findIndex((x) => x.id === c.id)
        const next = p.clips[i + 1]
        if (!next) return {}
        const room = Math.max(0.1, Math.min((c.out - c.in) / c.speed, (next.out - next.in) / next.speed) / 2 - 0.05)
        return { transition: f ? { type: f.item.id, duration: Math.min(dur, room) } : null }
      })
    },
    describe(a) {
      const f = findNamed(TRANSITIONS, String(a.name))
      const where = a.after == null || a.after === 'all' ? L('between all clips', 'सारी क्लिप के बीच') : L(`after clip ${(a.after as number[]).join(', ')}`, `क्लिप ${(a.after as number[]).join(', ')} के बाद`)
      return f ? L(`Transition "${f.item.name}" ${where.en}`, `${where.hi} "${f.item.name}" ट्रांज़िशन`) : L(`Remove transitions ${where.en}`, `${where.hi} ट्रांज़िशन हटाएँ`)
    },
  },
  {
    name: 'set_speed', group: 'edit', covers: ['Speed'],
    say: 'Play clips faster or slower (0.25 = slow motion, 2 = double speed).',
    words: ['speed', 'fast', 'slow', 'slow motion', 'tez', 'dheere', 'dheema', 'रफ़्तार', 'तेज़', 'धीरे', 'x'],
    params: { type: 'object', props: { clips: CLIPS, speed: { type: 'number', min: 0.1, max: 16 } }, required: ['speed'] },
    run: (p, a, ctx) => mapClips(p, resolveClips(p, a.clips, ctx), (c) => (c.out - c.in) / (a.speed as number) < MIN_CLIP ? {} : { speed: a.speed as number, ramp: null }),
    describe: (a) => { const c = clipsSay(a.clips); return L(`Speed ${a.speed}x on ${c.en}`, `${c.hi} की रफ़्तार ${a.speed}x`) },
  },
  {
    name: 'set_volume', group: 'audio', covers: ['Volume'],
    say: 'Sound level of clips (0 = mute, 1 = normal, 2 = double). For music use music_volume.',
    words: ['volume', 'sound', 'mute', 'awaaz', 'aawaz', 'loud', 'quiet', 'आवाज़', 'आवाज', 'unmute'],
    params: { type: 'object', props: { clips: CLIPS, volume: { type: 'number', min: 0, max: 2 } }, required: ['volume'] },
    run: (p, a, ctx) => mapClips(p, resolveClips(p, a.clips, ctx), () => ({ volume: a.volume as number, volKeys: undefined })),
    describe: (a) => { const c = clipsSay(a.clips); return a.volume === 0 ? L(`Mute ${c.en}`, `${c.hi} म्यूट`) : L(`Volume ${Math.round((a.volume as number) * 100)}% on ${c.en}`, `${c.hi} की आवाज़ ${Math.round((a.volume as number) * 100)}%`) },
  },
  {
    name: 'music_volume', group: 'audio',
    say: 'Sound level of the added music / audio items (0 = mute, 1 = normal). kind: music, voice, sound or all.',
    words: ['music', 'song', 'gaana', 'gana', 'background music', 'bgm', 'गाना', 'संगीत', 'म्यूज़िक'],
    params: { type: 'object', props: { volume: { type: 'number', min: 0, max: 2 }, kind: { type: 'string', enum: ['music', 'voice', 'sound', 'all'] } }, required: ['volume'] },
    run(p, a) {
      const kind = (a.kind as string) ?? 'all'
      const ok = unlockedLayers(p)
      const hits = p.layers.filter((l) => l.type === 'audio' && (kind === 'all' || l.kind === kind) && ok(l))
      if (!hits.length) throw new AgentError('There is no music or audio in the video yet. Add it with Audio.', 'वीडियो में अभी कोई गाना या ऑडियो नहीं है। "ऑडियो" से जोड़ें।')
      const ids = new Set(hits.map((l) => l.id))
      return { ...p, layers: p.layers.map((l) => (ids.has(l.id) && l.type === 'audio' ? { ...l, volume: a.volume as number, volKeys: undefined } : l)) }
    },
    describe: (a) => (a.volume === 0 ? L('Mute the music', 'गाना म्यूट') : L(`Music volume ${Math.round((a.volume as number) * 100)}%`, `गाने की आवाज़ ${Math.round((a.volume as number) * 100)}%`)),
  },
  {
    name: 'fade', group: 'audio',
    say: 'Fade in at the start and/or fade out at the end (seconds). target "video" = first/last clip, "music" = music items.',
    words: ['fade in', 'fade out', 'fade', 'dheere se', 'shuru', 'ant'],
    params: { type: 'object', props: { target: { type: 'string', enum: ['video', 'music'] }, in: SEC('fade-in seconds', 10), out: SEC('fade-out seconds', 10) } },
    run(p, a) {
      if (a.in == null && a.out == null) throw new AgentError('Fade in or fade out, how many seconds?', 'फ़ेड इन या फ़ेड आउट, कितने सेकंड?')
      if (a.target === 'music') {
        const ok = unlockedLayers(p)
        if (!p.layers.some((l) => l.type === 'audio' && ok(l))) throw new AgentError('There is no music in the video yet.', 'वीडियो में अभी कोई गाना नहीं है।')
        return { ...p, layers: p.layers.map((l) => (l.type === 'audio' && ok(l) ? { ...l, ...(a.in != null ? { fadeIn: Math.min(a.in as number, (l.end - l.start) / 2) } : {}), ...(a.out != null ? { fadeOut: Math.min(a.out as number, (l.end - l.start) / 2) } : {}) } : l)) }
      }
      if (!p.clips.length) throw new AgentError('There are no clips yet.', 'अभी कोई क्लिप नहीं है।')
      const first = p.clips[0], last = p.clips[p.clips.length - 1]
      const len = (c: Clip) => (c.out - c.in) / c.speed
      return {
        ...p, clips: p.clips.map((c) => ({
          ...c,
          ...(c === first && a.in != null ? { fadeIn: Math.min(a.in as number, len(c) / 2) } : {}),
          ...(c === last && a.out != null ? { fadeOut: Math.min(a.out as number, len(c) / 2) } : {}),
        })),
      }
    },
    describe: (a) => {
      const w = a.target === 'music' ? L('music', 'गाना') : L('video', 'वीडियो')
      const parts = [a.in != null ? `in ${a.in}s` : '', a.out != null ? `out ${a.out}s` : ''].filter(Boolean).join(', ')
      return L(`Fade ${w.en} ${parts}`, `${w.hi} फ़ेड ${parts}`)
    },
  },
  {
    name: 'rotate_flip', group: 'edit', covers: ['Rotate', 'Flip'],
    say: 'Turn clips by 90/180/270 degrees and/or mirror them (flip).',
    words: ['rotate', 'turn', 'flip', 'mirror', 'ghumao', 'ulta', 'seedha', 'घुमाओ', 'उल्टा'],
    params: { type: 'object', props: { clips: CLIPS, degrees: { type: 'integer', min: -360, max: 360, desc: 'turn by this many degrees (multiple of 90)' }, flip: { type: 'string', enum: ['horizontal', 'vertical', 'none'] } } },
    run(p, a, ctx) {
      if (a.degrees == null && (a.flip == null || a.flip === 'none')) throw new AgentError('Rotate by how much, or flip which way?', 'कितना घुमाना है या किधर उल्टा करना है?')
      return mapClips(p, resolveClips(p, a.clips, ctx), (c) => ({
        ...(a.degrees != null ? { rotate: ((((c.rotate + Math.round((a.degrees as number) / 90) * 90) % 360) + 360) % 360) as Clip['rotate'] } : {}),
        ...(a.flip === 'horizontal' ? { flipH: !c.flipH } : a.flip === 'vertical' ? { flipV: !c.flipV } : {}),
      }), ctx, true)
    },
    describe: (a) => { const c = clipsSay(a.clips); return L(`${a.degrees != null ? `Rotate ${a.degrees}°` : ''}${a.flip && a.flip !== 'none' ? ` flip ${a.flip}` : ''} ${c.en}`.trim(), `${c.hi}: ${a.degrees != null ? `${a.degrees}° घुमाएँ` : ''}${a.flip && a.flip !== 'none' ? ' उल्टा करें' : ''}`) },
  },
  {
    name: 'fit', group: 'look', covers: ['fit'],
    say: 'Fit the whole picture in the frame (bars) or fill the frame (edges cut).',
    words: ['fit', 'fill', 'full screen', 'black bars', 'poora', 'bhar do'],
    params: { type: 'object', props: { clips: CLIPS, mode: { type: 'string', enum: ['fit', 'fill'] } }, required: ['mode'] },
    run: (p, a, ctx) => mapClips(p, resolveClips(p, a.clips, ctx), () => ({ fit: a.mode as Clip['fit'] }), ctx, true),
    describe: (a) => { const c = clipsSay(a.clips); return L(`${a.mode === 'fill' ? 'Fill the frame' : 'Fit in the frame'}: ${c.en}`, `${c.hi}: ${a.mode === 'fill' ? 'पूरा फ़्रेम भरें' : 'फ़्रेम में फ़िट करें'}`) },
  },
  {
    name: 'set_aspect', group: 'project', covers: ['Format'],
    say: 'Video shape: 9:16 (Reels/Shorts), 16:9 (YouTube), 1:1, 4:5, original…',
    words: ['format', 'aspect', 'ratio', '9:16', '16:9', '1:1', 'reel', 'short', 'shorts', 'vertical', 'square', 'youtube', 'instagram', 'khada', 'आकार'],
    params: { type: 'object', props: { aspect: { type: 'string', enum: ASPECTS } }, required: ['aspect'] },
    run: (p, a) => ({ ...p, settings: { ...p.settings, aspect: a.aspect as AspectRatio } }),
    describe: (a) => L(`Video shape ${a.aspect}`, `वीडियो का आकार ${a.aspect}`),
  },
  {
    name: 'set_background', group: 'project',
    say: 'What shows around the picture: "black", "white", "blur" or a colour.',
    words: ['background', 'bg', 'peeche', 'blur background', 'बैकग्राउंड'],
    params: { type: 'object', props: { background: { type: 'string', desc: 'black, white, blur or a colour like red / #ff0000' } }, required: ['background'] },
    run(p, a) {
      const v = String(a.background).toLowerCase()
      const bg = v === 'blur' || v === 'black' || v === 'white' ? v : colorOf(v)
      if (!bg) throw new AgentError(`"${a.background}" is not a background colour.`, `"${a.background}" कोई बैकग्राउंड रंग नहीं है।`)
      return { ...p, settings: { ...p.settings, background: bg } }
    },
    describe: (a) => L(`Background: ${a.background}`, `बैकग्राउंड: ${a.background}`),
  },
  {
    name: 'add_text', group: 'add', covers: ['Text'],
    say: 'Add a text / title on the video at a time, for some seconds, at the top, middle or bottom.',
    words: ['text', 'title', 'likho', 'likh do', 'naam', 'heading', 'टेक्स्ट', 'लिखो', 'लिख दो', 'शीर्षक', 'write'],
    params: {
      type: 'object',
      props: {
        text: { type: 'string', max: 300 }, at: AT, duration: { type: 'number', min: 0.5, max: 600, desc: 'seconds, default 3' },
        position: { type: 'string', enum: ['top', 'middle', 'bottom'] }, color: { type: 'string' }, size: { type: 'string', enum: ['small', 'medium', 'large'] },
        animation: { type: 'string', enum: ANIMS }, fill: { type: 'string', enum: FILLS },
      }, required: ['text'],
    },
    run(p, a, ctx, after) {
      const text = String(a.text).trim()
      if (!text) throw new AgentError('What should the text say?', 'टेक्स्ट में क्या लिखना है?')
      const tot = total(p)
      if (!tot) throw new AgentError('Add a video first, then the text.', 'पहले वीडियो जोड़ें, फिर टेक्स्ट।')
      const start = Math.min(timeOf(p, a.at, ctx), Math.max(0, tot - 0.5))
      const end = Math.max(start + 0.5, Math.min(tot, start + ((a.duration as number) ?? 3)))
      const style: TextStyle = { ...defaultTextStyle(), ...(colorOf(a.color) ? { color: colorOf(a.color)! } : {}), ...(a.size ? { size: a.size === 'small' ? 0.045 : a.size === 'large' ? 0.09 : 0.06 } : {}), ...(a.fill ? { fill: a.fill as TextFill } : {}) }
      const anim = (a.animation as TextAnim) ?? 'fade'
      const l: TextLayer = {
        id: uid(), type: 'text', text, subtitle: false, start, end, style,
        box: { x: 0.5, y: a.position === 'top' ? 0.14 : a.position === 'bottom' ? 0.82 : 0.5, scale: 1, rotation: 0, opacity: 1 },
        animIn: anim, animOut: anim === 'none' ? 'none' : 'fade', frame: null, words: null,
      }
      after.select = { type: 'layer', id: l.id }
      return { ...p, layers: [...p.layers, l] }
    },
    describe(a, ctx) {
      const at = a.at === 'playhead' || a.at == null ? fmt(ctx.playhead) : a.at === 'start' ? '0s' : a.at === 'end' ? 'end' : fmt(a.at as number)
      return L(`Text "${a.text}" at ${at} for ${(a.duration as number) ?? 3}s${a.position ? `, ${a.position}` : ''}`, `${at} पर "${a.text}" टेक्स्ट, ${(a.duration as number) ?? 3} सेकंड${a.position ? `, ${a.position === 'top' ? 'ऊपर' : a.position === 'bottom' ? 'नीचे' : 'बीच में'}` : ''}`)
    },
  },
  {
    name: 'style_text', group: 'text', covers: ['Style', 'Caption style', 'Animation'],
    say: 'Change how text or subtitles look: color, size, bold, gold/tiranga fill, animation, word-by-word highlight (karaoke).',
    words: ['style', 'font', 'color', 'size', 'bada', 'chhota', 'bold', 'karaoke', 'highlight', 'animation', 'subtitle style', 'caption style', 'golden', 'tiranga'],
    params: {
      type: 'object',
      props: {
        texts: TEXTS, color: { type: 'string' }, size: { type: 'string', enum: ['small', 'medium', 'large', 'bigger', 'smaller'] }, bold: { type: 'boolean' },
        fill: { type: 'string', enum: [...FILLS, 'none'] }, animation: { type: 'string', enum: ANIMS }, words: { type: 'string', enum: [...WORD_STYLES, 'none'], desc: 'word-by-word highlight' },
        position: { type: 'string', enum: ['top', 'middle', 'bottom'] },
      }, required: ['texts'],
    },
    run(p, a, ctx) {
      const hits = new Set(resolveTexts(p, a.texts, ctx).map((l) => l.id))
      const ok = unlockedLayers(p)
      return {
        ...p, layers: p.layers.map((l) => {
          if (!hits.has(l.id) || l.type !== 'text' || !ok(l)) return l
          const s = { ...l.style }
          const c = colorOf(a.color)
          if (a.color != null && !c) throw new AgentError(`"${a.color}" is not a colour.`, `"${a.color}" कोई रंग नहीं है।`)
          if (c) s.color = c
          if (a.size === 'small') s.size = 0.045; else if (a.size === 'medium') s.size = 0.06; else if (a.size === 'large') s.size = 0.09
          else if (a.size === 'bigger') s.size = Math.min(0.2, s.size * 1.3); else if (a.size === 'smaller') s.size = Math.max(0.02, s.size / 1.3)
          if (typeof a.bold === 'boolean') s.bold = a.bold
          if (a.fill) s.fill = a.fill === 'none' ? null : (a.fill as TextFill)
          return {
            ...l, style: s,
            ...(a.animation ? { animIn: a.animation as TextAnim, animOut: a.animation === 'none' ? 'none' as TextAnim : 'fade' as TextAnim } : {}),
            ...(a.words ? { words: a.words === 'none' ? null : { style: a.words as WordFxStyle, color: l.words?.color ?? '#ffd60a', caps: l.words?.caps, emoji: l.words?.emoji } } : {}),
            ...(a.position && !l.frame ? { box: { ...l.box, y: a.position === 'top' ? 0.14 : a.position === 'bottom' ? (l.subtitle ? 0.86 : 0.82) : 0.5 } } : {}),
          }
        }),
      }
    },
    describe(a) {
      const parts = ['color', 'size', 'fill', 'animation', 'words', 'position'].filter((k) => a[k] != null).map((k) => `${k} ${a[k]}`)
      if (typeof a.bold === 'boolean') parts.push(a.bold ? 'bold' : 'not bold')
      return L(`Text style (${a.texts}): ${parts.join(', ')}`, `टेक्स्ट स्टाइल (${a.texts}): ${parts.join(', ')}`)
    },
  },
  {
    name: 'delete_texts', group: 'text',
    say: 'Delete text items or subtitles.',
    words: ['delete text', 'remove text', 'text hatao', 'subtitle hatao', 'mita'],
    params: { type: 'object', props: { texts: TEXTS }, required: ['texts'] },
    run(p, a, ctx) {
      const ok = unlockedLayers(p)
      const ids = new Set(resolveTexts(p, a.texts, ctx).filter(ok).map((l) => l.id))
      return { ...p, layers: p.layers.filter((l) => !ids.has(l.id)) }
    },
    describe: (a) => L(`Delete text: ${a.texts}`, `टेक्स्ट हटाएँ: ${a.texts}`),
  },
  {
    name: 'add_sticker', group: 'add', covers: ['Stickers'],
    say: 'Add an emoji sticker on the video at a time.',
    words: ['sticker', 'emoji', 'स्टिकर'],
    params: { type: 'object', props: { emoji: { type: 'string', max: 16 }, at: AT, duration: { type: 'number', min: 0.5, max: 600 } }, required: ['emoji'] },
    run(p, a, ctx, after) {
      const tot = total(p)
      if (!tot) throw new AgentError('Add a video first.', 'पहले वीडियो जोड़ें।')
      const start = Math.min(timeOf(p, a.at, ctx), Math.max(0, tot - 0.5))
      const l: Layer = { id: uid(), type: 'sticker', emoji: String(a.emoji), start, end: Math.max(start + 0.5, Math.min(tot, start + ((a.duration as number) ?? 3))), box: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 }, animIn: 'pop', animOut: 'fade' }
      after.select = { type: 'layer', id: l.id }
      return { ...p, layers: [...p.layers, l] }
    },
    describe: (a) => L(`Sticker ${a.emoji}`, `स्टिकर ${a.emoji}`),
  },
  {
    name: 'split_at', group: 'edit', covers: ['Split'],
    say: 'Cut the main video into two at these timeline times (seconds).',
    words: ['split', 'cut', 'kaato', 'kaat do', 'todo', 'काटो', 'काट दो', 'तोड़ो'],
    params: { type: 'object', props: { times: { type: 'array', items: AT, maxItems: 200 } }, required: ['times'] },
    run(p, a, ctx) {
      if (p.main?.locked) throw new AgentError('The main video row is locked.', 'मुख्य वीडियो की पंक्ति लॉक है।')
      let clips = p.clips
      let made = 0
      for (const raw of a.times as unknown[]) {
        const t = timeOf({ ...p, clips }, raw, ctx)
        const it = layoutClips(clips).items.find((x) => t > x.start + MIN_CLIP && t < x.start + x.dur - MIN_CLIP)
        if (!it) continue
        const c = it.clip
        const local = t - it.start
        const base = c.ramp ? { ramp: null } : {}
        const at = c.in + local * c.speed
        if (at - c.in < MIN_CLIP || c.out - at < MIN_CLIP) continue
        const left = { ...c, ...base, out: at, transition: null, fadeOut: 0 }
        const right = { ...c, ...base, id: uid(), in: at, fadeIn: 0, gap: undefined }
        clips = clips.flatMap((x) => (x.id === c.id ? [left, right] : [x]))
        made++
      }
      if (!made) throw new AgentError('Nothing to cut there (too close to a clip edge, or past the end).', 'वहाँ काटने को कुछ नहीं (क्लिप के किनारे के बहुत पास या वीडियो के बाद)।')
      return { ...p, clips }
    },
    describe: (a, ctx) => { const ts = (a.times as unknown[]).map((x) => (x === 'playhead' ? fmt(ctx.playhead) : typeof x === 'number' ? fmt(x) : String(x))).join(', '); return L(`Cut at ${ts}`, `${ts} पर काटें`) },
  },
  {
    name: 'delete_clips', group: 'edit', covers: ['Delete'],
    say: 'Delete whole clips from the main video.',
    words: ['delete', 'remove', 'hatao', 'hata do', 'nikalo', 'mitao', 'हटाओ', 'हटा दो', 'निकालो'],
    params: { type: 'object', props: { clips: CLIPS }, required: ['clips'] },
    run(p, a, ctx) {
      if (p.main?.locked) throw new AgentError('The main video row is locked.', 'मुख्य वीडियो की पंक्ति लॉक है।')
      const ids = new Set(resolveClips(p, a.clips, ctx))
      if (ids.size >= p.clips.length) throw new AgentError('That would delete the whole video. Delete fewer clips, or start a new project.', 'इससे पूरी वीडियो हट जाएगी। कम क्लिप हटाएँ या नया प्रोजेक्ट बनाएँ।')
      return { ...p, clips: p.clips.filter((c) => !ids.has(c.id)) }
    },
    describe: (a) => { const c = clipsSay(a.clips); return L(`Delete ${c.en}`, `${c.hi} हटाएँ`) },
  },
  {
    name: 'delete_range', group: 'edit', covers: ['Trim'],
    say: 'Remove a stretch of time from the video (from..to seconds); what comes after moves up, text and captions move with it.',
    words: ['remove part', 'cut out', 'trim', 'beech ka', 'hissa', 'part hatao', 'se tak', 'from', 'to', 'trim karo', 'ट्रिम', 'हिस्सा'],
    params: { type: 'object', props: { from: AT, to: AT }, required: ['from', 'to'] },
    run(p, a, ctx) {
      if (p.main?.locked) throw new AgentError('The main video row is locked.', 'मुख्य वीडियो की पंक्ति लॉक है।')
      const from = timeOf(p, a.from, ctx), to = timeOf(p, a.to, ctx)
      const [s, e] = from < to ? [from, to] : [to, from]
      if (e - s < 0.05) throw new AgentError('That stretch is empty.', 'वह हिस्सा खाली है।')
      if (s <= 0.01 && e >= total(p) - 0.01) throw new AgentError('That would remove the whole video.', 'इससे पूरी वीडियो हट जाएगी।')
      const cuts: CutRange[] = []
      for (const it of layoutClips(p.clips).items) {
        const a0 = Math.max(s, it.start), b0 = Math.min(e, it.start + it.dur)
        if (b0 - a0 < 0.01) continue
        const c = it.clip
        cuts.push({ clipId: c.id, from: c.in + (a0 - it.start) * c.speed, to: c.in + (b0 - it.start) * c.speed })
      }
      if (!cuts.length) throw new AgentError('Nothing is there to remove.', 'वहाँ हटाने को कुछ नहीं है।')
      return applyCuts(p, cuts).project
    },
    describe: (a, ctx) => { const f = timeOfSay(a.from, ctx), t = timeOfSay(a.to, ctx); return L(`Remove ${f} to ${t}`, `${f} से ${t} तक हटाएँ`) },
  },
  {
    name: 'trim_clip', group: 'edit',
    say: 'Shorten one clip: cut seconds off its start and/or end.',
    words: ['trim', 'shorten', 'chhota', 'start se', 'end se', 'shuru se', 'aakhir se', 'छोटा'],
    params: { type: 'object', props: { clip: CLIPS, cut_start: SEC('seconds to cut from its start', 3600), cut_end: SEC('seconds to cut from its end', 3600) }, required: ['clip'] },
    run(p, a, ctx) {
      if (!a.cut_start && !a.cut_end) throw new AgentError('How many seconds to cut, from the start or the end?', 'शुरू से या आख़िर से कितने सेकंड काटने हैं?')
      return mapClips(p, resolveClips(p, a.clip, ctx), (c) => {
        const inn = c.in + ((a.cut_start as number) ?? 0) * c.speed
        const out = c.out - ((a.cut_end as number) ?? 0) * c.speed
        if ((out - inn) / c.speed < MIN_CLIP) throw new AgentError('The clip would be too short.', 'क्लिप बहुत छोटी हो जाएगी।')
        return { in: inn, out }
      })
    },
    describe: (a) => { const c = clipsSay(a.clip); return L(`Trim ${c.en}: ${a.cut_start ? `${a.cut_start}s off the start ` : ''}${a.cut_end ? `${a.cut_end}s off the end` : ''}`, `${c.hi}: ${a.cut_start ? `शुरू से ${a.cut_start} सेकंड ` : ''}${a.cut_end ? `आख़िर से ${a.cut_end} सेकंड` : ''} काटें`) },
  },
  {
    name: 'duplicate_clip', group: 'edit', covers: ['Duplicate'],
    say: 'Copy clips (the copy comes right after each).',
    words: ['duplicate', 'copy', 'double', 'dobara', 'copy karo', 'कॉपी'],
    params: { type: 'object', props: { clips: CLIPS }, required: ['clips'] },
    run(p, a, ctx) {
      if (p.main?.locked) throw new AgentError('The main video row is locked.', 'मुख्य वीडियो की पंक्ति लॉक है।')
      const ids = new Set(resolveClips(p, a.clips, ctx))
      return { ...p, clips: p.clips.flatMap((c) => (ids.has(c.id) ? [c, { ...c, id: uid(), gap: undefined }] : [c])) }
    },
    describe: (a) => { const c = clipsSay(a.clips); return L(`Duplicate ${c.en}`, `${c.hi} की कॉपी`) },
  },
  {
    name: 'move_clip', group: 'edit', covers: ['Move / swap', 'Swap'],
    say: 'Move clip number "clip" to position "to" (1 = first). Or swap two clips with swap: true.',
    words: ['move', 'swap', 'order', 'aage', 'peeche', 'jagah', 'badlo', 'shift'],
    params: { type: 'object', props: { clip: { type: 'integer', min: 1, max: 9999 }, to: { type: 'integer', min: 1, max: 9999 }, swap: { type: 'boolean' } }, required: ['clip', 'to'] },
    run(p, a) {
      if (p.main?.locked) throw new AgentError('The main video row is locked.', 'मुख्य वीडियो की पंक्ति लॉक है।')
      const n = p.clips.length
      const i = (a.clip as number) - 1, j = Math.min(n, a.to as number) - 1
      if (i < 0 || i >= n) throw new AgentError(`There is no clip ${a.clip}.`, `क्लिप ${a.clip} नहीं है।`)
      if (i === j) return p
      const clips = [...p.clips]
      if (a.swap) [clips[i], clips[j]] = [clips[j], clips[i]]
      else { const [c] = clips.splice(i, 1); clips.splice(j, 0, c) }
      return { ...p, clips }
    },
    describe: (a) => (a.swap ? L(`Swap clip ${a.clip} and clip ${a.to}`, `क्लिप ${a.clip} और ${a.to} की जगह बदलें`) : L(`Move clip ${a.clip} to place ${a.to}`, `क्लिप ${a.clip} को ${a.to} नंबर पर ले जाएँ`)),
  },
  {
    name: 'camera_move', group: 'look', covers: ['Camera moves', 'Zoom & move'],
    say: `Cinematic camera move on clips: ${CAMERA_PRESETS.map((c) => c.id).join(', ')}; or "none".`,
    words: ['camera', 'zoom in', 'zoom out', 'push', 'shake', 'handheld', 'earthquake', 'tilt', 'pan', 'cinematic move', 'कैमरा', 'ज़ूम'],
    params: { type: 'object', props: { clips: CLIPS, move: { type: 'string', desc: 'push, pull, crash, handheld, impact, quake, dutch, spin, slideR, slideL, rise or none' }, strength: { type: 'number', min: 0.1, max: 1 } }, required: ['move'] },
    run(p, a, ctx) {
      const none = /^(none|off|remove)$/i.test(String(a.move))
      const f = none ? null : findNamed(CAMERA_PRESETS, String(a.move))
      if (!none && (!f || f.score < 0.4)) throw new AgentError(`No camera move called "${a.move}".`, `"${a.move}" नाम का कोई कैमरा मूव नहीं है।`)
      const s = (a.strength as number) ?? 0.6
      return mapClips(p, resolveClips(p, a.clips, ctx), (c) => (f ? { pos: null, keys: cameraKeys(c, f.item.id as CameraId, s), camera: { id: f.item.id, strength: s } } : { keys: undefined, camera: null }), ctx, true)
    },
    describe: (a) => { const f = findNamed(CAMERA_PRESETS, String(a.move)), c = clipsSay(a.clips); return f ? L(`Camera move "${f.item.name}" on ${c.en}`, `${c.hi} पर "${f.item.name}" कैमरा मूव`) : L(`Remove camera moves from ${c.en}`, `${c.hi} से कैमरा मूव हटाएँ`) },
  },
  {
    name: 'ken_burns', group: 'look', covers: ['Photo'],
    say: 'Slow pan & zoom on photo clips: zoom-in, zoom-out, pan-left, pan-right, pan-up, pan-down or none.',
    words: ['ken burns', 'photo zoom', 'photo move', 'pan', 'slideshow'],
    params: { type: 'object', props: { clips: CLIPS, move: { type: 'string', enum: [...BURNS, 'none'] } }, required: ['move'] },
    run(p, a, ctx) {
      const ids = resolveClips(p, a.clips, ctx).filter((id) => ctx.sources[p.clips.find((c) => c.id === id)!.sourceId]?.kind === 'image')
      if (!ids.length) throw new AgentError('That only works on photos, and those clips are videos.', 'यह सिर्फ़ फ़ोटो पर चलता है; ये क्लिप वीडियो हैं।')
      return mapClips(p, ids, () => ({ kenBurns: a.move === 'none' ? null : (a.move as KenBurns) }))
    },
    describe: (a) => L(`Photo move ${a.move}`, `फ़ोटो मूव ${a.move}`),
  },
  {
    name: 'add_marker', group: 'edit', covers: ['marker'],
    say: 'Put a named marker (chapter) on the timeline.',
    words: ['marker', 'chapter', 'mark', 'nishaan', 'निशान'],
    params: { type: 'object', props: { at: AT, name: { type: 'string', max: 80 } } },
    run(p, a, ctx) {
      const t = timeOf(p, a.at, ctx)
      const list = p.markers ?? []
      return { ...p, markers: [...list, { id: uid(), t, name: String(a.name ?? `Marker ${list.length + 1}`), color: '#ffcc00' }].sort((x, y) => x.t - y.t) }
    },
    describe: (a, ctx) => L(`Marker "${a.name ?? ''}" at ${timeOfSay(a.at, ctx)}`, `${timeOfSay(a.at, ctx)} पर मार्कर "${a.name ?? ''}"`),
  },
]

function timeOfSay(v: unknown, ctx: AgentCtx) {
  return v === 'playhead' || v == null ? fmt(ctx.playhead) : v === 'start' ? '0s' : v === 'end' ? 'end' : fmt(Number(v))
}

/**
 * Tools that need the user's eyes or a long job (listening for captions, finding faces, removing noise…): the
 * chat opens them for the user, after the other steps. Label = the toolbar label; panel = what the editor opens.
 */
export const OPENABLE: { label: string; panel: string; needs: 'nothing' | 'clip'; words: string[]; say: string }[] = [
  { label: 'Subtitles', panel: 'subtitles', needs: 'nothing', words: ['subtitle', 'subtitles', 'caption', 'captions', 'सबटाइटल', 'कैप्शन'], say: 'make subtitles from the speech (listens to the video)' },
  { label: 'Smart cut', panel: 'smartcut', needs: 'nothing', words: ['silence', 'chup', 'khamoshi', 'pause', 'umm', 'filler', 'smart cut', 'khaali'], say: 'remove silences and filler words, make shorts' },
  { label: 'Auto reframe', panel: 'reframe', needs: 'nothing', words: ['reframe', 'face follow', 'chehra'], say: 'wide video to 9:16 following the face' },
  { label: 'Beat sync', panel: 'beat', needs: 'nothing', words: ['beat', 'beats', 'taal', 'beat sync'], say: 'cut clips on the music beats, beat effects' },
  { label: 'AI Dub', panel: 'ai', needs: 'nothing', words: ['dub', 'translate voice', 'voice over', 'anuvad', 'dubbing'], say: 'translate and dub the voice' },
  { label: 'Audio', panel: 'audio', needs: 'nothing', words: ['add music', 'gaana lagao', 'gaana daalo', 'music add', 'song add'], say: 'add music or sound (user picks the file)' },
  { label: 'Watermark', panel: 'watermark', needs: 'nothing', words: ['watermark', 'logo'], say: 'add a watermark or logo' },
  { label: 'Intro/Outro', panel: 'templates', needs: 'nothing', words: ['intro', 'outro'], say: 'add an intro or outro' },
  { label: 'Slideshow', panel: 'slideshow', needs: 'nothing', words: ['slideshow'], say: 'photo slideshow settings' },
  { label: 'Titles', panel: 'text-titles', needs: 'nothing', words: ['festival', 'shayari', 'wedding title', 'diwali', 'holi'], say: 'ready-made titles (festivals, shayari)' },
  { label: 'Showers', panel: 'showers', needs: 'nothing', words: ['shower', 'confetti', 'petals', 'barish'], say: 'falling petals, hearts, confetti' },
  { label: 'Follow tag', panel: 'followtag', needs: 'nothing', words: ['follow tag', 'follow'], say: 'stickers that follow a person' },
  { label: 'Flower bloom', panel: 'bloomadd', needs: 'nothing', words: ['flower', 'bloom', 'phool'], say: 'flower bloom reveal' },
  { label: 'Shape reveal', panel: 'reveal', needs: 'nothing', words: ['shape reveal', 'reveal'], say: 'shape reveal' },
  { label: 'Split screen', panel: 'split', needs: 'nothing', words: ['split screen', 'do video saath'], say: 'two or more videos side by side' },
  { label: 'Main frame', panel: 'frame', needs: 'nothing', words: ['main frame', 'frame'], say: 'where the main video sits on the screen' },
  { label: 'Green screen', panel: 'chroma', needs: 'clip', words: ['green screen', 'chroma'], say: 'remove a green background (on the selected clip)' },
  { label: 'Remove noise', panel: 'noise', needs: 'clip', words: ['noise', 'shor', 'hiss', 'saaf awaaz', 'शोर'], say: 'remove background noise (on the selected clip)' },
  { label: 'Audio effects', panel: 'audiofx', needs: 'clip', words: ['voice changer', 'equalizer', 'echo', 'robot voice', 'awaaz badlo'], say: 'voice changer, equalizer, loudness (selected clip)' },
  { label: 'Remove BG', panel: 'cutout', needs: 'clip', words: ['remove background', 'background hatao', 'cutout', 'bg remove'], say: 'remove the background behind a person (selected clip)' },
  { label: 'Color', panel: 'color', needs: 'clip', words: ['curves', 'hsl', 'color match', 'grade'], say: 'curves, HSL, colour match (selected clip)' },
  { label: 'Crop', panel: 'crop', needs: 'clip', words: ['crop'], say: 'crop the picture (selected clip)' },
  { label: 'Mask', panel: 'mask', needs: 'clip', words: ['mask'], say: 'shape mask (selected clip)' },
]

TOOLS.push({
  name: 'open_tool', group: 'open',
  say: `Open an editor tool for the user when the job needs them or takes long: ${OPENABLE.map((o) => `"${o.label}" (${o.say})`).join('; ')}.`,
  words: OPENABLE.flatMap((o) => o.words),
  params: { type: 'object', props: { tool: { type: 'string', enum: OPENABLE.map((o) => o.label) }, clip: CLIPS }, required: ['tool'] },
  run(p, a, ctx, after) {
    const o = OPENABLE.find((x) => x.label === a.tool)!
    if (o.needs === 'clip') {
      const [id] = resolveClips(p, a.clip ?? 'selected', ctx)
      after.select = { type: 'clip', id }
    } else after.select = null
    after.open = o.panel
    return p
  },
  describe: (a) => L(`Open "${a.tool}" for you to finish`, `"${a.tool}" खोलें, आप पूरा करें`),
})

/** Main toolbar tools the chat doesn't do (viewing aids, recording, wizards that start a new video). */
export const NOT_FOR_CHAT = new Set([
  'Add', 'Overlay', 'Paste track', 'Annotate', 'Select all', 'Add marker', 'Record voice', 'Scopes', 'Preview copies', 'Blur', 'Adjustment layer',
  'Freeze frame', 'Record screen', 'Record camera', 'Slides to video', 'Script to video', 'Mind map to video', 'Audio to video', 'Quiz to video',
  'Data to video', 'Article to video', 'Deep Dive conversation to video',
])

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name) ?? null
