import { useEffect, useRef, type ReactNode } from 'react'
import { t } from '../lib/i18n'
import { BACK, useBack } from '../lib/back'
import { Icon } from '../components/Icon'

/** Range slider that reports live changes and a commit when the drag ends (one undo step). */
export function Slider(p: {
  label?: string; value: number; min: number; max: number; step?: number; format?: (v: number) => string
  onChange: (v: number) => void; onStart?: () => void; onEnd?: () => void; center?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const started = useRef(false)
  const cb = useRef(p); cb.current = p
  useEffect(() => {
    const el = ref.current!
    const end = () => { if (started.current) { started.current = false; cb.current.onEnd?.() } }
    el.addEventListener('change', end)
    return () => el.removeEventListener('change', end)
  }, [])
  const pct = ((p.value - p.min) / (p.max - p.min)) * 100
  const zero = p.center ? ((0 - p.min) / (p.max - p.min)) * 100 : 0
  return (
    <label className="slider">
      {p.label && <span className="slider-label">{t(p.label)}</span>}
      <input
        ref={ref}
        type="range"
        min={p.min}
        max={p.max}
        step={p.step ?? (p.max - p.min) / 200}
        value={p.value}
        style={{ ['--a' as string]: `${Math.min(pct, zero)}%`, ['--b' as string]: `${Math.max(pct, zero)}%` }}
        onInput={(e) => {
          if (!started.current) { started.current = true; p.onStart?.() }
          p.onChange(Number((e.target as HTMLInputElement).value))
        }}
        onChange={() => {}}
        onDoubleClick={() => { if (p.center) { p.onStart?.(); p.onChange(0); p.onEnd?.() } }}
      />
      <span className="slider-value">{p.format ? p.format(p.value) : p.value.toFixed(2)}</span>
    </label>
  )
}

export function Chips<T extends string | number>(p: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; wrap?: boolean }) {
  return (
    <div className={`chips${p.wrap ? ' wrap' : ''}`}>
      {p.options.map((o) => (
        <button key={String(o.value)} className={o.value === p.value ? 'on' : ''} onClick={() => p.onChange(o.value)}>{t(o.label)}</button>
      ))}
    </div>
  )
}

export function Toggle(p: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{t(p.label)}</span>
      <input type="checkbox" checked={p.value} onChange={(e) => p.onChange(e.target.checked)} />
      <i />
    </label>
  )
}

/** A tool panel above the toolbar. The back arrow, ✓, the phone's Back button and Esc all close it (changes stay; Undo takes them back). */
export function Panel(p: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; tall?: boolean }) {
  useBack(true, p.onClose, BACK.panel)
  return (
    <div className={`panel${p.tall ? ' tall' : ''}`}>
      <div className="panel-head">
        <button className="icon-btn panel-back" onClick={p.onClose} aria-label={t('Back')} title={t('Back')}><Icon name="back" size={20} /></button>
        <b className="panel-title">{t(p.title)}</b>
        <div className="panel-actions">
          {p.actions}
          <button className="btn small primary" onClick={p.onClose} aria-label={t('Done')} title={t('Done')}>✓</button>
        </div>
      </div>
      <div className="panel-body">{p.children}</div>
    </div>
  )
}

export const COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#30b0ff', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#8e8e93']

export function ColorRow(p: { value: string | null; onChange: (c: string | null) => void; allowNone?: boolean }) {
  return (
    <div className="colors">
      {p.allowNone && <button className={`swatch none${p.value === null ? ' on' : ''}`} onClick={() => p.onChange(null)} aria-label="None">⌀</button>}
      {COLORS.map((c) => (
        <button key={c} className={`swatch${p.value?.toLowerCase().startsWith(c) ? ' on' : ''}`} style={{ background: c }} onClick={() => p.onChange(c)} aria-label={c} />
      ))}
      <label className="swatch picker" aria-label="Custom colour">
        <input type="color" value={(p.value ?? '#ffffff').slice(0, 7)} onChange={(e) => p.onChange(e.target.value)} />
      </label>
    </div>
  )
}

/** The ✕ in the corner of a bottom sheet; Back / Esc do the same. `disabled` while a job must not be left. */
export function SheetClose(p: { onClose: () => void; disabled?: boolean }) {
  useBack(true, () => { if (!p.disabled) p.onClose() })
  return (
    <button className="icon-btn sheet-x" disabled={p.disabled} onClick={p.onClose} aria-label={t('Close')} title={t('Close')}>
      <Icon name="close" size={20} />
    </button>
  )
}
