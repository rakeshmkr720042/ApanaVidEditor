import type { AudioLayer, Clip, Layer, MediaLayer, MediaSource, Project, TextAnim, TextLayer, TextStyle } from '../types'
import type { TemplateRecord } from './db'
import { clipDuration, defaultAdjust, layoutClips, newClip } from '../model/timeline'
import { defaultChroma } from '../engine/chromakey'
import { defaultTextStyle } from '../engine/text'
import { restoreSource } from './media'
import { uid } from './format'

export type TemplateKind = TemplateRecord['kind']

/** Settings of the quick intro/outro builder. Files are kept so the template can be edited later. */
export interface TemplateDesign {
  duration: number
  theme: string
  background: 'solid' | 'gradient' | 'media'
  color1: string
  color2: string
  bgMedia: File | null
  title: string
  tagline: string
  cta: string
  textColor: string
  anim: TextAnim
  logo: File | null
  teaser: File | null // "next video" picture or clip, shown in a rounded box
  music: File | null
}

export interface Theme { id: string; name: string; font: string; accent: string; ctaBg: string; colors: [string, string] }

export const THEMES: Theme[] = [
  { id: 'bold', name: 'Bold', font: 'Anton', accent: '#ffe600', ctaBg: '#ff0033', colors: ['#ff3d7f', '#7a2cff'] },
  { id: 'clean', name: 'Clean', font: 'Montserrat', accent: '#e0f2ff', ctaBg: '#007aff', colors: ['#0f2027', '#2c5364'] },
  { id: 'neon', name: 'Neon', font: 'Righteous', accent: '#7df9ff', ctaBg: '#af52de', colors: ['#0b0b2b', '#3a0ca3'] },
  { id: 'desi', name: 'Desi', font: 'Yatra One', accent: '#ffd166', ctaBg: '#d00000', colors: ['#ff6b00', '#c9184a'] },
  { id: 'news', name: 'News', font: 'Bebas Neue', accent: '#ffcc00', ctaBg: '#e5383b', colors: ['#111111', '#3a3a3a'] },
  { id: 'elegant', name: 'Elegant', font: 'Playfair Display', accent: '#f1e3c6', ctaBg: '#a2845e', colors: ['#1d1a16', '#4a3f35'] },
]

export const defaultDesign = (kind: TemplateKind): TemplateDesign => ({
  duration: kind === 'intro' ? 4 : 6,
  theme: 'bold',
  background: 'gradient',
  color1: THEMES[0].colors[0],
  color2: THEMES[0].colors[1],
  bgMedia: null,
  title: kind === 'intro' ? 'My Channel' : 'Thanks for watching!',
  tagline: kind === 'intro' ? 'New videos every week' : 'Watch my next video',
  cta: kind === 'intro' ? '' : 'SUBSCRIBE 🔔',
  textColor: '#ffffff',
  anim: 'pop',
  logo: null,
  teaser: null,
  music: null,
})

/** Square background picture (fills any frame shape) in a solid colour or a soft diagonal gradient. */
export async function paintBackground(d: Pick<TemplateDesign, 'background' | 'color1' | 'color2'>): Promise<File> {
  const c = document.createElement('canvas')
  c.width = c.height = 1280
  const ctx = c.getContext('2d')!
  if (d.background === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, 1280, 1280)
    g.addColorStop(0, d.color1)
    g.addColorStop(1, d.color2)
    ctx.fillStyle = g
  } else ctx.fillStyle = d.color1
  ctx.fillRect(0, 0, 1280, 1280)
  if (d.background === 'gradient') {
    const r = ctx.createRadialGradient(640, 520, 40, 640, 640, 900)
    r.addColorStop(0, 'rgba(255,255,255,0.18)')
    r.addColorStop(1, 'rgba(0,0,0,0.25)')
    ctx.fillStyle = r
    ctx.fillRect(0, 0, 1280, 1280)
  }
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the background'))), 'image/png'))
  return new File([blob], 'background.png', { type: 'image/png' })
}

export type SourceLoader = (file: Blob, name: string) => Promise<MediaSource>

/** Turns builder settings into clips and layers on a 0-based timeline. */
export async function buildFromDesign(d: TemplateDesign, load: SourceLoader) {
  const theme = THEMES.find((x) => x.id === d.theme) ?? THEMES[0]
  const sources: MediaSource[] = []
  const bg = d.background === 'media' && d.bgMedia ? await load(d.bgMedia, d.bgMedia.name) : await load(await paintBackground(d), 'background.png')
  sources.push(bg)
  const clip: Clip = { ...newClip(bg, uid()), fit: 'fill', volume: d.music ? 0 : 1 }
  clip.out = bg.kind === 'image' ? d.duration : Math.min(d.duration, bg.duration)
  const total = clipDuration(clip)
  const layers: Layer[] = []

  const logo = d.logo ? await load(d.logo, d.logo.name) : null
  const teaser = d.teaser ? await load(d.teaser, d.teaser.name) : null
  const music = d.music ? await load(d.music, d.music.name) : null
  for (const s of [logo, teaser, music]) if (s) sources.push(s)

  const media = (src: MediaSource, x: number, y: number, scale: number, start: number, mask: MediaLayer['mask'], border: number): MediaLayer => ({
    id: uid(), type: 'media', sourceId: src.id, in: 0, start, end: src.kind === 'video' ? Math.min(total, start + src.duration) : total,
    box: { x, y, scale, rotation: 0, opacity: 1 }, volume: 0, chroma: defaultChroma(),
    mask, border, adjust: defaultAdjust(), filter: null, filterAmount: 1,
  })
  const text = (value: string, y: number, start: number, style: Partial<TextStyle>, animIn: TextAnim): TextLayer => ({
    id: uid(), type: 'text', text: value, subtitle: false, start: Math.min(start, Math.max(0, total - 0.5)), end: total,
    style: { ...defaultTextStyle(), ...style }, box: { x: 0.5, y, scale: 1, rotation: 0, opacity: 1 }, animIn, animOut: 'fade',
  })

  // layout: a "next video" box takes the middle, otherwise a logo sits above the title
  let yTitle = 0.42, yTag = 0.56, yCta = 0.74, titleSize = 0.1
  if (teaser) {
    layers.push(media(teaser, 0.5, 0.48, 0.95, 0.3, 'rounded', 1))
    if (logo) layers.push(media(logo, 0.1, 0.12, 0.28, 0, 'none', 0))
    yTitle = 0.12; yTag = 0.81; yCta = 0.91; titleSize = 0.07
  } else if (logo) {
    layers.push(media(logo, 0.5, 0.3, 0.6, 0, 'none', 0))
    yTitle = 0.56; yTag = 0.67; yCta = 0.82; titleSize = 0.085
  }
  if (d.title.trim()) layers.push(text(d.title, yTitle, 0.15, { font: theme.font, size: titleSize, color: d.textColor, shadow: true }, d.anim))
  if (d.tagline.trim()) layers.push(text(d.tagline, yTag, 0.6, { font: 'Poppins', size: 0.045, color: theme.accent, bold: false, shadow: true }, 'fade'))
  if (d.cta.trim()) layers.push(text(d.cta, yCta, 1, { font: 'Poppins', size: 0.045, color: '#ffffff', background: theme.ctaBg, shadow: false }, 'bounce'))
  if (music) {
    const a: AudioLayer = {
      id: uid(), type: 'audio', sourceId: music.id, in: 0, start: 0, end: Math.min(total, music.duration),
      volume: 0.8, fadeIn: 0, fadeOut: Math.min(1, total / 3), label: music.name.replace(/\.[^.]+$/, ''), kind: 'music',
    }
    layers.push(a)
  }
  return { clips: [clip], layers, sources, duration: total }
}

const sourceIdOf = (l: Layer) => (l.type === 'media' || l.type === 'audio' || l.type === 'wave' ? l.sourceId : null)
/** The photo/video behind a green screen clip or layer. */
const backdropIdOf = (o: Clip | Layer) => ('backdrop' in o && o.backdrop?.kind === 'media' ? o.backdrop.sourceId ?? null : null)

/** The media a set of clips and layers needs, ready to store in a template. */
export function templateMedia(clips: Clip[], layers: Layer[], sources: Record<string, MediaSource>): TemplateRecord['media'] {
  const ids = new Set([...clips.map((c) => c.sourceId), ...[...layers.map(sourceIdOf), ...[...clips, ...layers].map(backdropIdOf)].filter((x): x is string => !!x)])
  return [...ids].filter((id) => sources[id]).map((id) => {
    const { url: _url, file, ...meta } = sources[id] // eslint-disable-line @typescript-eslint/no-unused-vars
    void _url
    return { id, file, meta }
  })
}

const FADE = { type: 'fade', duration: 0.5 }

/**
 * Puts a template at the start or end of a project. Template media gets fresh ids, everything
 * already in the project moves later by the intro's length, and a short fade joins the two.
 */
export function placeTemplate(p: Project, tpl: TemplateRecord, where: 'start' | 'end') {
  const ids = new Map(tpl.media.map((m) => [m.id, uid()]))
  const sources = tpl.media.map((m) => restoreSource({ ...m.meta, id: ids.get(m.id)! }, m.file))
  const mapId = (id: string) => ids.get(id) ?? id
  const mapBd = <T extends { backdrop?: Clip['backdrop'] }>(o: T): T => (o.backdrop?.sourceId ? { ...o, backdrop: { ...o.backdrop, sourceId: mapId(o.backdrop.sourceId) } } : o)
  const tClips: Clip[] = tpl.clips.map((c) => mapBd({ ...c, id: uid(), sourceId: mapId(c.sourceId), fromTemplate: true }))
  const has = p.clips.length > 0
  let clips: Clip[]
  if (where === 'start') {
    if (has && !tClips[tClips.length - 1].transition) tClips[tClips.length - 1] = { ...tClips[tClips.length - 1], transition: FADE }
    clips = [...tClips, ...p.clips]
  } else {
    const old = has && !p.clips[p.clips.length - 1].transition
      ? [...p.clips.slice(0, -1), { ...p.clips[p.clips.length - 1], transition: FADE }]
      : p.clips
    clips = [...old, ...tClips]
  }
  // the last clip never carries a transition
  if (clips.length) clips[clips.length - 1] = { ...clips[clips.length - 1], transition: null }
  const { items } = layoutClips(clips)
  const tplStart = where === 'start' ? 0 : items[p.clips.length]?.start ?? 0
  const shift = where === 'start' && has ? items[tClips.length].start : 0

  const moved = p.layers.map((l) => (shift ? ({ ...l, start: l.start + shift, end: l.end + shift } as Layer) : l))
  const added = tpl.layers.map((l) => {
    const copy = { ...l, id: uid(), start: l.start + tplStart, end: l.end + tplStart } as Layer
    if (copy.type === 'media' || copy.type === 'audio' || copy.type === 'wave') copy.sourceId = mapId(copy.sourceId)
    if ('box' in copy) copy.box = { ...copy.box }
    return copy.type === 'media' ? mapBd(copy) : copy
  })
  const wm = p.watermark && shift && p.watermark.range === 'custom'
    ? { ...p.watermark, start: p.watermark.start + shift, end: p.watermark.end + shift }
    : p.watermark
  return { project: { ...p, clips, layers: [...moved, ...added], watermark: wm }, sources }
}

const DEFAULT_KEY = (k: TemplateKind) => `tpl.default.${k}`

export function getDefaultTemplate(kind: TemplateKind) {
  try { return localStorage.getItem(DEFAULT_KEY(kind)) } catch { return null }
}

export function setDefaultTemplate(kind: TemplateKind, id: string | null) {
  try { if (id) localStorage.setItem(DEFAULT_KEY(kind), id); else localStorage.removeItem(DEFAULT_KEY(kind)) } catch { /* private mode */ }
}
