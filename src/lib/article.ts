import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { Scene } from '../model/scenes'
import { ensureFont } from '../engine/text'
import { drawTextCard, parseScript, wrap, type CardTheme } from './scriptScenes'
import { desktop } from './desktop'
import { uid } from './format'

/**
 * Article link → video. The page is read, its story text and pictures are pulled out (no AI model),
 * and turned into the same text-card scenes as Script to video, with the article's pictures as
 * slides between them. The text goes through an editable box first, which also takes pasted text
 * for sites that can't be opened from the app.
 */

/** A picture scene from an article: the cover with its title, or a picture with its caption. */
export interface ArticlePic {
  kind: 'cover' | 'image'
  title: string // the headline, or the picture's caption
  sub: string // site and author under the headline
  image: Blob | null
}

export interface ArticleInfo { title: string; text: string; words: number; pictures: number; via: 'direct' | 'proxy' | 'reader' }

const deva = (s: string) => /[ऀ-ॿ]/.test(s)

// The web app has no server of its own, and browsers don't let a page read other sites unless
// they allow it. These public helpers fetch the page for us; the first one that answers wins.
const PAGE_PROXIES = [
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
]
const READER = (u: string) => `https://r.jina.ai/${u}` // returns the page already as Markdown
const IMAGE_PROXIES = [
  (u: string) => `https://wsrv.nl/?url=${encodeURIComponent(u)}&w=1920&h=1920&fit=inside&we&output=jpg`,
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
]
const TIMEOUT = 20000

export const CANT_OPEN = 'This page could not be opened from the app. Open it in your browser, copy the article text and paste it below.'

/** Turns what the user typed into a web link, or null when it isn't one. */
export function linkOf(s: string): string | null {
  let t = s.trim()
  if (!t || /\s/.test(t)) return null
  if (!/^https?:\/\//i.test(t)) {
    if (!/^[\w-]+(\.[\w-]+)+(\/|$)/.test(t)) return null
    t = `https://${t}`
  }
  try {
    const u = new URL(t)
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : null
  } catch { return null }
}

/** Bytes → text, in the page's own character set. */
function decode(data: ArrayBuffer, type: string) {
  const bytes = new Uint8Array(data)
  let cs = /charset=([\w-]+)/i.exec(type)?.[1]
  if (!cs) {
    const head = new TextDecoder('latin1').decode(bytes.slice(0, 2048))
    cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1]
  }
  try { return new TextDecoder(cs || 'utf-8').decode(bytes) } catch { return new TextDecoder().decode(bytes) }
}

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

interface Got { data: ArrayBuffer; type: string }

async function viaFetch(url: string): Promise<Got> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return { data: await res.arrayBuffer(), type: res.headers.get('content-type') ?? '' }
}

/** The Android and desktop apps read pages themselves, outside the browser's rules. */
async function viaApp(url: string, binary: boolean): Promise<Got | null> {
  if (desktop?.fetchUrl) {
    const r = await desktop.fetchUrl(url)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return { data: r.data.slice().buffer, type: r.type }
  }
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({ url, responseType: binary ? 'blob' : 'arraybuffer', connectTimeout: TIMEOUT, readTimeout: TIMEOUT })
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`)
    const type = Object.entries(r.headers ?? {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? ''
    const data = typeof r.data === 'string' ? (binary || !/^[\s<]/.test(r.data) ? b64ToBytes(r.data) : new TextEncoder().encode(r.data)) : new Uint8Array(r.data as ArrayBuffer)
    return { data: data.slice().buffer, type }
  }
  return null
}

/** Reads a web page: its HTML, or (from the reader) Markdown. */
export async function fetchPage(url: string): Promise<{ html?: string; markdown?: string; via: ArticleInfo['via'] }> {
  try {
    const own = await viaApp(url, false)
    if (own) return { html: decode(own.data, own.type), via: 'direct' }
  } catch { throw new Error(CANT_OPEN) }
  try {
    const g = await viaFetch(url)
    return { html: decode(g.data, g.type), via: 'direct' }
  } catch { /* the site doesn't allow it: try the helpers */ }
  for (const p of PAGE_PROXIES) {
    try {
      const g = await viaFetch(p(url))
      const html = decode(g.data, g.type)
      if (/<(p|article|h1)[\s>]/i.test(html)) return { html, via: 'proxy' }
    } catch { /* next */ }
  }
  try {
    const g = await viaFetch(READER(url))
    const markdown = decode(g.data, 'charset=utf-8')
    if (markdown.trim()) return { markdown, via: 'reader' }
  } catch { /* fall through */ }
  throw new Error(CANT_OPEN)
}

/** Downloads one picture of the article (null when it can't be had or isn't a usable picture). */
export async function fetchImage(url: string): Promise<Blob | null> {
  const ok = (g: Got) => {
    const type = g.type.split(';')[0].trim()
    if (g.data.byteLength < 2000 || (type && !type.startsWith('image/') && type !== 'application/octet-stream')) return null
    return new Blob([g.data], { type: type.startsWith('image/') ? type : 'image/jpeg' })
  }
  if (url.startsWith('data:image/')) { try { return await (await fetch(url)).blob() } catch { return null } }
  try {
    const own = await viaApp(url, true)
    if (own) return ok(own)
  } catch { return null }
  for (const get of [url, ...IMAGE_PROXIES.map((p) => p(url))]) {
    try { const b = ok(await viaFetch(get)); if (b) return b } catch { /* next */ }
  }
  return null
}

// ---------------------------------------------------------------- page → article text

const clean = (s: string | null | undefined) => (s ?? '').replace(/[ ​]/g, ' ').replace(/\s+/g, ' ').trim()
const JUNK = /(^|[\s_-])(comment|share|sharing|social|related|recommend|sidebar|widget|footer|nav|navbar|menu|breadcrumb|subscribe|newsletter|promo|sponsor|advert|ads?|banner|cookie|consent|popup|modal|signup|login|author-bio|byline|tags?|trending|most-read|read-more|also-read|outbrain|taboola)([\s_-]|$)/i
const SKIP_P = /^(advertisement|sponsored|also read|read more|read also|यह भी पढ़ें|ये भी पढ़ें|और पढ़ें|विज्ञापन|follow us|share this|click here)\b/i
const BAD_IMG = /(logo|icon|avatar|sprite|pixel|badge|emoji|spinner|placeholder|blank|gravatar|1x1|spacer|tracking|\/ads?\/)/i

/** The best picture URL of an <img> (lazy-loaded pictures keep it in a data attribute). */
function imgSrc(img: Element, base: string): string | null {
  const pick = (set: string | null) => {
    if (!set) return null
    // "a.jpg 400w, b.jpg 1200w" → the widest
    const best = set.split(',').map((s) => s.trim().split(/\s+/)).filter((p) => p[0])
      .sort((a, b) => (parseFloat(b[1] ?? '0') || 0) - (parseFloat(a[1] ?? '0') || 0))[0]
    return best?.[0] ?? null
  }
  const src = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') ||
    pick(img.getAttribute('data-srcset')) || pick(img.getAttribute('srcset')) ||
    pick(img.parentElement?.tagName === 'PICTURE' ? img.parentElement.querySelector('source[srcset]')?.getAttribute('srcset') ?? null : null) ||
    img.getAttribute('src')
  if (!src || src.startsWith('data:') || /\.svg(\?|$)/i.test(src) || BAD_IMG.test(src)) return null
  const w = Number(img.getAttribute('width')), h = Number(img.getAttribute('height'))
  if ((w && w < 200) || (h && h < 120)) return null
  try { return new URL(src, base).href } catch { return null }
}

const linkShare = (el: Element) => {
  const all = clean(el.textContent).length
  const links = [...el.querySelectorAll('a')].reduce((s, a) => s + clean(a.textContent).length, 0)
  return all ? links / all : 0
}

/** The element that holds the story: marked as the article body, or where most paragraph text sits. */
function storyRoot(doc: Document): Element {
  const marked = doc.querySelector('[itemprop="articleBody"], .article-body, .articleBody, .story-body, .post-content, .entry-content, .article-content')
  if (marked && clean(marked.textContent).length > 400) return marked
  const score = new Map<Element, number>()
  let total = 0
  for (const p of doc.querySelectorAll('p')) {
    const len = clean(p.textContent).length
    if (len < 40) continue
    total += len
    const a = p.parentElement, b = a?.parentElement
    if (a) score.set(a, (score.get(a) ?? 0) + len)
    if (b) score.set(b, (score.get(b) ?? 0) + len / 2)
  }
  const articles = [...doc.querySelectorAll('article')]
  if (articles.length === 1) {
    const inside = [...articles[0].querySelectorAll('p')].reduce((s, p) => s + clean(p.textContent).length, 0)
    if (inside >= total * 0.5) return articles[0]
  }
  let best: Element | null = null, top = 0
  for (const [el, s] of score) if (s > top) { top = s; best = el }
  return best ?? doc.querySelector('article, main, [role=main]') ?? doc.body
}

/** Pulls the headline, the story text and its pictures out of a web page, as Script-to-video Markdown. */
export function extractArticle(html: string, pageUrl: string): { title: string; text: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const meta = (k: string) => clean(doc.querySelector(`meta[property="${k}"], meta[name="${k}"]`)?.getAttribute('content'))
  const h1 = clean(doc.querySelector('article h1, h1')?.textContent)
  const title = (meta('og:title') || h1 || clean(doc.title)).replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/, '') // drop " | Site name"
  const host = (() => { try { return new URL(pageUrl).hostname.replace(/^www\./, '') } catch { return '' } })()
  const site = meta('og:site_name') || host
  const authorMeta = meta('author') || meta('article:author')
  const author = /^https?:/.test(authorMeta) ? '' : authorMeta
  let lead: string | null = null
  try { const og = meta('og:image') || meta('twitter:image'); lead = og ? new URL(og, pageUrl).href : null } catch { /* none */ }

  doc.querySelectorAll('script, style, noscript, iframe, svg, form, button, nav, footer, aside, template, select, input, .twitter-tweet, .instagram-media, [role=navigation], [role=complementary], [aria-hidden=true], [hidden]')
    .forEach((el) => el.remove())
  for (const el of [...doc.body?.querySelectorAll('[class], [id]') ?? []]) {
    if (!el.isConnected || el.tagName === 'ARTICLE' || el.tagName === 'MAIN' || el.tagName === 'BODY') continue
    const name = `${el.getAttribute('class') ?? ''} ${el.getAttribute('id') ?? ''}`
    // only small boxes are thrown away by name, so a whole story inside "post-share-wrapper" survives
    if (JUNK.test(name) && clean(el.textContent).length < 600) el.remove()
  }
  doc.querySelectorAll('header').forEach((el) => { if (!el.closest('article') || !el.querySelector('img')) el.remove() })

  const root = storyRoot(doc)
  const out: string[] = []
  const seen = new Set<string>()
  const key = (u: string) => u.replace(/[?#].*$/, '').replace(/-\d+x\d+(\.\w+)$/, '$1')
  const addImg = (src: string | null, caption: string) => {
    if (!src || seen.has(key(src))) return
    seen.add(key(src))
    out.push(`![${caption.replace(/[[\]]/g, '')}](${src})`)
  }
  const said = new Set<string>()
  const addText = (line: string, text: string) => {
    if (!text || said.has(text)) return
    said.add(text)
    out.push(line)
  }
  const walk = (el: Element) => {
    for (const c of el.children) {
      const tag = c.tagName
      if (/^H[1-6]$/.test(tag)) {
        const t = clean(c.textContent)
        if (t && t !== title && t.length < 160 && tag !== 'H1') addText(`## ${t}`, t)
        continue
      }
      if (tag === 'P') {
        c.querySelectorAll('img').forEach((img) => addImg(imgSrc(img, pageUrl), clean(img.getAttribute('alt'))))
        const t = clean(c.textContent)
        if (t.length < 2 || SKIP_P.test(t) || (t.length < 200 && linkShare(c) > 0.7)) continue
        addText(t, t)
        continue
      }
      if (tag === 'UL' || tag === 'OL') {
        if (linkShare(c) > 0.6) continue // a list of links: related stories, tags
        const items = [...c.querySelectorAll(':scope > li')].map((li) => clean(li.textContent)).filter((t) => t && t.length < 400)
        const fresh = items.filter((t) => !said.has(t))
        fresh.forEach((t) => said.add(t))
        if (fresh.length) out.push(fresh.map((t, i) => (tag === 'OL' ? `${i + 1}. ${t}` : `- ${t}`)).join('\n'))
        continue
      }
      if (tag === 'BLOCKQUOTE') {
        const t = clean(c.textContent)
        if (t) addText(`> ${t}`, t)
        continue
      }
      if (tag === 'FIGURE' || tag === 'PICTURE' || tag === 'IMG') {
        const img = tag === 'IMG' ? c : c.querySelector('img')
        const cap = clean(c.querySelector('figcaption')?.textContent) || clean(img?.getAttribute('alt'))
        if (img) addImg(imgSrc(img, pageUrl), cap)
        continue
      }
      if (tag === 'TABLE' || tag === 'PRE' || tag === 'CODE' || tag === 'FIGCAPTION') continue
      // some sites write paragraphs as bare text with <br> in a <div>
      const blocks = c.querySelector('p, h2, h3, h4, ul, ol, blockquote, figure, img, div, section, article')
      if (!blocks) {
        const t = clean(c.textContent)
        if (t.length > 80 && linkShare(c) < 0.5 && !SKIP_P.test(t)) addText(t, t)
        continue
      }
      walk(c)
    }
  }
  walk(root)

  const head = [`# ${title || site}`]
  const firstImg = out.findIndex((l) => l.startsWith('!['))
  // the page's share picture leads, unless the story opens with the same picture
  if (lead && !BAD_IMG.test(lead) && !seen.has(key(lead))) head.push(`![](${lead})`)
  else if (firstImg >= 0 && firstImg <= 2) head.push(...out.splice(firstImg, 1))
  const by = [site, author].filter(Boolean).join(' · ')
  if (by) head.push(`Source: ${by}`)
  return { title: title || site, text: [...head, ...out].join('\n\n') }
}

/** The reader's Markdown output → the same shape as extractArticle. */
export function readerToArticle(md: string): { title: string; text: string } {
  const title = clean(/^Title:\s*(.+)$/m.exec(md)?.[1])
  const source = clean(/^URL Source:\s*(.+)$/m.exec(md)?.[1])
  const body = md.includes('Markdown Content:') ? md.slice(md.indexOf('Markdown Content:') + 17) : md
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i]
    const next = lines[i + 1] ?? ''
    // "Heading\n=====" style headings
    if (l.trim() && /^\s*(=+|-+)\s*$/.test(next) && next.trim().length >= 3) { out.push(`## ${clean(l)}`); i++; continue }
    l = l.replace(/!\[(?:Image \d+:?\s*)?([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '\n![$1]($2)\n') // pictures on their own line
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → their words
    out.push(l)
  }
  let text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  // a link-only line left over from menus is now a short word list; drop lines of 1–2 words without an end mark
  text = text.split('\n').filter((l) => !(l.trim() && !l.startsWith('!') && !l.startsWith('#') && l.trim().split(/\s+/).length <= 2 && !/[.!?।:]$/.test(l.trim()) && !/^[-*]\s/.test(l.trim()))).join('\n')
  if (text.startsWith('# ')) text = text.replace(/^# .*\n?/, '')
  let host = ''
  try { host = new URL(source).hostname.replace(/^www\./, '') } catch { /* none */ }
  return { title, text: [`# ${title || host}`, host ? `Source: ${host}` : '', text].filter(Boolean).join('\n\n') }
}

/** Opens a link and returns the article as editable Markdown, with a short summary of what was found. */
export async function readArticle(url: string): Promise<ArticleInfo> {
  const page = await fetchPage(url)
  const got = page.html ? extractArticle(page.html, url) : readerToArticle(page.markdown!)
  const plan = planArticle(got.text, 'full')
  const words = plan.sections.reduce((s, x) => s + x.body.split(/\s+/).filter(Boolean).length, 0)
  if (words < 30) throw new Error(CANT_OPEN)
  return { ...got, words, pictures: plan.pictures, via: page.via }
}

// ---------------------------------------------------------------- article text → scenes

export type ArticleLength = 'short' | 'full'

const IMG_LINE = /^!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)\s*$/

interface Piece { text: string; images: { src: string; caption: string }[] }
interface Section { heading: string; pieces: Piece[] }
interface Plan { title: string; sub: string; cover: string | null; sections: (Section & { body: string })[]; pictures: number }

/** Splits article Markdown into the headline, its cover picture, and sections of text and pictures. */
export function planArticle(raw: string, length: ArticleLength): Plan {
  const blocks = raw.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  // a picture line inside a block stands on its own
  const flat = blocks.flatMap((b) => {
    const parts: string[] = []
    let cur: string[] = []
    for (const l of b.split('\n')) {
      if (IMG_LINE.test(l.trim())) { if (cur.length) parts.push(cur.join('\n')); cur = []; parts.push(l.trim()) } else cur.push(l)
    }
    if (cur.length) parts.push(cur.join('\n'))
    return parts
  })
  let title = '', sub = '', cover: string | null = null
  let i = 0
  if (/^#\s/.test(flat[0] ?? '')) { title = clean(flat[0].replace(/^#\s+/, '').split('\n')[0]); i = 1 }
  if (title) {
    // the picture and "Source:" line right under the headline belong to the cover
    for (let k = 0; k < 2 && i < flat.length; k++) {
      const m = IMG_LINE.exec(flat[i])
      if (m && !cover) { cover = m[2]; i++; continue }
      const s = /^source:\s*(.+)$/i.exec(flat[i])
      if (s && !sub) { sub = clean(s[1]); i++; continue }
      break
    }
  }
  const sections: Section[] = []
  let sec: Section = { heading: '', pieces: [{ text: '', images: [] }] }
  for (; i < flat.length; i++) {
    const b = flat[i]
    const h = /^#{1,6}\s+(.+)$/.exec(b.split('\n')[0])
    if (h && b.split('\n').length === 1) {
      if (sec.heading || sec.pieces.some((p) => p.text || p.images.length)) sections.push(sec)
      sec = { heading: clean(h[1]), pieces: [{ text: '', images: [] }] }
      continue
    }
    const m = IMG_LINE.exec(b)
    const last = sec.pieces[sec.pieces.length - 1]
    if (m) { last.images.push({ src: m[2], caption: clean(m[1]) }); continue }
    if (last.images.length) sec.pieces.push({ text: b, images: [] }) // text after a picture starts a new piece
    else last.text = last.text ? `${last.text}\n\n${b}` : b
  }
  if (sec.heading || sec.pieces.some((p) => p.text || p.images.length)) sections.push(sec)

  if (length === 'short') shorten(sections)
  return {
    title, sub, cover, pictures: sections.reduce((s, x) => s + x.pieces.reduce((t, p) => t + p.images.length, 0), 0) + (cover ? 1 : 0),
    sections: sections.map((s) => ({ ...s, body: s.pieces.map((p) => p.text).join('\n\n') })),
  }
}

/** First sentences of a paragraph, up to about max characters. */
function firstSentences(p: string, n = 2, max = 260) {
  const s = p.match(/[^.!?।॥]+(?:[.!?।॥]+["'”’)]*|$)\s*/g)?.map((x) => x.trim()).filter(Boolean) ?? [p]
  let out = ''
  for (const x of s.slice(0, n)) { if (out && (out + ' ' + x).length > max) break; out = out ? `${out} ${x}` : x }
  return out || p.slice(0, max)
}

/**
 * "Key points": each section keeps its first paragraph (two sentences of it), every third
 * paragraph after that, its first few list points, and one picture — enough to follow the story.
 */
function shorten(sections: Section[]) {
  for (const s of sections) {
    let para = 0, bullets = 0, pics = 0
    for (const p of s.pieces) {
      const kept: string[] = []
      for (const b of p.text.split(/\n\s*\n/).filter(Boolean)) {
        const lines = b.split('\n')
        if (/^\s*([-*+•]|\d{1,2}[.)])\s+/.test(lines[0])) {
          const keep = lines.slice(0, Math.max(0, 4 - bullets))
          bullets += keep.length
          if (keep.length) kept.push(keep.join('\n'))
          continue
        }
        if (/^\s*>/.test(b)) { if (!para) kept.push(b); continue }
        if (para++ % 3 === 0) kept.push(firstSentences(b.replace(/\n/g, ' ')))
      }
      p.text = kept.join('\n\n')
      p.images = p.images.slice(0, Math.max(0, 1 - pics))
      pics += p.images.length
    }
  }
}

const nameOf = (s: string) => (s.length > 40 ? s.slice(0, 40).replace(/\s+\S*$/, '') + '…' : s)
const sayEnd = (s: string) => (/[.!?।॥:]$/.test(s) ? s : `${s}${deva(s) ? '।' : '.'}`)

const blobOf = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/jpeg', 0.9))

async function bitmap(b: Blob | null) {
  if (!b) return null
  try { return await createImageBitmap(b) } catch { return null }
}

/** Draws the cover (headline over the lead picture) or a picture slide (fitted over a blurred copy, caption below). */
export async function drawArticlePic(pic: ArticlePic, theme: CardTheme, W: number, H: number): Promise<Blob> {
  const img = await bitmap(pic.image)
  if (!img && pic.kind === 'cover') return drawTextCard({ kind: 'title', title: pic.title, lines: pic.sub ? [pic.sub] : [] }, theme, W, H)
  const font = deva(pic.title + pic.sub) ? 'Noto Sans Devanagari' : 'Poppins'
  await ensureFont(font)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const u = Math.min(W, H)
  const lh = deva(pic.title + pic.sub) ? 1.45 : 1.22
  if (!img) {
    const grad = g.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, theme.bg[0]); grad.addColorStop(1, theme.bg[1])
    g.fillStyle = grad; g.fillRect(0, 0, W, H)
  } else if (pic.kind === 'cover') {
    // full-bleed picture, darkened towards the bottom where the headline sits
    const s = Math.max(W / img.width, H / img.height)
    g.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s)
    const shade = g.createLinearGradient(0, H * 0.25, 0, H)
    shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(0.55, 'rgba(0,0,0,0.6)'); shade.addColorStop(1, 'rgba(0,0,0,0.88)')
    g.fillStyle = shade; g.fillRect(0, 0, W, H)
  } else {
    const s = Math.max(W / img.width, H / img.height) * 1.1
    g.filter = `blur(${Math.round(u * 0.04)}px) brightness(0.45)`
    g.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s)
    g.filter = 'none'
  }

  const padX = W * 0.07
  const maxW = W - padX * 2
  if (pic.kind === 'cover') {
    let tPx = u * (W > H ? 0.075 : 0.088)
    const sPx = u * (W > H ? 0.036 : 0.045)
    g.font = `700 ${Math.round(tPx)}px "${font}"`
    let lines = wrap(g, pic.title, maxW)
    while (lines.length > 4 && tPx > u * 0.04) { tPx *= 0.9; g.font = `700 ${Math.round(tPx)}px "${font}"`; lines = wrap(g, pic.title, maxW) }
    lines = lines.slice(0, 5)
    const block = lines.length * tPx * lh + (pic.sub ? sPx * 1.8 : 0)
    let y = H - H * (W > H ? 0.1 : 0.16) - block
    g.textBaseline = 'top'; g.textAlign = 'left'
    g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = u * 0.012
    if (pic.sub) {
      g.fillStyle = theme.accent
      g.fillRect(padX, y + sPx * 0.1, u * 0.012, sPx * 1.05)
      g.font = `700 ${Math.round(sPx)}px "${font}"`
      g.fillStyle = '#ffffff'
      g.fillText(wrap(g, pic.sub, maxW - u * 0.03)[0] ?? '', padX + u * 0.03, y)
      y += sPx * 1.8
    }
    g.fillStyle = '#ffffff'
    g.font = `700 ${Math.round(tPx)}px "${font}"`
    for (const l of lines) { g.fillText(l, padX, y); y += tPx * lh }
    img?.close()
    return blobOf(c)
  }

  // a picture: as large as fits, with its caption under it
  const cPx = u * (W > H ? 0.036 : 0.048)
  g.font = `400 ${Math.round(cPx)}px "${font}"`
  const cap = pic.title ? wrap(g, pic.title, maxW).slice(0, 3) : []
  const capH = cap.length ? cap.length * cPx * lh + cPx * 1.4 : 0
  const area = { x: W * 0.05, y: H * 0.05, w: W * 0.9, h: H * 0.9 - capH }
  if (img) {
    const s = Math.min(area.w / img.width, area.h / img.height)
    const w = img.width * s, h = img.height * s
    const x = (W - w) / 2, y = area.y + (area.h - h) / 2
    g.save()
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = u * 0.03
    g.beginPath(); g.roundRect(x, y, w, h, u * 0.012); g.fillStyle = '#000'; g.fill()
    g.shadowColor = 'transparent'; g.clip()
    g.drawImage(img, x, y, w, h)
    g.restore()
    img.close()
  }
  if (cap.length) {
    let y = H * 0.95 - capH + cPx * 0.7
    g.textAlign = 'center'; g.textBaseline = 'top'
    g.fillStyle = img ? '#f1f5f9' : theme.text
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = u * 0.008
    for (const l of cap) { g.fillText(l, W / 2, y); y += cPx * lh }
  }
  return blobOf(c)
}

/** Article Markdown → scenes: the cover, text cards for each section, and its pictures in place. */
export async function articleToScenes(raw: string, o: { length: ArticleLength; pictures: boolean }, theme: CardTheme, W: number, H: number,
  progress: (p: number) => void, onPicture: (ok: boolean) => void = () => {}): Promise<Scene[]> {
  const plan = planArticle(raw, o.length)
  const scenes: Scene[] = []
  type Job = { pic?: ArticlePic & { src: string | null }; card?: ReturnType<typeof parseScript>[number] }
  const jobs: Job[] = []
  if (plan.title) jobs.push({ pic: { kind: 'cover', title: plan.title, sub: plan.sub, image: null, src: o.pictures ? plan.cover : null } })
  for (const sec of plan.sections) {
    sec.pieces.forEach((p, k) => {
      if (p.text.trim()) {
        const heading = sec.heading ? `## ${sec.heading}\n\n` : ''
        const parts = parseScript(heading + p.text)
        if (k > 0 && sec.heading) {
          // a section carried on after a picture keeps its heading on the card, but the voice doesn't repeat it
          const said = sayEnd(sec.heading)
          parts.forEach((x) => { if (x.script.startsWith(said)) x.script = x.script.slice(said.length).trim() })
          if (parts[0]?.card.kind === 'title') parts.shift()
        }
        jobs.push(...parts.map((card) => ({ card })))
      } else if (k === 0 && sec.heading) {
        jobs.push(...parseScript(`## ${sec.heading}`).map((card) => ({ card })))
      }
      if (o.pictures) for (const im of p.images) jobs.push({ pic: { kind: 'image', title: im.caption, sub: '', image: null, src: im.src } })
    })
  }
  if (!jobs.some((j) => j.card || j.pic?.kind === 'cover')) throw new Error('No article text found')

  for (let i = 0; i < jobs.length; i++) {
    progress(i / jobs.length)
    const j = jobs[i]
    if (j.card) {
      const { card, script } = j.card
      scenes.push({ id: uid(), image: await drawTextCard(card, theme, W, H), name: nameOf(card.title || card.lines[0] || ''), text: script, duration: null, card })
      continue
    }
    const { src, ...pic } = j.pic!
    if (src) {
      pic.image = await fetchImage(src)
      onPicture(!!pic.image)
    }
    if (pic.kind === 'image' && !pic.image) continue // a picture that couldn't be downloaded is left out
    const text = pic.kind === 'cover' ? sayEnd(pic.title) : pic.title
    scenes.push({ id: uid(), image: await drawArticlePic(pic, theme, W, H), name: nameOf(pic.title) || (pic.kind === 'cover' ? 'Cover' : 'Picture'), text, duration: null, art: pic })
  }
  return scenes
}
