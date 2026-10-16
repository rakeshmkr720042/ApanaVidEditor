import { useLayoutEffect, useRef, useState } from 'react'
import type { Clip, Layer } from '../types'
import { MIN_CLIP } from '../types'
import type { Editor } from '../model/useEditor'
import { clipDuration, IMAGE_DURATION, layerLanes } from '../model/timeline'
import { fmtTime } from '../lib/format'

interface Props {
  ed: Editor
  t: number
  pps: number
  setPps: (f: (p: number) => number) => void
  onScrub: (t: number) => void
  onTrimPreview: (clipId: string | null, sourceTime: number) => void
  onTransition: (clipId: string) => void
  onAdd: () => void
  snap: boolean
}

const SNAP_PX = 10

type Drag =
  | { kind: 'clip-trim'; id: string; side: 'in' | 'out'; x0: number; in0: number; out0: number; speed: number }
  | { kind: 'layer-trim'; id: string; side: 'in' | 'out'; x0: number; start0: number; end0: number; in0: number }
  | { kind: 'layer-move'; id: string; x0: number; start0: number; end0: number; moved: boolean }
  | { kind: 'reorder'; id: string; x: number; to: number }

const LAYER_COLORS: Record<Layer['type'], string> = { text: '#8b5cf6', sticker: '#f59e0b', media: '#14b8a6', blur: '#64748b', audio: '#22c55e' }

function layerLabel(l: Layer) {
  switch (l.type) {
    case 'text': return (l.subtitle ? '💬 ' : 'T  ') + l.text.replace(/\n/g, ' ')
    case 'sticker': return l.emoji
    case 'media': return '▣ Overlay'
    case 'blur': return l.mode === 'pixelate' ? '▦ Pixelate' : '◌ Blur'
    case 'audio': return (l.kind === 'voice' ? '🎙 ' : l.kind === 'sound' ? '🔔 ' : '♪ ') + l.label
  }
}

export function Timeline({ ed, t, pps, setPps, onScrub, onTrimPreview, onTransition, onAdd, snap }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const lastSet = useRef(-1)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const longPress = useRef<number>(0)
  const pinch = useRef<{ d0: number; pps0: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const { project, sources, layout, sel } = ed
  const total = layout.total
  const [snapLine, setSnapLine] = useState<number | null>(null)

  /** Magnetic snap: edges of clips, other layers and the playhead pull a dragged edge in when within SNAP_PX. */
  const snapEdges = (skipId: string) => {
    const e = [0, total, t]
    for (const it of layout.items) e.push(it.start, it.start + it.dur)
    for (const l of project.layers) if (l.id !== skipId) e.push(l.start, l.end)
    return e
  }
  /** Returns the shift that snaps one of `edges` to the nearest target, or 0. */
  const snapShift = (edges: number[], targets: number[]) => {
    if (!snap) { setSnapLine(null); return 0 }
    let best = SNAP_PX / pps, shift = 0, line: number | null = null
    for (const e of edges) for (const x of targets) {
      const d = x - e
      if (Math.abs(d) < best) { best = Math.abs(d); shift = d; line = x }
    }
    setSnapLine(line)
    return shift
  }

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || dragRef.current) return
    const x = t * pps
    if (Math.abs(el.scrollLeft - x) > 1) el.scrollLeft = x
    lastSet.current = el.scrollLeft
  }, [t, pps])

  const onScroll = () => {
    const el = scroller.current!
    if (dragRef.current || pinch.current || Math.abs(el.scrollLeft - lastSet.current) <= 1) return
    lastSet.current = el.scrollLeft
    onScrub(el.scrollLeft / pps)
  }

  // two-finger pinch to zoom the timeline
  const onPointerDownWrap = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { d0: Math.abs(a.x - b.x) || 1, pps0: pps }
    }
  }
  const onPointerMoveWrap = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const z = Math.max(4, Math.min(400, (pinch.current.pps0 * Math.abs(a.x - b.x)) / pinch.current.d0))
      setPps(() => z)
    }
  }
  const onPointerUpWrap = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  const capture = (e: React.PointerEvent) => { e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId) }

  // ----- main track trimming
  const startClipTrim = (e: React.PointerEvent, c: Clip, side: 'in' | 'out') => {
    capture(e)
    ed.begin()
    setDrag({ kind: 'clip-trim', id: c.id, side, x0: e.clientX, in0: c.in, out0: c.out, speed: c.ramp ? 1 : c.speed })
  }

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dt = (e.clientX - (d.kind === 'reorder' ? 0 : d.x0)) / pps
    if (d.kind === 'clip-trim') {
      const c = project.clips.find((x) => x.id === d.id)!
      const src = sources[c.sourceId]
      const maxOut = src.kind === 'image' ? IMAGE_DURATION : src.duration
      if (d.side === 'in') {
        const v = Math.max(0, Math.min(d.out0 - MIN_CLIP, d.in0 + dt * d.speed))
        ed.updateClip(c.id, { in: v })
        onTrimPreview(c.id, v)
      } else {
        const it = layout.items.find((x) => x.clip.id === c.id)!
        const raw = d.out0 + dt * d.speed
        const endAt = it.start + (raw - c.in) / d.speed
        const v = Math.min(maxOut, Math.max(d.in0 + MIN_CLIP, raw + snapShift([endAt], [t, ...project.layers.flatMap((l) => [l.start, l.end])]) * d.speed))
        ed.updateClip(c.id, { out: v })
        onTrimPreview(c.id, Math.max(d.in0, v - 0.04))
      }
    } else if (d.kind === 'layer-trim') {
      const l = project.layers.find((x) => x.id === d.id)!
      const hasSrc = l.type === 'media' || l.type === 'audio'
      const srcDur = hasSrc ? sources[(l as { sourceId: string }).sourceId]?.duration ?? Infinity : Infinity
      const targets = snapEdges(l.id)
      if (d.side === 'in') {
        let start = d.start0 + dt
        start = Math.max(0, Math.min(d.end0 - 0.2, start + snapShift([start], targets)))
        if (hasSrc) start = Math.max(start, d.start0 - d.in0)
        ed.updateLayer(l.id, hasSrc ? { start, in: d.in0 + (start - d.start0) } : { start })
      } else {
        let end = d.end0 + dt
        end = Math.max(d.start0 + 0.2, end + snapShift([end], targets))
        if (hasSrc) end = Math.min(end, d.start0 + (srcDur - d.in0))
        ed.updateLayer(l.id, { end })
      }
    } else if (d.kind === 'layer-move') {
      if (!d.moved && Math.abs(e.clientX - d.x0) < 6) return
      if (!d.moved) { ed.begin(); setDrag({ ...d, moved: true }) }
      const len = d.end0 - d.start0
      let start = d.start0 + dt
      start += snapShift([start, start + len], snapEdges(d.id))
      start = Math.max(0, start)
      ed.updateLayer(d.id, { start, end: start + len })
    } else if (d.kind === 'reorder') {
      const track = scroller.current!.querySelector('.tl-track') as HTMLElement
      const x = e.clientX - track.getBoundingClientRect().left
      let to = 0
      for (const it of layout.items) if (x > (it.start + it.dur / 2) * pps) to = it.index + 1
      const from = project.clips.findIndex((c) => c.id === d.id)
      if (to > from) to -= 1
      setDrag({ ...d, x: e.clientX, to })
    }
  }

  const onUp = () => {
    clearTimeout(longPress.current)
    const d = dragRef.current
    if (!d) return
    setDrag(null)
    setSnapLine(null)
    if (d.kind === 'clip-trim') { ed.end(); onTrimPreview(null, 0) }
    else if (d.kind === 'layer-trim') ed.end()
    else if (d.kind === 'layer-move' && d.moved) ed.end()
    else if (d.kind === 'reorder') ed.moveClip(d.id, d.to)
  }

  // ----- lanes for overlay layers
  const lanes = layerLanes(project.layers)
  const laneCount = Math.max(0, ...[...lanes.values()].map((v) => v + 1))
  const width = Math.max(total * pps, 1)
  const tickEvery = pps >= 80 ? 1 : pps >= 30 ? 2 : pps >= 12 ? 5 : pps >= 5 ? 10 : 30
  const ticks: number[] = []
  for (let s = 0; s <= total + 0.001; s += tickEvery) ticks.push(s)

  return (
    <div
      className="timeline"
      onPointerDown={onPointerDownWrap}
      onPointerMove={(e) => { onPointerMoveWrap(e); onMove(e) }}
      onPointerUp={(e) => { onPointerUpWrap(e); onUp() }}
      onPointerCancel={(e) => { onPointerUpWrap(e); onUp() }}
    >
      <div className="tl-scroll" ref={scroller} onScroll={onScroll} onClick={() => ed.setSel(null)}>
        <div className="tl-pad" />
        <div className="tl-content" style={{ width }}>
          {snapLine !== null && <div className="tl-snapline" style={{ left: snapLine * pps }} />}
          <div className="tl-ruler">
            {ticks.map((s) => <span key={s} style={{ left: s * pps }}>{fmtTime(s, false)}</span>)}
          </div>
          <div className="tl-track">
            {layout.items.map((it) => {
              const clip = it.clip
              const src = sources[clip.sourceId]
              if (!src) return null
              const selected = sel?.type === 'clip' && sel.id === clip.id
              const reordering = drag?.kind === 'reorder' && drag.id === clip.id
              const speed = clip.ramp ? (clip.out - clip.in) / clipDuration(clip) : clip.speed
              const isImg = src.kind === 'image'
              const thumbW = isImg ? 56 : (src.duration * pps) / speed / src.thumbs.length
              const shift = drag?.kind === 'clip-trim' && drag.id === clip.id && drag.side === 'in' ? ((clip.in - drag.in0) / drag.speed) * pps : 0
              return (
                <div
                  key={clip.id}
                  className={`tl-clip${selected ? ' selected' : ''}${reordering ? ' ghost' : ''}`}
                  style={{ left: it.start * pps + shift, width: it.dur * pps }}
                  onClick={(e) => { e.stopPropagation(); ed.setSel({ type: 'clip', id: clip.id }) }}
                  onPointerDown={(e) => {
                    if (pointers.current.size > 1) return
                    const x = e.clientX
                    const pid = e.pointerId
                    const target = e.currentTarget
                    clearTimeout(longPress.current)
                    longPress.current = window.setTimeout(() => {
                      if (project.clips.length < 2) return
                      target.setPointerCapture(pid)
                      navigator.vibrate?.(20)
                      setDrag({ kind: 'reorder', id: clip.id, x, to: it.index })
                    }, 450)
                  }}
                  onPointerMove={(e) => { if (!dragRef.current && Math.abs(e.movementX) + Math.abs(e.movementY) > 3) clearTimeout(longPress.current) }}
                >
                  <div className="tl-thumbs">
                    <div className="tl-strip" style={{ transform: isImg ? undefined : `translateX(${(-clip.in / speed) * pps}px)` }}>
                      {(isImg ? Array.from({ length: Math.min(60, Math.ceil((it.dur * pps) / 56)) }, () => src.thumbs[0]) : src.thumbs).map((th, i) => (
                        <img key={i} src={th} style={{ width: thumbW }} alt="" draggable={false} />
                      ))}
                    </div>
                  </div>
                  {src.wave && !isImg && (
                    <div className={`tl-clipwave${clip.volume === 0 ? ' muted' : ''}`}>
                      <img src={src.wave} alt="" draggable={false} style={{ width: (src.duration * pps) / speed, transform: `translateX(${(-clip.in / speed) * pps}px)` }} />
                    </div>
                  )}
                  <span className="tl-badges">
                    {clip.speed !== 1 && !clip.ramp && <i>{clip.speed}x</i>}
                    {clip.ramp && <i>⤳</i>}
                    {clip.volume === 0 && <i>🔇</i>}
                    {clip.filter && <i>◐</i>}
                  </span>
                  <span className="tl-dur">{fmtTime(it.dur)}</span>
                  {selected && (['in', 'out'] as const).map((side) => (
                    <div key={side} className={`tl-handle ${side}`} onPointerDown={(e) => startClipTrim(e, clip, side)} onClick={(e) => e.stopPropagation()} />
                  ))}
                </div>
              )
            })}
            {layout.items.slice(0, -1).map((it) => (
              // hidden next to the selected clip so its trim handles can be grabbed (the toolbar has Transition)
              sel?.type === 'clip' && (sel.id === it.clip.id || sel.id === layout.items[it.index + 1].clip.id) ? null : <button
                key={'tr' + it.clip.id}
                className={`tl-trans${it.clip.transition ? ' on' : ''}`}
                style={{ left: (it.start + it.dur - it.transOut / 2) * pps }}
                onClick={(e) => { e.stopPropagation(); onTransition(it.clip.id) }}
                aria-label="Transition"
              >
                {it.clip.transition ? '⧖' : '⇄'}
              </button>
            ))}
            <button className="tl-add" style={{ left: width + 16 }} onClick={(e) => { e.stopPropagation(); onAdd() }} aria-label="Add media">+</button>
          </div>
          <div className="tl-lanes" style={{ height: laneCount * 30 }}>
            {project.layers.map((l) => {
              const lane = lanes.get(l.id) ?? 0
              const selected = sel?.type === 'layer' && sel.id === l.id
              const src = (l.type === 'audio') ? sources[l.sourceId] : null
              return (
                <div
                  key={l.id}
                  className={`tl-layer${selected ? ' selected' : ''}`}
                  style={{ left: l.start * pps, width: Math.max(4, (l.end - l.start) * pps), top: lane * 30, background: LAYER_COLORS[l.type] }}
                  onClick={(e) => { e.stopPropagation(); ed.setSel({ type: 'layer', id: l.id }) }}
                  onPointerDown={(e) => {
                    if (!selected || pointers.current.size > 1) return
                    capture(e)
                    setDrag({ kind: 'layer-move', id: l.id, x0: e.clientX, start0: l.start, end0: l.end, moved: false })
                  }}
                >
                  {src?.thumbs[0] && <img className="tl-wave" src={src.thumbs[0]} alt="" draggable={false} style={{ width: (src.duration * pps), left: -(l as { in: number }).in * pps }} />}
                  <span>{layerLabel(l)}</span>
                  {selected && (['in', 'out'] as const).map((side) => (
                    <div
                      key={side}
                      className={`tl-lhandle ${side}`}
                      onPointerDown={(e) => {
                        capture(e)
                        ed.begin()
                        setDrag({ kind: 'layer-trim', id: l.id, side, x0: e.clientX, start0: l.start, end0: l.end, in0: (l as { in?: number }).in ?? 0 })
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
        <div className="tl-pad" />
      </div>
      <div className="tl-playhead" />
      {drag?.kind === 'reorder' && <div className="tl-reorder-hint">Move to position {drag.to + 1}</div>}
    </div>
  )
}
