import { useEffect, useRef, useState } from 'react'
import type { Player } from '../engine/player'
import type { Editor } from '../model/useEditor'
import type { VisualLayer } from '../types'

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
  | { kind: 'scale'; id: string; cx: number; cy: number; d0: number; a0: number; s0: number; r0: number; rect0?: { x: number; y: number; w: number; h: number } }

/** The video canvas plus handles to move, scale and rotate text, stickers, overlays and blur areas. */
export function Preview({ ed, player, canvasRef, t, onEditText, onTogglePlay, wmEdit }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0, left: 0, top: 0 })
  const gesture = useRef<Gesture | null>(null)
  const lastTap = useRef(0)
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
  const layers = ed.project.layers.filter((l): l is VisualLayer => l.type !== 'audio' && visible(l))
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

  const onDown = (e: React.PointerEvent) => {
    const p = toCanvas(e)
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
    const bx = l.type === 'blur' ? l.rect.x : l.box.x, by = l.type === 'blur' ? l.rect.y : l.box.y
    gesture.current = { kind: 'move', id: l.id, x0: p.x, y0: p.y, bx, by }
  }

  const onHandleDown = (e: React.PointerEvent) => {
    if (!selected || !rect) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toCanvas(e)
    ed.begin()
    gesture.current = {
      kind: 'scale', id: selected.id, cx: rect.cx, cy: rect.cy,
      d0: Math.hypot(p.x - rect.cx, p.y - rect.cy) || 1, a0: Math.atan2(p.y - rect.cy, p.x - rect.cx),
      s0: selected.type === 'blur' ? 1 : selected.box.scale, r0: selected.type === 'blur' ? 0 : selected.box.rotation,
      rect0: selected.type === 'blur' ? { ...selected.rect } : undefined,
    }
  }

  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g) return
    const p = toCanvas(e)
    if (g.kind === 'wm') {
      // dragging pins a floating watermark to the spot it was dropped
      ed.setWatermark({ position: 'custom', motion: 'static', x: (g.cx + p.x - g.x0) / W, y: (g.cy + p.y - g.y0) / H })
      return
    }
    const l = ed.project.layers.find((x) => x.id === g.id)
    if (!l || l.type === 'audio') return
    if (g.kind === 'move') {
      let nx = g.bx + (p.x - g.x0) / W, ny = g.by + (p.y - g.y0) / H
      if (l.type !== 'blur') {
        // snap to centre lines
        if (Math.abs(nx - 0.5) < 0.015) nx = 0.5
        if (Math.abs(ny - 0.5) < 0.015) ny = 0.5
        ed.updateLayer(l.id, { box: { ...l.box, x: nx, y: ny } })
      } else ed.updateLayer(l.id, { rect: { ...l.rect, x: nx, y: ny } })
    } else {
      const d = Math.hypot(p.x - g.cx, p.y - g.cy)
      const k = d / g.d0
      if (l.type === 'blur' && g.rect0) {
        const r0 = g.rect0
        const cx = r0.x + r0.w / 2, cy = r0.y + r0.h / 2
        const w = Math.max(0.03, Math.min(1, Math.abs(p.x / W - cx) * 2)), h = Math.max(0.03, Math.min(1, Math.abs(p.y / H - cy) * 2))
        ed.updateLayer(l.id, { rect: { x: cx - w / 2, y: cy - h / 2, w, h } })
      } else if (l.type !== 'blur') {
        let rot = g.r0 + ((Math.atan2(p.y - g.cy, p.x - g.cx) - g.a0) * 180) / Math.PI
        for (const snap of [-180, -90, 0, 90, 180]) if (Math.abs(rot - snap) < 4) rot = snap
        ed.updateLayer(l.id, { box: { ...l.box, scale: Math.max(0.1, Math.min(8, g.s0 * k)), rotation: rot } })
      }
    }
  }

  const onUp = () => {
    if (gesture.current) { gesture.current = null; ed.end() }
  }

  return (
    <div className="stage" ref={wrap} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
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
          <div className="sel-handle" onPointerDown={onHandleDown} onPointerMove={onMove} onPointerUp={onUp} />
        </div>
      )}
    </div>
  )
}
