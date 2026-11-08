import type { Clip, MediaLayer, ShapeMask } from '../types'
import type { Editor } from '../model/useEditor'
import { Chips, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'
import { defaultShapeMask } from '../engine/shapeMask'
import { RevealControls } from './RevealPanel'
import { REVEAL_SHAPE_OPTIONS, defaultReveal } from '../model/reveal'

type Shape = ShapeMask['shape'] | 'none'
const SHAPES: { value: Shape; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Circle' },
  { value: 'linear', label: 'Line' }, { value: 'mirror', label: 'Band' },
  ...REVEAL_SHAPE_OPTIONS.filter((o) => o.value !== 'ellipse' && o.value !== 'rect'),
]
const pct = (v: number) => `${Math.round(v * 100)}%`

/**
 * Mask: only the inside of a shape shows (or the outside with Invert), with a soft edge. On the main video the
 * rest shows the background; on an overlay it shows what is under the overlay.
 */
export function MaskPanel({ ed, target, onClose }: { ed: Editor; target: { kind: 'clip'; clip: Clip } | { kind: 'layer'; layer: MediaLayer }; onClose: () => void }) {
  const m = target.kind === 'clip' ? target.clip.shapeMask ?? null : target.layer.shapeMask ?? null
  const put = (v: ShapeMask | null) => (target.kind === 'clip' ? ed.updateClip(target.clip.id, { shapeMask: v }) : ed.updateLayer<MediaLayer>(target.layer.id, { shapeMask: v }))
  const set = (p: Partial<ShapeMask>) => m && put({ ...m, ...p })
  const pick = (s: Shape) => put(s === 'none' ? null : m ? { ...m, shape: s, ...(s === 'mirror' && m.shape !== 'mirror' ? { w: 1, h: 0.4 } : {}) } : defaultShapeMask(s))
  const sl = (label: string, key: keyof ShapeMask, min: number, max: number, format = pct, center = false) => (
    <Slider label={label} min={min} max={max} step={(max - min) / 400} value={m![key] as number} center={center} format={format} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ [key]: v } as Partial<ShapeMask>)} />
  )
  return (
    <Panel title="Mask" onClose={onClose} tall>
      <Chips options={SHAPES} value={m?.shape ?? 'none'} onChange={pick} wrap />
      {!m && <p className="muted small">{t('Pick a shape: only the part inside it shows. Use it for a spotlight, a split look, a soft vignette or to hide part of the picture.')}</p>}
      {m && (
        <>
          <Toggle label="Invert (show the outside)" value={m.invert} onChange={(v) => set({ invert: v })} />
          {sl('Soft edge', 'feather', 0, 1)}
          {m.shape !== 'linear' && m.shape !== 'mirror' && sl('Width', 'w', 0.05, 1.5)}
          {m.shape !== 'linear' && sl(m.shape === 'mirror' ? 'Band height' : 'Height', 'h', 0.02, 1.5)}
          {sl('Left / right', 'x', 0, 1, (v) => `${Math.round((v - 0.5) * 200)}`)}
          {sl('Up / down', 'y', 0, 1, (v) => `${Math.round((v - 0.5) * 200)}`)}
          {sl('Turn', 'rotation', -180, 180, (v) => `${Math.round(v)}°`, true)}
          {m.shape === 'rect' && sl('Round corners', 'round', 0, 1)}
          {m.shape !== 'linear' && m.shape !== 'mirror' && (
            <>
              <Toggle label="Opening animation (shape reveal)" value={!!m.reveal} onChange={(v) => set({ reveal: v ? defaultReveal(m.shape) : null })} />
              {m.reveal && <RevealControls begin={ed.begin} end={ed.end} value={m.reveal} onChange={(r) => set({ reveal: r })} />}
            </>
          )}
          <button className="btn small" onClick={() => put(defaultShapeMask(m.shape))}>{t('Reset')}</button>
        </>
      )}
    </Panel>
  )
}
