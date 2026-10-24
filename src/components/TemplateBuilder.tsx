import { useEffect, useRef, useState } from 'react'
import type { MediaSource, Project, TextAnim } from '../types'
import type { TemplateRecord } from '../lib/db'
import { Chips, ColorRow, Slider } from '../ui/kit'
import { Icon } from './Icon'
import { t } from '../lib/i18n'
import { useBack } from '../lib/back'
import { uid } from '../lib/format'
import { loadSource } from '../lib/media'
import { layoutClips } from '../model/timeline'
import { Renderer, clipKey, layerKey, outputSize, type FrameImage } from '../engine/renderer'
import { ensureFont } from '../engine/text'
import { THEMES, buildFromDesign, defaultDesign, templateMedia, type TemplateDesign, type TemplateKind } from '../lib/templates'

interface Props {
  project: Project
  sources: Record<string, MediaSource>
  kind: TemplateKind
  editing: TemplateRecord | null
  onClose: () => void
  onSave: (tpl: TemplateRecord) => Promise<void>
}

const ANIMS: { value: TextAnim; label: string }[] = [
  { value: 'pop', label: 'Pop' }, { value: 'zoom', label: 'Zoom' }, { value: 'fade', label: 'Fade' },
  { value: 'slide-up', label: 'Slide up' }, { value: 'bounce', label: 'Bounce' }, { value: 'typewriter', label: 'Typewriter' },
]

// loading a file (thumbnails, waveform) is slow, so each file is read once
const loaded = new WeakMap<Blob, Promise<MediaSource>>()
const painted = new Map<string, Promise<MediaSource>>()

/** Source loader for a design; painted backgrounds are new Blobs each time, so they are keyed by their colours. */
const loaderFor = (d: TemplateDesign) => (file: Blob, name: string) => {
  const key = file.type === 'image/png' && name === 'background.png' ? `${d.background}|${d.color1}|${d.color2}` : null
  let p = key ? painted.get(key) : loaded.get(file)
  if (!p) {
    p = loadSource(file, name)
    if (key) painted.set(key, p); else loaded.set(file, p)
    p.catch(() => { if (key) painted.delete(key); else loaded.delete(file) })
  }
  return p
}

/** A still picture of a source for the preview (first moments of a video). */
async function still(src: MediaSource): Promise<FrameImage | null> {
  try {
    if (src.kind === 'image') {
      const img = await createImageBitmap(src.file)
      return { image: img, width: img.width, height: img.height }
    }
    if (src.kind !== 'video') return null
    const v = document.createElement('video')
    v.muted = true; v.preload = 'auto'; v.src = src.url
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = j })
    v.currentTime = Math.min(0.5, src.duration / 2)
    await new Promise((r) => { v.onseeked = r })
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    v.removeAttribute('src'); v.load()
    return { image: c, width: c.width, height: c.height }
  } catch {
    return null
  }
}

/** Quick builder for a reusable intro or outro screen, with a live preview in the project's shape. */
export function TemplateBuilder({ project, sources, kind: kind0, editing, onClose, onSave }: Props) {
  const [kind, setKind] = useState<TemplateKind>(editing?.kind ?? kind0)
  const [name, setName] = useState(editing?.name ?? (kind0 === 'intro' ? t('My intro') : t('My outro')))
  const [d, setD] = useState<TemplateDesign>(() => (editing?.design as TemplateDesign | undefined) ?? defaultDesign(kind0))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<Renderer | null>(null)
  const files = { bg: useRef<HTMLInputElement>(null), logo: useRef<HTMLInputElement>(null), teaser: useRef<HTMLInputElement>(null), music: useRef<HTMLInputElement>(null) }
  const set = (patch: Partial<TemplateDesign>) => setD((x) => ({ ...x, ...patch }))
  const size = outputSize(project, sources, 360)

  // rebuild + redraw the preview shortly after each change
  useEffect(() => {
    let live = true
    const id = setTimeout(async () => {
      try {
        const b = await buildFromDesign(d, loaderFor(d))
        if (!live) return
        const theme = THEMES.find((x) => x.id === d.theme) ?? THEMES[0]
        await Promise.all([ensureFont(theme.font), ensureFont('Poppins')])
        const frames = new Map<string, FrameImage | null>()
        for (const c of b.clips) frames.set(clipKey(c), await still(b.sources.find((s) => s.id === c.sourceId)!))
        for (const l of b.layers) if (l.type === 'media') frames.set(layerKey(l), await still(b.sources.find((s) => s.id === l.sourceId)!))
        if (!live || !canvas.current) return
        const r = (renderer.current ??= new Renderer(canvas.current))
        r.resize(size.w, size.h)
        const p: Project = { clips: b.clips, layers: b.layers, settings: { aspect: project.settings.aspect, background: 'black', fps: 30 } }
        const srcs = Object.fromEntries(b.sources.map((s) => [s.id, s]))
        // a moment near the end, when every element has animated in
        r.render({ t: Math.max(0, b.duration * 0.85), project: p, items: layoutClips(b.clips).items, sources: srcs, frame: (k) => frames.get(k) ?? null, watermark: null, seed: 0.5 })
        setError(null)
      } catch (e) {
        if (live) setError((e as Error).message)
      }
    }, 250)
    return () => { live = false; clearTimeout(id) }
  }, [d, size.w, size.h, project.settings.aspect]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickTheme = (id: string) => {
    const th = THEMES.find((x) => x.id === id)!
    set({ theme: id, color1: th.colors[0], color2: th.colors[1] })
  }

  const save = async () => {
    setBusy(true)
    try {
      const b = await buildFromDesign(d, loaderFor(d))
      const srcs = Object.fromEntries(b.sources.map((s) => [s.id, s]))
      const thumb = canvas.current?.toDataURL('image/jpeg', 0.7) ?? null
      await onSave({
        id: editing?.id ?? uid(), name: name.trim() || t(kind === 'intro' ? 'My intro' : 'My outro'), kind, updatedAt: Date.now(),
        duration: b.duration, thumb, clips: b.clips, layers: b.layers, media: templateMedia(b.clips, b.layers, srcs), design: d,
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const fileButton = (label: string, file: File | null, key: keyof typeof files, clear: () => void) => (
    <div className="tpl-file">
      <span>{t(label)}</span>
      {file ? <small className="muted">{file.name}</small> : null}
      <button className="btn small" onClick={() => files[key].current?.click()}>{file ? t('Change') : t('Choose')}</button>
      {file && <button className="btn small ghost" onClick={clear} aria-label="Remove">✕</button>}
    </div>
  )

  useBack(true, () => { if (!busy) onClose() })
  return (
    <div className="modal tpl-builder">
      <div className="modal-head">
        <button className="icon-btn" onClick={onClose} aria-label="Cancel"><Icon name="close" /></button>
        <b>{editing ? t('Edit template') : kind === 'intro' ? t('New intro') : t('New outro')}</b>
        <button className="btn small primary" disabled={busy} onClick={save}>{busy ? '…' : t('Save')}</button>
      </div>
      <div className="tpl-preview">
        <canvas ref={canvas} style={{ aspectRatio: `${size.w} / ${size.h}` }} />
      </div>
      <div className="modal-foot tpl-form">
        {error && <p className="error-text">{error}</p>}
        <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Template name')} />
        <Chips options={[{ value: 'intro', label: '▶ Intro' }, { value: 'outro', label: '⏹ Outro' }]} value={kind} onChange={setKind} />
        <span className="field-label">{t('Look')}</span>
        <Chips options={THEMES.map((x) => ({ value: x.id, label: x.name }))} value={d.theme} onChange={pickTheme} />
        <input className="text-input" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder={t('Title (channel name)')} />
        <input className="text-input" value={d.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder={t('Tagline')} />
        <input className="text-input" value={d.cta} onChange={(e) => set({ cta: e.target.value })} placeholder={t('Button text, e.g. SUBSCRIBE 🔔')} />
        <span className="field-label">{t('Text colour')}</span>
        <ColorRow value={d.textColor} onChange={(c) => set({ textColor: c ?? '#ffffff' })} />
        <span className="field-label">{t('Title animation')}</span>
        <Chips options={ANIMS} value={d.anim} onChange={(anim) => set({ anim })} />
        <span className="field-label">{t('Background')}</span>
        <Chips options={[{ value: 'gradient', label: 'Gradient' }, { value: 'solid', label: 'Colour' }, { value: 'media', label: 'Photo / video' }]} value={d.background}
          onChange={(background) => { set({ background }); if (background === 'media' && !d.bgMedia) files.bg.current?.click() }} />
        {d.background !== 'media' && <ColorRow value={d.color1} onChange={(c) => set({ color1: c ?? '#000000' })} />}
        {d.background === 'gradient' && <ColorRow value={d.color2} onChange={(c) => set({ color2: c ?? '#000000' })} />}
        {d.background === 'media' && fileButton('Background photo or video', d.bgMedia, 'bg', () => set({ bgMedia: null, background: 'gradient' }))}
        {fileButton('Logo', d.logo, 'logo', () => set({ logo: null }))}
        {fileButton(kind === 'outro' ? 'Next video preview' : 'Preview clip', d.teaser, 'teaser', () => set({ teaser: null }))}
        {fileButton('Music', d.music, 'music', () => set({ music: null }))}
        <Slider label="Duration" min={2} max={15} step={0.5} value={d.duration} format={(v) => `${v.toFixed(1)} s`} onChange={(v) => set({ duration: v })} />
      </div>
      <input ref={files.bg} type="file" accept="video/*,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) set({ bgMedia: f, background: 'media' }); e.target.value = '' }} />
      <input ref={files.logo} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) set({ logo: f }); e.target.value = '' }} />
      <input ref={files.teaser} type="file" accept="video/*,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) set({ teaser: f }); e.target.value = '' }} />
      <input ref={files.music} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) set({ music: f }); e.target.value = '' }} />
    </div>
  )
}
