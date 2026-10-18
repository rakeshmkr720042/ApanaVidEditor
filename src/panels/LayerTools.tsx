import type { BlendMode, Layer, MediaLayer } from '../types'
import type { Arrange, Editor } from '../model/useEditor'
import { hasBox, keyIndexAt, keysOf } from '../model/keyframes'
import { fmtTime } from '../lib/format'
import { Chips, Panel } from '../ui/kit'
import { Icon } from '../components/Icon'
import { AnimPicker } from './LayerPanels'
import { t } from '../lib/i18n'

interface P { ed: Editor; onClose: () => void }

/** Bring to front / send to back, against the layers it overlaps in time. */
export function ArrangePanel({ ed, layer, onClose, onToast }: P & { layer: Layer; onToast: (s: string) => void }) {
  const go = (how: Arrange) => {
    if (!ed.arrange(layer.id, how)) onToast(t(how === 'front' || how === 'forward' ? 'Already in front' : 'Already at the back'))
  }
  const btn = (how: Arrange, label: string, icon: 'up' | 'down') => (
    <button className="btn" onClick={() => go(how)}><Icon name={icon} size={18} /> {t(label)}</button>
  )
  return (
    <Panel title="Layer order" onClose={onClose}>
      <p className="muted small">{t('Puts this layer in front of or behind the layers that show at the same time. Rows higher in the timeline are in front.')}</p>
      <div className="row">{btn('front', 'Bring to front', 'up')}{btn('forward', 'One step forward', 'up')}</div>
      <div className="row">{btn('backward', 'One step back', 'down')}{btn('back', 'Send to back', 'down')}</div>
    </Panel>
  )
}

/** Entry and exit animation for an overlay video or photo (fade, slide, pop, zoom, bounce). */
export function MediaAnimPanel({ ed, layer, onClose }: P & { layer: MediaLayer }) {
  return (
    <Panel title="Animation" onClose={onClose}>
      <AnimPicker noType inA={layer.animIn ?? 'none'} outA={layer.animOut ?? 'none'} onChange={(p) => ed.updateLayer<MediaLayer>(layer.id, p)} />
    </Panel>
  )
}

const BLENDS: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' }, { value: 'multiply', label: 'Multiply' }, { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' }, { value: 'soft-light', label: 'Soft light' }, { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' }, { value: 'add', label: 'Add' }, { value: 'difference', label: 'Difference' },
  { value: 'color-dodge', label: 'Color dodge' },
]

/** How an overlay mixes with the video under it. */
export function BlendPanel({ ed, layer, onClose }: P & { layer: MediaLayer }) {
  return (
    <Panel title="Blend" onClose={onClose}>
      <p className="muted small">{t('Screen and Add keep the bright parts (light leaks, fire, sparkles on black); Multiply keeps the dark parts (shapes on white).')}</p>
      <Chips options={BLENDS} value={layer.blend ?? 'normal'} onChange={(blend) => ed.updateLayer<MediaLayer>(layer.id, { blend })} wrap />
    </Panel>
  )
}

/** Keyframes: save the layer's place, size, angle and opacity at moments; it glides between them. */
export function KeyframePanel({ ed, layer, time, onSeek, onClose }: P & { layer: Layer; time: number; onSeek: (t: number) => void }) {
  if (!hasBox(layer)) return null
  const keys = keysOf(layer)
  const on = keyIndexAt(layer, time) >= 0
  const inside = time >= layer.start && time < layer.end
  const prev = [...keys].reverse().find((k) => layer.start + k.t < time - 0.05)
  const next = keys.find((k) => layer.start + k.t > time + 0.05)
  return (
    <Panel title="Keyframes" onClose={onClose}>
      <p className="muted small">
        {keys.length
          ? t('Move the playhead, then drag, resize or turn the layer (or change its opacity): a new keyframe is saved there by itself.')
          : t('Put the playhead where the motion starts and tap Add keyframe. Then move the playhead and change the layer.')}
      </p>
      <div className="row">
        <button className="btn" disabled={!prev} onClick={() => prev && onSeek(layer.start + prev.t)}>◀ {t('Previous')}</button>
        {on
          ? <button className="btn" onClick={() => ed.removeKey(layer.id, time)}>◆ {t('Remove keyframe')}</button>
          : <button className="btn primary" disabled={!inside} onClick={() => ed.addKey(layer.id, time)}>◇ {t('Add keyframe')}</button>}
        <button className="btn" disabled={!next} onClick={() => next && onSeek(layer.start + next.t)}>{t('Next')} ▶</button>
      </div>
      {keys.length > 0 && (
        <div className="row">
          <span className="muted small">{keys.length} {t('keyframes')}: {keys.map((k) => fmtTime(k.t)).join(', ')}</span>
          <button className="btn small" onClick={() => ed.removeKey(layer.id, time, true)}>{t('Remove all')}</button>
        </div>
      )}
      {!inside && <p className="muted small">{t('Move the playhead inside this layer first.')}</p>}
    </Panel>
  )
}
