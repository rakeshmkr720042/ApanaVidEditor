import { useEffect, useMemo, useState } from 'react'
import type { Adjust, AspectRatio, AudioLayer, Clip, MediaLayer } from '../types'
import type { Editor } from '../model/useEditor'
import { defaultAdjust, SPEED_RAMPS } from '../model/timeline'
import { ADJUST_SLIDERS, colorParams, FILTER_GROUPS, FILTERS } from '../engine/filters'
import { Grader } from '../engine/gl'
import { TRANSITION_GROUPS, TRANSITIONS } from '../engine/transitions'
import { Chips, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

interface P { ed: Editor; onClose: () => void }

export function SpeedPanel({ ed, clip, onClose }: P & { clip: Clip }) {
  const [tab, setTab] = useState<'normal' | 'curve'>(clip.ramp ? 'curve' : 'normal')
  return (
    <Panel title="Speed" onClose={onClose}>
      <Chips options={[{ value: 'normal', label: 'Normal' }, { value: 'curve', label: 'Speed ramp' }]} value={tab} onChange={setTab} />
      {tab === 'normal' ? (
        <>
          <Slider
            label="Speed" min={-2} max={2} step={0.01} value={Math.log2(clip.speed)}
            format={(v) => `${Math.pow(2, v).toFixed(2)}x`}
            onStart={ed.begin} onEnd={ed.end}
            onChange={(v) => ed.updateClip(clip.id, { speed: Math.round(Math.pow(2, v) * 100) / 100, ramp: null })}
          />
          <Chips options={SPEED_CHIPS} value={clip.ramp ? null : clip.speed} onChange={(s) => ed.updateClip(clip.id, { speed: s, ramp: null })} wrap />
        </>
      ) : (
        <div className="grid ramps">
          <button className={!clip.ramp ? 'on' : ''} onClick={() => ed.updateClip(clip.id, { ramp: null })}>
            <svg viewBox="0 0 80 30"><path d="M0 15H80" /></svg>{t('None')}
          </button>
          {SPEED_RAMPS.map((r) => {
            const pts = r.points.map((s, i) => `${(i / (r.points.length - 1)) * 80},${28 - (Math.log2(s) + 2) * 6.5}`).join(' ')
            return (
              <button key={r.id} className={clip.ramp === r.id ? 'on' : ''} onClick={() => ed.updateClip(clip.id, { ramp: r.id })}>
                <svg viewBox="0 0 80 30"><polyline points={pts} /></svg>{r.name}
              </button>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

/** Speed of a video or sound on its own track (no speed ramps there). */
export function LayerSpeedPanel({ ed, layer, onClose }: P & { layer: MediaLayer | AudioLayer }) {
  const src = ed.sources[layer.sourceId]
  // the layer keeps the same part of the video, so it gets shorter when faster and longer when slower
  const set = (s: number) => ed.updateLayer<MediaLayer | AudioLayer>(layer.id, (l) => {
    const len = ((l.end - l.start) * (l.speed ?? 1)) / s
    const room = src ? (src.duration - l.in) / s : Infinity
    return { speed: s, end: l.start + Math.max(0.2, Math.min(room, len)) }
  })
  return (
    <Panel title="Speed" onClose={onClose}>
      <Slider
        label="Speed" min={-2} max={2} step={0.01} value={Math.log2(layer.speed ?? 1)}
        format={(v) => `${Math.pow(2, v).toFixed(2)}x`}
        onStart={ed.begin} onEnd={ed.end}
        onChange={(v) => set(Math.round(Math.pow(2, v) * 100) / 100)}
      />
      <Chips options={SPEED_CHIPS} value={layer.speed ?? 1} onChange={set} wrap />
    </Panel>
  )
}

const SPEED_CHIPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].map((s) => ({ value: s, label: `${s}x` }))

export function VolumePanel({ ed, target, onClose }: P & { target: { kind: 'clip'; clip: Clip } | { kind: 'layer'; id: string; volume: number; fadeIn?: number; fadeOut?: number } }) {
  const vol = target.kind === 'clip' ? target.clip.volume : target.volume
  const fi = target.kind === 'clip' ? target.clip.fadeIn : target.fadeIn
  const fo = target.kind === 'clip' ? target.clip.fadeOut : target.fadeOut
  const set = (patch: { volume?: number; fadeIn?: number; fadeOut?: number }) =>
    target.kind === 'clip' ? ed.updateClip(target.clip.id, patch) : ed.updateLayer(target.id, patch)
  return (
    <Panel title="Volume" onClose={onClose} actions={<button className="btn small" onClick={() => set({ volume: vol === 0 ? 1 : 0 })}>{vol === 0 ? '🔈' : '🔇'} {t('Mute')}</button>}>
      <Slider label="Volume" min={0} max={2} value={vol} format={(v) => `${Math.round(v * 100)}%`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ volume: v })} />
      {fi !== undefined && <Slider label="Fade in" min={0} max={5} value={fi} format={(v) => `${v.toFixed(1)}s`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ fadeIn: v })} />}
      {fo !== undefined && <Slider label="Fade out" min={0} max={5} value={fo} format={(v) => `${v.toFixed(1)}s`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ fadeOut: v })} />}
    </Panel>
  )
}

type Gradable = { kind: 'clip'; clip: Clip } | { kind: 'layer'; layer: MediaLayer }

const thumbCache = new Map<string, string>()

function useFilterThumbs(src: string | undefined) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!src) return
    let cancelled = false
    const img = new Image()
    img.onload = async () => {
      const canvas = document.createElement('canvas')
      const g = Grader.create(canvas)
      if (!g) return
      const w = 96, h = Math.round((96 * img.naturalHeight) / img.naturalWidth) || 64
      g.resize(w, h)
      const base = document.createElement('canvas')
      base.width = w; base.height = h
      base.getContext('2d')!.drawImage(img, 0, 0, w, h)
      for (const f of FILTERS) {
        if (cancelled) return
        const key = src + f.id
        if (thumbCache.has(key)) continue
        g.drawGraded(base, colorParams(defaultAdjust(), f.id, 1), 0)
        thumbCache.set(key, canvas.toDataURL('image/jpeg', 0.7))
        if (FILTERS.indexOf(f) % 12 === 11) { force((n) => n + 1); await new Promise((r) => setTimeout(r)) }
      }
      force((n) => n + 1)
    }
    img.src = src
    return () => { cancelled = true }
  }, [src])
  return (id: string) => (src ? thumbCache.get(src + id) : undefined)
}

export function FilterPanel({ ed, target, onClose }: P & { target: Gradable }) {
  const cur = target.kind === 'clip' ? target.clip : target.layer
  const src = ed.sources[cur.sourceId]
  const thumbSrc = src?.thumbs[Math.floor(src.thumbs.length / 2)]
  const thumb = useFilterThumbs(thumbSrc)
  const [group, setGroup] = useState(() => (cur.filter ? FILTERS.find((f) => f.id === cur.filter)?.group : null) ?? FILTER_GROUPS[0])
  const set = (patch: { filter?: string | null; filterAmount?: number }) =>
    target.kind === 'clip' ? ed.updateClip(target.clip.id, patch) : ed.updateLayer(target.layer.id, patch)
  return (
    <Panel
      title="Filters" onClose={onClose} tall
      actions={target.kind === 'clip' && <button className="btn small" onClick={() => ed.updateAllClips(() => ({ filter: cur.filter, filterAmount: cur.filterAmount }))}>{t('Apply to all')}</button>}
    >
      <Chips options={FILTER_GROUPS.map((g) => ({ value: g, label: g }))} value={group} onChange={setGroup} />
      <div className="filter-grid">
        <button className={!cur.filter ? 'on' : ''} onClick={() => set({ filter: null })}>
          <span className="fthumb">{thumbSrc && <img src={thumbSrc} alt="" />}</span>{t('None')}
        </button>
        {FILTERS.filter((f) => f.group === group).map((f) => (
          <button key={f.id} className={cur.filter === f.id ? 'on' : ''} onClick={() => set({ filter: f.id, filterAmount: cur.filter === f.id ? cur.filterAmount : 1 })}>
            <span className="fthumb">{thumb(f.id) ? <img src={thumb(f.id)} alt="" /> : <i />}</span>{f.name}
          </button>
        ))}
      </div>
      {cur.filter && <Slider label="Intensity" min={0} max={1} value={cur.filterAmount} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ filterAmount: v })} />}
    </Panel>
  )
}

export function AdjustPanel({ ed, target, onClose }: P & { target: Gradable }) {
  const cur = target.kind === 'clip' ? target.clip.adjust : target.layer.adjust
  const set = (a: Adjust) => (target.kind === 'clip' ? ed.updateClip(target.clip.id, { adjust: a }) : ed.updateLayer(target.layer.id, { adjust: a }))
  return (
    <Panel
      title="Adjust" onClose={onClose} tall
      actions={<>
        <button className="btn small" onClick={() => set(defaultAdjust())}>{t('Reset')}</button>
        {target.kind === 'clip' && <button className="btn small" onClick={() => ed.updateAllClips(() => ({ adjust: { ...cur } }))}>{t('Apply to all')}</button>}
      </>}
    >
      {ADJUST_SLIDERS.map((s) => (
        <Slider
          key={s.key} label={s.label} min={s.min} max={s.max} value={cur[s.key]} center={s.min < 0}
          format={(v) => (s.key === 'hue' ? `${Math.round(v)}°` : `${Math.round(v * 100)}`)}
          onStart={ed.begin} onEnd={ed.end}
          onChange={(v) => set({ ...cur, [s.key]: v })}
        />
      ))}
    </Panel>
  )
}

export function TransitionPanel({ ed, clip, onClose }: P & { clip: Clip }) {
  const [group, setGroup] = useState(() => TRANSITIONS.find((x) => x.id === clip.transition?.type)?.group ?? TRANSITION_GROUPS[0])
  const dur = clip.transition?.duration ?? 0.6
  return (
    <Panel
      title="Transition" onClose={onClose} tall
      actions={<button className="btn small" onClick={() => ed.updateAllClips(() => ({ transition: clip.transition ? { ...clip.transition } : null }))}>{t('Apply to all')}</button>}
    >
      <Chips options={TRANSITION_GROUPS.map((g) => ({ value: g, label: g }))} value={group} onChange={setGroup} />
      <div className="trans-grid">
        <button className={!clip.transition ? 'on' : ''} onClick={() => ed.updateClip(clip.id, { transition: null })}>{t('None')}</button>
        {TRANSITIONS.filter((x) => x.group === group).map((x) => (
          <button key={x.id} className={clip.transition?.type === x.id ? 'on' : ''} onClick={() => ed.updateClip(clip.id, { transition: { type: x.id, duration: dur } })}>{x.name}</button>
        ))}
      </div>
      {clip.transition && (
        <Slider label="Duration" min={0.1} max={2} value={dur} format={(v) => `${v.toFixed(1)}s`} onStart={ed.begin} onEnd={ed.end}
          onChange={(v) => ed.updateClip(clip.id, { transition: { ...clip.transition!, duration: v } })} />
      )}
    </Panel>
  )
}

const ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: 'original', label: 'Original' }, { value: '9:16', label: '9:16 Reels' }, { value: '16:9', label: '16:9 YouTube' },
  { value: '1:1', label: '1:1 Square' }, { value: '4:5', label: '4:5 Post' }, { value: '3:4', label: '3:4' }, { value: '4:3', label: '4:3' }, { value: '21:9', label: '21:9 Cinema' },
]

export function FormatPanel({ ed, onClose }: P) {
  const s = ed.project.settings
  const bgs = ['black', 'white', 'blur', '#1e3a8a', '#7c2d12', '#14532d', '#831843', '#fde68a']
  const sel = ed.sel?.type === 'clip' ? ed.project.clips.find((c) => c.id === ed.sel!.id) : null
  return (
    <Panel title="Format" onClose={onClose}>
      <span className="field-label">{t('Aspect ratio')}</span>
      <Chips options={ASPECTS} value={s.aspect} onChange={(aspect) => ed.setSettings({ aspect })} wrap />
      <span className="field-label">{t('Background')}</span>
      <div className="colors">
        {bgs.map((b) => (
          <button key={b} className={`swatch${s.background === b ? ' on' : ''}${b === 'blur' ? ' blurbg' : ''}`} style={{ background: b === 'blur' ? undefined : b }} onClick={() => ed.setSettings({ background: b })} aria-label={b}>{b === 'blur' ? '◌' : ''}</button>
        ))}
      </div>
      <Toggle
        label={sel ? 'Fill frame (this clip)' : 'Fill frame (all clips)'}
        value={sel ? sel.fit === 'fill' : ed.project.clips.every((c) => c.fit === 'fill')}
        onChange={(v) => (sel ? ed.updateClip(sel.id, { fit: v ? 'fill' : 'fit' }) : ed.updateAllClips(() => ({ fit: v ? 'fill' : 'fit' })))}
      />
    </Panel>
  )
}

/** Small helpers used by the toolbar for direct (non-panel) clip actions. */
export function useClip(ed: Editor) {
  return useMemo(() => (ed.sel?.type === 'clip' ? ed.project.clips.find((c) => c.id === ed.sel!.id) ?? null : null), [ed.sel, ed.project.clips])
}
