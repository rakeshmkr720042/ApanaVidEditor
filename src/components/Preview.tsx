import { useEffect, useRef, useState } from 'react'
import type { Player } from '../engine/player'
import type { Editor } from '../model/useEditor'
import type { Layer, MediaLayer, TextLayer, VisualLayer } from '../types'
import { defaultFrame } from '../engine/text'
import { isLocked, playable } from '../model/tracks'
import { atTime } from '../model/keyframes'
import { t as tr } from '../lib/i18n'

type Rect = { x: number; y: number; w: number; h: number }
type Edge = { l?: boolean; r?: boolean; t?: boolean; b?: boolean }

const EDGES: [string, Edge][] = [
  ['l', { l: true }], ['r', { r: true }], ['t', { t: true }], ['b', { b: true }],
  ['tl', { t: true, l: true }], ['tr', { t: true, r: true }], ['bl', { b: true, l: true }], ['br', { b: true, r: true }],
]

/** A free caption's scale folded into its font size, so it looks the same once it sits in a box. */
const baked = (l: TextLayer): TextLayer =>
  l.frame ? l : { ...l, style: { ...l.style, size: l.style.size * l.box.scale }, box: { ...l.box, scale: 1, rotation: 0 } }

/** Blur areas and framed captions are placed as a rectangle rather than a centre + scale. */
const rectOf = (l: Layer): Rect | null => (l.type === 'blur' ? l.rect : l.type === 'text' && l.frame ? l.frame.rect : null)

interface Props {
  ed: Editor
  player: Player | null
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  t: number
  onEditText: (id: string) => void
  onTogglePlay: () => void
  /** Watermark panel is open: the watermark can be dragged. */
  wmEdit?: boolean
}

type Gesture =
  | { kind: 'move'; id: string; x0: number; y0: number; bx: number; by: number }
  | { kind: 'wm'; x0: number; y0: number; cx: number; cy: number }
  | { kind: 'scale'; id: string; cx: number; cy: number; d0: number; a0: number; s0: number; r0: number }
  | { kind: 'edge'; id: string; edge: Edge; x0: number; y0: number; rect0: Rect }
  | { kind: 'pinch'; id: string; d0: number; a0: number; s0: number; r0: number }

/** The video canvas plus handles to move, scale and rotate text, stickers, overlays and blur areas. */
export function Preview({ ed, player, canvasRef, t, onEditText, onTogglePlay, wmEdit }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0, left: 0, top: 0 })
  const gesture = useRef<Gesture | null>(null)
  const lastTap = useRef(0)
  // fingers on the stage, for a two-finger pinch (resize + rotate)
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const wheelEnd = useRef(0)
  const W = player?.renderer.W ?? 16, H = player?.renderer.H ?? 9

  // fit the canvas inside the stage keeping its aspect ratio
  useEffect(() => {
    const el = wrap.current!
    const fit = () => {
      const r = el.getBoundingClientRect()
      const s = Math.min(r.width / W, r.height / H)
      setBox({ w: W * s, h: H * s, left: (r.width - W * s) / 2, top: (r.height - H * s) / 2 })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [W, H])

  const scale = box.w / W
  const visible = (l: { start: number; end: number }) => t >= l.start && t < l.end
  // in drawing order (top track row last); hidden and locked rows can't be picked
  // keyframed layers are shown (and handled) where they are at the playhead
  const layers = playable(ed.project).layers
    .filter((l): l is VisualLayer => l.type !== 'audio' && visible(l) && !isLocked(ed.project, l)).map((l) => atTime(l, t))
  const selected = ed.sel?.type === 'layer' ? layers.find((l) => l.id === ed.sel!.id) : undefined
  const rect = selected && player ? player.renderer.layerRect(selected, ed.sources) : null
  const wmRect = wmEdit && player ? player.renderer.watermarkRect(ed.project, ed.sources, t) : null

  const toCanvas = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - box.left) / scale, y: (e.clientY - r.top - box.top) / scale }
  }

  const hit = (x: number, y: number) => {
    if (!player) return null
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i]
      const r = player.renderer.layerRect(l, ed.sources)
      const a = (-r.rotation * Math.PI) / 180
      const dx = x - r.cx, dy = y - r.cy
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a)
      if (Math.abs(lx) <= r.w / 2 + 8 && Math.abs(ly) <= r.h / 2 + 8) return l
    }
    return null
  }

  /** Two fingers apart and their angle. */
  const spread = () => {
    const [a, b] = [...pts.current.values()]
    return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, a: Math.atan2(b.y - a.y, b.x - a.x) }
  }

  /** New size + turn for a centre-and-scale layer; subtitles change together. */
  const setScaleRot = (l: VisualLayer, scale: number, rotation: number) => {
    if (l.type === 'blur') return
    for (const snap of [-180, -90, 0, 90, 180]) if (Math.abs(rotation - snap) < 4) rotation = snap
    scale = Math.max(0.1, Math.min(8, scale))
    if (l.type === 'text' && l.subtitle) ed.updateLayers((x) => x.type === 'text' && x.subtitle, (x) => ({ box: { ...(x as TextLayer).box, scale, rotation } }))
    else ed.updateLayer(l.id, { box: { ...l.box, scale, rotation } })
  }

  const onDown = (e: React.PointerEvent) => {
    const p = toCanvas(e)
    pts.current.set(e.pointerId, p)
    // a second finger on a selected overlay/sticker/caption turns the drag into a pinch
    if (pts.current.size === 2 && selected && selected.type !== 'blur' && !rectOf(selected)) {
      e.currentTarget.setPointerCapture(e.pointerId)
      if (!gesture.current) ed.begin()
      const sp = spread()
      gesture.current = { kind: 'pinch', id: selected.id, d0: sp.d, a0: sp.a, s0: selected.box.scale, r0: selected.box.rotation }
      return
    }
    if (pts.current.size > 1) return
    if (wmRect && Math.abs(p.x - wmRect.cx) <= wmRect.w / 2 + 10 && Math.abs(p.y - wmRect.cy) <= wmRect.h / 2 + 10) {
      e.currentTarget.setPointerCapture(e.pointerId)
      ed.begin()
      gesture.current = { kind: 'wm', x0: p.x, y0: p.y, cx: wmRect.cx, cy: wmRect.cy }
      return
    }
    const l = hit(p.x, p.y)
    if (!l) {
      const now = Date.now()
      if (now - lastTap.current < 300) onTogglePlay()
      lastTap.current = now
      if (ed.sel?.type === 'layer') ed.setSel(null)
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    if (ed.sel?.type === 'layer' && ed.sel.id === l.id && l.type === 'text' && Date.now() - lastTap.current < 350) onEditText(l.id)
    lastTap.current = Date.now()
    ed.setSel({ type: 'layer', id: l.id })
    ed.begin()
    const lr = rectOf(l)
    const bx = lr ? lr.x : l.type !== 'blur' ? l.box.x : 0, by = lr ? lr.y : l.type !== 'blur' ? l.box.y : 0
    gesture.current = { kind: 'move', id: l.id, x0: p.x, y0: p.y, bx, by }
  }

  const onHandleDown = (e: React.PointerEvent) => {
    if (!selected || !rect) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toCanvas(e)
    ed.begin()
    if (selected.type === 'blur') return
    gesture.current = {
      kind: 'scale', id: selected.id, cx: rect.cx, cy: rect.cy,
      d0: Math.hypot(p.x - rect.cx, p.y - rect.cy) || 1, a0: Math.atan2(p.y - rect.cy, p.x - rect.cx),
      s0: selected.box.scale, r0: selected.box.rotation,
    }
  }

  /** Where a layer's box is now, as a rectangle (a free caption's measured size, unrotated). */
  const boxOf = (l: VisualLayer): Rect | null => {
    const lr = rectOf(l)
    if (lr) return { ...lr }
    if (l.type !== 'text' || !player) return null
    const r = player.renderer.layerRect(l, ed.sources)
    const w = Math.min(1, r.w / W), h = Math.min(1, r.h / H)
    return { x: Math.max(0, Math.min(1 - w, r.cx / W - w / 2)), y: Math.max(0, Math.min(1 - h, r.cy / H - h / 2)), w, h }
  }

  /** Height a caption box w wide needs so its text (every subtitle's, for subtitles) shows at full size. */
  const fitH = (l: TextLayer, w: number) => {
    if (!player) return 0
    const all = l.subtitle ? ed.project.layers.filter((x): x is TextLayer => x.type === 'text' && x.subtitle) : [l]
    return Math.max(...all.map((x) => player.renderer.fitFrameHeight(baked(x), w)))
  }

  /** Puts a caption in a box (all subtitles together); a free caption becomes a see-through box. */
  const setTextRect = (l: TextLayer, r: Rect) => {
    const frame = l.frame ? { ...l.frame, preset: 'custom' as const, rect: r } : { ...defaultFrame('custom'), rect: r, fillOpacity: 0 }
    const patch = (x: Layer) => {
      const b = baked(x as TextLayer)
      return { frame: { ...frame, rect: { ...r } }, style: b.style, box: b.box }
    }
    if (l.subtitle) ed.updateLayers((x) => x.type === 'text' && x.subtitle, patch)
    else ed.updateLayer(l.id, patch(l))
  }

  const onEdgeDown = (edge: Edge) => (e: React.PointerEvent) => {
    if (!selected || (selected.type !== 'text' && selected.type !== 'blur')) return
    const r0 = boxOf(selected)
    if (!r0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toCanvas(e)
    ed.begin()
    gesture.current = { kind: 'edge', id: selected.id, edge, x0: p.x, y0: p.y, rect0: r0 }
  }

  /** Quick spots for a caption: the left or right half of the screen, or the full width. */
  const quick = (where: 'left' | 'right' | 'full') => {
    if (selected?.type !== 'text') return
    const cur = boxOf(selected)
    if (!cur) return
    const x = where === 'right' ? 0.5 : 0, w = where === 'full' ? 1 : 0.5
    const h = Math.max(0.08, fitH(selected, w))
    const y = Math.max(0, Math.min(1 - h, cur.y + cur.h / 2 - h / 2))
    ed.begin()
    setTextRect(selected, { x, y, w, h })
    ed.end()
  }

  const onMove = (e: React.PointerEvent) => {
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, toCanvas(e))
    const g = gesture.current
    if (!g) return
    const p = toCanvas(e)
    if (g.kind === 'pinch') {
      if (pts.current.size < 2) return
      const l0 = ed.project.layers.find((x) => x.id === g.id)
      if (!l0 || l0.type === 'audio') return
      const sp = spread()
      setScaleRot(atTime(l0, t), g.s0 * (sp.d / g.d0), g.r0 + ((sp.a - g.a0) * 180) / Math.PI)
      return
    }
    if (g.kind === 'wm') {
      // dragging pins a floating watermark to the spot it was dropped
      ed.setWatermark({ position: 'custom', motion: 'static', x: (g.cx + p.x - g.x0) / W, y: (g.cy + p.y - g.y0) / H })
      return
    }
    const l0 = ed.project.layers.find((x) => x.id === g.id)
    if (!l0 || l0.type === 'audio') return
    const l = atTime(l0, t)
    const lr = rectOf(l)
    const setRect = (r: Rect) => {
      if (l.type === 'blur') ed.updateLayer(l.id, { rect: r })
      else if (l.type === 'text') setTextRect(l, r)
    }
    if (g.kind === 'move') {
      let nx = g.bx + (p.x - g.x0) / W, ny = g.by + (p.y - g.y0) / H
      if (lr) {
        // caption frames stay on screen; blur areas may hang off the edge
        if (l.type === 'text') { nx = Math.max(0, Math.min(1 - lr.w, nx)); ny = Math.max(0, Math.min(1 - lr.h, ny)) }
        setRect({ ...lr, x: nx, y: ny })
      } else if (l.type !== 'blur') {
        // snap to centre lines
        if (Math.abs(nx - 0.5) < 0.015) nx = 0.5
        if (Math.abs(ny - 0.5) < 0.015) ny = 0.5
        // subtitles move together, so the next line shows up in the same spot
        if (l.type === 'text' && l.subtitle) ed.updateLayers((x) => x.type === 'text' && x.subtitle, (x) => ({ box: { ...(x as TextLayer).box, x: nx, y: ny } }))
        else ed.updateLayer(l.id, { box: { ...l.box, x: nx, y: ny } })
      }
    } else if (g.kind === 'edge') {
      // drag one side (or a corner); the opposite side stays where it is
      const r0 = g.rect0, e = g.edge
      const keep = l.type === 'text', min = keep ? 0.05 : 0.02
      const dx = (p.x - g.x0) / W, dy = (p.y - g.y0) / H
      let x = r0.x, y = r0.y, w = r0.w, h = r0.h
      if (e.l) { x = Math.min(r0.x + r0.w - min, r0.x + dx); if (keep) x = Math.max(0, x); w = r0.x + r0.w - x }
      if (e.r) { w = Math.max(min, r0.w + dx); if (keep) w = Math.min(w, 1 - x) }
      if (e.t) { y = Math.min(r0.y + r0.h - min, r0.y + dy); if (keep) y = Math.max(0, y); h = r0.y + r0.h - y }
      if (e.b) { h = Math.max(min, r0.h + dy); if (keep) h = Math.min(h, 1 - y) }
      if (l.type === 'text' && !e.t && !e.b) {
        // narrowing a caption wraps it onto more lines: grow the box to fit rather than shrink the text
        h = Math.max(h, fitH(l, w))
        if (y + h > 1) { h = Math.min(1, h); y = 1 - h }
      }
      setRect({ x, y, w, h })
    } else if (l.type !== 'blur') {
      const d = Math.hypot(p.x - g.cx, p.y - g.cy)
      setScaleRot(l, g.s0 * (d / g.d0), g.r0 + ((Math.atan2(p.y - g.cy, p.x - g.cx) - g.a0) * 180) / Math.PI)
    }
  }

  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId)
    // lifting one finger of a pinch waits for the other
    if (gesture.current?.kind === 'pinch' && pts.current.size) return
    if (gesture.current) { gesture.current = null; ed.end() }
  }

  /** Mouse wheel over the selected layer resizes it (desktop has no pinch); one undo step per spin. */
  const onWheel = (e: React.WheelEvent) => {
    if (!selected || selected.type === 'blur' || rectOf(selected) || gesture.current) return
    const r = wrap.current!.getBoundingClientRect()
    if (!hit((e.clientX - r.left - box.left) / scale, (e.clientY - r.top - box.top) / scale)) return
    if (!wheelEnd.current) ed.begin()
    clearTimeout(wheelEnd.current)
    wheelEnd.current = window.setTimeout(() => { wheelEnd.current = 0; ed.end() }, 400)
    setScaleRot(selected, selected.box.scale * Math.exp(-e.deltaY * 0.0015), selected.box.rotation)
  }

  /** Quick spots for an overlay photo/video: fill or fit the screen, or picture-in-picture in a corner. */
  const place = (where: 'fill' | 'fit' | 'tl' | 'tr' | 'bl' | 'br') => {
    if (selected?.type !== 'media' || !player) return
    const one = player.renderer.layerRect({ ...selected, box: { ...selected.box, scale: 1 } }, ed.sources)
    const box1 = { ...selected.box, rotation: 0 }
    let next: MediaLayer['box']
    if (where === 'fill' || where === 'fit') {
      const k = where === 'fill' ? Math.max(W / one.w, H / one.h) : Math.min(W / one.w, H / one.h)
      next = { ...box1, x: 0.5, y: 0.5, scale: k }
    } else {
      // a third of the screen wide, a small margin from the edges
      const k = Math.min((W * 0.34) / one.w, (H * 0.4) / one.h), m = 0.03
      const hw = (one.w * k) / W / 2, hh = (one.h * k) / H / 2
      next = { ...box1, scale: k, x: where.endsWith('l') ? m + hw : 1 - m - hw, y: where.startsWith('t') ? m + hh : 1 - m - hh }
    }
    ed.begin()
    ed.updateLayer(selected.id, { box: next })
    ed.end()
  }

  return (
    <div className="stage" ref={wrap} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
      <canvas ref={canvasRef} className="preview-canvas" style={{ width: box.w, height: box.h, left: box.left, top: box.top }} />
      {wmRect && (
        <div className="sel-box wm" style={{ left: box.left + wmRect.cx * scale, top: box.top + wmRect.cy * scale, width: wmRect.w * scale, height: wmRect.h * scale, transform: 'translate(-50%, -50%)' }} />
      )}
      {selected && rect && (
        <div
          className="sel-box"
          style={{
            left: box.left + rect.cx * scale, top: box.top + rect.cy * scale, width: rect.w * scale, height: rect.h * scale,
            transform: `translate(-50%, -50%) rotate(${rect.rotation}deg)`,
          }}
        >
          {(selected.type === 'text' || selected.type === 'blur') && EDGES
            // a free caption keeps its corner for scale + rotate; sides resize it into a box
            .filter(([k]) => rectOf(selected) || k.length === 1)
            .map(([k, edge]) => (
              <div key={k} className={`sel-edge e-${k}`} onPointerDown={onEdgeDown(edge)} onPointerMove={onMove} onPointerUp={onUp} />
            ))}
          {!rectOf(selected) && <div className="sel-handle" onPointerDown={onHandleDown} onPointerMove={onMove} onPointerUp={onUp} />}
        </div>
      )}
      {selected?.type === 'media' && (
        <div className="frame-quick" onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => place('fill')}>⛶ {tr('Full screen')}</button>
          <button onClick={() => place('fit')}>▭ {tr('Fit')}</button>
          <button onClick={() => place('tl')} aria-label={tr('Top left')} title={tr('Top left')}>◰</button>
          <button onClick={() => place('tr')} aria-label={tr('Top right')} title={tr('Top right')}>◳</button>
          <button onClick={() => place('bl')} aria-label={tr('Bottom left')} title={tr('Bottom left')}>◱</button>
          <button onClick={() => place('br')} aria-label={tr('Bottom right')} title={tr('Bottom right')}>◲</button>
        </div>
      )}
      {selected?.type === 'text' && (
        <div className="frame-quick" onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => quick('left')}>◧ {tr('Left half')}</button>
          <button onClick={() => quick('full')}>▭ {tr('Full width')}</button>
          <button onClick={() => quick('right')}>◨ {tr('Right half')}</button>
        </div>
      )}
    </div>
  )
}
