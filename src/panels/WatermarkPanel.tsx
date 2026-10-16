import { useEffect, useRef, useState } from 'react'
import type { Watermark, WatermarkPos } from '../types'
import type { Editor } from '../model/useEditor'
import { FONTS, ensureFont, prefetchFonts } from '../engine/text'
import { defaultWatermark } from '../engine/watermark'
import { loadSource } from '../lib/media'
import { saveMedia } from '../lib/db'
import { fmtTime } from '../lib/format'
import { Chips, ColorRow, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

const GRID: WatermarkPos[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']
const ARROWS: Record<string, string> = { tl: '↖', tc: '↑', tr: '↗', ml: '←', mc: '•', mr: '→', bl: '↙', bc: '↓', br: '↘' }

/** Your own text or logo watermark: style, position (grid, drag, or floating) and when it shows. */
export function WatermarkPanel({ ed, time, onClose }: { ed: Editor; time: number; onClose: () => void }) {
  const wm: Watermark = ed.project.watermark ?? { ...defaultWatermark(), enabled: false }
  const set = ed.setWatermark
  const total = ed.layout.total
  const [tab, setTab] = useState('content')
  const [error, setError] = useState<string | null>(null)
  const [, fontsReady] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const logo = wm.sourceId ? ed.sources[wm.sourceId] : undefined

  // opening the panel turns the watermark on
  useEffect(() => { if (!ed.project.watermark) set({ enabled: true }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'content' && wm.kind === 'text') prefetchFonts().then(() => fontsReady((n) => n + 1)) }, [tab, wm.kind])

  const upload = async (f: File) => {
    setError(null)
    try {
      const src = await loadSource(f, f.name)
      if (src.kind !== 'image') throw new Error(t('Pick an image (PNG with a transparent background works best)'))
      ed.addSource(src)
      await saveMedia(src)
      set({ kind: 'image', sourceId: src.id, enabled: true })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const live = { onStart: ed.begin, onEnd: ed.end }
  const clampT = (v: number) => Math.max(0, Math.min(total, v))

  return (
    <Panel title="Watermark" onClose={onClose} tall>
      <Toggle label="Show watermark" value={wm.enabled} onChange={(enabled) => set({ enabled })} />
      <Chips options={[{ value: 'content', label: 'Content' }, { value: 'position', label: 'Position' }, { value: 'timing', label: 'Timing' }]} value={tab} onChange={setTab} />

      {tab === 'content' && (
        <>
          <Chips options={[{ value: 'text', label: 'Text' }, { value: 'image', label: 'Logo image' }]} value={wm.kind} onChange={(kind) => set({ kind })} />
          {wm.kind === 'text' ? (
            <>
              <input className="text-input" value={wm.text} placeholder={t('Your name or channel')} onChange={(e) => set({ text: e.target.value })} />
              <Slider label="Size" min={0.02} max={0.15} value={wm.size} format={(v) => `${Math.round(v * 100)}`} {...live} onChange={(size) => set({ size })} />
              <span className="field-label">{t('Colour')}</span>
              <ColorRow value={wm.color} onChange={(c) => set({ color: c ?? '#ffffff' })} />
              <div className="row-toggles">
                <Toggle label="Bold" value={wm.bold} onChange={(bold) => set({ bold })} />
                <Toggle label="Shadow" value={wm.shadow} onChange={(shadow) => set({ shadow })} />
              </div>
              <span className="field-label">{t('Font')}</span>
              <div className="font-grid">
                {FONTS.map((f) => (
                  <button key={f} className={wm.font === f ? 'on' : ''} style={{ fontFamily: `"${f}"` }} onClick={() => { ensureFont(f); set({ font: f }) }}>
                    Aa <small>{f}</small>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="wm-logo">
                {logo ? <img src={logo.url} alt="" /> : <div className="wm-logo-empty">{t('No logo yet')}</div>}
                <button className="btn" onClick={() => fileInput.current?.click()}>{logo ? t('Change logo') : t('Upload logo')}</button>
              </div>
              <Slider label="Size" min={0.04} max={0.5} value={wm.imageSize} format={(v) => `${Math.round(v * 100)}`} {...live} onChange={(imageSize) => set({ imageSize })} />
              {error && <p className="error-text">{error}</p>}
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
            </>
          )}
          <Slider label="Opacity" min={0.1} max={1} value={wm.opacity} format={(v) => `${Math.round(v * 100)}%`} {...live} onChange={(opacity) => set({ opacity })} />
        </>
      )}

      {tab === 'position' && (
        <>
          <Chips options={[{ value: 'static', label: 'Static' }, { value: 'float', label: 'Floating' }]} value={wm.motion} onChange={(motion) => set({ motion })} />
          {wm.motion === 'static' ? (
            <>
              <div className="wm-grid">
                {GRID.map((p) => (
                  <button key={p} className={wm.position === p ? 'on' : ''} onClick={() => set({ position: p })} aria-label={p}>{ARROWS[p]}</button>
                ))}
              </div>
              <p className="muted small">{wm.position === 'custom' ? t('Custom spot. Pick a box above to snap it back.') : t('Or drag the watermark on the video.')}</p>
            </>
          ) : (
            <>
              <Slider label="Speed" min={0.25} max={3} value={wm.speed} format={(v) => `${v.toFixed(2)}×`} {...live} onChange={(speed) => set({ speed })} />
              <p className="muted small">{t('Moves slowly around the whole frame so it is hard to crop out.')}</p>
            </>
          )}
        </>
      )}

      {tab === 'timing' && (
        <>
          <Chips options={[{ value: 'full', label: 'Full video' }, { value: 'custom', label: 'Time range' }]} value={wm.range}
            onChange={(range) => set(range === 'custom' && wm.range !== 'custom' ? { range, start: clampT(time), end: clampT(Math.max(time + 0.5, Math.min(total, time + 5))) } : { range })} />
          {wm.range === 'custom' && (
            <>
              <Slider label="Start" min={0} max={Math.max(0.01, total)} value={Math.min(wm.start, total)} format={fmtTime} {...live} onChange={(v) => set({ start: Math.min(v, wm.end - 0.1) })} />
              <Slider label="End" min={0} max={Math.max(0.01, total)} value={Math.min(wm.end, total)} format={fmtTime} {...live} onChange={(v) => set({ end: Math.max(v, wm.start + 0.1) })} />
              <div className="row">
                <button className="btn small" onClick={() => set({ start: Math.min(clampT(time), wm.end - 0.1) })}>{t('Start at playhead')}</button>
                <button className="btn small" onClick={() => set({ end: Math.max(clampT(time), wm.start + 0.1) })}>{t('End at playhead')}</button>
              </div>
            </>
          )}
        </>
      )}
    </Panel>
  )
}
