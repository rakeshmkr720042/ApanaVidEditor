// Ultra smooth slow motion: new in-between frames made from the movement between two real frames
// (motion-compensated frame interpolation, like "optical flow" slow motion in pro editors).
//
// 1. Both frames are made small and grey; a block search finds where each 6x6 block of the first
//    frame went in the second (coarse to fine, so big moves are found too), on the CPU.
// 2. The motion field is cleaned up (median of neighbours; flat blocks take their neighbours' motion).
// 3. A WebGL2 shader moves both frames part of the way along the motion and mixes them, so a
//    moving ball is drawn in between its two places instead of twice, faded (what a plain blend does).
// Without WebGL2 the renderer falls back to the plain blend.

import { toGray, type Gray } from './motion'
import type { FrameImage } from './renderer'

export interface Flow { gw: number; gh: number; v: Float32Array /* dx, dy per cell, in parts of the width / height */ }

const AW = 240 // width of the small grey copy the motion is found on
const CELL = 6

/** Sum of absolute differences between the block at (x, y) in a and the block at (x+dx, y+dy) in b. */
function sad(a: Gray, b: Gray, x: number, y: number, dx: number, dy: number, size: number, best: number) {
  let s = 0
  for (let j = 0; j < size; j++) {
    const ya = y + j, yb = ya + dy
    if (yb < 0 || yb >= b.h) return Infinity
    const ra = ya * a.w, rb = yb * b.w
    for (let i = 0; i < size; i++) {
      const xb = x + i + dx
      if (xb < 0 || xb >= b.w) return Infinity
      s += Math.abs(a.d[ra + x + i] - b.d[rb + xb])
    }
    if (s >= best) return s
  }
  return s
}

/** Half-size copy of a grey picture. */
function half(g: Gray): Gray {
  const w = g.w >> 1, h = g.h >> 1
  const d = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 2 * y * g.w + 2 * x
    d[y * w + x] = (g.d[i] + g.d[i + 1] + g.d[i + g.w] + g.d[i + g.w + 1]) / 4
  }
  return { d, w, h }
}

/** Block motion on one level: for each cell the best move within `r` pixels of the guess. */
function search(a: Gray, b: Gray, size: number, r: number, guess: ((cx: number, cy: number) => [number, number]) | null) {
  const gw = Math.floor(a.w / size), gh = Math.floor(a.h / size)
  const v = new Float32Array(gw * gh * 2)
  const flat = new Uint8Array(gw * gh)
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    const x = cx * size, y = cy * size
    // how much detail the block has: flat blocks (sky, walls) cannot tell where they moved
    let mn = 255, mx = 0
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const p = a.d[(y + j) * a.w + x + i]; if (p < mn) mn = p; if (p > mx) mx = p }
    const [gx, gy] = guess ? guess(cx, cy) : [0, 0]
    let best = sad(a, b, x, y, 0, 0, size, Infinity) * 0.97 // a small pull towards "not moving"
    let bx = 0, by = 0
    for (let dy = gy - r; dy <= gy + r; dy++) for (let dx = gx - r; dx <= gx + r; dx++) {
      if (dx === 0 && dy === 0) continue
      const s = sad(a, b, x, y, dx, dy, size, best)
      if (s < best) { best = s; bx = dx; by = dy }
    }
    v[(cy * gw + cx) * 2] = bx
    v[(cy * gw + cx) * 2 + 1] = by
    flat[cy * gw + cx] = mx - mn < 12 ? 1 : 0
  }
  return { gw, gh, v, flat }
}

/** Median of the neighbours (3x3) for every cell; flat cells take the median of their detailed neighbours. */
function clean(gw: number, gh: number, v: Float32Array, flat: Uint8Array) {
  const out = new Float32Array(v.length)
  const xs: number[] = [], ys: number[] = []
  const med = (a: number[]) => { a.sort((p, q) => p - q); return a[a.length >> 1] }
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    xs.length = 0; ys.length = 0
    const self = cy * gw + cx
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const x = cx + i, y = cy + j
      if (x < 0 || y < 0 || x >= gw || y >= gh) continue
      const k = y * gw + x
      if (flat[k] && k !== self) continue
      xs.push(v[k * 2]); ys.push(v[k * 2 + 1])
    }
    if (!xs.length || (flat[self] && xs.length === 1)) { out[self * 2] = 0; out[self * 2 + 1] = 0; continue }
    out[self * 2] = med(xs); out[self * 2 + 1] = med(ys)
  }
  return out
}

/** The movement from frame a to frame b (coarse to fine block search on small grey copies). */
export function findFlow(a: Gray, b: Gray): Flow {
  const a1 = half(a), b1 = half(b)
  const coarse = search(a1, b1, CELL, 10, null)
  const cv = clean(coarse.gw, coarse.gh, coarse.v, coarse.flat)
  const fine = search(a, b, CELL, 2, (cx, cy) => {
    const i = Math.min(coarse.gh - 1, cy >> 1) * coarse.gw + Math.min(coarse.gw - 1, cx >> 1)
    return [Math.round(cv[i * 2] * 2), Math.round(cv[i * 2 + 1] * 2)]
  })
  const fv = clean(fine.gw, fine.gh, fine.v, fine.flat)
  // pixels of the small copy -> parts of the picture; cells measure from their corner, the texture samples centres
  for (let i = 0; i < fv.length; i += 2) { fv[i] /= fine.gw * CELL; fv[i + 1] /= fine.gh * CELL }
  return { gw: fine.gw, gh: fine.gh, v: fv }
}

// ---------------------------------------------------------------- drawing the in-between frame

const VS = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`

// backward warp: the in-between pixel looks back along the motion into frame a and forward into frame b.
// Where the two disagree a lot (things appearing from behind), the nearer real frame wins.
const FS = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D ta;
uniform sampler2D tb;
uniform sampler2D tf;
uniform float f;
void main() {
  vec2 m = texture(tf, uv).rg;
  vec4 ca = texture(ta, uv - f * m);
  vec4 cb = texture(tb, uv + (1.0 - f) * m);
  float diff = length(ca.rgb - cb.rgb);
  float w = mix(f, step(0.5, f), smoothstep(0.25, 0.6, diff));
  o = mix(ca, cb, w);
}`

type C = OffscreenCanvas | HTMLCanvasElement

class Warper {
  canvas: C
  private gl: WebGL2RenderingContext
  private tex: WebGLTexture[]
  private uf: WebGLUniformLocation

  constructor() {
    this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(2, 2) : Object.assign(document.createElement('canvas'), { width: 2, height: 2 })
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false }) as WebGL2RenderingContext | null
    if (!gl) throw new Error('no webgl2')
    this.gl = gl
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src); gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link')
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    this.tex = [0, 1, 2].map((i) => {
      const t = gl.createTexture()!
      gl.activeTexture(gl.TEXTURE0 + i)
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return t
    })
    gl.uniform1i(gl.getUniformLocation(prog, 'ta'), 0)
    gl.uniform1i(gl.getUniformLocation(prog, 'tb'), 1)
    gl.uniform1i(gl.getUniformLocation(prog, 'tf'), 2)
    this.uf = gl.getUniformLocation(prog, 'f')!
  }

  draw(a: FrameImage, b: FrameImage, flow: Flow, f: number, w: number, h: number): C {
    const gl = this.gl
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h }
    gl.viewport(0, 0, w, h)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[0])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.image as TexImageSource)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex[1])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, b.image as TexImageSource)
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tex[2])
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, flow.gw, flow.gh, 0, gl.RG, gl.FLOAT, flow.v)
    gl.uniform1f(this.uf, f)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    return this.canvas
  }
}

let warper: Warper | null | undefined
const getWarper = () => {
  if (warper === undefined) { try { warper = new Warper() } catch { warper = null } }
  return warper
}

/** True when this device can make in-between frames (WebGL2). */
export const canInterpolate = () => !!getWarper()

// the last few flows, by source + frame number (an ultra slow clip shows many in-betweens of one pair)
const flows = new Map<string, Flow>()
const grays = new Map<string, Gray>()
const remember = <T>(m: Map<string, T>, k: string, v: T, keep: number) => { m.set(k, v); while (m.size > keep) m.delete(m.keys().next().value!) }

/**
 * The picture `f` (0..1) of the way from frame a to frame b, `id` naming the pair (source and frame
 * number) so the motion is found once per pair. Null when WebGL2 is missing (blend instead).
 */
export function inBetween(a: FrameImage, b: FrameImage, f: number, id: string, idB: string): FrameImage | null {
  const wp = getWarper()
  if (!wp) return null
  let flow = flows.get(id + '>' + idB)
  if (!flow) {
    const gray = (img: FrameImage, k: string) => {
      let g = grays.get(k)
      if (!g) { g = toGray(img.image, img.width, img.height, AW); remember(grays, k, g, 4) }
      return g
    }
    const ga = gray(a, id), gb = gray(b, idB)
    flow = findFlow(ga, gb)
    remember(flows, id + '>' + idB, flow, 3)
  }
  // no bigger than needed: the frame is drawn into the output picture after this
  const scale = Math.min(1, 1920 / Math.max(a.width, a.height))
  const w = Math.max(2, Math.round(a.width * scale)), h = Math.max(2, Math.round(a.height * scale))
  return { image: wp.draw(a, b, flow, Math.min(1, Math.max(0, f)), w, h), width: w, height: h }
}
