import { useLayoutEffect, useRef, useState } from 'react'
import type { Clip, MediaSource } from '../types'
import { MIN_CLIP, clipLen } from '../types'
import { fmtTime } from '../lib/format'

interface Props {
  clips: Clip[]
  sources: Record<string, MediaSource>
  playhead: number
  total: number
  pps: number // pixels per second
  selectedId: string | null
  onSelect: (id: string | null) => void
  onScrub: (t: number) => void
  onTrimStart: () => void
  onTrim: (clip: Clip, side: 'in' | 'out') => void
  onTrimEnd: () => void
  onAdd: () => void
}

interface Drag { id: string; side: 'in' | 'out'; startX: number; origIn: number; origOut: number }

export function Timeline(p: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const lastSet = useRef(-1)
  const [drag, setDrag] = useState<Drag | null>(null)

  // Playhead stays in the centre; the track scrolls under it (CapCut style).
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const x = p.playhead * p.pps
    if (Math.abs(el.scrollLeft - x) > 1) el.scrollLeft = x
    lastSet.current = el.scrollLeft
  }, [p.playhead, p.pps])

  const onScroll = () => {
    const el = scroller.current!
    if (drag || Math.abs(el.scrollLeft - lastSet.current) <= 1) return
    lastSet.current = el.scrollLeft
    p.onScrub(el.scrollLeft / p.pps)
  }

  const startTrim = (e: React.PointerEvent, clip: Clip, side: 'in' | 'out') => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: clip.id, side, startX: e.clientX, origIn: clip.in, origOut: clip.out })
    p.onTrimStart()
  }
  const moveTrim = (e: React.PointerEvent, clip: Clip) => {
    if (!drag || drag.id !== clip.id) return
    const dt = (e.clientX - drag.startX) / p.pps
    const dur = p.sources[clip.sourceId].duration
    if (drag.side === 'in') {
      const v = Math.max(0, Math.min(drag.origOut - MIN_CLIP, drag.origIn + dt))
      p.onTrim({ ...clip, in: v }, 'in')
    } else {
      const v = Math.min(dur, Math.max(drag.origIn + MIN_CLIP, drag.origOut + dt))
      p.onTrim({ ...clip, out: v }, 'out')
    }
  }
  const endTrim = () => {
    if (!drag) return
    setDrag(null)
    p.onTrimEnd()
  }

  const width = p.total * p.pps
  const tickEvery = p.pps >= 80 ? 1 : p.pps >= 30 ? 2 : p.pps >= 12 ? 5 : 10
  const ticks: number[] = []
  for (let s = 0; s <= p.total; s += tickEvery) ticks.push(s)

  return (
    <div className="timeline">
      <div className="tl-scroll" ref={scroller} onScroll={onScroll} onClick={() => p.onSelect(null)}>
        <div className="tl-pad" />
        <div className="tl-content" style={{ width }}>
          <div className="tl-ruler">
            {ticks.map((s) => (
              <span key={s} style={{ left: s * p.pps }}>{fmtTime(s, false)}</span>
            ))}
          </div>
          <div className="tl-track">
            {p.clips.map((clip) => {
              const src = p.sources[clip.sourceId]
              const sel = clip.id === p.selectedId
              const shift = drag?.id === clip.id && drag.side === 'in' ? (clip.in - drag.origIn) * p.pps : 0
              const thumbW = (src.duration * p.pps) / src.thumbs.length
              return (
                <div
                  key={clip.id}
                  className={`tl-clip${sel ? ' selected' : ''}`}
                  style={{ width: clipLen(clip) * p.pps, marginLeft: shift }}
                  onClick={(e) => { e.stopPropagation(); p.onSelect(clip.id) }}
                >
                  <div className="tl-thumbs">
                    <div className="tl-strip" style={{ transform: `translateX(${-clip.in * p.pps}px)` }}>
                      {src.thumbs.map((t, i) => (
                        <img key={i} src={t} style={{ width: thumbW }} alt="" draggable={false} />
                      ))}
                    </div>
                  </div>
                  <span className="tl-dur">{fmtTime(clipLen(clip))}</span>
                  {sel && (['in', 'out'] as const).map((side) => (
                    <div
                      key={side}
                      className={`tl-handle ${side}`}
                      onPointerDown={(e) => startTrim(e, clip, side)}
                      onPointerMove={(e) => moveTrim(e, clip)}
                      onPointerUp={endTrim}
                      onPointerCancel={endTrim}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ))}
                </div>
              )
            })}
            <button className="tl-add" onClick={(e) => { e.stopPropagation(); p.onAdd() }} aria-label="Add video">+</button>
          </div>
        </div>
        <div className="tl-pad" />
      </div>
      <div className="tl-playhead" />
    </div>
  )
}
