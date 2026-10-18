import type { Scene } from '../model/scenes'
import { ensureFont } from '../engine/text'
import { renderCanvasVideo } from './canvasVideo'
import { uid } from './format'

/**
 * Mind map → video. A map is a tree of short texts. It is laid out by rules (no AI model) and
 * revealed one step at a time: the central topic, then each branch growing out of it with its
 * points, then optionally the whole map. Every step is one scene, rendered as a short clip where
 * the lines draw and the new nodes pop in, then hold still for as long as the scene lasts.
 */

export interface MindNode {
  id: string
  text: string
  children: MindNode[]
}

export type MapLayout = 'radial' | 'tree'

export interface MapSettings {
  theme: string
  layout: MapLayout
  focus: boolean // zoom to each branch and dim the earlier ones
}

/** What a mind map scene shows: one step of the reveal. */
export interface MindScene {
  map: MindNode
  settings: MapSettings
  overview: boolean // whether the reveal ends with the whole map
  step: number // index into stepsOf(map, overview)
}

export type MapStep = { kind: 'root' } | { kind: 'branch'; index: number } | { kind: 'overview' }

export const node = (text: string, children: MindNode[] = []): MindNode => ({ id: uid(), text, children })

const deva = (s: string) => /[ऀ-ॿ]/.test(s)
const allText = (n: MindNode): string => [n.text, ...n.children.map(allText)].join(' ')
const fontOf = (map: MindNode) => (deva(allText(map)) ? 'Noto Sans Devanagari' : 'Poppins')

// ---------------------------------------------------------------- text in and out

const BULLET = /^(?:[-*+•·▪●◦➤►▶✓✔→]|\d{1,2}[.)])\s+/

function plain(s: string) {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Indented outline or Markdown list → tree. Deeper indentation means a sub-point; a bullet counts
 * one step deeper than a plain line at the same indent, so "Topic" followed by "- point" works
 * without indenting. # headings set the level directly. A lone first line is the central topic.
 */
export function parseOutline(raw: string, fallbackTitle = 'Mind map'): MindNode | null {
  const top: MindNode = node('')
  const stack: { level: number; n: MindNode }[] = [{ level: -Infinity, n: top }]
  for (const rawLine of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.replace(/\t/g, '    ')
    if (!line.trim() || /^\s*([-*_=])\1{2,}\s*$/.test(line)) continue
    const indent = line.length - line.trimStart().length
    let s = line.trim()
    let level: number
    const h = /^(#{1,6})\s+/.exec(s)
    if (h) { level = (h[1].length - 1) * 2 - 1000; s = s.slice(h[0].length) } // headings sit above any list
    else {
      const b = BULLET.exec(s)
      level = indent * 2 + (b ? 1 : 0)
      if (b) s = s.slice(b[0].length)
    }
    s = plain(s.replace(/:$/, ''))
    if (!s) continue
    while (stack[stack.length - 1].level >= level) stack.pop()
    const n = node(s)
    stack[stack.length - 1].n.children.push(n)
    stack.push({ level, n })
  }
  const roots = top.children
  if (!roots.length) return null
  if (roots.length === 1) return roots[0]
  // several top-level lines: a first line without points is the topic, the rest its branches
  if (!roots[0].children.length) return { ...roots[0], children: roots.slice(1) }
  return node(fallbackTitle, roots)
}

/** Tree → indented outline (two spaces a level), the same format parseOutline reads. */
export function toOutline(root: MindNode): string {
  const out: string[] = [root.text]
  const walk = (n: MindNode, d: number) => { for (const c of n.children) { out.push(`${'  '.repeat(d)}- ${c.text}`); walk(c, d + 1) } }
  walk(root, 0)
  return out.join('\n')
}

/** Drops empty nodes (left over in the editor), keeping their points. */
export function tidy(n: MindNode): MindNode {
  const kids = n.children.flatMap((c) => { const t = tidy(c); return t.text.trim() ? [t] : t.children })
  return { ...n, text: n.text.trim(), children: kids }
}

export function stepsOf(map: MindNode, overview: boolean): MapStep[] {
  return [{ kind: 'root' }, ...map.children.map((_, index) => ({ kind: 'branch' as const, index })), ...(overview && map.children.length > 1 ? [{ kind: 'overview' as const }] : [])]
}

const say = (s: string) => (/[.!?।॥]$/.test(s) ? s : `${s}${deva(s) ? '।' : '.'}`)

/** What the voice reads on a step: the topic, or a branch and its points. */
export function narration(map: MindNode, step: MapStep): string {
  if (step.kind === 'root') return say(map.text)
  if (step.kind === 'overview') return ''
  const b = map.children[step.index]
  const points: string[] = []
  const walk = (n: MindNode) => n.children.forEach((c) => { points.push(c.text); walk(c) })
  walk(b)
  if (!points.length) return say(b.text)
  return `${b.text}${deva(b.text) ? ' —' : ':'} ${say(points.join(', '))}`
}

// ---------------------------------------------------------------- looks

export interface MapTheme {
  id: string
  label: string
  bg: [string, string]
  text: string // points
  root: string
  rootText: string
  branchText: string
  colors: string[] // one per branch, repeating
  tint: number // fill strength behind points
}

export const MAP_THEMES: MapTheme[] = [
  {
    id: 'light', label: 'Light', bg: ['#ffffff', '#edf1f8'], text: '#1f2937', root: '#1e293b', rootText: '#ffffff', branchText: '#ffffff',
    colors: ['#3b6cf6', '#f0712c', '#0e9f6e', '#e0245e', '#8b5cf6', '#0891b2', '#ca8a04', '#db2777'], tint: 0.12,
  },
  {
    id: 'night', label: 'Night', bg: ['#0b1023', '#24124a'], text: '#e5e7eb', root: '#fbbf24', rootText: '#1c1917', branchText: '#0b1023',
    colors: ['#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf', '#facc15', '#f87171'], tint: 0.16,
  },
  {
    id: 'chalk', label: 'Chalkboard', bg: ['#21402f', '#173226'], text: '#f1f5ef', root: '#fef3c7', rootText: '#1f3b2d', branchText: '#1f3b2d',
    colors: ['#fde68a', '#a5f3fc', '#fbcfe8', '#bbf7d0', '#ddd6fe', '#fed7aa', '#bae6fd', '#fecdd3'], tint: 0.14,
  },
]

export const mapThemeOf = (id: string) => MAP_THEMES.find((x) => x.id === id) ?? MAP_THEMES[0]

// ---------------------------------------------------------------- layout

interface Pt { x: number; y: number }

interface LNode {
  n: MindNode
  depth: number
  branch: number // index of the first-level branch it belongs to; -1 for the topic
  parent: LNode | null
  x: number; y: number // centre
  w: number; h: number
  px: number // font size
  lines: string[]
  edge: Pt[] // line from the parent, as points
  edgeLen: number[] // running length along `edge`
}

interface Rect { x0: number; y0: number; x1: number; y1: number }

interface Laid {
  root: LNode
  nodes: LNode[]
  branches: LNode[][] // each branch's nodes in reveal order (the branch first)
  font: string
  lh: number
  unit: number
}

let measure: CanvasRenderingContext2D | null = null

function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w
    if (cur && g.measureText(next).width > width) { lines.push(cur); cur = w } else cur = next
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

function bezier(a: Pt, b: Pt, horizontal: boolean): Pt[] {
  const pts: Pt[] = []
  const dx = (b.x - a.x) * 0.55, dy = (b.y - a.y) * 0.55
  const c1 = horizontal ? { x: a.x + dx, y: a.y } : { x: a.x, y: a.y + dy }
  const c2 = horizontal ? { x: b.x - dx, y: b.y } : { x: b.x, y: b.y - dy }
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, u = 1 - t
    pts.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    })
  }
  return pts
}

function lengths(pts: Pt[]) {
  const out = [0]
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  return out
}

const layoutCache = new WeakMap<MindNode, Map<string, Laid>>()

/** Places every node of the map for a W×H frame. Sizes are in frame pixels before the camera. */
function layout(map: MindNode, s: MapSettings, W: number, H: number): Laid {
  const key = `${s.layout}|${W}x${H}`
  let byKey = layoutCache.get(map)
  if (!byKey) { byKey = new Map(); layoutCache.set(map, byKey) }
  const hit = byKey.get(key)
  if (hit) return hit

  measure ??= document.createElement('canvas').getContext('2d')!
  const g = measure
  const font = fontOf(map)
  const lh = font === 'Poppins' ? 1.22 : 1.42
  const f = Math.min(W, H) * 0.04
  const tree = s.layout === 'tree'
  const indent = f * 2.6
  const maxW = (depth: number) => tree
    ? Math.min(f * 16, W * 0.84 - depth * indent)
    : f * (depth === 0 ? 8.5 : depth === 1 ? 7 : 6.5)

  const nodes: LNode[] = []
  const make = (n: MindNode, depth: number, branch: number, parent: LNode | null): LNode => {
    const px = f * (depth === 0 ? 1.4 : depth === 1 ? 1.05 : 0.86)
    g.font = `700 ${Math.round(px)}px "${font}"`
    const lines = wrap(g, n.text, maxW(depth))
    const tw = Math.max(...lines.map((l) => g.measureText(l).width))
    const padX = px * (depth === 0 ? 0.9 : 0.7), padY = px * (depth === 0 ? 0.6 : 0.42)
    const ln: LNode = { n, depth, branch, parent, x: 0, y: 0, w: tw + padX * 2, h: lines.length * px * lh + padY * 2, px, lines, edge: [], edgeLen: [0] }
    nodes.push(ln)
    return ln
  }
  const root = make(map, 0, -1, null)
  const kids = new Map<LNode, LNode[]>()
  const build = (p: LNode, branch: number) => {
    const list = p.n.children.map((c, i) => {
      const b = p.depth === 0 ? i : branch
      const ln = make(c, p.depth + 1, b, p)
      build(ln, b)
      return ln
    })
    kids.set(p, list)
  }
  build(root, -1)
  const branchNodes = kids.get(root)!

  if (tree) {
    // an indented tree: topic at the top, every point on its own row, joined by elbow lines
    const gap = f * 0.42, groupGap = f * 0.95
    root.x = root.w / 2; root.y = root.h / 2
    let y = root.h + groupGap
    const place = (ln: LNode) => {
      const p = ln.parent!
      ln.x = ln.depth * indent + ln.w / 2
      ln.y = y + ln.h / 2
      y += ln.h + gap
      const sx = p === root ? indent * 0.5 : p.x - p.w / 2 + indent * 0.5
      const r = Math.min(f * 0.5, Math.abs(ln.y - (p.y + p.h / 2)) / 2)
      const ex = ln.x - ln.w / 2
      // straight down, a rounded corner, then across to the point
      ln.edge = [{ x: sx, y: p.y + p.h / 2 }, { x: sx, y: ln.y - r }]
      for (let i = 1; i <= 6; i++) { const a = (Math.PI / 2) * (i / 6); ln.edge.push({ x: sx + r - r * Math.cos(a), y: ln.y - r + r * Math.sin(a) }) }
      ln.edge.push({ x: ex, y: ln.y })
      for (const c of kids.get(ln)!) place(c)
    }
    branchNodes.forEach((b, i) => { if (i) y += groupGap - gap; place(b) })
  } else {
    // left and right of the topic, each side a tidy tree growing outwards
    const gapY = f * 0.38, groupGap = f * 0.8, gapX = f * 1.7, gap0 = f * 2.4
    const span = new Map<LNode, number>()
    const sub = (ln: LNode): number => {
      const ks = kids.get(ln)!
      const h = ks.length ? Math.max(ln.h, ks.reduce((a, c) => a + sub(c), 0) + gapY * (ks.length - 1)) : ln.h
      span.set(ln, h)
      return h
    }
    branchNodes.forEach(sub)
    const place = (ln: LNode, edge: number, top: number, side: number) => {
      const h = span.get(ln)!
      ln.x = edge + (side * ln.w) / 2
      ln.y = top + h / 2
      const ks = kids.get(ln)!
      const total = ks.reduce((a, c) => a + span.get(c)!, 0) + gapY * Math.max(0, ks.length - 1)
      let y = top + (h - total) / 2
      for (const c of ks) { place(c, edge + side * (ln.w + gapX), y, side); y += span.get(c)! + gapY }
    }
    // keep the order: the first branches go right (top to bottom), the rest left
    const hs = branchNodes.map((b) => span.get(b)!)
    let best = hs.length, bestDiff = Infinity
    for (let k = Math.ceil(hs.length / 2); k <= hs.length; k++) {
      const d = Math.abs(hs.slice(0, k).reduce((a, b) => a + b, 0) - hs.slice(k).reduce((a, b) => a + b, 0))
      if (d < bestDiff - 1e-6) { bestDiff = d; best = k }
    }
    const sides: [LNode[], number][] = [[branchNodes.slice(0, best), 1], [branchNodes.slice(best), -1]]
    for (const [list, side] of sides) {
      const total = list.reduce((a, b) => a + span.get(b)!, 0) + groupGap * Math.max(0, list.length - 1)
      let y = -total / 2
      for (const b of list) { place(b, side * (root.w / 2 + gap0), y, side); y += span.get(b)! + groupGap }
    }
    for (const ln of nodes) {
      if (!ln.parent) continue
      const p = ln.parent
      const side = ln.x >= p.x ? 1 : -1
      const from = p === root ? { x: p.x + side * p.w * 0.38, y: p.y } : { x: p.x + side * p.w / 2, y: p.y }
      ln.edge = bezier(from, { x: ln.x - side * ln.w / 2, y: ln.y }, true)
    }
  }
  for (const ln of nodes) ln.edgeLen = lengths(ln.edge)

  const order: LNode[][] = branchNodes.map((b) => {
    const list: LNode[] = []
    const walk = (ln: LNode) => { list.push(ln); kids.get(ln)!.forEach(walk) }
    walk(b)
    return list
  })
  const laid: Laid = { root, nodes, branches: order, font, lh, unit: f }
  byKey.set(key, laid)
  return laid
}

function bounds(list: LNode[]): Rect {
  const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const n of list) {
    r.x0 = Math.min(r.x0, n.x - n.w / 2); r.x1 = Math.max(r.x1, n.x + n.w / 2)
    r.y0 = Math.min(r.y0, n.y - n.h / 2); r.y1 = Math.max(r.y1, n.y + n.h / 2)
    for (const p of n.edge) { r.x0 = Math.min(r.x0, p.x); r.x1 = Math.max(r.x1, p.x); r.y0 = Math.min(r.y0, p.y); r.y1 = Math.max(r.y1, p.y) }
  }
  return r
}

// ---------------------------------------------------------------- animation

interface Cam { x: number; y: number; s: number }

const MAX_SCALE = 1.7 // never blow text up more than this
const FOCUS_ZOOM = 1.6 // how much closer than the whole map a focused branch may get
const DIM = 0.32
const CAM_TIME = 0.8

function fit(r: Rect, W: number, H: number, cap: number): Cam {
  const s = Math.min(cap, (W * 0.9) / Math.max(1, r.x1 - r.x0), (H * 0.84) / Math.max(1, r.y1 - r.y0))
  return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, s }
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const backOut = (t: number) => { if (t <= 0) return 0; if (t >= 1) return 1; const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2 }
const span01 = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)))

interface Reveal { edge: [number, number]; pop: [number, number] }

/** The animation of one step: when each new line draws and node pops, and where the camera goes. */
class StepPlan {
  readonly end: number
  private reveals = new Map<LNode, Reveal>()
  private shown = new Set<LNode>()
  private dimFrom = new Map<LNode, number>()
  private dimTo = new Map<LNode, number>()
  private camFrom: Cam
  private camTo: Cam
  private undim = false
  private overview: boolean

  constructor(laid: Laid, steps: MapStep[], i: number, s: MapSettings, W: number, H: number) {
    const step = steps[i]
    this.overview = step.kind === 'overview'
    const all = fit(bounds(laid.nodes), W, H, MAX_SCALE)
    const camOf = (k: number): Cam => {
      const st = steps[k]
      if (!s.focus || st.kind === 'overview') return all
      const list = st.kind === 'root' ? [laid.root] : [laid.root, ...laid.branches[st.index]]
      return fit(bounds(list), W, H, Math.min(MAX_SCALE, all.s * FOCUS_ZOOM))
    }
    this.camTo = camOf(i)
    this.camFrom = i > 0 ? camOf(i - 1) : this.camTo

    // what was already on screen when this step starts, and how bright
    const focusOf = (k: number) => (steps[k]?.kind === 'branch' ? (steps[k] as { index: number }).index : -1)
    this.shown.add(laid.root)
    for (let k = 1; k < i; k++) {
      const st = steps[k]
      if (st.kind !== 'branch') continue
      for (const n of laid.branches[st.index]) {
        this.shown.add(n)
        const bright = !s.focus || n.branch === focusOf(i - 1) || steps[i - 1].kind === 'overview'
        this.dimFrom.set(n, bright ? 1 : DIM)
        this.dimTo.set(n, !s.focus || step.kind === 'overview' ? 1 : DIM)
      }
    }

    if (step.kind === 'root') {
      this.shown.delete(laid.root)
      this.reveals.set(laid.root, { edge: [0, 0], pop: [0.1, 0.55] })
      this.end = 0.75
    } else if (step.kind === 'branch') {
      const list = laid.branches[step.index]
      const stagger = list.length > 1 ? Math.min(0.4, Math.max(0.18, 1.8 / (list.length - 1))) : 0
      let end = 0
      list.forEach((n, k) => {
        const start = k === 0 ? 0.3 : 0.95 + (k - 1) * stagger
        const r: Reveal = k === 0 ? { edge: [0.3, 0.8], pop: [0.65, 1.0] } : { edge: [start, start + 0.35], pop: [start + 0.25, start + 0.55] }
        this.reveals.set(n, r)
        end = Math.max(end, r.pop[1])
      })
      this.end = Math.max(CAM_TIME, end) + 0.2
    } else {
      this.undim = true
      this.end = 1.2
    }
  }

  cam(t: number): Cam {
    const p = ease(t / (this.overview ? 1.1 : CAM_TIME))
    const a = this.camFrom, b = this.camTo
    return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, s: a.s * Math.pow(b.s / a.s, p) }
  }

  /** Node pop (0..1), its line's drawn share (0..1) and brightness at time t. */
  state(n: LNode, t: number): { pop: number; edge: number; alpha: number } | null {
    const r = this.reveals.get(n)
    if (r) {
      const pop = span01(t, r.pop[0], r.pop[1])
      const edge = r.edge[1] > r.edge[0] ? ease(span01(t, r.edge[0], r.edge[1])) : 1
      return edge > 0 || pop > 0 ? { pop, edge, alpha: 1 } : null
    }
    if (!this.shown.has(n)) return null
    const from = this.dimFrom.get(n) ?? 1, to = this.dimTo.get(n) ?? 1
    const p = ease(span01(t, 0, this.undim ? 0.6 : 0.5))
    return { pop: 1, edge: 1, alpha: from + (to - from) * p }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}

function drawFrame(g: CanvasRenderingContext2D, laid: Laid, plan: StepPlan, theme: MapTheme, t: number, W: number, H: number) {
  const u = Math.min(W, H)
  const grad = g.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, theme.bg[0]); grad.addColorStop(1, theme.bg[1])
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.fillStyle = grad; g.fillRect(0, 0, W, H)
  g.globalAlpha = 0.07; g.fillStyle = theme.colors[0]
  g.beginPath(); g.arc(W, 0, u * 0.4, 0, Math.PI * 2); g.fill()
  g.fillStyle = theme.colors[1]
  g.beginPath(); g.arc(0, H, u * 0.3, 0, Math.PI * 2); g.fill()
  g.globalAlpha = 1

  const cam = plan.cam(t)
  g.setTransform(cam.s, 0, 0, cam.s, W / 2 - cam.x * cam.s, H / 2 - cam.y * cam.s)
  const color = (n: LNode) => (n.branch < 0 ? theme.root : theme.colors[n.branch % theme.colors.length])
  const states = laid.nodes.map((n) => plan.state(n, t))

  // lines under the nodes
  g.lineCap = 'round'; g.lineJoin = 'round'
  laid.nodes.forEach((n, k) => {
    const st = states[k]
    if (!st || !n.parent || st.edge <= 0) return
    const total = n.edgeLen[n.edgeLen.length - 1]
    const upto = total * st.edge
    g.strokeStyle = color(n)
    g.globalAlpha = st.alpha
    g.lineWidth = laid.unit * (n.depth === 1 ? 0.26 : 0.14)
    g.beginPath()
    g.moveTo(n.edge[0].x, n.edge[0].y)
    for (let i = 1; i < n.edge.length; i++) {
      if (n.edgeLen[i] <= upto) { g.lineTo(n.edge[i].x, n.edge[i].y); continue }
      const a = n.edge[i - 1], b = n.edge[i]
      const f = (upto - n.edgeLen[i - 1]) / Math.max(1e-6, n.edgeLen[i] - n.edgeLen[i - 1])
      g.lineTo(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f)
      break
    }
    g.stroke()
  })

  g.textAlign = 'center'; g.textBaseline = 'middle'
  laid.nodes.forEach((n, k) => {
    const st = states[k]
    if (!st || st.pop <= 0) return
    const sc = backOut(st.pop)
    g.save()
    g.translate(n.x, n.y)
    g.scale(sc, sc)
    g.globalAlpha = st.alpha * Math.min(1, st.pop * 1.8)
    const c = color(n)
    const r = n.depth <= 1 ? n.h / 2 : n.px * 0.45
    roundRect(g, -n.w / 2, -n.h / 2, n.w, n.h, Math.min(r, n.h / 2))
    if (n.depth <= 1) {
      g.fillStyle = c; g.fill()
    } else {
      g.fillStyle = hexA(c, theme.tint); g.fill()
      g.strokeStyle = c; g.lineWidth = laid.unit * 0.09; g.stroke()
    }
    g.fillStyle = n.depth === 0 ? theme.rootText : n.depth === 1 ? theme.branchText : theme.text
    g.font = `700 ${Math.round(n.px)}px "${laid.font}"`
    const lineH = n.px * laid.lh
    n.lines.forEach((l, i) => g.fillText(l, 0, (i - (n.lines.length - 1) / 2) * lineH + n.px * 0.06))
    g.restore()
  })
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
}

async function prepare(ms: MindScene, W: number, H: number) {
  await ensureFont(fontOf(ms.map)) // before measuring any text
  const laid = layout(ms.map, ms.settings, W, H)
  const plan = new StepPlan(laid, stepsOf(ms.map, ms.overview), ms.step, ms.settings, W, H)
  return { laid, plan, theme: mapThemeOf(ms.settings.theme) }
}

function canvas(W: number, H: number) {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  return c
}

const png = (c: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the map'))), 'image/png'))

/** The step's final picture: the scene thumbnail, and its stand-in where video can't be made. */
export async function drawMindStill(ms: MindScene, W: number, H: number): Promise<Blob> {
  const { laid, plan, theme } = await prepare(ms, W, H)
  const c = canvas(W, H)
  drawFrame(c.getContext('2d')!, laid, plan, theme, plan.end + 1, W, H)
  return png(c)
}

/** A preview of the whole map, for the editor sheet. */
export async function drawMapPreview(map: MindNode, settings: MapSettings, c: HTMLCanvasElement) {
  const ms: MindScene = { map, settings: { ...settings, focus: false }, overview: true, step: stepsOf(map, true).length - 1 }
  const { laid, plan, theme } = await prepare(ms, c.width, c.height)
  drawFrame(c.getContext('2d')!, laid, plan, theme, plan.end + 1, c.width, c.height)
}

/** Seconds of movement at the start of a step's clip; the rest holds still. */
export async function mindAnimLength(ms: MindScene, W: number, H: number) {
  return (await prepare(ms, W, H)).plan.end
}

// ---------------------------------------------------------------- video

/**
 * Renders one step as a clip of `seconds`: the movement at full frame rate, then the still map.
 * Returns null where the device can't encode video, and the scene then uses its still picture.
 */
export async function renderMindVideo(ms: MindScene, W: number, H: number, seconds: number, fps = 30): Promise<{ blob: Blob; ext: string } | null> {
  const { laid, plan, theme } = await prepare(ms, W, H)
  return renderCanvasVideo(W, H, seconds, [[0, Math.min(plan.end, seconds)]], (g, t) => drawFrame(g, laid, plan, theme, t, W, H), fps)
}

// ---------------------------------------------------------------- scenes

const short = (s: string) => (s.length > 40 ? s.slice(0, 40).replace(/\s+\S*$/, '') + '…' : s)

/** One scene per step of the reveal, each with its picture and what the voice reads. */
export async function mindToScenes(map: MindNode, settings: MapSettings, overview: boolean, W: number, H: number, progress: (p: number) => void, wholeMap = 'Whole map'): Promise<Scene[]> {
  const steps = stepsOf(map, overview)
  const scenes: Scene[] = []
  for (let i = 0; i < steps.length; i++) {
    progress(i / steps.length)
    const st = steps[i]
    const mind: MindScene = { map, settings, overview, step: i }
    scenes.push({
      id: uid(), image: await drawMindStill(mind, W, H), duration: null, mind,
      name: short(st.kind === 'root' ? map.text : st.kind === 'branch' ? map.children[st.index].text : wholeMap),
      text: narration(map, st),
    })
  }
  return scenes
}
