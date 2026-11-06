import { useEffect, useRef, useState } from 'react'
import { SCOPE_H, SCOPE_W, drawScope, frameStats, sampleFrame, type FrameStats, type ScopeMode } from '../engine/scopes'
import { t } from '../lib/i18n'
import { Icon } from './Icon'

const MODES: { value: ScopeMode; label: string; hint: string }[] = [
  { value: 'waveform', label: 'Waveform', hint: 'Brightness of each part of the picture, left to right: bottom = black, top = white. Lines stuck at the top are burnt out.' },
  { value: 'parade', label: 'RGB parade', hint: 'Red, green and blue side by side. If one is higher than the others in white or grey parts, the picture has a colour cast.' },
  { value: 'histogram', label: 'Histogram', hint: 'How many pixels have each brightness. A pile at the left edge = lost shadows, at the right edge = lost highlights.' },
  { value: 'vector', label: 'Vectorscope', hint: 'Colour round the circle, stronger colour further out. Skin should sit near the orange line.' },
]
const KEY = 'scope-mode'

/** Scopes of the preview frame, updated a few times a second while open. */
export function Scopes({ source, onClose }: { source: () => HTMLCanvasElement | null; onClose: () => void }) {
  const [mode, setMode] = useState<ScopeMode>(() => {
    try { const m = localStorage.getItem(KEY) as ScopeMode | null; return m && MODES.some((x) => x.value === m) ? m : 'waveform' } catch { return 'waveform' }
  })
  const pick = (m: ScopeMode) => { setMode(m); try { localStorage.setItem(KEY, m) } catch { /* private mode */ } }
  const out = useRef<HTMLCanvasElement>(null)
  const [stats, setStats] = useState<FrameStats | null>(null)
  const [help, setHelp] = useState(false)

  useEffect(() => {
    let last = ''
    const draw = () => {
      const c = out.current?.getContext('2d')
      const src = source()
      if (!c || !src || !src.width) return
      const px = sampleFrame(src)
      if (!px) return
      drawScope(c, px, mode)
      const s = frameStats(px)
      const k = `${s.black.toFixed(3)}:${s.white.toFixed(3)}:${s.mean.toFixed(2)}`
      if (k !== last) { last = k; setStats(s) }
    }
    draw()
    const id = setInterval(draw, 200)
    return () => clearInterval(id)
  }, [source, mode])

  const warn = stats && (stats.white > 0.02 ? t('Highlights burnt out') : stats.black > 0.05 ? t('Shadows crushed') : null)
  return (
    <div className="scopes" data-testid="scopes" onPointerDown={(e) => e.stopPropagation()}>
      <div className="scopes-head">
        <select value={mode} onChange={(e) => pick(e.target.value as ScopeMode)} aria-label={t('Scope')}>
          {MODES.map((m) => <option key={m.value} value={m.value}>{t(m.label)}</option>)}
        </select>
        <button className="icon-btn" onClick={() => setHelp((v) => !v)} aria-label={t('What is this?')} title={t('What is this?')}>?</button>
        <button className="icon-btn" onClick={onClose} aria-label={t('Close')}><Icon name="close" size={16} /></button>
      </div>
      <canvas ref={out} width={SCOPE_W} height={SCOPE_H} />
      <div className="scopes-foot small">
        {stats && <span>{t('Brightness')} {Math.round(stats.mean * 100)}%</span>}
        {warn && <span className="scopes-warn">⚠ {warn}</span>}
      </div>
      {help && <p className="small muted scopes-help">{t(MODES.find((m) => m.value === mode)!.hint)}</p>}
    </div>
  )
}
