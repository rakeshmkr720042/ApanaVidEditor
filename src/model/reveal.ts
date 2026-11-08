import type { ShapeMask, ShapeReveal } from '../types'

/** The shapes a scene can open in, with a small sign so they are easy to tell apart. */
export const REVEAL_SHAPE_OPTIONS: { value: ShapeMask['shape']; label: string }[] = [
  { value: 'heart', label: '❤ Heart' }, { value: 'star', label: '★ Star' }, { value: 'ellipse', label: '● Circle' },
  { value: 'diamond', label: '◆ Diamond' }, { value: 'flower', label: '✿ Flower' }, { value: 'keyhole', label: '🔑 Keyhole' },
  { value: 'hexagon', label: '⬢ Hexagon' }, { value: 'triangle', label: '▲ Triangle' }, { value: 'cross', label: '✚ Plus' },
  { value: 'cloud', label: '☁ Cloud' }, { value: 'drop', label: '💧 Drop' }, { value: 'sparkle', label: '✦ Sparkle' },
  { value: 'octagon', label: '⯃ Octagon' }, { value: 'rect', label: '▢ Box' },
]

export const defaultReveal = (shape: ShapeMask['shape']): ShapeReveal => ({
  open: 1.2, close: 0, fill: true, spin: 0, pulse: shape === 'heart', edge: shape === 'heart' ? '#ff2d55' : '#ffffff',
})
