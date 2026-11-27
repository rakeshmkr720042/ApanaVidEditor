import { useEffect, useRef, useState } from 'react'
import type { Bloom, BloomPhotos, MediaLayer, MediaSource } from '../types'
import type { Editor } from '../model/useEditor'
import { usedSources } from '../lib/relink'
import { Chips, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'
import { FLOWERS, bloomTimes, drawFlower, flowerInfo, type FlowerKind } from '../engine/bloom'
import { bloomLocked, photosMissing, withFlower } from '../model/bloom'
import { isReadyPhoto, readyPhotosOf, readyUrl, usesReadyPhotos } from '../engine/readyFlowers'
import { cutFlower } from '../lib/flowerCut'
import './bloom.css'

/** A small live picture of a flower; the picked one keeps opening again and again. */
function FlowerThumb({ kind, color, live }: { kind: FlowerKind; color: string | null; live: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const c = cv?.getContext('2d')
    if (!cv || !c) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const S = 64
    cv.width = S * dpr; cv.height = S * dpr
    const R = kind === 'sakura' ? 15 : kind === 'lotus' ? 22 : 26
    const draw = (now: number) => {
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.clearRect(0, 0, S, S)
      const tm = now / 1000
      const open = live ? Math.min(1, Math.max(0, ((tm % 4) - 0.4) / 1.8)) : 1
      drawFlower(c, kind, color, open, S / 2, S / 2 + (kind === 'lotus' ? -4 : 0), R, live ? tm : 0)
    }
    if (!live) { draw(0); return }
    let raf = 0
    const loop = (now: number) => { draw(now); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [kind, color, live])
  return <canvas ref={ref} className="bloom-thumb" style={{ width: 64, height: 64 }} aria-hidden />
}

/** The five flower cards. */
export function FlowerPicker({ value, color, onChange }: { value: FlowerKind; color: string | null; onChange: (k: FlowerKind) => void }) {
  return (
    <div className="bloom-flowers" role="radiogroup">
      {FLOWERS.map((f) => (
        <button key={f.value} role="radio" aria-checked={value === f.value} className={value === f.value ? 'on' : ''} onClick={() => onChange(f.value)} data-flower={f.value}>
          <FlowerThumb kind={f.value} color={value === f.value ? color : null} live={value === f.value} />
          <span>{t(f.label)}</span>
          {bloomLocked(f.value) && <em className="bloom-pro">PRO</em>}
        </button>
      ))}
    </div>
  )
}

type Style = 'fill' | 'stay'
const STYLES: { value: Style; label: string }[] = [
  { value: 'fill', label: 'Opens, then fills the screen' }, { value: 'stay', label: 'Stays inside the flower' },
]

type Scene = 'photo' | 'garden' | 'video'
const SCENES: { value: Scene; label: string }[] = [
  { value: 'photo', label: '📷 Real flower, from my photos' },
  { value: 'garden', label: '🌷 Flower garden, camera goes to one bud' }, { value: 'video', label: 'Only the flower, over my video' },
]

/** What the real-photo bloom needs to add a photo: the loaded files, a way to add one to the project and to take one out. */
export interface PhotoTools {
  sources: Record<string, MediaSource>
  importSource: (f: File) => Promise<MediaSource | null>
  /** Takes a cut-out the user removed out of the project, when nothing else uses it. */
  forget?: (id: string) => void
}

const SLOTS: { key: 'bud' | 'half' | 'open' | 'full'; label: string; need?: boolean }[] = [
  { key: 'bud', label: 'Bud (closed)', need: true }, { key: 'half', label: 'Half open' },
  { key: 'open', label: 'Open' }, { key: 'full', label: 'Fully open', need: true },
]
type SlotKey = (typeof SLOTS)[number]['key']

/**
 * Four photo slots for a real-photo bloom, from the closed bud to the fully open flower. Each picked photo is cut
 * out on the device (the background goes, see lib/flowerCut.ts) and added to the project as a PNG. A flower with
 * ready photos (the rose) starts with those; the user's own photo in any slot replaces them.
 */
export function FlowerPhotos({ value, onChange, tools }: { value: Bloom; onChange: (b: Bloom) => void; tools: PhotoTools }) {
  const [busy, setBusy] = useState<SlotKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const slot = useRef<SlotKey>('bud')
  const ph = value.photos ?? null
  const ready = readyPhotosOf(value.flower)
  const onReady = usesReadyPhotos(ph) && !!ph
  const set = (next: BloomPhotos | null) => onChange({ ...value, photo: true, garden: true, photos: next })
  const drop = (id: string | null | undefined) => { if (id && !isReadyPhoto(id)) tools.forget?.(id) }
  const put = (k: SlotKey, id: string | null) => {
    // the user's own photo replaces the ready ones (a set is one flower); the ready garden stays behind it
    const base: Partial<BloomPhotos> = onReady && id ? { garden: ph?.garden ?? null } : { ...ph }
    const old = ph?.[k]
    const next = { bud: '', full: '', ...base, [k]: id ?? (k === 'bud' || k === 'full' ? '' : null) } as BloomPhotos
    set(next)
    if (old && old !== id) drop(old)
  }
  const pick = async (f: File) => {
    const k = slot.current
    setBusy(k); setError(null)
    try {
      const cut = await cutFlower(f)
      const s = await tools.importSource(new File([cut.blob], `flower-${k}.png`, { type: 'image/png' }))
      if (s) put(k, s.id)
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('Could not cut out this photo'))
    } finally { setBusy(null) }
  }
  const urlOf = (id: string | null | undefined) => (!id ? null : isReadyPhoto(id) ? readyUrl(id) : tools.sources[id]?.url ?? null)
  const own = !!ph && !onReady && SLOTS.some((sl) => ph[sl.key])
  return (
    <div className="bloom-photos">
      {onReady
        ? <p className="muted small">{t('Ready real flower photos are in. To use your own flower instead, tap a photo and pick yours.')}</p>
        : <p className="muted small">{t('Add photos of one real flower (your own photos): a closed bud, and the same kind fully open. Half open and open make the bloom smoother. A plain or blurred background works best; it is cut away on your device.')}</p>}
      <div className="bloom-slots">
        {SLOTS.map((sl) => {
          const id = ph?.[sl.key]
          const url = urlOf(id)
          return (
            <div key={sl.key} className={`bloom-slot${url ? ' has' : ''}`} data-slot={sl.key}>
              <button className="bloom-slot-pic" disabled={busy !== null} onClick={() => { slot.current = sl.key; input.current?.click() }} aria-label={t(sl.label)}>
                {busy === sl.key ? <span className="small">{t('Cutting out…')}</span> : url ? <img src={url} alt="" /> : <span className="bloom-plus">+</span>}
              </button>
              <span className="small">{t(sl.label)}{sl.need ? ' *' : ''}</span>
              {url && !onReady && <button className="bloom-slot-x" onClick={() => put(sl.key, null)} aria-label={t('Remove')} title={t('Remove')}>✕</button>}
            </div>
          )
        })}
      </div>
      {own && (
        <div className="bloom-photo-actions">
          <button className="btn small" onClick={() => { SLOTS.forEach((sl) => drop(ph?.[sl.key])); set(ready ? { ...ready } : null) }}>
            {ready ? `🌸 ${t('Back to the ready photos')}` : `🗑 ${t('Remove all my flower photos')}`}
          </button>
        </div>
      )}
      {!ph?.bud && !ph?.full && ready && !onReady && (
        <button className="btn small" onClick={() => set({ ...ready })}>🌸 {t('Use the ready photos')}</button>
      )}
      {error && <p className="small bloom-error">{error}</p>}
      {photosMissing(value) && <p className="muted small">* {t('Needed: the bud and the fully open flower.')}</p>}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f) }} />
    </div>
  )
}

/** Colour, opening, petals and wind of a bloom (used when adding one and for a selected one). */
export function BloomControls({ value, onChange, begin, end, photos }: { value: Bloom; onChange: (b: Bloom) => void; begin?: () => void; end?: () => void; photos?: PhotoTools }) {
  const b = value
  const info = flowerInfo(b.flower)
  const scene: Scene = b.photo && photos ? 'photo' : b.garden ? 'garden' : 'video'
  const scenes = photos ? SCENES : SCENES.filter((x) => x.value !== 'photo')
  return (
    <>
      <p className="muted small">{t('Background')}</p>
      <Chips options={scenes} value={scene} onChange={(s) => onChange({ ...b, garden: s !== 'video', photo: s === 'photo', photos: s === 'photo' && !b.photos?.bud && !b.photos?.full ? (readyPhotosOf(b.flower) ?? b.photos) : b.photos })} wrap />
      {scene === 'photo' && photos && <FlowerPhotos value={b} onChange={onChange} tools={photos} />}
      {scene !== 'photo' && <p className="muted small">{t('Petal colour')}</p>}
      {scene !== 'photo' && <>
      <div className="bloom-colors">
        <button className={`swatch${b.color === null ? ' on' : ''}`} style={{ background: info.color }} onClick={() => onChange({ ...b, color: null })} aria-label={t('Natural')} />
        {info.colors.slice(1).map((c) => (
          <button key={c} className={`swatch${b.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => onChange({ ...b, color: c })} aria-label={c} />
        ))}
        <label className="swatch picker" aria-label={t('Custom colour')}>
          <input type="color" value={(b.color ?? info.color).slice(0, 7)} onChange={(e) => onChange({ ...b, color: e.target.value })} />
        </label>
      </div>
      </>}
      <Chips options={STYLES} value={b.fill ? 'fill' : 'stay'} onChange={(s) => onChange({ ...b, fill: s === 'fill' })} wrap />
      <Slider label="Blooming time" min={0.8} max={5} step={0.1} value={b.open} format={(v) => `${v.toFixed(1)} s`} onStart={begin} onEnd={end} onChange={(v) => onChange({ ...b, open: v })} />
      <Slider label="Flower size" min={0.3} max={1} step={0.01} value={b.size} format={(v) => `${Math.round(v * 100)}%`} onStart={begin} onEnd={end} onChange={(v) => onChange({ ...b, size: v })} />
      <Slider label="Falling petals" min={0} max={150} step={1} value={b.petals} format={(v) => `${Math.round(v)}`} onStart={begin} onEnd={end} onChange={(v) => onChange({ ...b, petals: Math.round(v) })} />
      {b.petals > 0 && <Slider label="Petals keep falling for" min={1} max={12} step={0.5} value={b.seconds} format={(v) => `${v.toFixed(1)} s`} onStart={begin} onEnd={end} onChange={(v) => onChange({ ...b, seconds: v })} />}
      {b.petals > 0 && <Slider label="Wind" min={-1} max={1} step={0.05} value={b.wind} format={(v) => (Math.abs(v) < 0.03 ? t('None') : v < 0 ? `← ${Math.round(-v * 100)}%` : `${Math.round(v * 100)}% →`)} onStart={begin} onEnd={end} onChange={(v) => onChange({ ...b, wind: v })} />}
      <p className="muted small">{t('The photo comes out at')} {bloomTimes(b).emerge.toFixed(1)} s</p>
    </>
  )
}

/** A selected flower bloom: change the flower and how it opens, or take the bloom off. */
export function BloomEditPanel({ ed, layer, onClose, onLocked, importSource }: { ed: Editor; layer: MediaLayer; onClose: () => void; onLocked: () => void; importSource?: (f: File) => Promise<MediaSource | null> }) {
  const b = layer.bloom!
  const set = (nb: Bloom) => {
    if (nb.flower !== b.flower && bloomLocked(nb.flower)) { onLocked(); return }
    ed.updateLayer<MediaLayer>(layer.id, { bloom: nb })
  }
  return (
    <Panel title="Flower bloom" onClose={onClose} tall>
      <FlowerPicker value={b.flower} color={b.color} onChange={(flower) => set({ ...withFlower(b, flower), color: null, wind: flower === 'sakura' && b.wind === 0 ? 0.4 : b.wind })} />
      <BloomControls value={b} onChange={set} begin={ed.begin} end={ed.end} photos={importSource ? { sources: ed.sources, importSource, forget: (id) => forgetUnused(ed, id) } : undefined} />
      <Toggle label="Flower bloom on" value onChange={() => ed.updateLayer<MediaLayer>(layer.id, { bloom: null })} />
    </Panel>
  )
}

/** Takes a removed flower cut-out out of the project's media, unless something in the project still uses it. */
export function forgetUnused(ed: Editor, id: string) {
  // the edit is committed first; check on the next tick against the project as it is then
  setTimeout(() => { if (!usedSources(ed.projectRef.current).has(id)) ed.removeSource(id) }, 0)
}
