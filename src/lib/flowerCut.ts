/**
 * Cuts a flower out of a photo, on the phone or computer, with no internet: the background colour is learned from
 * the photo's border, everything clearly different from it is kept, only the part joined to the flower in the
 * middle stays (specks and far things go), holes are filled and the edge is softened. Works best on a plain or
 * blurred background (black, white, sky, soft green). A PNG that is already cut out (see-through background) is
 * kept as it is. Returns a PNG with a see-through background, cropped to the flower.
 */
export interface FlowerCut { blob: Blob; width: number; height: number }

const MAX = 1200

function canvas(w: number, h: number) {
  return Object.assign(document.createElement('canvas'), { width: w, height: h })
}

async function decode(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** Grows (r > 0) or shrinks (r < 0) a 0/1 mask by |r| pixels (square), in place. */
function morph(m: Uint8Array, w: number, h: number, r: number) {
  const grow = r > 0
  const k = Math.abs(r)
  const tmp = new Uint8Array(m.length)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let v = grow ? 0 : 1
      for (let d = -k; d <= k; d++) {
        const xx = Math.min(w - 1, Math.max(0, x + d))
        const s = m[row + xx]
        if (grow ? s : !s) { v = grow ? 1 : 0; break }
      }
      tmp[row + x] = v
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = grow ? 0 : 1
    for (let d = -k; d <= k; d++) {
      const yy = Math.min(h - 1, Math.max(0, y + d))
      const s = tmp[yy * w + x]
      if (grow ? s : !s) { v = grow ? 1 : 0; break }
    }
    m[y * w + x] = v
  }
}

/** Keeps only the part of mask `m` joined to (sx, sy). */
function keepJoined(m: Uint8Array, w: number, h: number, sx: number, sy: number) {
  const out = new Uint8Array(m.length)
  const stack = new Int32Array(m.length)
  let n = 0
  const s0 = sy * w + sx
  if (!m[s0]) return out
  stack[n++] = s0; out[s0] = 1
  while (n) {
    const p = stack[--n]
    const x = p % w, y = (p - x) / w
    if (x > 0 && m[p - 1] && !out[p - 1]) { out[p - 1] = 1; stack[n++] = p - 1 }
    if (x < w - 1 && m[p + 1] && !out[p + 1]) { out[p + 1] = 1; stack[n++] = p + 1 }
    if (y > 0 && m[p - w] && !out[p - w]) { out[p - w] = 1; stack[n++] = p - w }
    if (y < h - 1 && m[p + w] && !out[p + w]) { out[p + w] = 1; stack[n++] = p + w }
  }
  return out
}

/** Fills holes: background not reachable from the picture's edge becomes flower. */
function fillHoles(m: Uint8Array, w: number, h: number) {
  const inv = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1
  // a border of background all round, so one flood from a corner reaches every outside pixel
  const W2 = w + 2, H2 = h + 2
  const big = new Uint8Array(W2 * H2).fill(1)
  for (let y = 0; y < h; y++) big.set(inv.subarray(y * w, y * w + w), (y + 1) * W2 + 1)
  const outside = keepJoined(big, W2, H2, 0, 0)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = outside[(y + 1) * W2 + x + 1] ? 0 : 1
}

/** The flower pixel nearest the middle of the picture. */
function middle(m: Uint8Array, w: number, h: number): [number, number] {
  let sx = w >> 1, sy = h >> 1
  if (m[sy * w + sx]) return [sx, sy]
  let best = Infinity
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    if (!m[y * w + x]) continue
    const d = (x - w / 2) ** 2 + (y - h / 2) ** 2
    if (d < best) { best = d; sx = x; sy = y }
  }
  return [sx, sy]
}

/** The nearest of the colours `c` (r,g,b,r,g,b…) to r,g,b: its index and distance. */
function nearest(c: Float32Array, r: number, g: number, b: number) {
  let d = Infinity, i = 0
  for (let k = 0; k < c.length; k += 3) {
    const e = (r - c[k]) ** 2 + (g - c[k + 1]) ** 2 + (b - c[k + 2]) ** 2
    if (e < d) { d = e; i = k / 3 }
  }
  return { i, d: Math.sqrt(d) }
}

/** Groups colour samples (r,g,b,…) into up to `k` main colours (k-means); `spread` is how far samples sit from theirs. */
function groups(s: number[], k: number): { c: Float32Array; spread: number; share: number[] } {
  const n = s.length / 3
  k = Math.max(1, Math.min(k, n))
  const c = new Float32Array(k * 3)
  // start from samples spread through the list (sorted by brightness, so dark and light both get a group)
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => s[a * 3] + s[a * 3 + 1] + s[a * 3 + 2] - (s[b * 3] + s[b * 3 + 1] + s[b * 3 + 2]))
  for (let j = 0; j < k; j++) { const q = order[Math.floor(((j + 0.5) / k) * n)]; c.set([s[q * 3], s[q * 3 + 1], s[q * 3 + 2]], j * 3) }
  const sum = new Float64Array(k * 4)
  let spread = 0
  for (let it = 0; it < 8; it++) {
    sum.fill(0); spread = 0
    for (let q = 0; q < n; q++) {
      const r = s[q * 3], g = s[q * 3 + 1], b = s[q * 3 + 2]
      const nn = nearest(c, r, g, b)
      spread += nn.d * nn.d
      sum[nn.i * 4] += r; sum[nn.i * 4 + 1] += g; sum[nn.i * 4 + 2] += b; sum[nn.i * 4 + 3]++
    }
    for (let j = 0; j < k; j++) if (sum[j * 4 + 3]) c.set([sum[j * 4] / sum[j * 4 + 3], sum[j * 4 + 1] / sum[j * 4 + 3], sum[j * 4 + 2] / sum[j * 4 + 3]], j * 3)
  }
  return { c, spread: Math.sqrt(spread / n), share: Array.from({ length: k }, (_, j) => sum[j * 4 + 3] / n) }
}

/** Only the groups that hold at least `min` of the samples (a stem reaching the edge is not background). */
function bigGroups(g: { c: Float32Array; share: number[] }, min: number) {
  const keep = g.share.flatMap((v, j) => (v >= min ? [g.c[j * 3], g.c[j * 3 + 1], g.c[j * 3 + 2]] : []))
  return keep.length ? new Float32Array(keep) : g.c
}

/** A colour as its tint plus a little of its brightness, so a petal in shadow still matches the lit petal. */
function tint(r: number, g: number, b: number): [number, number, number] {
  const k = 255 / (r + g + b + 40), l = (r + g + b) / 3
  return [r * k * 0.8 + l * 0.35, g * k * 0.8 + l * 0.35, b * k * 0.8 + l * 0.35]
}

/**
 * `strength` 0..1: how different from the background a colour must be to count as flower (0.5 is a good start;
 * lower keeps more, higher cuts more).
 */
export async function cutFlower(file: Blob, strength = 0.5): Promise<FlowerCut> {
  const img = await decode(file)
  const s = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(2, Math.round(img.naturalWidth * s)), h = Math.max(2, Math.round(img.naturalHeight * s))
  const cv = canvas(w, h)
  const c = cv.getContext('2d', { willReadFrequently: true })!
  c.drawImage(img, 0, 0, w, h)
  const data = c.getImageData(0, 0, w, h)
  const px = data.data
  const N = w * h
  // already cut out? (see-through border) -> keep its own edge
  let clear = 0, border = 0
  for (let x = 0; x < w; x += 4) { border += 2; if (px[x * 4 + 3] < 200) clear++; if (px[((h - 1) * w + x) * 4 + 3] < 200) clear++ }
  const m = new Uint8Array(N)
  if (clear > border * 0.5) {
    for (let i = 0; i < N; i++) m[i] = px[i * 4 + 3] > 40 ? 1 : 0
  } else {
    // learn the background from a band round the edge: a few colour groups (a busy background has several)
    const band = Math.max(2, Math.round(Math.min(w, h) * 0.04))
    const bgS: number[] = []
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x >= band && x < w - band && y >= band && y < h - band) continue
      if ((x + y) % 3) continue
      const i = (y * w + x) * 4
      bgS.push(px[i], px[i + 1], px[i + 2])
    }
    const bg0 = groups(bgS, 6)
    const bg = { c: bigGroups(bg0, 0.04), spread: bg0.spread }
    const lim = (16 + bg.spread * 1.5) * (0.55 + strength * 0.9)
    const dBg = new Float32Array(N)
    const bright = new Uint8Array(N) // clearly more colourful than the background: always flower
    for (let i = 0; i < N; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]
      const k = nearest(bg.c, r, g, b)
      dBg[i] = k.d
      const sat = Math.max(r, g, b) - Math.min(r, g, b)
      const c = bg.c, j = k.i * 3
      const bgSat = Math.max(c[j], c[j + 1], c[j + 2]) - Math.min(c[j], c[j + 1], c[j + 2])
      // petals are usually much more colourful than the background next to them
      const colourful = sat > bgSat + 70 * (0.6 + strength * 0.8) && k.d > lim * 0.6
      bright[i] = colourful ? 1 : 0
      m[i] = k.d > lim || colourful ? 1 : 0
    }
    // then learn the flower's own colours from the sure middle of it, and give every unsure pixel to whichever
    // side (flower or background) its colour is closer to
    // (only near the middle, so a haze round the flower is not taken for it)
    const [cx, cy] = middle(m, w, h)
    const core = keepJoined(m, w, h, cx, cy)
    morph(core, w, h, -Math.max(2, Math.round(Math.min(w, h) / 60)))
    const near = (Math.min(w, h) * 0.22) ** 2
    const fgS: number[] = []
    for (let i = 0; i < N; i += 3) {
      const x = i % w, y = (i - x) / w
      if (core[i] && dBg[i] > lim * 1.3 && (x - cx) ** 2 + (y - cy) ** 2 < near) fgS.push(...tint(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]))
    }
    if (fgS.length > 60) {
      const fg = groups(fgS, 5)
      const bgT = new Float32Array(bg.c.length)
      for (let j = 0; j < bg.c.length; j += 3) bgT.set(tint(bg.c[j], bg.c[j + 1], bg.c[j + 2]), j)
      for (let i = 0; i < N; i++) {
        if (dBg[i] < lim * 0.45) { m[i] = 0; continue }
        if (dBg[i] > lim * 2.2 || bright[i]) continue
        const [r, g, b] = tint(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])
        m[i] = nearest(fg.c, r, g, b).d < nearest(bgT, r, g, b).d * 0.95 ? 1 : 0
      }
    }
  }
  // tidy: close small gaps, open away thin bits, keep the flower joined to the middle, fill holes
  const r = Math.max(1, Math.round(Math.min(w, h) / 400))
  morph(m, w, h, r); morph(m, w, h, -r)
  morph(m, w, h, -r); morph(m, w, h, r)
  const keep = keepJoined(m, w, h, ...middle(m, w, h))
  fillHoles(keep, w, h)
  // soft edge
  const a = canvas(w, h)
  const ac = a.getContext('2d')!
  const md = ac.createImageData(w, h)
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (let i = 0; i < N; i++) {
    const v = keep[i] ? 255 : 0
    md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = 255
    md.data[i * 4 + 3] = v
    if (v) { const x = i % w, y = (i - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 <= x0 || y1 <= y0) throw new Error('No flower found in this photo. Try a photo with a plain background.')
  ac.putImageData(md, 0, 0)
  const soft = canvas(w, h)
  const sc = soft.getContext('2d')!
  sc.filter = `blur(${Math.max(0.8, r * 0.9)}px)`
  sc.drawImage(a, 0, 0)
  sc.filter = 'none'
  // flower colours through the soft mask
  const out = canvas(x1 - x0 + 1, y1 - y0 + 1)
  const oc = out.getContext('2d')!
  oc.drawImage(soft, -x0, -y0)
  oc.globalCompositeOperation = 'source-in'
  oc.drawImage(cv, -x0, -y0)
  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('Could not save the cut-out'))), 'image/png'))
  return { blob, width: out.width, height: out.height }
}
