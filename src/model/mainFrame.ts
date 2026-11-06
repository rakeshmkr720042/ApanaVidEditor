import type { MainFrame } from '../types'

/** Shapes the main video's frame can take; 'free' = any size. */
export type FramePreset = NonNullable<MainFrame['preset']>

export const FRAME_PRESETS: { value: FramePreset; label: string; ratio: number | null }[] = [
  { value: 'full', label: 'Full screen', ratio: null },
  { value: '9:16', label: '9:16', ratio: 9 / 16 },
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
  { value: '1:1', label: '1:1', ratio: 1 },
  { value: '4:5', label: '4:5', ratio: 4 / 5 },
  { value: 'free', label: 'Free', ratio: null },
]

/** The frame filling the whole screen (the same as no frame). */
export const FULL_FRAME: MainFrame = { x: 0, y: 0, w: 1, h: 1, fit: 'fill', round: 0, border: 0, borderColor: '#ffffff', shadow: false, preset: 'full' }

/** True when the frame changes the picture (anything other than the whole screen, plain). */
export function mainFrameOn(f: MainFrame | null | undefined): f is MainFrame {
  if (!f) return false
  const full = Math.abs(f.x) < 1e-4 && Math.abs(f.y) < 1e-4 && Math.abs(f.w - 1) < 1e-4 && Math.abs(f.h - 1) < 1e-4
  return !full || f.round > 0 || (f.border ?? 0) > 0
}

/** Width / height of the frame in screen pixels. */
export const frameRatio = (f: Pick<MainFrame, 'w' | 'h'>, W: number, H: number) => (f.w * W) / (f.h * H)

/**
 * The biggest box of a preset's shape that fits the screen at `size` (1 = touching the screen's edges), centred
 * on (cx, cy) and kept on screen. Sizes are fractions of the screen.
 */
export function presetRect(preset: FramePreset, W: number, H: number, size = 0.9, cx = 0.5, cy = 0.5) {
  const p = FRAME_PRESETS.find((x) => x.value === preset)
  if (!p?.ratio) return preset === 'full' ? { x: 0, y: 0, w: 1, h: 1 } : { x: (1 - size) / 2, y: (1 - size) / 2, w: size, h: size }
  // in pixels: the biggest box with this ratio inside W x H
  let pw = W, ph = W / p.ratio
  if (ph > H) { ph = H; pw = H * p.ratio }
  const w = (pw / W) * size, h = (ph / H) * size
  return keepOn({ x: cx - w / 2, y: cy - h / 2, w, h })
}

/** Moves a box back onto the screen (it may still be bigger than the screen when made so on purpose). */
export function keepOn(r: { x: number; y: number; w: number; h: number }) {
  const x = r.w <= 1 ? Math.max(0, Math.min(1 - r.w, r.x)) : r.x
  const y = r.h <= 1 ? Math.max(0, Math.min(1 - r.h, r.y)) : r.y
  return { ...r, x, y }
}

/** Grows or shrinks a frame around its centre, keeping its shape. */
export function scaleFrame(f: MainFrame, k: number): MainFrame {
  const w0 = f.w, h0 = f.h
  let s = k
  // not smaller than 10% of the screen, not bigger than the screen
  s = Math.max(0.1 / Math.min(w0, h0), Math.min(1 / Math.max(w0, h0), s))
  const w = w0 * s, h = h0 * s
  const cx = f.x + w0 / 2, cy = f.y + h0 / 2
  return { ...f, ...keepOn({ x: cx - w / 2, y: cy - h / 2, w, h }) }
}

/** Lines a dragged frame edge or centre is pulled onto: the screen's sides, its centre and thirds. */
export const SNAP_LINES = [0, 1 / 3, 0.5, 2 / 3, 1]
export const SNAP_DIST = 0.015

/**
 * Pulls a moved box onto the snap lines: its left/right side or centre onto a vertical line, its top/bottom or
 * centre onto a horizontal one. Returns the box and the lines it snapped to (for drawing guides).
 */
export function snapMove(r: { x: number; y: number; w: number; h: number }, on = true) {
  const guides: { v: number[]; h: number[] } = { v: [], h: [] }
  if (!on) return { r, guides }
  const pull = (start: number, size: number, out: number[]) => {
    let best: { d: number; line: number; at: number } | null = null
    for (const line of SNAP_LINES) {
      for (const [k, at] of [[0, start], [0.5, start + size / 2], [1, start + size]] as const) {
        const d = Math.abs(at - line)
        if (d < SNAP_DIST && (!best || d < best.d)) best = { d, line, at: line - k * size }
      }
    }
    if (!best) return start
    out.push(best.line)
    return best.at
  }
  const x = pull(r.x, r.w, guides.v)
  const y = pull(r.y, r.h, guides.h)
  return { r: { ...r, x, y }, guides }
}

/** Pulls one moving edge (a coordinate 0..1) onto a snap line. */
export function snapEdge(v: number, on = true): { v: number; line: number | null } {
  if (!on) return { v, line: null }
  for (const line of SNAP_LINES) if (Math.abs(v - line) < SNAP_DIST) return { v: line, line }
  return { v, line: null }
}

/**
 * Where the main video goes inside the frame (pixels). Fill: covers the frame (the edges are cut off). Fit: the
 * whole picture shows inside it.
 */
export function contentRect(f: MainFrame, W: number, H: number) {
  const bx = f.x * W, by = f.y * H, bw = f.w * W, bh = f.h * H
  const s = f.fit === 'fit' ? Math.min(bw / W, bh / H) : Math.max(bw / W, bh / H)
  const dw = W * s, dh = H * s
  return { bx, by, bw, bh, dx: bx + (bw - dw) / 2, dy: by + (bh - dh) / 2, dw, dh }
}
