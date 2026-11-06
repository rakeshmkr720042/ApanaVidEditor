import type { MainFrame } from '../types'
import type { Editor } from '../model/useEditor'
import { Chips, ColorRow, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'
import { FRAME_PRESETS, FULL_FRAME, keepOn, mainFrameOn, presetRect, scaleFrame, type FramePreset } from '../model/mainFrame'

const pct = (v: number) => `${Math.round(v * 100)}%`

/**
 * Main frame: makes the whole main video smaller and puts it anywhere on the screen (a box of any size, or a
 * 9:16 / 16:9 / 1:1 / 4:5 shape), with round corners, a border and a shadow. The project background shows
 * around it. The box can also be dragged and resized on the preview.
 */
export function MainFramePanel({ ed, W, H, onClose }: { ed: Editor; W: number; H: number; onClose: () => void }) {
  const f = ed.project.main?.frame ?? FULL_FRAME
  const set = (patch: Partial<MainFrame>) => ed.setMain({ frame: { ...f, ...patch } })
  const preset = f.preset ?? 'free'
  // size: 100% = the biggest box of this shape on the screen
  const full = preset === 'free' ? null : presetRect(preset, W, H, 1)
  const size = full ? f.w / full.w : Math.max(f.w, f.h)
  const pick = (p: FramePreset) => {
    if (p === 'free') { set({ preset: 'free' }); return }
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2
    // a new shape keeps the frame's centre; full screen fills it
    const r = presetRect(p, W, H, p === 'full' ? 1 : mainFrameOn(f) && f.preset !== 'full' ? Math.min(1, Math.max(0.3, size)) : 0.9, p === 'full' ? 0.5 : cx, p === 'full' ? 0.5 : cy)
    set({ ...r, preset: p })
  }
  const place = (where: 'center' | 'left' | 'right' | 'top' | 'bottom') => {
    const m = 0.03
    let { x, y } = f
    if (where === 'center') { x = (1 - f.w) / 2; y = (1 - f.h) / 2 }
    if (where === 'left') x = Math.min(m, (1 - f.w) / 2)
    if (where === 'right') x = Math.max(1 - m - f.w, (1 - f.w) / 2)
    if (where === 'top') y = Math.min(m, (1 - f.h) / 2)
    if (where === 'bottom') y = Math.max(1 - m - f.h, (1 - f.h) / 2)
    set(keepOn({ x, y, w: f.w, h: f.h }))
  }
  const on = mainFrameOn(ed.project.main?.frame)
  return (
    <Panel title="Main frame" onClose={onClose}>
      <p className="muted small">{t('Make the whole main video smaller and put it anywhere. Drag the yellow box on the video to move it, drag its corners or sides to resize. It snaps to the centre, the edges and the thirds.')}</p>
      <span className="field-label">{t('Shape')}</span>
      <Chips options={FRAME_PRESETS.map((p) => ({ value: p.value, label: p.label }))} value={preset} onChange={pick} wrap />
      <Chips options={[{ value: 'fill', label: 'Fill (cut edges)' }, { value: 'fit', label: 'Fit (whole video)' }]} value={f.fit} onChange={(v) => set({ fit: v as MainFrame['fit'] })} />
      <Slider label="Size" min={0.1} max={1} step={0.005} value={Math.max(0.1, Math.min(1, size))} format={pct} onStart={ed.begin} onEnd={ed.end}
        onChange={(v) => ed.setMain({ frame: scaleFrame(f, v / (size || 1)) })} />
      <Slider label="Left / right" min={0} max={1} step={0.002} value={f.x + f.w / 2} format={(v) => `${Math.round((v - 0.5) * 200)}`} onStart={ed.begin} onEnd={ed.end}
        onChange={(v) => set(keepOn({ ...f, x: v - f.w / 2 }))} />
      <Slider label="Up / down" min={0} max={1} step={0.002} value={f.y + f.h / 2} format={(v) => `${Math.round((v - 0.5) * 200)}`} onStart={ed.begin} onEnd={ed.end}
        onChange={(v) => set(keepOn({ ...f, y: v - f.h / 2 }))} />
      <div className="row">
        <button className="btn small" onClick={() => place('center')}>{t('Centre')}</button>
        <button className="btn small" onClick={() => place('left')}>◧ {t('Left')}</button>
        <button className="btn small" onClick={() => place('right')}>◨ {t('Right')}</button>
        <button className="btn small" onClick={() => place('top')}>⬒ {t('Top')}</button>
        <button className="btn small" onClick={() => place('bottom')}>⬓ {t('Bottom')}</button>
      </div>
      <Slider label="Round corners" min={0} max={1} step={0.01} value={f.round} format={pct} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ round: v })} />
      <Slider label="Border" min={0} max={1} step={0.01} value={f.border ?? 0} format={pct} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ border: v })} />
      {(f.border ?? 0) > 0 && <ColorRow value={f.borderColor ?? '#ffffff'} onChange={(c) => set({ borderColor: c ?? '#ffffff' })} />}
      <Toggle label="Shadow" value={!!f.shadow} onChange={(v) => set({ shadow: v })} />
      <p className="muted small">{t('Around the frame you see the project background (Format › Background: colour or blur).')}</p>
      <button className="btn small" disabled={!on && !ed.project.main?.frame} onClick={() => ed.setMain({ frame: null })} data-testid="frame-reset">{t('Reset (full screen)')}</button>
    </Panel>
  )
}
