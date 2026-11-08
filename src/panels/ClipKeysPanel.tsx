import { useRef, useState } from 'react'
import type { Clip, ClipPos } from '../types'
import type { Editor } from '../model/useEditor'
import { Panel, Slider } from '../ui/kit'
import { t } from '../lib/i18n'
import { fmtTime } from '../lib/format'
import { clipKeyAt, isNoPos, localOfSrc, NO_POS, posAt, posPatch, withClipKey } from '../model/clipKeys'

/**
 * Zoom & move for a main-video clip: move, zoom and turn the picture, fixed or with keyframes that glide from one
 * to the next (like Premiere's Motion). `src` is the clip's source time at the playhead (null = playhead elsewhere).
 */
export function ZoomMovePanel({ ed, clip, src, start, onSeek, onClose }: {
  ed: Editor; clip: Clip; src: number | null; start: number; onSeek: (t: number) => void; onClose: () => void
}) {
  const keys = clip.keys ?? []
  const pos = posAt(clip, src ?? clip.in)
  const on = clipKeyAt(clip, src) >= 0
  const set = (p: Partial<ClipPos>) => ed.updateClip(clip.id, posPatch(clip, src, { ...pos, ...p }))
  const at = (k: { t: number }) => start + (localOfSrc(clip, k.t) ?? 0)
  const now = src === null ? null : start + (localOfSrc(clip, src) ?? 0)
  const prev = now === null ? undefined : [...keys].reverse().find((k) => at(k) < now - 0.05)
  const next = now === null ? undefined : keys.find((k) => at(k) > now + 0.05)
  const addKey = () => { if (src !== null) ed.updateClip(clip.id, { keys: withClipKey(clip, src, pos) }) }
  const removeKey = () => ed.updateClip(clip.id, { keys: keys.filter((_, i) => i !== clipKeyAt(clip, src)) })
  /** A ready motion over the whole clip: two keyframes, at its first and last frame. */
  const quick = (a: Partial<ClipPos>, b: Partial<ClipPos>) => ed.updateClip(clip.id, {
    pos: null, keys: [{ t: clip.in, pos: { ...NO_POS, ...a } }, { t: clip.out, pos: { ...NO_POS, ...b } }],
  })
  return (
    <Panel title="Zoom & move" onClose={onClose}>
      <p className="muted small">
        {keys.length
          ? t('Move the playhead, then change a slider: a keyframe is saved there by itself, and the picture glides between keyframes.')
          : t('The sliders move the picture for the whole clip. For movement, tap Add keyframe, move the playhead and change the sliders again.')}
      </p>
      <div className="row">
        <button className="btn" disabled={!prev} onClick={() => prev && onSeek(at(prev))}>◀ {t('Previous')}</button>
        {on
          ? <button className="btn" onClick={removeKey}>◆ {t('Remove keyframe')}</button>
          : <button className="btn primary" disabled={src === null} onClick={addKey}>◇ {t('Add keyframe')}</button>}
        <button className="btn" disabled={!next} onClick={() => next && onSeek(at(next))}>{t('Next')} ▶</button>
      </div>
      <Slider label="Zoom" min={-1.3} max={2} step={0.01} value={Math.log2(pos.scale)} format={(v) => `${Math.round(Math.pow(2, v) * 100)}%`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ scale: Math.pow(2, v) })} />
      <Slider label="Left / right" min={-1} max={1} step={0.005} value={pos.x} center format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ x: v })} />
      <Slider label="Up / down" min={-1} max={1} step={0.005} value={pos.y} center format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ y: v })} />
      <Slider label="Turn" min={-180} max={180} step={0.5} value={pos.rotation} center format={(v) => `${Math.round(v)}°`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ rotation: v })} />
      <div className="chips wrap">
        <button onClick={() => quick({}, { scale: 1.35 })}>{t('Slow zoom in')}</button>
        <button onClick={() => quick({ scale: 1.35 }, {})}>{t('Slow zoom out')}</button>
        <button onClick={() => quick({ scale: 1.3, x: 0.1 }, { scale: 1.3, x: -0.1 })}>{t('Pan right')}</button>
        <button onClick={() => quick({ scale: 1.3, x: -0.1 }, { scale: 1.3, x: 0.1 })}>{t('Pan left')}</button>
        <button disabled={!keys.length && isNoPos(clip.pos)} onClick={() => ed.updateClip(clip.id, { pos: null, keys: [] })}>{t('Reset')}</button>
      </div>
      {keys.length > 0 && <p className="muted small">{keys.length} {t('keyframes')}: {keys.map((k) => fmtTime(at(k) - start)).join(', ')}</p>}
      {src === null && <p className="muted small">{t('Move the playhead inside this clip to add keyframes.')}</p>}
    </Panel>
  )
}

const LO = Math.log2(0.05), HI = 2 // log2 speed range of the curve: 0.05x … 4x

/**
 * The user's own speed curve: 8 points over the clip, dragged up (faster) or down (slower). The clip's length
 * follows the curve, like the ready-made ramps.
 */
export function SpeedCurve({ ed, clip }: { ed: Editor; clip: Clip }) {
  const pts = clip.ramp === 'custom' && clip.rampPts?.length ? clip.rampPts : null
  const [drag, setDrag] = useState<number | null>(null)
  const box = useRef<SVGSVGElement>(null)
  const W = 320, H = 110, n = 8
  const vals = pts ?? Array.from({ length: n }, () => 1)
  const x = (i: number) => 16 + (i / (n - 1)) * (W - 32)
  const y = (s: number) => 10 + ((HI - Math.log2(s)) / (HI - LO)) * (H - 20)
  const speedAtY = (py: number) => {
    const r = box.current!.getBoundingClientRect()
    const v = HI - ((((py - r.top) / r.height) * H - 10) / (H - 20)) * (HI - LO)
    const s = Math.pow(2, Math.max(LO, Math.min(HI, v)))
    // gentle snap to the usual speeds
    for (const k of [0.05, 0.1, 0.25, 0.5, 1, 2, 4]) if (Math.abs(Math.log2(s / k)) < 0.08) return k
    return Math.round(s * 100) / 100
  }
  const setPoint = (i: number, s: number) => ed.updateClip(clip.id, { ramp: 'custom', rampPts: vals.map((v, j) => (j === i ? s : v)) })
  const down = (i: number) => (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); ed.begin(); setDrag(i) }
  const move = (e: React.PointerEvent) => { if (drag !== null) setPoint(drag, speedAtY(e.clientY)) }
  const up = () => { if (drag !== null) { ed.end(); setDrag(null) } }
  const line = vals.map((s, i) => `${x(i)},${y(s)}`).join(' ')
  return (
    <div className="speed-curve">
      <svg ref={box} viewBox={`0 0 ${W} ${H}`} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="speed-curve">
        {[4, 1, 0.25, 0.05].map((s) => (
          <g key={s}>
            <line x1={0} x2={W} y1={y(s)} y2={y(s)} className={s === 1 ? 'mid' : ''} />
            <text x={2} y={y(s) - 2}>{s}x</text>
          </g>
        ))}
        <polyline points={line} />
        {vals.map((s, i) => <circle key={i} cx={x(i)} cy={y(s)} r={drag === i ? 9 : 7} onPointerDown={down(i)} />)}
      </svg>
      <div className="row">
        <span className="muted small">{drag !== null ? `${vals[drag]}x` : t('Drag the dots: up = faster, down = slower.')}</span>
        {pts && <button className="btn small" onClick={() => ed.updateClip(clip.id, { ramp: 'custom', rampPts: Array.from({ length: n }, () => 1) })}>{t('Flat')}</button>}
      </div>
    </div>
  )
}
