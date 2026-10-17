import type { Scene } from '../model/scenes'
import { cleanText } from '../model/scenes'
import { ensureFont } from '../engine/text'
import { kindOf } from './media'
import { uid } from './format'

/** Turns picked files (PDF, PowerPoint, photos) into scenes: one per page, slide or photo. */

const LONG_SIDE = 1920
const base = (name: string) => name.replace(/\.[^.]+$/, '')

export type ImportProgress = (label: string, p: number) => void

const canvasBlob = (c: HTMLCanvasElement, type = 'image/jpeg', q = 0.92) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the page'))), type, q))

export const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
export const isPptx = (f: File) => /presentationml\.presentation/.test(f.type) || /\.pptx$/i.test(f.name)

export async function filesToScenes(files: File[], progress: ImportProgress): Promise<Scene[]> {
  const out: Scene[] = []
  for (const f of files) {
    if (isPdf(f)) out.push(...await pdfToScenes(f, progress))
    else if (isPptx(f)) out.push(...await pptxToScenes(f, progress))
    else if (kindOf(f) === 'image') out.push({ id: uid(), image: f, name: base(f.name), text: '', duration: null })
    else if (/\.ppt$/i.test(f.name)) throw new Error(`${f.name}: old .ppt files can't be read. Save it as .pptx or PDF first.`)
    else throw new Error(`${f.name}: pick a PDF, a PowerPoint (.pptx) or photos`)
  }
  return out
}

// ---------------------------------------------------------------- PDF

/** Renders every page sharply (long side 1920 px) and keeps its text as the starting script. */
export async function pdfToScenes(file: File, progress: ImportProgress): Promise<Scene[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    throw new Error((e as Error).name === 'PasswordException' ? `${file.name} is password protected` : `${file.name} could not be opened as a PDF`)
  }
  const scenes: Scene[] = []
  const name = base(file.name)
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      progress(`${name}: page ${i}/${doc.numPages}`, (i - 1) / doc.numPages)
      const page = await doc.getPage(i)
      const vp1 = page.getViewport({ scale: 1 })
      const vp = page.getViewport({ scale: LONG_SIDE / Math.max(vp1.width, vp1.height) })
      const c = document.createElement('canvas')
      c.width = Math.round(vp.width); c.height = Math.round(vp.height)
      await page.render({ canvas: c, viewport: vp }).promise
      const content = await page.getTextContent()
      const text = content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('')
      scenes.push({ id: uid(), image: await canvasBlob(c), name: `${name} ${i}`, text: cleanText(text), duration: null })
      page.cleanup()
    }
  } finally {
    void task.destroy()
  }
  return scenes
}

// ---------------------------------------------------------------- PowerPoint

/** Minimal zip reader (stored and deflate entries), enough for .pptx files. */
async function unzip(file: Blob): Promise<Map<string, () => Promise<Uint8Array>>> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const dv = new DataView(buf.buffer)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Not a valid .pptx file')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const entries = new Map<string, () => Promise<Uint8Array>>()
  const dec = new TextDecoder()
  for (let n = 0; n < count && dv.getUint32(p, true) === 0x02014b50; n++) {
    const method = dv.getUint16(p + 10, true)
    const size = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true)
    const local = dv.getUint32(p + 42, true)
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    entries.set(name, async () => {
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
      const data = buf.subarray(start, start + size)
      if (method === 0) return data
      if (method !== 8) throw new Error('Unsupported compression in .pptx')
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    })
  }
  return entries
}

const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml')
const all = (n: ParentNode, tag: string) => [...(n as Element).getElementsByTagNameNS('*', tag)]
const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)

/** Resolves "../media/image1.png" against the folder of the part that refers to it. */
function resolvePath(from: string, target: string) {
  if (target.startsWith('/')) return target.slice(1)
  const parts = (dirOf(from) + target).split('/')
  const out: string[] = []
  for (const s of parts) { if (s === '..') out.pop(); else if (s !== '.') out.push(s) }
  return out.join('/')
}

interface Para { text: string; level: number }
interface SlideContent { title: string; body: Para[]; notes: string; picture: { blob: Blob; area: number } | null }

async function readSlide(zip: Map<string, () => Promise<Uint8Array>>, path: string, slideArea: number): Promise<SlideContent> {
  const text = async (p: string) => { const f = zip.get(p); return f ? new TextDecoder().decode(await f()) : null }
  const relsXml = await text(`${dirOf(path)}_rels/${path.slice(path.lastIndexOf('/') + 1)}.rels`)
  const rels = new Map<string, { type: string; target: string }>()
  if (relsXml) for (const r of all(xml(relsXml), 'Relationship')) rels.set(r.getAttribute('Id')!, { type: r.getAttribute('Type') ?? '', target: resolvePath(path, r.getAttribute('Target') ?? '') })

  const doc = xml((await text(path)) ?? '<x/>')
  let title = ''
  const body: Para[] = []
  for (const sp of all(doc, 'sp')) {
    const ph = all(sp, 'ph')[0]?.getAttribute('type') ?? ''
    if (['dt', 'ftr', 'sldNum', 'hdr'].includes(ph)) continue
    const paras = all(sp, 'p').map((p) => ({
      text: all(p, 't').map((t) => t.textContent ?? '').join('').trim(),
      level: Number(all(p, 'pPr')[0]?.getAttribute('lvl') ?? 0),
    })).filter((p) => p.text)
    if (!paras.length) continue
    if ((ph === 'title' || ph === 'ctrTitle') && !title) title = paras.map((p) => p.text).join(' ')
    else body.push(...paras)
  }

  // the biggest picture on the slide that the browser can show (EMF/WMF can't)
  let picture: SlideContent['picture'] = null
  for (const pic of all(doc, 'pic')) {
    const id = all(pic, 'blip')[0]?.getAttributeNS(NS_R, 'embed')
    const target = id ? rels.get(id)?.target : null
    const ext = all(pic, 'ext').find((e) => e.hasAttribute('cx'))
    const area = ext ? Number(ext.getAttribute('cx')) * Number(ext.getAttribute('cy')) : slideArea / 4
    if (!target || !/\.(png|jpe?g|gif|webp|bmp)$/i.test(target) || (picture && picture.area >= area)) continue
    const data = await zip.get(target)?.()
    if (data) picture = { blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: /\.png$/i.test(target) ? 'image/png' : 'image/jpeg' }), area }
  }

  let notes = ''
  const notesRel = [...rels.values()].find((r) => r.type.endsWith('/notesSlide'))
  const notesXml = notesRel ? await text(notesRel.target) : null
  if (notesXml) {
    for (const sp of all(xml(notesXml), 'sp')) {
      if (all(sp, 'ph')[0]?.getAttribute('type') !== 'body') continue
      notes = all(sp, 'p').map((p) => all(p, 't').map((t) => t.textContent ?? '').join('')).join('\n')
    }
  }
  return { title, body, notes: cleanText(notes, 1200), picture }
}

/** Wraps text to a width; returns the lines. */
function wrap(c: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const w of text.split(/\s+/)) {
    const next = cur ? `${cur} ${w}` : w
    if (cur && c.measureText(next).width > width) { lines.push(cur); cur = w } else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

/**
 * PowerPoint layouts can't be reproduced exactly in a browser, so each slide is redrawn as a clean
 * card: title, bullet points and its main picture. (Export the deck as PDF to keep the exact look.)
 */
async function drawSlideCard(s: SlideContent, W: number, H: number, slideArea: number): Promise<Blob> {
  const deva = /[ऀ-ॿ]/.test(s.title + s.body.map((b) => b.text).join(''))
  const font = deva ? 'Noto Sans Devanagari' : 'Poppins'
  await ensureFont(font)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H)
  const img = s.picture ? await createImageBitmap(s.picture.blob).catch(() => null) : null
  const textless = !s.title && !s.body.length
  // a picture filling most of the slide is the slide: show it whole
  if (img && (textless || s.picture!.area > slideArea * 0.6)) {
    const k = Math.min(W / img.width, H / img.height)
    g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k)
    if (textless) return canvasBlob(c)
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, H * 0.78, W, H * 0.22)
    g.fillStyle = '#fff'; g.font = `700 ${Math.round(H * 0.06)}px "${font}"`; g.textBaseline = 'middle'
    g.fillText(wrap(g, s.title || s.body[0].text, W * 0.9)[0] ?? '', W * 0.05, H * 0.89)
    return canvasBlob(c)
  }
  const pad = W * 0.06
  const textW = img ? W * 0.5 : W - pad * 2
  g.fillStyle = '#4f7cff'; g.fillRect(0, 0, W * 0.012, H)
  g.textBaseline = 'top'
  let y = H * 0.1
  if (s.title) {
    g.fillStyle = '#111827'
    const size = Math.round(H * (s.body.length ? 0.07 : 0.1))
    g.font = `700 ${size}px "${font}"`
    if (!s.body.length) y = H * 0.38
    for (const line of wrap(g, s.title, textW).slice(0, 3)) { g.fillText(line, pad, y); y += size * 1.25 }
    y += size * 0.4
  }
  const size = Math.round(H * (s.body.length > 6 ? 0.036 : 0.045))
  g.font = `400 ${size}px "${font}"`
  for (const p of s.body) {
    const indent = pad + p.level * size * 1.4
    const lines = wrap(g, p.text, textW - (indent - pad) - size)
    if (y + size * 1.4 > H * 0.94) break
    g.fillStyle = '#4f7cff'; g.beginPath(); g.arc(indent + size * 0.25, y + size * 0.6, size * 0.16, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#374151'
    for (const line of lines) {
      if (y + size * 1.4 > H * 0.94) break
      g.fillText(line, indent + size, y); y += size * 1.4
    }
    y += size * 0.35
  }
  if (img) {
    const bx = W * 0.6, bw = W * 0.36, by = H * 0.12, bh = H * 0.76
    const k = Math.min(bw / img.width, bh / img.height)
    g.drawImage(img, bx + (bw - img.width * k) / 2, by + (bh - img.height * k) / 2, img.width * k, img.height * k)
  }
  return canvasBlob(c)
}

export async function pptxToScenes(file: File, progress: ImportProgress): Promise<Scene[]> {
  const zip = await unzip(file)
  const read = async (p: string) => { const f = zip.get(p); return f ? new TextDecoder().decode(await f()) : '' }
  const pres = xml(await read('ppt/presentation.xml'))
  const size = all(pres, 'sldSz')[0]
  const cx = Number(size?.getAttribute('cx') ?? 12192000), cy = Number(size?.getAttribute('cy') ?? 6858000)
  const k = LONG_SIDE / Math.max(cx, cy)
  const W = Math.round(cx * k), H = Math.round(cy * k)
  const rels = new Map(all(xml(await read('ppt/_rels/presentation.xml.rels')), 'Relationship')
    .map((r) => [r.getAttribute('Id'), resolvePath('ppt/presentation.xml', r.getAttribute('Target') ?? '')]))
  const slides = all(pres, 'sldId').filter((s) => s.getAttribute('show') !== '0')
    .map((s) => rels.get(s.getAttributeNS(NS_R, 'id'))).filter((p): p is string => !!p && zip.has(p))
  if (!slides.length) throw new Error(`${file.name} has no slides`)
  const name = base(file.name)
  const scenes: Scene[] = []
  for (let i = 0; i < slides.length; i++) {
    progress(`${name}: slide ${i + 1}/${slides.length}`, i / slides.length)
    const s = await readSlide(zip, slides[i], cx * cy)
    // speaker notes are the natural narration; otherwise read the slide itself
    const script = s.notes || cleanText([s.title, ...s.body.map((b) => b.text)].filter(Boolean).join('. ').replace(/\.\./g, '.'))
    scenes.push({ id: uid(), image: await drawSlideCard(s, W, H, cx * cy), name: `${name} ${i + 1}`, text: script, duration: null })
  }
  return scenes
}
