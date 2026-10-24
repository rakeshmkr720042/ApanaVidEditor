import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Clip, Layer } from '../types'
import { MIN_CLIP } from '../types'
import { selectedIds, type Editor, type Selection } from '../model/useEditor'
import { clipDuration, IMAGE_DURATION, layerSpeed } from '../model/timeline'
import { trackKind, trackName } from '../model/tracks'
import { keysOf } from '../model/keyframes'
import { fmtTime } from '../lib/format'
import { t as tl } from '../lib/i18n'
import { Icon } from './Icon'
import { TrackSheet } from './TrackSheet'

interface Props {
  ed: Editor
  t: number
  pps: number
  setPps: (f: (p: number) => number) => void
  onScrub: (t: number) => void
  onTrimPreview: (clipId: string | null, sourceTime: number) => void
  onTransition: (clipId: string) => void
  onAdd: () => void
  /** A new audio row was made: offer what to put on it (file, voice, computer sound, music). */
  onAudioTrack?: () => void
  /** Select every clip of the main video / every item on a row (from the row's first item). */
  onSelectAll?: () => void
  onSelectRow?: (firstId: string) => void
  snap: boolean
  /** Swap is waiting for a second item: taps pick it instead of selecting. */
  picking?: Selection
  onPicked?: (s: NonNullable<Selection>) => void
}

const SNAP_PX = 10
const EDGE_PX = 48 // dragging a clip this close to the timeline's side scrolls it
const LANE = 34 // height of one track row

type Drag =
  | { kind: 'clip-trim'; id: string; side: 'in' | 'out'; x0: number; in0: number; out0: number; speed: number }
  | { kind: 'layer-trim'; id: string; side: 'in' | 'out'; x0: number; start0: number; end0: number; in0: number; speed: number }
  | { kind: 'layer-move'; id: string; x0: number; y0: number; start0: number; end0: number; moved: boolean }
  // slot: the gap the clip is over (k = before clip k); to: its new index once taken out
  | { kind: 'reorder'; id: string; x0: number; x: number; y: number; slot: number; to: number; moved: boolean }

const LAYER_COLORS: Record<Layer['type'], string> = { text: '#8b5cf6', sticker: '#f59e0b', media: '#14b8a6', blur: '#64748b', audio: '#22c55e', wave: '#0ea5e9' }

function layerLabel(l: Layer) {
  switch (l.type) {
    case 'text': return (l.subtitle ? '💬 ' : 'T  ') + l.text.replace(/\n/g, ' ')
    case 'sticker': return l.emoji
    case 'media': return '▣ Overlay'
    case 'blur': return l.mode === 'pixelate' ? '▦ Pixelate' : '◌ Blur'
    case 'wave': return `〰 ${l.style === 'circle' ? 'Circle' : l.style === 'line' ? 'Line' : 'Bars'}`
    case 'audio': return (l.kind === 'voice' ? '🎙 ' : l.kind === 'sound' ? '🔔 ' : '♪ ') + l.label
  }
}

export function Timeline({ ed, t, pps, setPps, onScrub, onTrimPreview, onTransition, onAdd, onAudioTrack, onSelectAll, onSelectRow, snap, picking, onPicked }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const lastSet = useRef(-1)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const longPress = useRef<number>(0)
  const pinch = useRef<{ d0: number; pps0: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const { project, sources, layout, sel } = ed
  // the other items picked together with the selected one
  const group = useMemo(() => (sel?.all ? new Set(selectedIds(project, sel)) : null), [sel, project])
  const total = layout.total
  const [snapLine, setSnapLine] = useState<number | null>(null)
  const lanesRef = useRef<HTMLDivElement>(null)
  const tracks = project.tracks ?? []
  const mainLocked = !!project.main?.locked
  const [menu, setMenu] = useState<string | null>(null) // track whose settings sheet is open
  const [addMenu, setAddMenu] = useState(false)
  // a row header being dragged up or down to change which row is in front
  const rowDrag = useRef<{ id: string; y0: number; from: number; moved: boolean } | null>(null)
  const [rowTo, setRowTo] = useState<{ id: string; to: number } | null>(null)
  const rowDown = (id: string, i: number) => (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    rowDrag.current = { id, y0: e.clientY, from: i, moved: false }
  }
  const rowMove = (e: React.PointerEvent) => {
    const d = rowDrag.current
    if (!d) return
    const dy = e.clientY - d.y0
    if (!d.moved && Math.abs(dy) < 6) return
    d.moved = true
    const kind = tracks[d.from].kind
    const same = tracks.map((tr, i) => (tr.kind === kind ? i : -1)).filter((i) => i >= 0)
    const to = Math.max(same[0], Math.min(same[same.length - 1], d.from + Math.round(dy / LANE)))
    setRowTo({ id: d.id, to })
  }
  const rowUp = () => {
    const d = rowDrag.current
    rowDrag.current = null
    if (d?.moved && rowTo) ed.reorderTrack(d.id, rowTo.to)
    setRowTo(null)
  }

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

  // Mouse wheel scrolls the timeline sideways (desktop has no swipe). Vertical wheel still scrolls stacked layers
  // when they overflow, unless the pointer is on the ruler or the main track.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      const onTrack = (e.target as Element).closest?.('.tl-ruler, .tl-track')
      if (!onTrack && el.scrollHeight > el.clientHeight + 1) return
      e.preventDefault()
      el.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : 1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Mouse drag pans the timeline like a finger swipe does on touch screens.
  const pan = useRef<{ x0: number; left0: number; moved: boolean } | null>(null)
  const onPanStart = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || dragRef.current) return
    const el = scroller.current!
    pan.current = { x0: e.clientX, left0: el.scrollLeft, moved: false }
    const move = (ev: PointerEvent) => {
      const p = pan.current
      if (!p || dragRef.current) return
      if (Math.abs(ev.clientX - p.x0) > 4) { p.moved = true; clearTimeout(longPress.current) }
      if (p.moved) el.scrollLeft = p.left0 - (ev.clientX - p.x0)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      // let the click that ends a pan through only if the mouse did not move
      if (pan.current?.moved) window.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true })
      setTimeout(() => { pan.current = null })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Tap or click on the ruler jumps the playhead to that time. */
  const onRulerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    onScrub(Math.max(0, Math.min(total, (e.clientX - r.left) / pps)))
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

  // ----- main track reorder: the gap under the pointer, and scrolling while held near a side
  const slotAt = (clientX: number) => {
    const track = scroller.current!.querySelector('.tl-track') as HTMLElement
    const x = clientX - track.getBoundingClientRect().left
    let k = 0
    for (const it of layout.items) if (x > (it.start + it.dur / 2) * pps) k = it.index + 1
    return k
  }
  const toOf = (id: string, slot: number) => {
    const from = project.clips.findIndex((c) => c.id === id)
    return slot > from ? slot - 1 : slot
  }
  const edge = useRef(0)
  const reordering = drag?.kind === 'reorder' && drag.moved
  useEffect(() => {
    if (!reordering) return
    const id = setInterval(() => {
      const d = dragRef.current
      if (!edge.current || d?.kind !== 'reorder') return
      scroller.current!.scrollLeft += edge.current * 14
      const slot = slotAt(d.x)
      if (slot !== d.slot) setDrag({ ...d, slot, to: toOf(d.id, slot) })
    }, 30)
    return () => { clearInterval(id); edge.current = 0 }
  }, [reordering]) // eslint-disable-line react-hooks/exhaustive-deps
  // a finger that held still for the long press must not start scrolling the timeline when it moves
  useEffect(() => {
    const stop = (e: TouchEvent) => {
      const d = dragRef.current
      if (e.cancelable && (d?.kind === 'reorder' || (d?.kind === 'layer-move' && d.moved))) e.preventDefault()
    }
    window.addEventListener('touchmove', stop, { passive: false })
    return () => window.removeEventListener('touchmove', stop)
  }, [])

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
    const dt = (e.clientX - d.x0) / pps
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
      const hasSrc = l.type === 'media' || l.type === 'audio' || l.type === 'wave'
      const srcDur = hasSrc ? sources[(l as { sourceId: string }).sourceId]?.duration ?? Infinity : Infinity
      const targets = snapEdges(l.id)
      if (d.side === 'in') {
        let start = d.start0 + dt
        start = Math.max(0, Math.min(d.end0 - 0.2, start + snapShift([start], targets)))
        if (hasSrc) start = Math.max(start, d.start0 - d.in0 / d.speed)
        ed.updateLayer(l.id, hasSrc ? { start, in: d.in0 + (start - d.start0) * d.speed } : { start })
      } else {
        let end = d.end0 + dt
        end = Math.max(d.start0 + 0.2, end + snapShift([end], targets))
        if (hasSrc) end = Math.min(end, d.start0 + (srcDur - d.in0) / d.speed)
        ed.updateLayer(l.id, { end })
      }
    } else if (d.kind === 'layer-move') {
      if (!d.moved && Math.abs(e.clientX - d.x0) < 6 && Math.abs(e.clientY - d.y0) < 12) return
      if (!d.moved) { ed.begin(); setDrag({ ...d, moved: true }) }
      const len = d.end0 - d.start0
      let start = d.start0 + dt
      start += snapShift([start, start + len], snapEdges(d.id))
      start = Math.max(0, start)
      // dragging up or down moves it to another row of the same kind
      const l = project.layers.find((x) => x.id === d.id)!
      const top = lanesRef.current!.getBoundingClientRect().top
      const row = tracks[Math.max(0, Math.min(tracks.length - 1, Math.floor((e.clientY - top) / LANE)))]
      const track = row && row.kind === trackKind(l) && !row.locked ? row.id : l.track
      ed.updateLayer(d.id, { start, end: start + len, track })
    } else if (d.kind === 'reorder') {
      if (!d.moved && Math.abs(e.clientX - d.x0) < 6) return
      const slot = slotAt(e.clientX)
      setDrag({ ...d, moved: true, x: e.clientX, y: e.clientY, slot, to: toOf(d.id, slot) })
      const r = scroller.current!.getBoundingClientRect()
      const left = (scroller.current!.querySelector('.tl-heads') as HTMLElement | null)?.getBoundingClientRect().right ?? r.left
      edge.current = e.clientX < left + EDGE_PX ? -1 : e.clientX > r.right - EDGE_PX ? 1 : 0
    }
  }

  const onUp = () => {
    clearTimeout(longPress.current)
    const d = dragRef.current
    if (!d) return
    setDrag(null)
    setSnapLine(null)
    if (d.kind === 'clip-trim') { ed.end(); onTrimPreview(null, 0) }
    else if (d.kind === 'layer-trim' || (d.kind === 'layer-move' && d.moved)) { ed.settleLayer(d.id); ed.end() }
    else if (d.kind === 'reorder' && d.moved) {
      // land on the moved clip's new start (the timeline may have scrolled while dragging)
      const at = ed.moveClip(d.id, d.to)
      const el = scroller.current!
      el.scrollLeft = (at ?? t) * pps
      lastSet.current = el.scrollLeft
      if (at !== null) onScrub(at)
    }
  }

  // ----- lanes for overlay layers
  const rowOf = new Map(tracks.map((tr, i) => [tr.id, i]))
  const width = Math.max(total * pps, 1)
  const tickEvery = pps >= 80 ? 1 : pps >= 30 ? 2 : pps >= 12 ? 5 : pps >= 5 ? 10 : 30
  const ticks: number[] = []
  for (let s = 0; s <= total + 0.001; s += tickEvery) ticks.push(s)

  return (
    <div
      className={`timeline${picking ? ' picking' : ''}`}
      onPointerDown={onPointerDownWrap}
      onPointerMove={(e) => { onPointerMoveWrap(e); onMove(e) }}
      onPointerUp={(e) => { onPointerUpWrap(e); onUp() }}
      onPointerCancel={(e) => { onPointerUpWrap(e); onUp() }}
    >
      <div className="tl-scroll" ref={scroller} onScroll={onScroll} onPointerDown={onPanStart} onClick={() => ed.setSel(null)}>
        <div className="tl-heads" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <div className="tl-head-ruler" />
          <div className={`tl-head main${mainLocked ? ' locked' : ''}`}>
            <span className="tl-head-name">{tl('Main')}</span>
            <button className={project.main?.muted ? 'off' : ''} onClick={() => ed.setMain({ muted: !project.main?.muted })} aria-label="Main sound" aria-pressed={!project.main?.muted} title={tl('Sound')}>
              <Icon name={project.main?.muted ? 'mute' : 'volume'} size={16} />
            </button>
            <button className={mainLocked ? 'off' : ''} onClick={() => ed.setMain({ locked: !mainLocked })} aria-label="Lock main" aria-pressed={mainLocked} title={tl('Lock')}>
              <Icon name={mainLocked ? 'lock' : 'unlock'} size={16} />
            </button>
            <button className={sel?.type === 'clip' && sel.all ? 'on' : ''} disabled={mainLocked} onClick={() => onSelectAll?.()} aria-label="Select all clips" title={tl('Select all clips')}>
              <Icon name="selectAll" size={16} />
            </button>
          </div>
          <div className="tl-head-rows">
            {tracks.map((tr, i) => {
              const visual = tr.kind === 'visual'
              const off = visual ? tr.hidden : tr.muted
              const dragging = rowTo?.id === tr.id
              return (
                <div key={tr.id} className={`tl-head${ed.track === tr.id ? ' on' : ''}${tr.locked ? ' locked' : ''}${dragging ? ' dragging' : ''}`}
                  style={{ height: LANE, ...(dragging ? { transform: `translateY(${(rowTo.to - i) * LANE}px)` } : {}) }}>
                  <button className="tl-head-name" onPointerDown={rowDown(tr.id, i)} onPointerMove={rowMove} onPointerUp={rowUp} onPointerCancel={rowUp}
                    onClick={() => { if (!rowTo) ed.setTrack(ed.track === tr.id ? null : tr.id) }} title={tl('Tap: new items go here. Drag up or down: change which row is in front')}>
                    {trackName(tracks, tr, tl)}
                  </button>
                  <button className={off ? 'off' : ''} onClick={() => ed.updateTrack(tr.id, visual ? { hidden: !tr.hidden } : { muted: !tr.muted })}
                    aria-label={visual ? 'Show track' : 'Track sound'} aria-pressed={!off} title={tl(visual ? 'Show on video' : 'Sound')}>
                    <Icon name={visual ? (tr.hidden ? 'eyeOff' : 'eye') : (tr.muted ? 'mute' : 'volume')} size={16} />
                  </button>
                  <button className={tr.locked ? 'off' : ''} onClick={() => ed.updateTrack(tr.id, { locked: !tr.locked })} aria-label="Lock track" aria-pressed={!!tr.locked} title={tl('Lock')}>
                    <Icon name={tr.locked ? 'lock' : 'unlock'} size={16} />
                  </button>
                  <button onClick={() => setMenu(tr.id)} aria-label="Track settings" title={tl('Track settings')}><Icon name="more" size={16} /></button>
                </div>
              )
            })}
          </div>
          <div className="tl-addtrack">
            <button onClick={() => setAddMenu((v) => !v)} aria-expanded={addMenu}><Icon name="plus" size={16} /> {tl('Add track')}</button>
            {addMenu && (
              <div className="tl-addmenu">
                <button onClick={() => { ed.addTrack('visual'); setAddMenu(false) }}><Icon name="overlay" size={16} /> {tl('Video track')}</button>
                <button onClick={() => { ed.addTrack('audio'); setAddMenu(false); onAudioTrack?.() }}><Icon name="music" size={16} /> {tl('Audio track')}</button>
              </div>
            )}
          </div>
        </div>
        <div className="tl-pad" />
        <div className="tl-content" style={{ width }}>
          {snapLine !== null && <div className="tl-snapline" style={{ left: snapLine * pps }} />}
          <div className="tl-ruler" onClick={onRulerClick}>
            {ticks.map((s) => <span key={s} style={{ left: s * pps }}>{fmtTime(s, false)}</span>)}
          </div>
          <div className="tl-track">
            {layout.items.map((it) => {
              const clip = it.clip
              const src = sources[clip.sourceId]
              if (!src) return null
              const selected = sel?.type === 'clip' && sel.id === clip.id
              const inGroup = !selected && !!group?.has(clip.id)
              const reordering = drag?.kind === 'reorder' && drag.moved && drag.id === clip.id
              const speed = clip.ramp ? (clip.out - clip.in) / clipDuration(clip) : clip.speed
              const isImg = src.kind === 'image'
              const thumbW = isImg ? 56 : (src.duration * pps) / speed / src.thumbs.length
              const shift = drag?.kind === 'clip-trim' && drag.id === clip.id && drag.side === 'in' ? ((clip.in - drag.in0) / drag.speed) * pps : 0
              return (
                <div
                  key={clip.id}
                  className={`tl-clip${selected ? ' selected' : ''}${inGroup ? ' group' : ''}${reordering ? ' ghost' : ''}${mainLocked ? ' locked' : ''}`}
                  style={{ left: it.start * pps + shift, width: it.dur * pps }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (picking) onPicked?.({ type: 'clip', id: clip.id })
                    else if (!mainLocked) ed.setSel({ type: 'clip', id: clip.id })
                  }}
                  onPointerDown={(e) => {
                    if (pointers.current.size > 1 || mainLocked || picking || project.clips.length < 2) return
                    const x = e.clientX, y = e.clientY
                    const start: Drag = { kind: 'reorder', id: clip.id, x0: x, x, y, slot: it.index, to: it.index, moved: false }
                    // the selected clip moves as soon as it is dragged (finger or mouse)
                    if (selected) { capture(e); setDrag(start); return }
                    // any other clip: hold it, then drag
                    const pid = e.pointerId
                    const target = e.currentTarget
                    clearTimeout(longPress.current)
                    longPress.current = window.setTimeout(() => {
                      target.setPointerCapture(pid)
                      navigator.vibrate?.(20)
                      ed.setSel({ type: 'clip', id: clip.id })
                      setDrag({ ...start, moved: true })
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
              mainLocked || (sel?.type === 'clip' && (sel.id === it.clip.id || sel.id === layout.items[it.index + 1].clip.id)) ? null : <button
                key={'tr' + it.clip.id}
                className={`tl-trans${it.clip.transition ? ' on' : ''}`}
                style={{ left: (it.start + it.dur - it.transOut / 2) * pps }}
                onClick={(e) => { e.stopPropagation(); onTransition(it.clip.id) }}
                aria-label="Transition"
              >
                {it.clip.transition ? '⧖' : '⇄'}
              </button>
            ))}
            {drag?.kind === 'reorder' && drag.moved && (
              <div className="tl-drop" style={{ left: (layout.items[drag.slot]?.start ?? total) * pps }} />
            )}
            <button className="tl-add" style={{ left: width + 16 }} onClick={(e) => { e.stopPropagation(); onAdd() }} aria-label="Add media">+</button>
          </div>
          <div className="tl-lanes" ref={lanesRef} style={{ height: tracks.length * LANE }}>
            {tracks.map((tr, i) => <div key={tr.id} className={`tl-row${ed.track === tr.id ? ' on' : ''}`} style={{ top: i * LANE }} />)}
            {project.layers.map((l) => {
              const lane = rowOf.get(l.track ?? '') ?? 0
              const row = tracks[lane]
              const locked = !!row?.locked
              const selected = sel?.type === 'layer' && sel.id === l.id
              const inGroup = !selected && !!group?.has(l.id)
              const src = (l.type === 'audio') ? sources[l.sourceId] : null
              return (
                <div
                  key={l.id}
                  className={`tl-layer${selected ? ' selected' : ''}${inGroup ? ' group' : ''}${locked ? ' locked' : ''}${row?.hidden ? ' hidden' : ''}`}
                  style={{ left: l.start * pps, width: Math.max(4, (l.end - l.start) * pps), top: lane * LANE + 3, background: LAYER_COLORS[l.type] }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (picking) onPicked?.({ type: 'layer', id: l.id })
                    else if (!locked) ed.setSel({ type: 'layer', id: l.id })
                  }}
                  onPointerDown={(e) => {
                    if (!selected || locked || picking || pointers.current.size > 1) return
                    capture(e)
                    setDrag({ kind: 'layer-move', id: l.id, x0: e.clientX, y0: e.clientY, start0: l.start, end0: l.end, moved: false })
                  }}
                >
                  {src?.thumbs[0] && <img className="tl-wave" src={src.thumbs[0]} alt="" draggable={false} style={{ width: (src.duration * pps) / layerSpeed(l), left: -((l as { in: number }).in * pps) / layerSpeed(l) }} />}
                  <span>{l.type === 'media' && sources[l.sourceId] ? `▣ ${sources[l.sourceId].name}` : layerLabel(l)}{layerSpeed(l) !== 1 && ` · ${layerSpeed(l)}x`}</span>
                  {keysOf(l).map((k, j) => <i key={j} className="tl-key" style={{ left: k.t * pps }} />)}
                  {selected && (['in', 'out'] as const).map((side) => (
                    <div
                      key={side}
                      className={`tl-lhandle ${side}`}
                      onPointerDown={(e) => {
                        capture(e)
                        ed.begin()
                        setDrag({ kind: 'layer-trim', id: l.id, side, x0: e.clientX, start0: l.start, end0: l.end, in0: (l as { in?: number }).in ?? 0, speed: layerSpeed(l) })
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
      {drag?.kind === 'reorder' && drag.moved && (() => {
        const c = project.clips.find((x) => x.id === drag.id)
        const src = c && sources[c.sourceId]
        return <>
          <div className="tl-reorder-hint">{tl('Move to position')} {drag.to + 1} / {project.clips.length}</div>
          <div className="tl-drag-ghost" style={{ left: drag.x, top: drag.y }}>
            {src?.thumbs[0] && <img src={src.thumbs[0]} alt="" draggable={false} />}
            <b>{drag.to + 1}</b>
          </div>
        </>
      })()}
      {menu && <TrackSheet ed={ed} id={menu} onClose={() => setMenu(null)} onSelectAll={onSelectRow} />}
    </div>
  )
}
