import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { MediaSource } from '../types'
import type { Pic } from '../lib/rawMedia'
import { AUX, coverageOf, kindOf, type AuxKind, type Part } from '../lib/material'
import { fmtTime } from '../lib/format'
import { t } from '../lib/i18n'

/** A numbered heading over one step of the sheet: ① the main file, ② extra material. */
export function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mat-step">
      <b>{n}</b><span>{t(title)}</span>{hint && <em className="muted">{t(hint)}</em>}
    </div>
  )
}

/** One box per kind of extra material the mode can use, each opening its own file picker. */
export function AuxBoxes(p: {
  kinds: AuxKind[]; pics: Pic[]; music: MediaSource | null; busy: boolean
  onAdd: (kind: AuxKind, files: File[]) => void; onRemove: (id: string) => void; onRemoveMusic: () => void; onClear: () => void
  children?: ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  const kind = useRef<AuxKind>('photo')
  const open = (k: AuxKind) => {
    kind.current = k
    const el = input.current!
    el.accept = AUX[k].accept
    el.multiple = k !== 'music'
    el.click()
  }
  const count = (k: AuxKind) => (k === 'music' ? (p.music ? 1 : 0) : p.pics.filter((x) => kindOf(x) === k).length)
  return (
    <div className="aux">
      <div className="aux-grid">
        {p.kinds.map((k) => (
          <button key={k} className={`aux-box${count(k) ? ' has' : ''}`} disabled={p.busy} onClick={() => open(k)}>
            <span className="aux-icon">{AUX[k].icon}</span>
            <span className="aux-label">{t(AUX[k].label)}</span>
            <em>{count(k) ? (k === 'music' ? '✓' : count(k)) : '+'}</em>
          </button>
        ))}
      </div>
      {p.pics.length > 0 && (
        <div className="pic-pool">
          {p.pics.map((x) => (
            <div className="pic" key={x.id} title={x.words || x.name}>
              <Thumb blob={x.image} moving={x.media} />
              <button className="pic-x" disabled={p.busy} aria-label={t('Remove')} onClick={() => p.onRemove(x.id)}>✕</button>
            </div>
          ))}
          <button className="btn small ghost" disabled={p.busy} onClick={p.onClear}>{t('Clear')}</button>
        </div>
      )}
      {p.music && (
        <p className="small">♪ {p.music.name} · {fmtTime(p.music.duration)} · {t('plays quietly under the whole video')}{' '}
          <button className="btn small ghost" disabled={p.busy} onClick={p.onRemoveMusic}>{t('Remove')}</button></p>
      )}
      {p.children}
      <input ref={input} type="file" hidden
        onChange={(e) => { if (e.target.files?.length) p.onAdd(kind.current, [...e.target.files]); e.target.value = '' }} />
    </div>
  )
}

/**
 * How much of the video the user's own material fills, scene by scene: a green tick at 100%,
 * otherwise the share, which scenes the editor will make itself, and the long ones among them.
 */
export function CoverageMeter(p: { parts: Part[]; estimate: boolean; rest: string; known: boolean }) {
  if (!p.parts.length) return null
  const c = coverageOf(p.parts)
  const full = c.pct === 100
  const shown = c.empty.slice(0, 8)
  return (
    <div className={`meter${full ? ' full' : ''}`} role="status">
      <div className="meter-head">
        <span className="meter-pct">{full ? '✓ ' : ''}{c.pct}%</span>
        <span className="small">{c.covered}/{c.total} {t('scenes from your material')}{p.estimate ? ` (${t('estimate')})` : ''}</span>
      </div>
      <div className="meter-bar" aria-hidden>
        {p.parts.map((x, i) => <i key={i} className={x.covered ? 'on' : c.long.includes(i) ? 'long' : ''} title={`${i + 1}. ${x.name}`} />)}
      </div>
      <p className="small muted">{full
        ? t('Enough for the whole video. Every scene shows your material.')
        : `${c.total - c.covered} ${t(c.total - c.covered === 1 ? 'scene' : 'scenes')}: ${p.rest}`}</p>
      {!full && p.known && (
        <div className="meter-empty">
          {shown.map((i) => (
            <span key={i} className={c.long.includes(i) ? 'long' : ''}>
              {i + 1}. {p.parts[i].name || t('Scene')}{c.long.includes(i) && ` · ⚠ ${fmtTime(p.parts[i].seconds)} ${t('long, add a picture here')}`}
            </span>
          ))}
          {c.empty.length > shown.length && <span className="muted">+{c.empty.length - shown.length} {t('more')}</span>}
        </div>
      )}
    </div>
  )
}

export function Thumb({ blob, moving }: { blob: Blob; moving?: Pic['media'] }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return <>{<img src={url} alt="" loading="lazy" decoding="async" />}{moving && <em className="thumb-badge">{moving.kind === 'gif' ? 'GIF' : `▶ ${fmtTime(moving.length)}`}</em>}</>
}
