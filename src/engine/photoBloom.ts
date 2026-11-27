import type { Bloom } from '../types'

/**
 * Real-photo flower bloom: the flower is made from the user's own cut-out photos of one kind of flower (a closed
 * bud, half open, open, fully open). A garden of copies of those flowers fills the screen, the camera moves in to
 * the bud while the garden goes soft, the bud grows and turns into each next photo (a short dissolve at the same
 * size, so it looks like it opens), and the photo's real petals (cut from the open flower) fall at the end.
 * Everything is a pure function of the time, so preview, seeking and export give the same frame.
 */
type Canvas = HTMLCanvasElement | OffscreenCanvas
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export type PicImage = CanvasImageSource & { width: number; height: number }
/** The decoded flower photos of a bloom (bud and full are needed, half and open are optional). */
export interface Pics { key: string; bud: PicImage; half?: PicImage | null; open?: PicImage | null; full: PicImage; garden?: PicImage | null }

// ---------- the user's photos, decoded by the renderer ----------
/** True when this bloom is made from the user's own flower photos (bud and fully open are needed). */
export const photoOn = (b: Bloom) => !!(b.photo && b.photos?.bud && b.photos.full)
export const photoKey = (b: Bloom) => (b.photos ? [b.photos.bud, b.photos.half ?? '', b.photos.open ?? '', b.photos.full, b.photos.garden ?? ''].join('|') : '')
let loaded: Pics[] = []
/** The decoded photos of this bloom, or null while they are still loading. */
export function picsOf(b: Bloom): Pics | null {
  if (!photoOn(b)) return null
  const k = photoKey(b)
  return loaded.find((p) => p.key === k) ?? null
}
/** Keeps decoded photos for picsOf (the last few sets). */
export function setPics(p: Pics) { loaded = [p, ...loaded.filter((x) => x.key !== p.key)].slice(0, 4) }

const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x)
const sm = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x) }
const eio = (x: number) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
const lerp = (a: number, b: number, f: number) => a + (b - a) * f
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const rnd = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x) }

function makeCanvas(w: number, h: number): Canvas {
  if (typeof document !== 'undefined') return Object.assign(document.createElement('canvas'), { width: w, height: h })
  return new OffscreenCanvas(w, h)
}
const ctxOf = (c: Canvas) => c.getContext('2d', { willReadFrequently: true }) as Ctx
function blurred(src: Canvas, px: number): Canvas {
  const out = makeCanvas(src.width, src.height)
  const c = ctxOf(out)
  if (px > 0.3 && 'filter' in (c as object)) { c.filter = `blur(${px.toFixed(1)}px)`; c.drawImage(src, 0, 0); c.filter = 'none'; return out }
  if (px > 0.3) {
    const k = Math.max(1, px / 2)
    const sm2 = makeCanvas(Math.max(2, Math.round(src.width / k)), Math.max(2, Math.round(src.height / k)))
    ctxOf(sm2).drawImage(src, 0, 0, sm2.width, sm2.height)
    c.drawImage(sm2, 0, 0, src.width, src.height)
    return out
  }
  c.drawImage(src, 0, 0)
  return out
}

// ---------- where the flower head is in each photo ----------
/** Head of a cut-out flower: centre x, the bottom of the head (where the stem starts), its width and top. */
interface Head { cx: number; base: number; width: number; top: number }
const heads = new WeakMap<object, Head>()
function headOf(img: PicImage): Head {
  const hit = heads.get(img as object)
  if (hit) return hit
  const w = Math.max(8, Math.min(256, Math.round(img.width / 4))), h = Math.max(8, Math.round((img.height / img.width) * w))
  const c = makeCanvas(w, h)
  const x = ctxOf(c)
  x.drawImage(img, 0, 0, w, h)
  const a = x.getImageData(0, 0, w, h).data
  const rows: { l: number; r: number; n: number }[] = []
  let maxN = 0
  for (let y = 0; y < h; y++) {
    let l = w, r = -1, n = 0
    for (let xx = 0; xx < w; xx++) if (a[(y * w + xx) * 4 + 3] > 100) { n++; if (xx < l) l = xx; if (xx > r) r = xx }
    rows.push({ l, r, n }); if (n > maxN) maxN = n
  }
  // the head is the block of wide rows from the top; a stem or narrow leaves below it are not the head
  let top = rows.findIndex((r) => r.n > 0)
  if (top < 0) top = 0
  // (a bud's pointed tip is narrow too: the head starts at the first wide row, it does not end at the tip;
  // measuring only the tip made the bud's width tiny and the bud was drawn hugely, covering the screen)
  let base = top, best = 0, sumX = 0, cnt = 0
  for (let y = top; y < h; y++) {
    const r = rows[y]
    if (r.n >= maxN * 0.35) { base = y; if (r.r - r.l > best) best = r.r - r.l; sumX += (r.l + r.r) / 2; cnt++ } else if (cnt > 0 && y > base + h * 0.06) break
  }
  const k = img.width / w
  const hd: Head = { cx: (cnt ? sumX / cnt : w / 2) * k, base: (base + 1) * k, width: Math.max(4, best * k), top: top * k }
  heads.set(img as object, hd)
  return hd
}

// ---------- timeline ----------
export interface PhotoTimes { push: number; bud: number; stages: number[]; xf: number; bloom: number; emerge: number; grow: number; fall: number; full: number }
export function photoTimes(b: Bloom, pics?: Pics | null): PhotoTimes {
  const o = Math.max(0.8, Math.min(5, b.open))
  const push = 1.6 + o * 0.6
  const bud = push - 0.2
  const n = pics ? 1 + (pics.half ? 1 : 0) + (pics.open ? 1 : 0) : 3
  const step = (o * 1.2) / n
  const stages = Array.from({ length: n }, (_, i) => bud + i * step)
  const xf = Math.min(0.5, step * 0.6)
  const bloom = bud + o * 1.2
  const emerge = bloom + 0.15
  const grow = 0.6 + 0.15 * o
  return { push, bud, stages, xf, bloom, emerge, grow, fall: emerge + grow, full: emerge + grow + 0.9 + 0.2 * o }
}

// ---------- the garden (cached) ----------
interface Garden { key: string; W: number; H: number; m: number; back: Canvas; far: Canvas; farSoft: Canvas; mid: Canvas; midSoft: Canvas; fg: Canvas; hero: { x: number; y: number; w: number } }
let cache: Garden[] = []

function drawStalk(c: Ctx, x: number, y: number, len: number, wid: number) {
  if (len <= 0 || wid <= 0.3) return
  const g = c.createLinearGradient(x - wid, 0, x + wid, 0)
  g.addColorStop(0, '#173c12'); g.addColorStop(0.35, '#4f9a3c'); g.addColorStop(0.6, '#2f6e24'); g.addColorStop(1, '#123009')
  c.fillStyle = g
  c.beginPath()
  c.moveTo(x - wid * 0.5, y); c.lineTo(x + wid * 0.5, y); c.lineTo(x + wid * 0.6, y + len); c.lineTo(x - wid * 0.6, y + len)
  c.closePath(); c.fill()
}

/** Draws a flower photo so its head is `w` wide with the head base at (x, y); a green stalk goes on down. */
function drawFlowerPic(c: Ctx, img: PicImage, x: number, y: number, w: number, stalk: number) {
  const hd = headOf(img)
  const s = w / hd.width
  const below = (img.height - hd.base) * s // the photo's own stem / leaves, if any
  drawStalk(c, x, y + below * 0.6, stalk - below * 0.6, w * 0.06)
  c.drawImage(img, x - hd.cx * s, y - hd.base * s, img.width * s, img.height * s)
}

function buildGarden(pics: Pics, W: number, H: number): Garden {
  const s = Math.min(W, H)
  const m = Math.round(Math.max(W, H) * 0.12)
  const res = Math.min(1, 1600 / Math.max(W + 2 * m, H + 2 * m))
  const LW = Math.round((W + 2 * m) * res), LH = Math.round((H + 2 * m) * res)
  const hero = { x: W * 0.5, y: H * (W >= H ? 0.6 : 0.56), w: s * 0.17 }
  const kinds = [pics.full, pics.open ?? pics.full, pics.half ?? pics.full, pics.full].filter(Boolean) as PicImage[]
  const layer = () => { const cv = makeCanvas(LW, LH); const c = ctxOf(cv); c.scale(res, res); c.translate(m, m); return { cv, c } }

  // far background: soft greens, a light sky gap, light spots
  const bk = makeCanvas(Math.round(LW / 2), Math.round(LH / 2))
  const bc = ctxOf(bk)
  bc.scale(res / 2, res / 2)
  const gr = bc.createLinearGradient(0, 0, 0, H + 2 * m)
  gr.addColorStop(0, '#d6e4aa'); gr.addColorStop(0.35, '#5c8c3c'); gr.addColorStop(1, '#183c14')
  bc.fillStyle = gr
  bc.fillRect(0, 0, W + 2 * m, H + 2 * m)
  const greens = ['#345c22', '#4e7830', '#24461a', '#6e9640']
  for (let i = 0; i < 70; i++) {
    const x = rnd(i, 1) * (W + 2 * m), y = (H + 2 * m) * (0.08 + 0.6 * Math.pow(rnd(i, 2), 0.8)), r = s * (0.06 + 0.16 * rnd(i, 3))
    bc.globalAlpha = 0.45 + 0.35 * rnd(i, 4)
    bc.fillStyle = greens[i % 4]
    bc.beginPath(); bc.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); bc.fill()
  }
  bc.globalAlpha = 1
  if (pics.garden) {
    // a real garden photo behind everything (cover-fit), soft like a camera focused on the bud
    const gw = pics.garden.width, gh = pics.garden.height
    const k = Math.max(bk.width / gw, bk.height / gh)
    bc.setTransform(1, 0, 0, 1, 0, 0)
    bc.drawImage(pics.garden, (bk.width - gw * k) / 2, (bk.height - gh * k) / 2, gw * k, gh * k)
  }
  const back = blurred(bk, s * res * 0.5 * (pics.garden ? 0.022 : 0.035))
  const bkc = ctxOf(back)
  bkc.scale(res / 2, res / 2)
  for (let i = 0; i < (pics.garden ? 0 : 22); i++) {
    const x = rnd(i, 5) * (W + 2 * m), y = (H + 2 * m) * 0.6 * rnd(i, 6), r = s * (0.02 + 0.04 * rnd(i, 7))
    const g = bkc.createRadialGradient(x, y, 0, x, y, r)
    const a = 0.08 + 0.16 * rnd(i, 8)
    g.addColorStop(0, `rgba(255,246,214,${(a * 0.7).toFixed(3)})`); g.addColorStop(0.85, `rgba(255,248,222,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(255,248,222,0)')
    bkc.fillStyle = g
    bkc.beginPath(); bkc.arc(x, y, r, 0, Math.PI * 2); bkc.fill()
  }

  // far flowers: a row behind the bud
  const f = layer()
  const farList: [number, number, number, number][] = []
  for (let i = 0; i < 30; i++) {
    const y = H * lerp(0.36, 0.5, rnd(i, 11))
    farList.push([((i + rnd(i, 12)) / 30) * (W + 2 * m) - m * 1.5, y, s * (0.035 + 0.03 * ((y / H - 0.36) / 0.14)), i % kinds.length])
  }
  farList.sort((a, b) => a[1] - b[1]).forEach(([x, y, w, k]) => drawFlowerPic(f.c, kinds[k], x, y, w, s * 0.25))
  const far = blurred(f.cv, s * res * 0.004)
  const farSoft = blurred(far, s * res * 0.012)

  // middle flowers in front, kept away from the bud
  const md = layer()
  const midList: [number, number, number, number][] = []
  for (let i = 0, tries = 0; midList.length < 18 && tries < 600; tries++, i++) {
    const y = H * lerp(0.62, 1.15, rnd(i, 21))
    const x = rnd(i, 22) * (W + 2 * m) - m
    const w = s * (0.12 + 0.12 * ((y / H - 0.62) / 0.5))
    if (Math.abs(x - hero.x) < s * 0.22 + w * 0.4 && y < hero.y + s * 0.5) continue
    if (midList.some(([a, b2, w2]) => Math.abs(a - x) < (w + w2) * 0.35 && Math.abs(b2 - y) < (w + w2) * 0.3)) continue
    midList.push([x, y, w, i % kinds.length])
  }
  midList.sort((a, b) => a[1] - b[1]).forEach(([x, y, w, k]) => drawFlowerPic(md.c, kinds[k], x, y, w, s * 0.6))
  const mid = blurred(md.cv, s * res * 0.0015)
  const midSoft = blurred(md.cv, s * res * 0.016)

  // near, very soft flowers at the bottom corners
  const fgl = layer()
  ;([[-0.06, 1.1, 0.5], [1.06, 1.05, 0.45], [0.88, 1.22, 0.4]] as const).forEach(([fx, fy, fw], i) => drawFlowerPic(fgl.c, kinds[i % kinds.length], fx * W, fy * H, s * fw, s))
  const fg = blurred(fgl.cv, s * res * 0.03)
  return { key: '', W, H, m, back, far, farSoft, mid, midSoft, fg, hero }
}

function garden(pics: Pics, W: number, H: number): Garden {
  const key = `${pics.key}|${W}x${H}`
  let g = cache.find((x) => x.key === key)
  if (!g) { g = buildGarden(pics, W, H); g.key = key; cache = [g, ...cache].slice(0, 2) }
  return g
}

// ---------- camera ----------
interface Cam { z: number; cx: number; cy: number; p: number; focus: number }
/** Final width of the flower head on screen. */
const finalW = (b: Bloom, W: number, H: number) => Math.min(W * 0.92, Math.max(0.15, Math.min(1.2, b.size)) * Math.min(W, H) * 1.4)
function camera(b: Bloom, pics: Pics, local: number, g: Garden, W: number, H: number): Cam {
  const tm = photoTimes(b, pics)
  const p = eio((local - 0.3) / (tm.push - 0.3))
  const Z = finalW(b, W, H) / g.hero.w
  const z = lerp(1, Z, p) * (1 + 0.025 * sm((local - tm.push) / 6))
  // the head's middle ends a little above the centre of the frame
  const tx = W / 2, ty = H / 2 + finalW(b, W, H) * 0.42
  return { z, cx: lerp(g.hero.x, tx, p) + Math.sin(local * 0.5) * W * 0.003, cy: lerp(g.hero.y, ty, p) + Math.cos(local * 0.4) * H * 0.002, p, focus: sm((local - 0.3) / (tm.push * 0.8)) }
}

function drawLayer(c: Ctx, cv: Canvas, g: Garden, cam: Cam, k: number, alpha = 1) {
  if (alpha <= 0.003) return
  const z = 1 + (cam.z - 1) * k
  const sx = cv.width / (g.W + 2 * g.m)
  c.save()
  c.globalAlpha *= alpha
  c.translate(cam.cx, cam.cy)
  c.scale(z / sx, z / sx)
  c.translate(-(g.hero.x + g.m) * sx, -(g.hero.y + g.m) * sx)
  c.drawImage(cv, 0, 0)
  c.restore()
}

/** The photos in bloom order and their head widths (as a share of the fully open flower's width). */
function steps(pics: Pics): { img: PicImage; share: number }[] {
  const out: { img: PicImage; share: number }[] = [{ img: pics.bud, share: 0.5 }]
  if (pics.half) out.push({ img: pics.half, share: 0.65 })
  if (pics.open) out.push({ img: pics.open, share: 0.88 })
  out.push({ img: pics.full, share: 1 })
  return out
}

/** The hero flower: stalk, then the bloom photos dissolving one into the next as the head grows. */
function drawHero(c: Ctx, b: Bloom, pics: Pics, local: number, cam: Cam, g: Garden, H: number) {
  const tm = photoTimes(b, pics)
  const st = steps(pics)
  const wf = g.hero.w * cam.z
  const sway = Math.sin(local * 1.4) * 0.02 * (1 - sm((local - tm.bud) / 3))
  let share = st[0].share
  for (let i = 1; i < st.length; i++) share = lerp(share, st[i].share, eio((local - tm.stages[i - 1]) / tm.xf))
  c.save()
  c.translate(cam.cx, cam.cy)
  c.rotate(sway)
  drawStalk(c, 0, -wf * 0.02, H * 2, wf * 0.07)
  for (let i = 0; i < st.length; i++) {
    const start = i > 0 ? tm.stages[i - 1] : -1e9
    const next = i < st.length - 1 ? tm.stages[i] : 1e9
    const a = (i === 0 ? 1 : sm((local - start) / tm.xf)) * (1 - sm((local - next - tm.xf * 0.55) / (tm.xf * 0.45)))
    if (a <= 0.003) continue
    const img = st[i].img
    const hd = headOf(img)
    const breath = 1 + 0.03 * Math.sin(clamp01((local - (i ? start : 0)) / tm.xf) * Math.PI)
    const sc = (wf * share * breath) / hd.width
    c.globalAlpha = a
    c.drawImage(img, -hd.cx * sc, -hd.base * sc, img.width * sc, img.height * sc)
  }
  c.restore()
}

/** Where the open flower's heart is on screen and how wide the flower is (for the photo and the petals). */
export function photoHeart(b: Bloom, pics: Pics, local: number, W: number, H: number) {
  const g = garden(pics, W, H)
  const cam = camera(b, pics, local, g, W, H)
  const hd = headOf(pics.full)
  const wf = g.hero.w * cam.z
  const sc = wf / hd.width
  return { x: cam.cx, y: cam.cy - (hd.base - (hd.top + (hd.base - hd.top) * 0.42)) * sc, r: wf / 2 }
}

/** Light: warm haze from the top left and darker corners. */
function drawLight(c: Ctx, W: number, H: number) {
  c.save()
  c.globalCompositeOperation = 'lighter'
  const g = c.createRadialGradient(W * 0.15, -H * 0.05, 0, W * 0.15, -H * 0.05, Math.max(W, H) * 0.9)
  g.addColorStop(0, 'rgba(255,236,190,0.22)'); g.addColorStop(0.5, 'rgba(255,226,170,0.06)'); g.addColorStop(1, 'rgba(255,226,170,0)')
  c.fillStyle = g
  c.fillRect(0, 0, W, H)
  c.restore()
  c.save()
  const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6)
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(10,15,5,0.45)')
  c.fillStyle = v
  c.fillRect(0, 0, W, H)
  c.restore()
}

/** Everything under the picture: garden, camera move, the blooming photo flower, a glow before the photo. */
export function drawPhotoBack(c: Ctx, b: Bloom, pics: Pics, local: number, W: number, H: number, alpha: number) {
  if (alpha <= 0.001) return
  const tm = photoTimes(b, pics)
  if (b.fill && local > tm.full + 0.05) return
  const g = garden(pics, W, H)
  const cam = camera(b, pics, local, g, W, H)
  c.save()
  c.globalAlpha = alpha
  drawLayer(c, g.back, g, cam, 0.25)
  drawLayer(c, g.far, g, cam, 0.5, 1 - cam.focus)
  drawLayer(c, g.farSoft, g, cam, 0.5, cam.focus)
  drawLayer(c, g.mid, g, cam, 0.8, 1 - cam.focus)
  drawLayer(c, g.midSoft, g, cam, 0.8, cam.focus)
  drawLight(c, W, H)
  drawHero(c, b, pics, local, cam, g, H)
  c.globalAlpha = alpha
  // the near soft flowers leave early, so they never cover the bud while the camera moves in
  drawLayer(c, g.fg, g, cam, 1.5, 1 - sm(cam.p / 0.3))
  const gl = clamp01(1 - Math.abs(local - tm.emerge) / 0.6)
  if (gl > 0) {
    const h = photoHeart(b, pics, local, W, H)
    const R = h.r * 0.6
    c.globalCompositeOperation = 'lighter'
    const rg = c.createRadialGradient(h.x, h.y, 0, h.x, h.y, R)
    rg.addColorStop(0, `rgba(255,248,225,${(0.5 * gl).toFixed(3)})`); rg.addColorStop(1, 'rgba(255,240,200,0)')
    c.fillStyle = rg
    c.fillRect(h.x - R, h.y - R, R * 2, R * 2)
  }
  c.restore()
}

// ---------- real petals cut from the open flower ----------
const petalSets = new WeakMap<object, { front: Canvas[]; back: Canvas[]; soft: Canvas[]; softBack: Canvas[] }>()
function petalPath(c: Ctx, w: number, h: number, seed: number) {
  c.beginPath()
  for (let k = 0; k <= 64; k++) {
    const a = (k / 64) * Math.PI * 2
    const x = Math.sin(a) * (0.5 - 0.18 * Math.max(0, Math.cos(a))) * w * (1 + 0.04 * Math.sin(a * 5 + seed))
    const y = (-Math.cos(a) * 0.5 + 0.5) * h
    const px = w / 2 + x * 0.95, py = h - y * 0.97
    if (k) c.lineTo(px, py); else c.moveTo(px, py)
  }
  c.closePath()
}
function petalsOf(pics: Pics) {
  let set = petalSets.get(pics.full as object)
  if (set) return set
  const img = pics.full
  const hd = headOf(img)
  const S = 160
  const front: Canvas[] = [], back: Canvas[] = []
  for (let i = 0; i < 8; i++) {
    // a patch from the outer part of the open flower, cut to a petal shape and shaded darker at its base
    const ang = (i / 8) * Math.PI * 2
    const pw = hd.width * 0.2, ph = pw * 1.2
    const hx = hd.cx + Math.cos(ang) * hd.width * 0.27
    const hy = hd.top + (hd.base - hd.top) * (0.45 + Math.sin(ang) * 0.25)
    for (const side of [0, 1]) {
      const cv = makeCanvas(S, Math.round(S * 1.2))
      const c = ctxOf(cv)
      if (side) { c.translate(S, 0); c.scale(-1, 1) }
      petalPath(c, S, cv.height, i)
      c.save()
      c.clip()
      c.drawImage(img, hx - pw / 2, hy - ph / 2, pw, ph, 0, 0, S, cv.height)
      const g = c.createLinearGradient(0, cv.height, 0, 0)
      g.addColorStop(0, side ? 'rgba(40,0,10,0.55)' : 'rgba(40,0,10,0.4)'); g.addColorStop(0.5, side ? 'rgba(40,0,10,0.25)' : 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,255,255,0.05)')
      c.fillStyle = g
      c.fillRect(0, 0, S, cv.height)
      c.restore()
      ;(side ? back : front).push(cv)
    }
  }
  set = { front, back, soft: front.map((p) => blurred(p, 5)), softBack: back.map((p) => blurred(p, 5)) }
  petalSets.set(pics.full as object, set)
  return set
}

/** Draws one real petal centred at 0,0, `size` px long, tumbling at `phase`. */
export function drawPhotoPetal(c: Ctx, pics: Pics, i: number, size: number, phase: number, soft: boolean) {
  const set = petalsOf(pics)
  const cs = Math.cos(phase)
  const list = soft ? (cs >= 0 ? set.soft : set.softBack) : (cs >= 0 ? set.front : set.back)
  const p = list[Math.abs(Math.floor(i)) % list.length]
  const nod = 0.75 + 0.25 * Math.abs(Math.cos(phase * 0.7 + i))
  const w = size * 0.83 * Math.max(0.14, Math.abs(cs)), h = size * nod
  c.drawImage(p, -w / 2, -h / 2, w, h)
}

// ---------- the picture coming out of the flower ----------
/**
 * Where the picture is and how much shows (like gardenPhoto): centre, scale against its full-frame size, radius
 * of the round opening on screen (Infinity = all of it), the glowing rim and its alpha. Hidden while the photos load.
 */
export function photoPlace(b: Bloom, local: number, dur: number, W: number, H: number, pw: number, ph: number) {
  const pics = picsOf(b)
  const tm = photoTimes(b, pics)
  const t = local - tm.emerge
  const end = Number.isFinite(dur) ? clamp01((dur - local) / 0.5) : 1
  if (!pics || t <= 0) return { x: W / 2, y: H / 2, s: 0, r: 0, edge: 0, alpha: 0 }
  const h = photoHeart(b, pics, Math.min(local, tm.fall), W, H)
  const inner = h.r * 0.42
  const rA = inner * (0.15 + 0.85 * easeOut(t / tm.grow))
  const short = Math.min(pw, ph)
  const s0 = (rA * 2.3) / short
  if (!b.fill) return { x: h.x, y: h.y, s: s0, r: rA, edge: 1, alpha: clamp01(t * 4) * end }
  const f = eio((local - tm.fall) / (tm.full - tm.fall))
  if (f >= 1) return { x: W / 2, y: H / 2, s: 1, r: Infinity, edge: 0, alpha: end }
  const r = lerp(rA, Math.hypot(W, H) * 0.6, f)
  const sc = Math.min(1, Math.max(s0, (r * 2.3) / short))
  return { x: lerp(h.x, W / 2, f), y: lerp(h.y, H / 2, f), s: sc, r, edge: 1 - f, alpha: clamp01(t * 4) }
}
