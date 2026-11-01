import { useRef, useState } from 'react'
import { SPLIT_LAYOUTS, type SplitLayout } from '../model/split'
import { Panel, Slider } from '../ui/kit'
import { t } from '../lib/i18n'

/** Split screen / collage: pick a layout, the gap and border, then the photos and videos for its cells. */
export function SplitPanel({ onClose, onPick }: { onClose: () => void; onPick: (files: File[], layout: SplitLayout, gap: number, border: number) => void }) {
  const [layout, setLayout] = useState<SplitLayout>(SPLIT_LAYOUTS[0])
  const [gap, setGap] = useState(0.01)
  const [border, setBorder] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  return (
    <Panel title="Split screen" onClose={onClose} tall>
      <div className="split-grid">
        {SPLIT_LAYOUTS.map((l) => (
          <button key={l.id} className={layout.id === l.id ? 'on' : ''} onClick={() => setLayout(l)} aria-label={t(l.name)} title={t(l.name)}>
            <span className="split-thumb">
              {l.cells.map((c, i) => (
                <i key={i} style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }}>{i + 1}</i>
              ))}
            </span>
            <small>{t(l.name)}</small>
          </button>
        ))}
      </div>
      <Slider label="Gap" min={0} max={0.05} value={gap} format={(v) => `${Math.round(v * 1000) / 10}`} onChange={setGap} />
      <Slider label="Border" min={0} max={2} value={border} format={(v) => v.toFixed(1)} onChange={setBorder} />
      <button className="btn primary wide" onClick={() => input.current?.click()}>
        {t('Pick')} {layout.cells.length} {t('photos or videos')}
      </button>
      <input ref={input} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) onPick(f, layout, gap, border) }} />
      <p className="muted small">{t('They go in the cells in the order you pick them, from the playhead. Each one is its own item: tap it to move, swap, add filters or change its length.')}</p>
    </Panel>
  )
}
