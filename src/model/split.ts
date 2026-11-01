/**
 * Split screen and collage layouts: cells of the frame (normalised, top-left), each filled by one photo or video
 * on its own row. The pictures are cropped to their cell's shape, so they fill it without stretching.
 */
export interface SplitLayout { id: string; name: string; cells: { x: number; y: number; w: number; h: number }[] }

const third = 1 / 3
export const SPLIT_LAYOUTS: SplitLayout[] = [
  { id: '2v', name: 'Side by side', cells: [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }] },
  { id: '2h', name: 'Top and bottom', cells: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }] },
  { id: '3v', name: 'Three columns', cells: [0, 1, 2].map((i) => ({ x: i * third, y: 0, w: third, h: 1 })) },
  { id: '3h', name: 'Three rows', cells: [0, 1, 2].map((i) => ({ x: 0, y: i * third, w: 1, h: third })) },
  { id: '1+2', name: 'Big left', cells: [{ x: 0, y: 0, w: 0.6, h: 1 }, { x: 0.6, y: 0, w: 0.4, h: 0.5 }, { x: 0.6, y: 0.5, w: 0.4, h: 0.5 }] },
  { id: '2+1', name: 'Big right', cells: [{ x: 0, y: 0, w: 0.4, h: 0.5 }, { x: 0, y: 0.5, w: 0.4, h: 0.5 }, { x: 0.4, y: 0, w: 0.6, h: 1 }] },
  { id: '1/3', name: 'Big top', cells: [{ x: 0, y: 0, w: 1, h: 0.6 }, ...[0, 1, 2].map((i) => ({ x: i * third, y: 0.6, w: third, h: 0.4 }))] },
  { id: '2x2', name: 'Four grid', cells: [0, 1, 2, 3].map((i) => ({ x: (i % 2) * 0.5, y: Math.floor(i / 2) * 0.5, w: 0.5, h: 0.5 })) },
  { id: '3x2', name: 'Six grid', cells: [0, 1, 2, 3, 4, 5].map((i) => ({ x: (i % 3) * third, y: Math.floor(i / 3) * 0.5, w: third, h: 0.5 })) },
  { id: '3x3', name: 'Nine grid', cells: Array.from({ length: 9 }, (_, i) => ({ x: (i % 3) * third, y: Math.floor(i / 3) * third, w: third, h: third })) },
]

/** A cell shrunk by the gap (fraction of the short side) on every side that is not the frame's edge… and the edges too, for a framed look. */
export function insetCell(c: SplitLayout['cells'][number], gap: number, W: number, H: number) {
  const g = (gap * Math.min(W, H)) / 2
  const gx = g / W, gy = g / H
  return { x: c.x + gx, y: c.y + gy, w: Math.max(0.02, c.w - gx * 2), h: Math.max(0.02, c.h - gy * 2) }
}
