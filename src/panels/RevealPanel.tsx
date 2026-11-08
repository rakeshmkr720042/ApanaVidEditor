import { useRef, useState } from 'react'
import type { MediaSource, ShapeMask, ShapeReveal } from '../types'
import type { Editor } from '../model/useEditor'
import { Chips, ColorRow, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'
import { REVEAL_SHAPE_OPTIONS, defaultReveal } from '../model/reveal'

type Style = 'fill' | 'stay' | 'close'
const STYLES: { value: Style; label: string }[] = [
  { value: 'fill', label: 'Opens, then fills the screen' }, { value: 'stay', label: 'Opens and stays' }, { value: 'close', label: 'Opens, then closes' },
]
const styleOf = (r: ShapeReveal): Style => (r.fill ? 'fill' : r.close > 0 ? 'close' : 'stay')
const withStyle = (r: ShapeReveal, s: Style): ShapeReveal => ({ ...r, fill: s === 'fill', close: s === 'close' ? Math.max(0.4, r.open) : 0 })

/** Opening speed, style, glowing edge, spin and heartbeat of a shape reveal (used by Shape reveal and Mask). */
export function RevealControls({ begin, end, value, onChange }: { begin?: () => void; end?: () => void; value: ShapeReveal; onChange: (r: ShapeReveal) => void }) {
  const r = value
  return (
    <>
      <Chips options={STYLES} value={styleOf(r)} onChange={(s) => onChange(withStyle(r, s))} wrap />
      <Slider label="Opening time" min={0.2} max={4} step={0.05} value={r.open} format={(v) => `${v.toFixed(1)} s`} onStart={begin} onEnd={end} onChange={(v) => onChange({ ...r, open: v })} />
      {r.close > 0 && <Slider label="Closing time" min={0.2} max={4} step={0.05} value={r.close} format={(v) => `${v.toFixed(1)} s`} onStart={begin} onEnd={end} onChange={(v) => onChange({ ...r, close: v })} />}
      <Toggle label="Spin while opening" value={r.spin !== 0} onChange={(v) => onChange({ ...r, spin: v ? 180 : 0 })} />
      <Toggle label="Heartbeat (beats while open)" value={r.pulse} onChange={(v) => onChange({ ...r, pulse: v })} />
      <p className="muted small">{t('Glowing edge')}</p>
      <ColorRow value={r.edge} onChange={(c) => onChange({ ...r, edge: c })} allowNone />
    </>
  )
}

/**
 * Shape reveal: pick a shape and the scene (photo or video) that shows inside it; it goes over the video from
 * the playhead, filling the frame, and opens like a heart opening with that scene inside.
 */
export function RevealPanel({ ed, time, onAdded, onClose, importSource }: {
  ed: Editor; time: number; onClose: () => void
  onAdded: (layerId: string, start: number) => void
  importSource: (f: File) => Promise<MediaSource | null>
}) {
  const [shape, setShape] = useState<ShapeMask['shape']>('heart')
  const [reveal, setReveal] = useState<ShapeReveal>(() => defaultReveal('heart'))
  const [size, setSize] = useState(0.6)
  const visual = Object.values(ed.sources).filter((s) => s.kind !== 'audio')
  const [srcId, setSrcId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const src = srcId ? ed.sources[srcId] : undefined
  const pickShape = (s: ShapeMask['shape']) => { setShape(s); setReveal((r) => ({ ...r, pulse: s === 'heart' ? true : r.pulse, edge: r.edge === null ? null : s === 'heart' ? '#ff2d55' : r.edge })) }
  const add = () => {
    if (!src) return
    const l = ed.addReveal(time, src, shape, reveal, size)
    onAdded(l.id, l.start)
  }
  const name = (s: MediaSource) => `${s.kind === 'image' ? '🖼' : '🎬'} ${s.name.length > 22 ? `${s.name.slice(0, 20)}…` : s.name}`
  return (
    <Panel title="Shape reveal" onClose={onClose} tall>
      <p className="muted small">{t('A shape (heart, star…) opens over your video and the scene you pick shows inside it.')}</p>
      <b className="small">{t('1. Shape')}</b>
      <Chips options={REVEAL_SHAPE_OPTIONS} value={shape} onChange={pickShape} wrap />
      <b className="small">{t('2. Scene inside the shape')}</b>
      {visual.length > 0 && <Chips options={visual.map((s) => ({ value: s.id, label: name(s) }))} value={srcId} onChange={setSrcId} wrap />}
      <button className="btn small" disabled={busy} onClick={() => file.current?.click()}>{busy ? t('Adding…') : t('Pick a photo or video…')}</button>
      <input ref={file} type="file" accept="video/*,image/*" hidden onChange={async (e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (!f) return
        setBusy(true)
        try { const s = await importSource(f); if (s) setSrcId(s.id) } finally { setBusy(false) }
      }} />
      <b className="small">{t('3. How it opens')}</b>
      <Slider label="Shape size" min={0.2} max={1} step={0.01} value={size} format={(v) => `${Math.round(v * 100)}%`} onChange={setSize} />
      <RevealControls value={reveal} onChange={setReveal} />
      <button className="btn primary" disabled={!src} onClick={add}>{src ? t('Add at playhead') : t('Pick the scene first')}</button>
    </Panel>
  )
}
