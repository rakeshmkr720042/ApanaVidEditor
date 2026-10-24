import { useEffect, useMemo, useRef, useState } from 'react'
import type { Backdrop, ChromaKey, Clip, MediaLayer, MediaSource } from '../types'
import type { Editor } from '../model/useEditor'
import { defaultAdjust, sourceAt } from '../model/timeline'
import { colorParams } from '../engine/filters'
import { Grader } from '../engine/gl'
import { colorAt, defaultChroma, detectKey, grabFrame, hexRgb, smallPixels, toChroma, tuneKey } from '../engine/chromakey'
import { loadSource } from '../lib/media'
import { saveMedia } from '../lib/db'
import { Chips, ColorRow, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

export type GreenTarget = { kind: 'clip'; clip: Clip } | { kind: 'layer'; layer: MediaLayer }

const NEUTRAL = colorParams(defaultAdjust(), null, 1)
const SWATCHES = [
  { c: '#00b140', label: 'Green' }, { c: '#00ff00', label: 'Bright green' },
  { c: '#0047bb', label: 'Blue' }, { c: '#0000ff', label: 'Bright blue' },
]

/** Seconds of the source shown at timeline time `at`, and the source span the item covers (for sampling frames). */
function sourceSpan(ed: Editor, target: GreenTarget, at: number) {
  if (target.kind === 'clip') {
    const it = ed.layout.items.find((x) => x.clip.id === target.clip.id)
    if (!it) return { now: target.clip.in, from: target.clip.in, to: target.clip.out }
    const local = Math.max(0, Math.min(it.dur - 0.05, at - it.start))
    return { now: sourceAt(target.clip, local).time, from: target.clip.in, to: target.clip.out }
  }
  const l = target.layer
  const sp = l.speed ?? 1
  const local = Math.max(0, Math.min(l.end - l.start - 0.05, at - l.start))
  return { now: l.in + local * sp, from: l.in, to: l.in + (l.end - l.start) * sp }
}

/**
 * Green screen: finds the screen colour by itself, removes it (preview over a checkerboard, the same shader as the
 * video), and puts a photo, video or colour behind the person that stays with this clip or layer.
 */
export function GreenScreenPanel({ ed, target, time, onToast, onClose }: { ed: Editor; target: GreenTarget; time: number; onToast: (s: string) => void; onClose: () => void }) {
  const item = target.kind === 'clip' ? target.clip : target.layer
  const key: ChromaKey = item.chroma ?? defaultChroma()
  const backdrop = item.backdrop ?? null
  const src = ed.sources[item.sourceId]
  const id = item.id

  const setKey = (patch: Partial<ChromaKey>) => {
    if (target.kind === 'clip') ed.updateClip(id, (c) => ({ chroma: { ...(c.chroma ?? defaultChroma()), ...patch } }))
    else ed.updateLayer<MediaLayer>(id, (l) => ({ chroma: { ...l.chroma, ...patch } }))
  }
  const setBackdrop = (b: Backdrop | null) => {
    if (target.kind === 'clip') ed.updateClip(id, { backdrop: b })
    else ed.updateLayer<MediaLayer>(id, { backdrop: b })
  }
  const patchBackdrop = (patch: Partial<Backdrop>) => backdrop && setBackdrop({ ...backdrop, ...patch })

  // ---- sample frames: the one at the playhead (shown) plus two more for detection
  const [frame, setFrame] = useState<HTMLCanvasElement | null>(null)
  const [samples, setSamples] = useState<ImageData[]>([])
  const [status, setStatus] = useState<string | null>(t('Looking at the video…'))
  const at = useRef(time)
  at.current = time
  const keyRef = useRef(key)
  keyRef.current = key
  useEffect(() => {
    if (!src) return
    let live = true
    ;(async () => {
      const span = sourceSpan(ed, target, at.current)
      const main = await grabFrame(src, span.now)
      if (!live) return
      if (!main) { setStatus(t('Could not read this video. Pick the screen colour below.')); return }
      setFrame(main)
      const more = src.kind === 'video'
        ? await Promise.all([0.2, 0.8].map((f) => grabFrame(src, span.from + (span.to - span.from) * f, 240)))
        : []
      if (!live) return
      const px = [main, ...more].filter((c): c is HTMLCanvasElement => !!c).map((c) => smallPixels(c))
      setSamples(px)
      if (keyRef.current.enabled) { setStatus(null); return }
      // first time: find the screen and switch it on by itself
      const found = detectKey(px, keyRef.current)
      if (found) {
        setKey(found.key)
        setStatus(found.kind === 'blue' ? t('Blue screen found and removed ✓') : found.kind === 'green' ? t('Green screen found and removed ✓') : t('Screen colour found and removed ✓'))
      } else setStatus(t('No green or blue screen found. Tap the background in the picture to pick its colour.'))
    })()
    return () => { live = false }
  }, [src?.id, id]) // eslint-disable-line react-hooks/exhaustive-deps

  const autoDetect = () => {
    const found = samples.length ? detectKey(samples, key) : null
    if (found) { setKey(found.key); setStatus(t('Settings tuned for this video ✓')) }
    else setStatus(t('No green or blue screen found. Tap the background in the picture to pick its colour.'))
  }
  const applyColor = (c: string) => {
    setKey(samples.length ? tuneKey(samples, c, key) : { ...key, enabled: true, color: c })
    setStatus(null)
  }

  // ---- mini preview: same shader as the video, over a checkerboard, the backdrop, or as it was
  const [view, setView] = useState<'checker' | 'backdrop' | 'original'>('checker')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const grader = useMemo(() => Grader.create(document.createElement('canvas')), [])
  const bdSrc: MediaSource | undefined = backdrop?.kind === 'media' && backdrop.sourceId ? ed.sources[backdrop.sourceId] : undefined
  const [bdFrame, setBdFrame] = useState<{ id: string; c: HTMLCanvasElement | null } | null>(null)
  useEffect(() => {
    if (!bdSrc) return
    let live = true
    grabFrame(bdSrc, backdrop?.in ?? 0).then((c) => { if (live) setBdFrame({ id: bdSrc.id, c }) })
    return () => { live = false }
  }, [bdSrc?.id, backdrop?.in]) // eslint-disable-line react-hooks/exhaustive-deps
  const bdImg = bdSrc && bdFrame?.id === bdSrc.id ? bdFrame.c : null
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !frame) return
    cv.width = frame.width; cv.height = frame.height
    const c = cv.getContext('2d')!
    c.clearRect(0, 0, cv.width, cv.height)
    if (view === 'original' || !key.enabled || !grader) { c.drawImage(frame, 0, 0); return }
    if (view === 'backdrop' && backdrop) {
      if (backdrop.kind === 'color') { c.fillStyle = backdrop.color; c.fillRect(0, 0, cv.width, cv.height) }
      else if (bdImg) {
        const s = backdrop.fit === 'fit' ? Math.min(cv.width / bdImg.width, cv.height / bdImg.height) : Math.max(cv.width / bdImg.width, cv.height / bdImg.height)
        c.save()
        if (backdrop.blur) c.filter = `blur(${(backdrop.blur * Math.min(cv.width, cv.height) * 0.02).toFixed(1)}px)`
        c.drawImage(bdImg, (cv.width - bdImg.width * s) / 2, (cv.height - bdImg.height * s) / 2, bdImg.width * s, bdImg.height * s)
        c.restore()
      }
    }
    grader.resize(frame.width, frame.height)
    grader.drawGraded(frame, NEUTRAL, 0, toChroma(key))
    c.drawImage(grader.canvas, 0, 0)
  }, [frame, view, key, backdrop, bdImg, grader])

  const full = useMemo(() => (frame ? frame.getContext('2d')!.getImageData(0, 0, frame.width, frame.height) : null), [frame])
  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!full) return
    const r = e.currentTarget.getBoundingClientRect()
    applyColor(colorAt(full, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height))
    onToast(t('Colour picked from the picture'))
  }

  // ---- background: photo or video from the device
  const fileRef = useRef<HTMLInputElement>(null)
  const addBackground = async (file: File) => {
    try {
      const s = await loadSource(file, file.name)
      if (s.kind === 'audio') { onToast(t('Pick a photo or video')); return }
      ed.addSource(s)
      await saveMedia(s)
      setBackdrop({ kind: 'media', color: backdrop?.color ?? '#000000', sourceId: s.id, in: 0, fit: 'fill', blur: 0 })
      if (!key.enabled) setKey({ enabled: true })
      setView('backdrop')
      onToast(s.kind === 'image' ? t('Background photo added behind the person') : t('Background video added behind the person'))
    } catch (e) { onToast((e as Error).message) }
  }

  const blue = (() => { const [r, g, b] = hexRgb(key.color); return b > g && b > r })()
  const chip = backdrop ? backdrop.kind : 'none'

  return (
    <Panel title="Green screen" onClose={onClose} tall
      actions={<button className="btn small" onClick={autoDetect} disabled={!samples.length}>✨ {t('Auto')}</button>}>
      <Toggle label="Remove the green screen" value={key.enabled} onChange={(enabled) => setKey({ enabled })} />
      {status && <p className="muted small gs-status">{status}</p>}
      {frame && (
        <div className="gs-preview">
          <canvas ref={canvasRef} className="gs-canvas" onPointerDown={pick} aria-label={t('Tap the background to pick its colour')} />
          <Chips options={[{ value: 'checker', label: 'See-through' }, ...(backdrop ? [{ value: 'backdrop' as const, label: 'With background' }] : []), { value: 'original', label: 'Original' }]}
            value={view} onChange={setView} />
          <p className="muted small">{t('Tap the background in the picture to pick its exact colour.')}</p>
        </div>
      )}
      <span className="field-label">{t('Screen colour')}</span>
      <div className="colors">
        {SWATCHES.map((s) => (
          <button key={s.c} className={`swatch${key.color === s.c ? ' on' : ''}`} style={{ background: s.c }} onClick={() => applyColor(s.c)} aria-label={t(s.label)} title={t(s.label)} />
        ))}
        <span className="swatch on" style={{ background: key.color }} title={key.color} aria-label={t('Current colour')} />
        <label className="swatch picker"><input type="color" value={key.color} onChange={(e) => applyColor(e.target.value)} /></label>
      </div>
      <Slider label="Strength" min={0} max={0.6} value={key.similarity} format={(v) => `${Math.round((v / 0.6) * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => setKey({ similarity: v, enabled: true })} />
      <Slider label="Edge softness" min={0} max={0.3} value={key.smoothness} format={(v) => `${Math.round((v / 0.3) * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => setKey({ smoothness: v })} />
      <Slider label={blue ? 'Remove blue edge' : 'Remove green edge'} min={0} max={1} value={key.spill ?? 0.5} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => setKey({ spill: v })} />
      <Slider label="Edge shrink" min={0} max={1} value={key.shrink ?? 0} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => setKey({ shrink: v })} />

      <span className="field-label">{t('Background')}</span>
      <Chips options={[{ value: 'none', label: 'None' }, { value: 'media', label: 'Photo / video' }, { value: 'color', label: 'Colour' }]} value={chip}
        onChange={(v) => {
          if (v === 'none') setBackdrop(null)
          else if (v === 'media') fileRef.current?.click()
          else { setBackdrop({ kind: 'color', color: backdrop?.color && backdrop.color !== '#000000' ? backdrop.color : '#30b0ff' }); setView('backdrop') }
        }} />
      <input ref={fileRef} type="file" accept="video/*,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) addBackground(f); e.target.value = '' }} />
      {backdrop?.kind === 'color' && <ColorRow value={backdrop.color} onChange={(c) => c && patchBackdrop({ color: c })} />}
      {backdrop?.kind === 'media' && (
        <>
          <div className="row">
            <span className="muted small gs-name">{bdSrc ? bdSrc.name : t('Missing file')}</span>
            <button className="btn small" onClick={() => fileRef.current?.click()}>{t('Change')}</button>
          </div>
          <Chips options={[{ value: 'fill', label: 'Fill screen' }, { value: 'fit', label: 'Fit whole picture' }]} value={backdrop.fit ?? 'fill'} onChange={(fit) => patchBackdrop({ fit })} />
          <Slider label="Background blur" min={0} max={1} value={backdrop.blur ?? 0} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => patchBackdrop({ blur: v })} />
          {bdSrc?.kind === 'video' && (
            <>
              <Slider label="Background starts at" min={0} max={Math.max(0.1, bdSrc.duration - 0.1)} value={backdrop.in ?? 0} format={(v) => `${v.toFixed(1)}s`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => patchBackdrop({ in: v })} />
              <p className="muted small">{t('The background video plays silently and starts again if it is shorter than this clip.')}</p>
            </>
          )}
        </>
      )}
      <p className="muted small">{target.kind === 'clip'
        ? t('The background stays with this clip when you move, split or trim it.')
        : t('The background fills the screen behind this layer and moves with it.')}</p>
    </Panel>
  )
}
