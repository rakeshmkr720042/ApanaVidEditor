import { useEffect, useRef } from 'react'
import type { Bloom, MediaLayer } from '../types'
import type { Editor } from '../model/useEditor'
import { Chips, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'
import { FLOWERS, bloomTimes, drawFlower, flowerInfo, type FlowerKind } from '../engine/bloom'
import { bloomLocked } from '../model/bloom'
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

/** Colour, opening, petals and wind of a bloom (used when adding one and for a selected one). */
export function BloomControls({ value, onChange, begin, end }: { value: Bloom; onChange: (b: Bloom) => void; begin?: () => void; end?: () => void }) {
  const b = value
  const info = flowerInfo(b.flower)
  return (
    <>
      <p className="muted small">{t('Petal colour')}</p>
      <div className="bloom-colors">
        <button className={`swatch${b.color === null ? ' on' : ''}`} style={{ background: info.color }} onClick={() => onChange({ ...b, color: null })} aria-label={t('Natural')} />
        {info.colors.slice(1).map((c) => (
          <button key={c} className={`swatch${b.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => onChange({ ...b, color: c })} aria-label={c} />
        ))}
        <label className="swatch picker" aria-label={t('Custom colour')}>
          <input type="color" value={(b.color ?? info.color).slice(0, 7)} onChange={(e) => onChange({ ...b, color: e.target.value })} />
        </label>
      </div>
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
export function BloomEditPanel({ ed, layer, onClose, onLocked }: { ed: Editor; layer: MediaLayer; onClose: () => void; onLocked: () => void }) {
  const b = layer.bloom!
  const set = (nb: Bloom) => {
    if (nb.flower !== b.flower && bloomLocked(nb.flower)) { onLocked(); return }
    ed.updateLayer<MediaLayer>(layer.id, { bloom: nb })
  }
  return (
    <Panel title="Flower bloom" onClose={onClose} tall>
      <FlowerPicker value={b.flower} color={b.color} onChange={(flower) => set({ ...b, flower, color: null, wind: flower === 'sakura' && b.wind === 0 ? 0.4 : b.wind })} />
      <BloomControls value={b} onChange={set} begin={ed.begin} end={ed.end} />
      <Toggle label="Flower bloom on" value onChange={() => ed.updateLayer<MediaLayer>(layer.id, { bloom: null })} />
    </Panel>
  )
}
