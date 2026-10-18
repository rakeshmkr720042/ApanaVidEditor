import type { CaptionFrame, CaptionFramePreset } from '../types'
import type { Editor } from '../model/useEditor'
import { FRAME_RECTS, defaultFrame } from '../engine/text'
import { Chips, ColorRow, Slider } from '../ui/kit'
import { t } from '../lib/i18n'

const PRESETS: { value: CaptionFramePreset | 'off'; label: string }[] = [
  { value: 'off', label: 'Free' },
  { value: 'bottom', label: '▁ Bottom strip' },
  { value: 'top', label: '▔ Top strip' },
  { value: 'left', label: '▌ Left half' },
  { value: 'right', label: '▐ Right half' },
  { value: 'center', label: '▣ Centre box' },
  { value: 'custom', label: '✥ Custom' },
]

/** Picks where a caption sits (strip, half screen, custom box) and how its frame looks. */
export function CaptionFrameEditor({ ed, frame, onChange }: { ed: Editor; frame: CaptionFrame | null | undefined; onChange: (f: CaptionFrame | null) => void }) {
  const set = (patch: Partial<CaptionFrame>) => frame && onChange({ ...frame, ...patch })
  const pick = (v: CaptionFramePreset | 'off') => {
    if (v === 'off') return onChange(null)
    const base = frame ?? defaultFrame(v)
    // "Custom" keeps the current box so it can be dragged from where it is
    onChange({ ...base, preset: v, rect: v === 'custom' ? { ...base.rect } : { ...FRAME_RECTS[v] } })
  }
  return (
    <>
      <span className="field-label">{t('Caption position')}</span>
      <Chips options={PRESETS} value={frame ? frame.preset : 'off'} onChange={pick} wrap />
      {frame && (
        <>
          <p className="muted small">{t('Drag the frame on the video to move it, or its sides and corners to resize it.')}</p>
          <span className="field-label">{t('Frame colour')}</span>
          <ColorRow value={frame.fill} onChange={(c) => set({ fill: c ?? '#000000' })} />
          <Slider label="Frame opacity" min={0} max={1} value={frame.fillOpacity} format={(v) => `${Math.round(v * 100)}%`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ fillOpacity: v })} />
          <span className="field-label">{t('Border')}</span>
          <ColorRow value={frame.border} allowNone onChange={(c) => set({ border: c })} />
          {frame.border && <Slider label="Border width" min={0.2} max={3} value={frame.borderWidth} format={(v) => v.toFixed(1)} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ borderWidth: v })} />}
          <Slider label="Corners" min={0} max={1} value={frame.radius} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ radius: v })} />
          <Chips options={[{ value: 'top', label: '⤒ Top' }, { value: 'middle', label: '↕ Middle' }, { value: 'bottom', label: '⤓ Bottom' }]} value={frame.valign} onChange={(valign) => set({ valign })} />
        </>
      )}
    </>
  )
}
