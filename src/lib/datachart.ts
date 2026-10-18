import type { Scene } from '../model/scenes'
import { ensureFont } from '../engine/text'
import { renderCanvasVideo } from './canvasVideo'
import { wrap } from './scriptScenes'
import { uid } from './format'

/**
 * Data table or key numbers → video. A table is pasted (from a spreadsheet, CSV, or simple
 * "Label: value" lines) and split by rules (no AI model). It becomes an animated chart: bars,
 * columns, a line, a donut, a table or big counting numbers, with rows coming in one by one in
 * time with the voice, and an optional last scene that points out the top value.
 */

export interface DataRow {
  id: string
  label: string
  cells: string[] // one per series, as written ("1,250", "38%", "₹4.2 Cr")
}

export interface DataTable {
  id: string
  title: string
  head: string // heading of the label column ("City", "Year")
  series: string[] // names of the value columns
  rows: DataRow[]
  source: string // "Source: …" line, shown small at the bottom
}

export interface DataDoc {
  tables: DataTable[]
}

export type ChartKind = 'bars' | 'columns' | 'line' | 'donut' | 'table' | 'numbers'

export interface DataSettings {
  kind: 'auto' | ChartKind
  theme: string
  sort: boolean // biggest first
  steps: boolean // a scene for each row (or a few rows), so the voice talks about one at a time
  highlight: boolean // end with a scene that points out the top value
}

/** Which rows a scene brings in. Rows before `from` are already there (except on a new table page). */
export interface DataStep {
  from: number
  to: number
  page: boolean // a page of a long table: only rows from..to are shown
  summary: boolean // the closing "highest is …" scene
  first: boolean // the title and axes come in too
}

/** What a data scene shows. `phrases` are what the voice reads, each tied to the row it is about. */
export interface DataScene {
  table: DataTable
  kind: ChartKind
  settings: DataSettings
  step: DataStep
  phrases: { text: string; row: number }[] // row -1: the title or the summary
}

export const defaultDataSettings = (): DataSettings => ({ kind: 'auto', theme: 'light', sort: false, steps: true, highlight: true })

export const row = (label = '', cells: string[] = ['']): DataRow => ({ id: uid(), label, cells })
export const table = (title = '', series: string[] = [''], rows: DataRow[] = [row()]): DataTable => ({ id: uid(), title, head: '', series, rows, source: '' })

const deva = (s: string) => /[ऀ-ॿ]/.test(s)
const tableText = (t: DataTable) => [t.title, t.head, ...t.series, ...t.rows.flatMap((r) => [r.label, ...r.cells])].join(' ')
export const tableLang = (t: DataTable) => (deva(tableText(t)) ? 'hi' : 'en')
export const docLang = (d: DataDoc) => (deva(d.tables.map(tableText).join(' ')) ? 'hi' : 'en')

// ---------------------------------------------------------------- numbers

export interface Num {
  value: number
  prefix: string // "₹", "$ ", "Rs. "
  suffix: string // "%", " lakh", "k"
  decimals: number
  grouped: boolean // written with thousands commas
  indian: boolean // 1,23,456 style
}

const toLatin = (s: string) => s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966)).replace(/[−]/g, '-')
const NUM = /^(\D{0,6}?)([-+]?)(\d[\d,]*(?:\.\d+)?|\.\d+)(\D{0,14})$/u
const PREFIX_OK = /^(?:[^\p{L}\p{N}]*|rs\.?|inr|usd|eur|approx\.?|about|लगभग|करीब)$/iu

/** Reads a cell as a number with its unit, or null when it is text. */
export function parseNum(raw: string): Num | null {
  const s = toLatin(raw).trim()
  if (!s) return null
  const m = NUM.exec(s)
  if (!m) return null
  const [, pre, sign, digits, post] = m
  if (!PREFIX_OK.test(pre.trim()) || /[-+]$/.test(pre.trim())) return null
  const suf = post.trim()
  if (suf.split(/\s+/).length > 2 || /^[,.:;/]/.test(suf)) return null
  let clean = digits
  let grouped = false, indian = false
  if (digits.includes(',')) {
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(digits)) { grouped = true; clean = digits.replace(/,/g, '') }
    else if (/^\d{1,2}(,\d{2})+,\d{3}(\.\d+)?$/.test(digits)) { grouped = true; indian = true; clean = digits.replace(/,/g, '') }
    else if (/^\d+,\d{1,2}$/.test(digits)) clean = digits.replace(',', '.') // 4,5 = 4.5
    else return null
  }
  const value = Number(clean) * (sign === '-' ? -1 : 1)
  if (!Number.isFinite(value)) return null
  const dot = clean.indexOf('.')
  return { value, prefix: pre, suffix: post, decimals: dot < 0 ? 0 : clean.length - dot - 1, grouped, indian }
}

/** A number written the way its cell was, for counting up from zero. */
export function formatNum(n: Num, v = n.value): string {
  const body = Math.abs(v).toLocaleString(n.indian ? 'en-IN' : 'en-US', { minimumFractionDigits: n.decimals, maximumFractionDigits: n.decimals, useGrouping: n.grouped })
  const neg = v < 0 && Number(body.replace(/,/g, '')) !== 0
  return `${neg ? '-' : ''}${n.prefix}${body}${n.suffix}`
}

const MONTHS = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(\s*'?\d{2,4})?$|^(जनवरी|फ़?फरवरी|फ़रवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|सितम्बर|अक्टूबर|अक्तूबर|नवंबर|नवम्बर|दिसंबर|दिसम्बर)(\s*\d{2,4})?$/i
const DAYS = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?$|^(सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|रविवार|सोम|मंगल|बुध|गुरु|शुक्र|शनि|रवि)$/i
/** Labels that are points in time (years, months, quarters, dates) read best as a line. */
export function isTimeLabel(raw: string): boolean {
  const s = toLatin(raw).trim()
  return /^(?:fy\s*)?'?(1[5-9]|20|21)?\d{2}(?:\s*[-–/]\s*\d{2,4})?$/i.test(s) && (/^(fy|')/i.test(s) || /^(1[5-9]|20|21)\d{2}/.test(s))
    || /^q[1-4](\s*'?\d{2,4})?$/i.test(s) || /^(?:week|wk|day|month|सप्ताह|हफ़्ता|दिन|महीना)\s*\d+$/i.test(s)
    || MONTHS.test(s) || DAYS.test(s) || /^\d{1,4}[-/.]\d{1,2}(?:[-/.]\d{1,4})?$/.test(s)
}

export interface Analysis {
  nums: (Num | null)[][] // [row][series]
  numeric: number[] // series that hold numbers
  text: number[] // series that hold words
}

export function analyse(t: DataTable): Analysis {
  const nums = t.rows.map((r) => t.series.map((_, j) => parseNum(r.cells[j] ?? '')))
  const numeric: number[] = [], text: number[] = []
  t.series.forEach((_, j) => {
    const filled = t.rows.filter((r) => (r.cells[j] ?? '').trim() && !/^[-–—]$/.test(r.cells[j].trim())).length
    const n = nums.filter((r) => r[j]).length
    if (!filled) return
    if (n >= Math.ceil(filled * 0.6)) numeric.push(j)
    else text.push(j)
  })
  return { nums, numeric, text }
}

const MAX_SERIES = 4

/** The chart that suits a table best. */
export function autoKind(t: DataTable, a = analyse(t)): ChartKind {
  const n = t.rows.length
  if (!a.numeric.length || a.text.length || !n) return 'table'
  const time = n > 1 && t.rows.every((r) => isTimeLabel(r.label))
  const longest = Math.max(...t.rows.map((r) => r.label.length))
  if (a.numeric.length > 1) {
    if (a.numeric.length > MAX_SERIES || n > 15) return 'table'
    if (time) return 'line'
    return n * a.numeric.length <= 24 && longest <= 12 ? 'columns' : 'bars'
  }
  const j = a.numeric[0]
  const cells = a.nums.map((r) => r[j]).filter((x): x is Num => !!x)
  const units = new Set(cells.map((c) => `${c.prefix.trim()}|${c.suffix.trim()}`))
  if (n <= 6 && units.size > 1) return 'numbers' // "Users: 12,500 / Growth: 38%" are separate facts
  if (n === 1) return 'numbers'
  if (time) return n >= 5 ? 'line' : 'columns'
  const sum = cells.reduce((s, c) => s + c.value, 0)
  if (n <= 8 && cells.every((c) => c.suffix.trim() === '%' && c.value >= 0) && sum >= 97 && sum <= 103) return 'donut'
  if (n > 15) return 'table'
  return n <= 7 && longest <= 10 ? 'columns' : 'bars'
}

/** The chart a table is drawn as: the one asked for, unless the data can't be drawn that way. */
export function kindOf(t: DataTable, wanted: DataSettings['kind'], a = analyse(t)): ChartKind {
  if (wanted === 'auto') return autoKind(t, a)
  if (wanted === 'table') return 'table'
  if (!a.numeric.length) return 'table'
  if (wanted === 'donut' && a.nums.some((r) => (r[a.numeric[0]]?.value ?? 0) < 0)) return 'bars'
  return wanted
}

// ---------------------------------------------------------------- text in and out

const TITLE = /^(?:#{1,3}\s+|(?:title|chart|table|शीर्षक|विषय|चार्ट|टेबल|तालिका)\s*[:\-–]\s*)/i
const SOURCE = /^(?:source|sources|data|note|स्रोत|आंकड़े|आँकड़े|नोट)\s*[:\-–]\s*/i
const MD_RULE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/

function csvSplit(line: string, d: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (c === d && !q) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/** Splits one line of a block into cells, given the block's separator. */
function cellsOf(line: string, sep: string | null): string[] {
  if (sep === '\t') return line.split('\t').map((s) => s.trim())
  if (sep === '|') return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((s) => s.trim())
  if (sep === ';') return csvSplit(line, ';')
  if (sep === ',') {
    // "Delhi, 1,234" splits at a comma followed by a space; "Delhi,1234" is plain CSV
    if (/,\s/.test(line) && !line.includes('"')) return line.split(/\s*,\s+/).map((s) => s.trim())
    return csvSplit(line, ',')
  }
  // no separator: "Label: value", "Label - value", "Label = value", or "Label   value"
  const colon = /^(.+?)\s*(?::|=|\s[-–—]\s|\s{2,})\s*(.+)$/.exec(line)
  if (colon) {
    const vals = colon[2].split(/\s*[,;]\s+|\s*\|\s*|\s{2,}|\t/).filter(Boolean)
    if (vals.every((v) => parseNum(v))) return [colon[1], ...vals]
    if (!colon[1].includes(' ') || line.includes(':')) return [colon[1], colon[2]]
  }
  // "Mumbai 21.7" or "Revenue ₹4.2 Cr": a number at the end
  const tail = /^(.*\S)\s+(\S*\d[\d,.]*(?:\s?(?:%|[\p{L}.]{1,8}))?)$/u.exec(line)
  if (tail && parseNum(tail[2])) return [tail[1], tail[2]]
  return [line]
}

function separatorOf(lines: string[]): string | null {
  const share = (c: string) => lines.filter((l) => l.includes(c)).length / lines.length
  if (share('\t') >= 0.5) return '\t'
  if (share('|') >= 0.6) return '|'
  if (share(';') >= 0.6) return ';'
  // commas that only sit inside numbers ("Users: 12,500") are not separators
  const commaCells = lines.filter((l) => /,/.test(l.replace(/\d,\d{2,3}\b/g, ''))).length / lines.length
  if (commaCells >= 0.6 && !lines.every((l) => /^[^,]+:\s/.test(l))) return ','
  return null
}

const yearLike = (s: string) => /^(1[5-9]|20|21)\d{2}$/.test(toLatin(s).trim())

/** One block of lines (no blank lines inside) → a table, or null when there is no data in it. */
function parseBlock(lines: string[], fallbackTitle: string): DataTable | null {
  let title = ''
  let source = ''
  const body: string[] = []
  for (const l of lines) {
    if (MD_RULE.test(l)) continue
    if (SOURCE.test(l)) { source = l.replace(SOURCE, '').trim(); continue }
    if (!body.length && !title && TITLE.test(l)) { title = l.replace(TITLE, '').trim(); continue }
    body.push(l)
  }
  if (!body.length) return null
  const sep = separatorOf(body)
  let grid = body.map((l) => cellsOf(l, sep))
  // a first line on its own (no numbers, nothing after it) names the table
  if (!title && grid.length > 1 && grid[0].length === 1 && !parseNum(grid[0][0]) && grid.slice(1).some((r) => r.length > 1)) {
    title = grid[0][0].replace(/:$/, '')
    grid = grid.slice(1)
  }
  // a header row: words over number columns, or years over columns of other numbers
  let head = '', series: string[] = []
  const valuesOf = (r: string[]) => r.slice(1)
  if (grid.length > 1 && grid[0].length > 1) {
    const h = valuesOf(grid[0])
    const below = grid.slice(1)
    const wordy = h.some((c) => c && !parseNum(c)) && below.some((r) => valuesOf(r).some((c) => parseNum(c)))
    const years = h.length > 0 && h.every(yearLike) && below.every((r) => !valuesOf(r).every(yearLike))
    if (wordy || years) { head = grid[0][0]; series = h; grid = below }
  }
  // when CSV thousands commas split a number ("Delhi,1,234"), put it back together
  const cols = Math.max(series.length + 1, 2)
  if (sep === ',' && series.length) {
    grid = grid.map((r) => {
      const out = [...r]
      for (let i = 1; out.length > cols && i < out.length - 1;) {
        if (/^\d{1,3}$/.test(out[i]) && /^\d{3}(\.\d+)?\D{0,3}$/.test(out[i + 1])) out.splice(i, 2, `${out[i]},${out[i + 1]}`)
        else i++
      }
      return out
    })
  }
  grid = grid.filter((r) => r.some((c) => c))
  const width = Math.max(series.length, ...grid.map((r) => r.length - 1))
  if (width < 1 || !grid.length) return null
  if (!grid.some((r) => r.slice(1).some((c) => c))) return null
  while (series.length < width) series.push('')
  let rows = grid.map((r) => row(r[0] ?? '', Array.from({ length: width }, (_, j) => r[j + 1] ?? '')))
  // a single row across many columns ("Sales | 10 | 20 | 30" under years) reads better turned round
  if (rows.length === 1 && width >= 3 && series.every((s) => s)) {
    const one = rows[0]
    rows = series.map((s, j) => row(s, [one.cells[j]]))
    series = [one.label]
  }
  return { id: uid(), title: title || fallbackTitle, head, series, rows, source }
}

/**
 * Rule-based split of pasted text into tables. Understands spreadsheet copies (tabs), CSV, | pipe
 * tables, and plain "Label: value" lines. A blank line starts a new table; a "# Title" or a first
 * line on its own names it, and a "Source: …" line is shown under the chart.
 */
export function parseData(raw: string): DataDoc {
  const blocks: string[][] = [[]]
  for (const l of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const line = l.replace(/\s+$/, '')
    if (!line.trim()) { if (blocks[blocks.length - 1].length) blocks.push([]); continue }
    blocks[blocks.length - 1].push(line.trim())
  }
  const tables: DataTable[] = []
  let pendingTitle = ''
  for (const b of blocks) {
    if (!b.length) continue
    // a title alone in its block names the next table
    if (b.length === 1 && TITLE.test(b[0])) { pendingTitle = b[0].replace(TITLE, '').trim(); continue }
    const t = parseBlock(b, '')
    if (!t) { if (b.length === 1 && !tables.length) pendingTitle = b[0]; continue }
    if (!t.title && pendingTitle) t.title = pendingTitle
    pendingTitle = ''
    tables.push(t)
  }
  return { tables }
}

/** Tables → text in the same format, for switching from the grid editor back to text. */
export function dataToText(d: DataDoc): string {
  return d.tables.map((t) => {
    const out: string[] = []
    if (t.title.trim()) out.push(`# ${t.title.trim()}`)
    if (t.series.some((s) => s.trim()) || t.head.trim()) out.push([t.head || '-', ...t.series].join(' | '))
    for (const r of t.rows) out.push([r.label, ...r.cells].join(' | '))
    if (t.source.trim()) out.push(`Source: ${t.source.trim()}`)
    return out.join('\n')
  }).join('\n\n')
}

/** Cleans tables from the grid editor: no empty rows or columns. */
export function tidyDoc(d: DataDoc): DataDoc {
  return {
    tables: d.tables.map((t) => {
      const keep = t.series.map((_, j) => j).filter((j) => t.series[j].trim() || t.rows.some((r) => (r.cells[j] ?? '').trim()))
      const head = t.head.trim() === '-' ? '' : t.head.trim()
      return {
        ...t, title: t.title.trim(), head, source: t.source.trim(), series: keep.map((j) => t.series[j].trim()),
        rows: t.rows.filter((r) => r.label.trim() || r.cells.some((c) => c.trim())).map((r) => ({ ...r, label: r.label.trim(), cells: keep.map((j) => (r.cells[j] ?? '').trim()) })),
      }
    }).filter((t) => t.rows.length && t.series.length),
  }
}

// ---------------------------------------------------------------- what the voice says

const LABELS = {
  en: { highest: 'Highest', biggest: 'Biggest share', total: 'Total', percent: 'percent', peak: 'Peak' },
  hi: { highest: 'सबसे ज़्यादा', biggest: 'सबसे बड़ा हिस्सा', total: 'कुल', percent: 'प्रतिशत', peak: 'सबसे ऊँचा' },
}

const say = (s: string, hi: boolean) => (!s ? '' : /[.!?।॥:]$/.test(s) ? s : `${s}${hi ? '।' : '.'}`)
const spoken = (c: string, hi: boolean) => c.replace(/%/g, hi ? ' प्रतिशत' : ' percent').replace(/\s+/g, ' ').trim()

/** Series that a chart draws (numbers only, at most four). Tables show every column. */
export const drawnSeries = (kind: ChartKind, a: Analysis, t: DataTable) =>
  kind === 'table' ? t.series.map((_, j) => j) : kind === 'donut' ? a.numeric.slice(0, 1) : a.numeric.slice(0, MAX_SERIES)

const pctOf = (a: Analysis, j: number, r: number) => {
  const total = a.nums.reduce((s, x) => s + Math.max(0, x[j]?.value ?? 0), 0)
  return total ? ((a.nums[r][j]?.value ?? 0) / total) * 100 : 0
}
const pctText = (p: number) => (p >= 10 || Number.isInteger(p) ? Math.round(p) : Math.round(p * 10) / 10).toString()

/** The row the closing scene points at: the largest value of the last (most recent) series. */
export function topRow(t: DataTable, kind: ChartKind, a = analyse(t)): { row: number; series: number } | null {
  const cols = drawnSeries(kind, a, t).filter((j) => a.numeric.includes(j))
  const j = cols[cols.length - 1]
  if (j == null) return null
  let best = -1
  a.nums.forEach((r, i) => { if (r[j] && (best < 0 || r[j]!.value > a.nums[best][j]!.value)) best = i })
  return best < 0 ? null : { row: best, series: j }
}

function rowPhrase(t: DataTable, a: Analysis, kind: ChartKind, r: number, hi: boolean): string {
  const rw = t.rows[r]
  const cols = drawnSeries(kind, a, t).filter((j) => (rw.cells[j] ?? '').trim())
  if (!cols.length) return say(rw.label, hi)
  if (cols.length === 1) {
    const j = cols[0]
    let v = spoken(rw.cells[j], hi)
    if (kind === 'donut' && a.nums[r][j] && a.nums[r][j]!.suffix.trim() !== '%') v += `, ${pctText(pctOf(a, j, r))} ${LABELS[hi ? 'hi' : 'en'].percent}`
    return say(`${rw.label}, ${v}`, hi)
  }
  // "in 2011, 18.4" when the columns are years, otherwise "Sales 10"
  const part = (j: number) => {
    const s = t.series[j], v = spoken(rw.cells[j], hi)
    if (!s) return v
    if (yearLike(s)) return hi ? `${s} में ${v}` : `in ${s}, ${v}`
    return `${s} ${v}`
  }
  return say(`${rw.label}: ${cols.map(part).join('; ')}`, hi)
}

function summaryPhrase(t: DataTable, a: Analysis, kind: ChartKind, hi: boolean): string {
  const top = topRow(t, kind, a)
  if (!top) return ''
  const rw = t.rows[top.row]
  const v = spoken(rw.cells[top.series], hi)
  const many = drawnSeries(kind, a, t).length > 1 && t.series[top.series]
  if (kind === 'donut') {
    const p = pctText(pctOf(a, top.series, top.row))
    return hi ? `सबसे बड़ा हिस्सा ${rw.label} का है, ${p} प्रतिशत।` : `${rw.label} has the biggest share, ${p} percent.`
  }
  if ((kind === 'line' || t.rows.every((r) => isTimeLabel(r.label))) && !many) return hi ? `सबसे ऊँचा ${rw.label} में रहा, ${v}।` : `The peak was in ${rw.label}, at ${v}.`
  const where = many ? (hi ? `${t.series[top.series]} में ` : `In ${t.series[top.series]}, `) : ''
  return hi ? `${where}सबसे ज़्यादा ${rw.label}, ${v}।` : `${where}${rw.label} is the highest, at ${v}.`
}

/** The scenes a table is told in. */
export function dataSteps(t: DataTable, kind: ChartKind, st: DataSettings): DataStep[] {
  const n = t.rows.length
  const steps: DataStep[] = []
  const add = (from: number, to: number, page = false) => steps.push({ from, to, page, summary: false, first: from === 0 })
  if (kind === 'table' && n > 12) for (let a = 0; a < n; a += 10) add(a, Math.min(n, a + 10), true)
  else if (st.steps && n > 1) {
    const per = kind === 'donut' || kind === 'numbers' ? 1 : Math.ceil(n / 8)
    for (let a = 0; a < n; a += per) add(a, Math.min(n, a + per))
  } else add(0, n)
  if (st.highlight && n >= 2 && kind !== 'table' && kind !== 'numbers' && topRow(t, kind)) steps.push({ from: n, to: n, page: false, summary: true, first: false })
  return steps
}

/** Table rows put biggest first (not for points in time, whose order matters). */
export function sortedTable(t: DataTable, a = analyse(t)): DataTable {
  const j = a.numeric[0]
  if (j == null || t.rows.every((r) => isTimeLabel(r.label))) return t
  const order = t.rows.map((r, i) => ({ r, v: a.nums[i][j]?.value ?? -Infinity })).sort((x, y) => y.v - x.v)
  return { ...t, rows: order.map((x) => x.r) }
}

export function phrasesOf(t: DataTable, kind: ChartKind, step: DataStep): DataScene['phrases'] {
  const hi = tableLang(t) === 'hi'
  const a = analyse(t)
  if (step.summary) return [{ text: summaryPhrase(t, a, kind, hi), row: -1 }]
  const out: DataScene['phrases'] = []
  if (step.first && t.title.trim()) out.push({ text: say(t.title.trim(), hi), row: -1 })
  for (let r = step.from; r < step.to; r++) out.push({ text: rowPhrase(t, a, kind, r, hi), row: r })
  return out
}

// ---------------------------------------------------------------- timing

export interface DataPlan {
  at: number[] // when each row of the step starts coming in
  grow: number // how long a row takes to come in
  chrome: number // title and axes come in until then (first scene of a table)
  end: number
  moving: [number, number][]
}

const VOICE_AT = 0.3

/** When things happen in a data scene, given how long its voice lasts (0 = no voice). */
export function dataPlan(ds: DataScene, voice: number): DataPlan {
  const { step, kind } = ds
  const grow = kind === 'numbers' ? 1.1 : kind === 'donut' ? 0.8 : kind === 'table' ? 0.45 : 0.7
  if (step.summary) {
    const end = Math.max(3, voice ? VOICE_AT + voice + 0.7 : 0)
    return { at: [], grow, chrome: 0, end, moving: [[0, 1]] }
  }
  const chrome = step.first ? 0.5 : 0
  const count = step.to - step.from
  let at: number[]
  if (voice > 0) {
    // each row comes in as the voice reaches it
    const w = ds.phrases.map((p) => p.text.length + 6)
    const total = w.reduce((s, x) => s + x, 0) || 1
    at = []
    for (let r = step.from; r < step.to; r++) {
      const k = ds.phrases.findIndex((p) => p.row === r)
      const before = k < 0 ? 0 : w.slice(0, k).reduce((s, x) => s + x, 0)
      at.push(Math.max(chrome * 0.6 + (at.length ? at[at.length - 1] + 0.12 : 0.1), VOICE_AT + (voice * before) / total))
    }
  } else {
    const gap = Math.min(0.45, 3 / Math.max(1, count))
    at = Array.from({ length: count }, (_, k) => chrome * 0.6 + 0.15 + k * gap)
  }
  const animEnd = count ? at[at.length - 1] + grow : chrome
  const hold = voice ? 0.8 : 1.4 + Math.min(4, count * 0.5)
  const end = Math.max(animEnd + hold, voice ? VOICE_AT + voice + 0.7 : 0)
  const moving: [number, number][] = []
  const push = (a: number, b: number) => {
    const last = moving[moving.length - 1]
    if (last && a <= last[1] + 0.05) last[1] = Math.max(last[1], b)
    else moving.push([a, b])
  }
  if (chrome) push(0, chrome)
  for (const a of at) push(a, a + grow)
  return { at, grow, chrome, end, moving }
}

// ---------------------------------------------------------------- looks

export interface DataTheme {
  id: string
  label: string
  bg: [string, string]
  text: string
  sub: string
  grid: string
  panel: string
  panel2: string // every other table row
  accent: string
  accentText: string
  palette: string[]
}

export const DATA_THEMES: DataTheme[] = [
  {
    id: 'light', label: 'Light', bg: ['#f8fafc', '#e2e8f0'], text: '#0f172a', sub: '#475569', grid: 'rgba(15,23,42,0.10)', panel: '#ffffff', panel2: '#f1f5f9',
    accent: '#2563eb', accentText: '#ffffff', palette: ['#2563eb', '#f97316', '#10b981', '#e11d48', '#8b5cf6', '#eab308', '#0891b2', '#db2777'],
  },
  {
    id: 'night', label: 'Night', bg: ['#0b1020', '#1e293b'], text: '#ffffff', sub: '#94a3b8', grid: 'rgba(255,255,255,0.10)', panel: 'rgba(255,255,255,0.07)', panel2: 'rgba(255,255,255,0.03)',
    accent: '#38bdf8', accentText: '#04121f', palette: ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb7185', '#2dd4bf', '#fdba74'],
  },
  {
    id: 'bold', label: 'Bold', bg: ['#4c1d95', '#be185d'], text: '#ffffff', sub: '#f5d0fe', grid: 'rgba(255,255,255,0.16)', panel: 'rgba(255,255,255,0.14)', panel2: 'rgba(255,255,255,0.06)',
    accent: '#fde047', accentText: '#3b0764', palette: ['#fde047', '#67e8f9', '#86efac', '#fdba74', '#ffffff', '#f9a8d4', '#a5b4fc', '#fca5a5'],
  },
]

export const dataThemeOf = (id: string) => DATA_THEMES.find((x) => x.id === id) ?? DATA_THEMES[0]

// ---------------------------------------------------------------- drawing

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const ease = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const pop = (x: number) => { const c1 = 1.70158, c3 = c1 + 1, v = clamp01(x) - 1; return 1 + c3 * v * v * v + c1 * v * v }

interface Box { x: number; y: number; w: number; h: number }

interface Laid {
  W: number; H: number; u: number; portrait: boolean; pad: number; font: string; lh: number
  title: { lines: string[]; px: number; y: number } | null
  sub: { y: number; px: number } // legend or callout row
  plot: Box
  source: { text: string; px: number; y: number } | null
  a: Analysis
  cols: number[] // drawn series
  lo: number; hi: number // value range of the chart
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, h / 2, w / 2)))
}

function setFont(g: CanvasRenderingContext2D, px: number, font: string) { g.font = `700 ${Math.round(px)}px "${font}"` }

function fitText(g: CanvasRenderingContext2D, text: string, px: number, width: number, font: string): string {
  setFont(g, px, font)
  if (g.measureText(text).width <= width) return text
  let s = text
  while (s.length > 1 && g.measureText(s + '…').width > width) s = s.slice(0, -1)
  return s.trimEnd() + '…'
}

/** Text placed with its middle on y (Devanagari hangs from its top line, so it sits a little lower). */
function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, font: string, align: CanvasTextAlign = 'left') {
  setFont(g, px, font)
  g.textAlign = align
  g.textBaseline = 'middle'
  g.fillText(s, x, y + px * (font.includes('Devanagari') ? 0.1 : 0.04))
}

function niceStep(range: number, count: number) {
  const raw = range / Math.max(1, count)
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}

/** Round-number range and gridlines covering lo..hi. */
export function niceRange(lo: number, hi: number, count = 4): { lo: number; hi: number; ticks: number[] } {
  if (hi === lo) { hi = lo + (lo === 0 ? 1 : Math.abs(lo) * 0.5) }
  const step = niceStep(hi - lo, count)
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = a; v <= b + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step)
  return { lo: a, hi: b, ticks }
}

function cellNum(L: Laid, r: number, j: number) { return L.a.nums[r]?.[j] ?? null }

function layout(ds: DataScene, W: number, H: number, font: string): Laid {
  const t = ds.table
  const portrait = W < H
  const u = Math.min(W, H)
  const pad = W * (portrait ? 0.07 : 0.06)
  const top = H * (portrait ? 0.08 : 0.07)
  const bottom = H - H * (portrait ? 0.13 : 0.07) // tall videos keep clear of the app buttons at the bottom
  const lh = font.includes('Devanagari') ? 1.45 : 1.25
  const c = document.createElement('canvas').getContext('2d')!
  let title: Laid['title'] = null
  let y = top
  if (t.title.trim()) {
    let px = u * (portrait ? 0.066 : 0.062)
    let lines: string[] = []
    for (let k = 0; k < 20; k++) { setFont(c, px, font); lines = wrap(c, t.title.trim(), W - pad * 2); if (lines.length <= 2 || px < u * 0.035) break; px *= 0.92 }
    title = { lines: lines.slice(0, 3), px, y }
    y += lines.slice(0, 3).length * px * lh + u * 0.03
  }
  const subPx = u * 0.032
  const sub = { y: y + subPx, px: subPx }
  y += subPx * 2.4
  let source: Laid['source'] = null
  let end = bottom
  if (t.source.trim()) {
    const px = u * 0.024
    source = { text: t.source.trim(), px, y: bottom - px * 0.6 }
    end -= px * 2
  }
  const a = analyse(t)
  const cols = drawnSeries(ds.kind, a, t)
  let lo = 0, hi = 0
  for (const r of a.nums) for (const j of cols) { const v = r[j]?.value; if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v) } }
  if (ds.kind === 'line') {
    // a line need not start at zero when its values sit far above it
    const vals = a.nums.flatMap((r) => cols.map((j) => r[j]?.value).filter((v): v is number => v != null))
    const mn = Math.min(...vals), mx = Math.max(...vals)
    lo = mn >= 0 && mn > mx * 0.45 ? mn - (mx - mn) * 0.15 : Math.min(0, mn)
    hi = mx
  }
  return { W, H, u, portrait, pad, font, lh, title, sub, plot: { x: pad, y, w: W - pad * 2, h: end - y }, source, a, cols, lo, hi }
}

function background(g: CanvasRenderingContext2D, L: Laid, th: DataTheme) {
  const { W, H, u } = L
  const grad = g.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, th.bg[0]); grad.addColorStop(1, th.bg[1])
  g.fillStyle = grad; g.fillRect(0, 0, W, H)
  g.globalAlpha = 0.07; g.fillStyle = th.accent
  g.beginPath(); g.arc(W * 0.97, H * 0.02, u * 0.36, 0, Math.PI * 2); g.fill()
  g.globalAlpha = 0.05
  g.beginPath(); g.arc(0, H, u * 0.3, 0, Math.PI * 2); g.fill()
  g.globalAlpha = 1
}

/** How far each row has come in at time t (0 = not yet, 1 = fully), or null when not shown. */
type Progress = (r: number) => number | null

function progressOf(ds: DataScene, plan: DataPlan, t: number): Progress {
  const { step } = ds
  return (r) => {
    if (step.summary) return 1
    if (step.page && (r < step.from || r >= step.to)) return null
    if (r < step.from) return 1
    if (r >= step.to) return 0
    return ease((t - plan.at[r - step.from]) / plan.grow)
  }
}

const valueText = (L: Laid, r: number, j: number, p: number, cells: string[]) => {
  const n = cellNum(L, r, j)
  return n ? formatNum(n, n.value * p) : cells[j] ?? ''
}

function drawChrome(g: CanvasRenderingContext2D, L: Laid, th: DataTheme, ds: DataScene, t: number, plan: DataPlan, hl: number) {
  const { u, pad, font } = L
  const a = ds.step.first ? ease(t / 0.4) : 1
  if (L.title) {
    g.save()
    g.globalAlpha = a
    g.translate(0, (1 - a) * u * 0.03)
    g.fillStyle = th.text
    L.title.lines.forEach((l, i) => text(g, l, pad, L.title!.y + (i + 0.5) * L.title!.px * L.lh, L.title!.px, font))
    g.restore()
  }
  // accent rule under the title, then the legend (or the callout of the closing scene)
  const ry = L.sub.y - L.sub.px * 1.2
  g.fillStyle = th.accent
  g.globalAlpha = 1
  rr(g, pad, ry - Math.max(3, u * 0.006), u * 0.12 * ease((t - (ds.step.first ? 0.15 : -1)) / 0.4), Math.max(4, u * 0.008), 4); g.fill()
  const legend = L.cols.length > 1 && ds.kind !== 'table'
  if (legend) {
    let x = pad
    g.globalAlpha = ds.step.first ? ease((t - 0.25) / 0.4) : 1
    L.cols.forEach((j, k) => {
      const name = ds.table.series[j] || `${k + 1}`
      const r = L.sub.px * 0.42
      g.fillStyle = th.palette[k % th.palette.length]
      g.beginPath(); g.arc(x + r, L.sub.y, r, 0, Math.PI * 2); g.fill()
      g.fillStyle = th.sub
      const s = fitText(g, name, L.sub.px, L.W * 0.3, font)
      text(g, s, x + r * 2 + L.sub.px * 0.4, L.sub.y, L.sub.px, font)
      x += r * 2 + L.sub.px * 1.4 + g.measureText(s).width
    })
    g.globalAlpha = 1
  } else {
    const one = L.cols.length === 1 ? ds.table.series[L.cols[0]] : ''
    const label = [ds.table.head && ds.kind !== 'table' ? ds.table.head : '', ds.kind !== 'table' ? one : ''].filter(Boolean).join(' · ')
    if (label) {
      g.globalAlpha = (ds.step.first ? ease((t - 0.25) / 0.4) : 1) * (1 - hl)
      g.fillStyle = th.sub
      text(g, fitText(g, label, L.sub.px, L.W - pad * 2, font), pad, L.sub.y, L.sub.px, font)
      g.globalAlpha = 1
    }
  }
  if (hl > 0) {
    // the closing scene: "▲ Highest · Delhi 33.8"
    const top = topRow(ds.table, ds.kind, L.a)
    if (top) {
      const lab = LABELS[font.includes('Devanagari') ? 'hi' : 'en']
      const time = ds.kind === 'line' || ds.table.rows.every((r) => isTimeLabel(r.label))
      const word = ds.kind === 'donut' ? lab.biggest : time && L.cols.length === 1 ? lab.peak : lab.highest
      const px = L.sub.px * 1.05
      const s = `▲ ${word} · ${ds.table.rows[top.row].label} ${ds.table.rows[top.row].cells[top.series]}`
      const str = fitText(g, s, px, L.W - pad * 2 - px * 2, font)
      const w = g.measureText(str).width + px * 1.6
      const x = L.W - pad - w
      g.save()
      g.globalAlpha = hl
      g.translate(0, (1 - hl) * u * 0.02)
      g.fillStyle = th.accent
      rr(g, x, L.sub.y - px * 1.05, w, px * 2.1, px * 1.05); g.fill()
      g.fillStyle = th.accentText
      text(g, str, x + px * 0.8, L.sub.y, px, font)
      g.restore()
    }
  }
  if (L.source) {
    g.globalAlpha = (ds.step.first ? ease((t - 0.3) / 0.4) : 1) * 0.85
    g.fillStyle = th.sub
    text(g, fitText(g, L.source.text, L.source.px, L.W - pad * 2, font), pad, L.source.y, L.source.px, font)
    g.globalAlpha = 1
  }
  void plan
}

/** Colour of a bar: one colour per series, or one per row when there is a single series. */
const colorOf = (L: Laid, th: DataTheme, k: number, r: number) => th.palette[(L.cols.length > 1 ? k : r) % th.palette.length]

function drawBars(g: CanvasRenderingContext2D, L: Laid, th: DataTheme, ds: DataScene, prog: Progress, hl: number, top: { row: number; series: number } | null) {
  const { plot, font, u, portrait } = L
  const rows = ds.table.rows
  const n = rows.length
  const S = L.cols.length
  const band = plot.h / n
  const labelPx = Math.max(u * 0.02, Math.min(u * 0.046, band * (portrait ? 0.3 : 0.34)))
  const labelH = portrait ? labelPx * 1.5 : 0
  setFont(g, labelPx, font)
  const labelW = portrait ? 0 : Math.min(plot.w * 0.3, Math.max(...rows.map((r) => g.measureText(r.label).width)) + labelPx * 0.8)
  const thick = Math.min((band - labelH) * (portrait ? 0.8 : 0.68), u * 0.085)
  const valuePx = Math.min(labelPx, thick / Math.max(1, S) * 0.85 + labelPx * 0.25)
  setFont(g, valuePx, font)
  const valueW = Math.max(...rows.flatMap((r, i) => L.cols.map((j) => g.measureText(valueText(L, i, j, 1, r.cells)).width))) + valuePx * 0.7
  const x0 = plot.x + labelW
  const area = plot.w - labelW - valueW
  const range = L.hi - L.lo || 1
  const zero = x0 + (-L.lo / range) * area
  if (L.lo < 0) { g.fillStyle = th.grid; g.fillRect(zero - 1, plot.y, 2, plot.h) }
  rows.forEach((rw, i) => {
    const p = prog(i)
    if (p == null || p <= 0) return
    const y = plot.y + i * band
    const isTop = top?.row === i
    const dim = top && !isTop ? 1 - 0.65 * hl : 1
    g.save()
    g.globalAlpha = Math.min(1, p * 2) * dim
    g.fillStyle = th.text
    if (portrait) text(g, fitText(g, rw.label, labelPx, plot.w, font), plot.x, y + labelH * 0.45, labelPx, font)
    else text(g, fitText(g, rw.label, labelPx, labelW - labelPx * 0.6, font), x0 - labelPx * 0.5, y + band / 2, labelPx, font, 'right')
    const by0 = portrait ? y + labelH + (band - labelH - thick) / 2 : y + (band - thick) / 2
    const sub = thick / S
    L.cols.forEach((j, k) => {
      const n = cellNum(L, i, j)
      if (!n) return
      const len = (n.value / range) * area * p
      const by = by0 + k * sub
      const bh = sub * (S > 1 ? 0.86 : 1)
      g.fillStyle = colorOf(L, th, k, i)
      const bx = len >= 0 ? zero : zero + len
      rr(g, bx, by, Math.max(Math.abs(len), 2), bh, bh * 0.28); g.fill()
      const grow = isTop && k === L.cols.indexOf(top!.series) ? 1 + 0.18 * hl : 1
      g.fillStyle = th.text
      const vx = len >= 0 ? zero + len + valuePx * 0.35 : zero + len - valuePx * 0.35
      text(g, valueText(L, i, j, ease(p), rw.cells), vx, by + bh / 2, valuePx * grow, font, len >= 0 ? 'left' : 'right')
    })
    g.restore()
  })
}

function drawColumns(g: CanvasRenderingContext2D, L: Laid, th: DataTheme, ds: DataScene, prog: Progress, hl: number, top: { row: number; series: number } | null, t: number) {
  const { plot, font, u } = L
  const rows = ds.table.rows
  const n = rows.length
  const S = L.cols.length
  const band = plot.w / n
  const labelPx = Math.max(u * 0.019, Math.min(u * 0.04, band * 0.2))
  const labelLines = (s: string) => { setFont(g, labelPx, font); return wrap(g, s, band * 0.94).slice(0, 2) }
  const laid = rows.map((r) => labelLines(r.label))
  const labelH = Math.max(...laid.map((l) => l.length)) * labelPx * L.lh + labelPx * 0.6
  const colW = (band * 0.66) / S
  setFont(g, labelPx, font)
  const widest = Math.max(...rows.flatMap((r, i) => L.cols.map((j) => g.measureText(valueText(L, i, j, 1, r.cells)).width)))
  const valuePx = Math.max(u * 0.016, Math.min(labelPx * 1.05, (labelPx * (S > 1 ? colW * 1.25 : band * 0.95)) / Math.max(1, widest)))
  const baseTop = plot.y + valuePx * 1.8
  const base = plot.y + plot.h - labelH
  const range = L.hi - L.lo || 1
  const zeroY = base - (-L.lo / range) * (base - baseTop)
  const scale = (base - baseTop) / range
  // gridlines
  const nice = niceRange(L.lo, L.hi)
  g.globalAlpha = ds.step.first ? ease((t - 0.2) / 0.4) : 1
  g.fillStyle = th.grid
  for (const v of nice.ticks) {
    const y = zeroY - v * scale
    if (y < baseTop - 1 || y > base + 1) continue
    g.fillRect(plot.x, y - 0.75, plot.w, 1.5)
  }
  g.globalAlpha = 1
  rows.forEach((rw, i) => {
    const p = prog(i)
    if (p == null || p <= 0) return
    const cx = plot.x + band * (i + 0.5)
    const isTop = top?.row === i
    const dim = top && !isTop ? 1 - 0.65 * hl : 1
    g.save()
    g.globalAlpha = Math.min(1, p * 2) * dim
    g.fillStyle = th.text
    laid[i].forEach((l, k) => text(g, fitText(g, l, labelPx, band * 0.96, font), cx, base + labelPx * 0.5 + (k + 0.5) * labelPx * L.lh, labelPx, font, 'center'))
    L.cols.forEach((j, k) => {
      const n = cellNum(L, i, j)
      if (!n) return
      const h = n.value * scale * p
      const x = cx - (colW * S) / 2 + k * colW
      const w = colW * (S > 1 ? 0.88 : 1)
      g.fillStyle = colorOf(L, th, k, i)
      const y = h >= 0 ? zeroY - h : zeroY
      rr(g, x, y, w, Math.max(Math.abs(h), 2), Math.min(w * 0.22, u * 0.012)); g.fill()
      const grow = isTop && j === top!.series ? 1 + 0.2 * hl : 1
      g.fillStyle = th.text
      text(g, valueText(L, i, j, ease(p), rw.cells), x + w / 2, h >= 0 ? y - valuePx * 0.75 * grow : y + Math.abs(h) + valuePx * 0.75, valuePx * grow, font, 'center')
    })
    g.restore()
  })
}

function drawLine(g: CanvasRenderingContext2D, L: Laid, th: DataTheme, ds: DataScene, prog: Progress, hl: number, top: { row: number; series: number } | null, t: number) {
  const { plot, font, u } = L
  const rows = ds.table.rows
  const n = rows.length
  const S = L.cols.length
  const nice = niceRange(L.lo, L.hi, 4)
  const tickPx = u * 0.026
  const fmt0 = L.a.nums.flatMap((r) => L.cols.map((j) => r[j])).find((x) => x) ?? null
  const tickText = (v: number) => (fmt0 ? formatNum({ ...fmt0, decimals: Number.isInteger(niceStep(nice.hi - nice.lo, 4)) ? 0 : 1 }, v) : `${v}`)
  setFont(g, tickPx, font)
  const axisW = Math.max(...nice.ticks.map((v) => g.measureText(tickText(v)).width)) + tickPx * 0.8
  const labelPx = Math.max(u * 0.019, Math.min(u * 0.034, (plot.w / n) * 0.3))
  const labelH = labelPx * 2
  const valuePx = Math.min(u * 0.032, labelPx * 1.05)
  const x0 = plot.x + axisW + valuePx * 1.5, x1 = plot.x + plot.w - valuePx * 1.8
  const y0 = plot.y + valuePx * 2, y1 = plot.y + plot.h - labelH
  const X = (i: number) => (n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1))
  const Y = (v: number) => y1 - ((v - nice.lo) / (nice.hi - nice.lo || 1)) * (y1 - y0)
  // grid and its numbers
  const ga = ds.step.first ? ease((t - 0.2) / 0.4) : 1
  g.globalAlpha = ga
  for (const v of nice.ticks) {
    g.fillStyle = th.grid
    g.fillRect(x0 - valuePx, Y(v) - 0.75, x1 - x0 + valuePx * 2, 1.5)
    g.fillStyle = th.sub
    text(g, tickText(v), plot.x + axisW - tickPx * 0.6, Y(v), tickPx, font, 'right')
  }
  // labels along the bottom, as many as fit
  setFont(g, labelPx, font)
  const widest = Math.max(...rows.map((r) => g.measureText(r.label).width)) + labelPx
  const every = Math.max(1, Math.ceil(widest / Math.max(1, (x1 - x0) / Math.max(1, n - 1))))
  g.globalAlpha = 1
  rows.forEach((rw, i) => {
    const p = prog(i)
    if (p == null || p <= 0 || (i % every && i !== n - 1)) return
    if (i === n - 1 && i % every && (n - 1) % every < every / 2 && n > every) return
    g.globalAlpha = Math.min(1, p * 2)
    g.fillStyle = th.sub
    text(g, fitText(g, rw.label, labelPx, widest * 1.1, font), X(i), y1 + labelPx * 1.1, labelPx, font, 'center')
  })
  g.globalAlpha = 1
  const showValues = n <= 12 && S <= 2
  L.cols.forEach((j, k) => {
    const color = th.palette[k % th.palette.length]
    const pts: { x: number; y: number; p: number; i: number }[] = []
    rows.forEach((_, i) => {
      const v = cellNum(L, i, j)
      const p = prog(i)
      if (v && p != null && p > 0) pts.push({ x: X(i), y: Y(v.value), p, i })
    })
    if (!pts.length) return
    const dim = top && j !== top.series ? 1 - 0.5 * hl : 1
    // the path grows towards each new point
    const path: { x: number; y: number }[] = [pts[0]]
    for (let m = 1; m < pts.length; m++) {
      const a = pts[m - 1], b = pts[m]
      path.push({ x: a.x + (b.x - a.x) * b.p, y: a.y + (b.y - a.y) * b.p })
    }
    if (S === 1) {
      const grad = g.createLinearGradient(0, y0, 0, y1)
      grad.addColorStop(0, color + '55'); grad.addColorStop(1, color + '00')
      g.fillStyle = grad
      g.beginPath(); g.moveTo(path[0].x, y1)
      for (const q of path) g.lineTo(q.x, q.y)
      g.lineTo(path[path.length - 1].x, y1); g.closePath(); g.fill()
    }
    g.globalAlpha = dim
    g.strokeStyle = color
    g.lineWidth = Math.max(3, u * 0.008); g.lineJoin = 'round'; g.lineCap = 'round'
    g.beginPath(); path.forEach((q, m) => (m ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.stroke()
    for (const q of pts) {
      const isTop = top?.row === q.i && top.series === j
      const r = u * 0.011 * pop(q.p) * (isTop ? 1 + 0.6 * hl : 1)
      g.fillStyle = th.bg[0]
      g.beginPath(); g.arc(q.x, q.y, r + Math.max(2, u * 0.004), 0, Math.PI * 2); g.fill()
      g.fillStyle = color
      g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.fill()
      if (isTop && hl > 0) {
        g.strokeStyle = color; g.lineWidth = Math.max(2, u * 0.004); g.globalAlpha = hl * 0.6
        g.beginPath(); g.arc(q.x, q.y, r * 2, 0, Math.PI * 2); g.stroke()
        g.globalAlpha = dim
      }
      if (showValues || (isTop && hl > 0)) {
        g.globalAlpha = dim * (showValues ? ease(q.p) : hl) * (top && !isTop ? 1 - 0.6 * hl : 1)
        g.fillStyle = th.text
        const above = k === 0 || S === 1
        text(g, valueText(L, q.i, j, 1, rows[q.i].cells), q.x, q.y + (above ? -1 : 1) * valuePx * 1.15, valuePx * (isTop ? 1 + 0.2 * hl : 1), font, 'center')
        g.globalAlpha = dim
      }
    }
    g.globalAlpha = 1
  })
}

function drawDonut(g: CanvasRenderingContext2D, L: Laid, th: DataTheme, ds: DataScene, prog: Progress, hl: number, top: { row: number; series: number } | null) {
  const { plot, font, u, portrait } = L
  const rows = ds.table.rows
  const j = L.cols[0]
  const vals = rows.map((_, i) => Math.max(0, cellNum(L, i, j)?.value ?? 0))
  const total = vals.reduce((s, v) => s + v, 0) || 1
  const R = portrait ? Math.min(plot.w * 0.4, plot.h * 0.27) : Math.min(plot.h * 0.47, plot.w * 0.25)
  const cx = portrait ? L.W / 2 : plot.x + R + plot.w * 0.02
  const cy = portrait ? plot.y + R + u * 0.02 : plot.y + plot.h / 2
  const inner = R * 0.58
  let start = -Math.PI / 2
  let shown = 0
  rows.forEach((_, i) => {
    const p = prog(i) ?? 0
    const sweep = (vals[i] / total) * Math.PI * 2
    if (p > 0) {
      const isTop = top?.row === i
      const out = isTop ? R * 0.07 * hl : 0
      const mid = start + sweep / 2
      g.save()
      g.globalAlpha = top && !isTop ? 1 - 0.55 * hl : 1
      g.translate(Math.cos(mid) * out, Math.sin(mid) * out)
      g.fillStyle = th.palette[i % th.palette.length]
      g.beginPath()
      g.arc(cx, cy, R, start, start + sweep * p)
      g.arc(cx, cy, inner, start + sweep * p, start, true)
      g.closePath(); g.fill()
      g.restore()
      shown += vals[i] * ease(p)
    }
    start += sweep
  })
  // the middle: running total, or the top share at the end
  const n0 = cellNum(L, 0, j)
  const lab = LABELS[font.includes('Devanagari') ? 'hi' : 'en']
  g.fillStyle = th.text
  if (top && hl > 0) {
    g.globalAlpha = hl
    text(g, `${pctText(pctOf(L.a, j, top.row))}%`, cx, cy - inner * 0.08, inner * 0.46, font, 'center')
    g.fillStyle = th.sub
    text(g, fitText(g, rows[top.row].label, inner * 0.2, inner * 1.6, font), cx, cy + inner * 0.38, inner * 0.2, font, 'center')
  }
  g.globalAlpha = 1 - hl
  if (n0 && hl < 1) {
    g.fillStyle = th.text
    const s = n0.suffix.trim() === '%' ? `${Math.round(shown)}%` : formatNum(n0, shown)
    text(g, s, cx, cy - inner * 0.08, Math.min(inner * 0.42, (inner * 1.7) / Math.max(3, s.length) * 1.6), font, 'center')
    g.fillStyle = th.sub
    text(g, lab.total, cx, cy + inner * 0.38, inner * 0.2, font, 'center')
  }
  g.globalAlpha = 1
  // the legend: colour, name, value and share
  const lx = portrait ? plot.x : cx + R + plot.w * 0.06
  const ly = portrait ? cy + R + u * 0.06 : plot.y
  const lw = portrait ? plot.w : Math.min(plot.x + plot.w - lx, plot.w * 0.5)
  const lh = portrait ? plot.y + plot.h - ly : plot.h
  const rowH = Math.min(u * 0.09, lh / rows.length)
  const px = Math.min(u * 0.04, rowH * 0.42)
  const y0 = ly + (lh - rowH * rows.length) / 2
  rows.forEach((rw, i) => {
    const p = prog(i) ?? 0
    if (p <= 0) return
    const y = y0 + rowH * (i + 0.5)
    const isTop = top?.row === i
    g.globalAlpha = Math.min(1, p * 1.6) * (top && !isTop ? 1 - 0.55 * hl : 1)
    g.fillStyle = th.palette[i % th.palette.length]
    rr(g, lx, y - px * 0.45, px * 0.9, px * 0.9, px * 0.25); g.fill()
    setFont(g, px, font)
    const pct = `${pctText(pctOf(L.a, j, i))}%`
    const value = rw.cells[j] ?? ''
    const right = n0?.suffix.trim() === '%' ? pct : `${value}  ${pct}`
    const rw2 = g.measureText(right).width
    g.fillStyle = th.text
    text(g, fitText(g, rw.label, px, lw - px * 2 - rw2 - px, font), lx + px * 1.5, y, px, font)
    g.fillStyle = isTop && hl > 0 ? th.accent : th.sub
    text(g, right, lx + lw, y, px, font, 'right')
  })
  g.globalAlpha = 1
}

function drawTable(g: CanvasRenderingContext2D, L: Laid, th: DataTheme, ds: DataScene, prog: Progress, t: number) {
  const { plot, font, u } = L
  const tb = ds.table
  const step = ds.step
  const visible = tb.rows.map((_, i) => i).filter((i) => prog(i) != null)
  const pageRows = step.page ? Math.max(visible.length, 10) : visible.length
  const rowH = Math.min(u * 0.1, plot.h / (pageRows + 1))
  let px = Math.min(u * 0.042, rowH * 0.42)
  const head = [tb.head, ...tb.series]
  const cell = (i: number, c: number) => (c === 0 ? tb.rows[i].label : tb.rows[i].cells[c - 1] ?? '')
  const isNum = (c: number) => c > 0 && L.a.numeric.includes(c - 1)
  const widths = () => {
    setFont(g, px, font)
    return head.map((h, c) => Math.max(g.measureText(h).width, ...tb.rows.map((_, i) => g.measureText(cell(i, c)).width)) + px * 1.6)
  }
  let ws = widths()
  for (let k = 0; k < 12 && ws.reduce((a, b) => a + b, 0) > plot.w && px > u * 0.018; k++) { px *= 0.92; ws = widths() }
  const sum = ws.reduce((a, b) => a + b, 0)
  if (sum < plot.w) ws = ws.map((w) => w + (plot.w - sum) / ws.length)
  else ws = ws.map((w) => (w * plot.w) / sum)
  const xs = ws.map((_, c) => plot.x + ws.slice(0, c).reduce((a, b) => a + b, 0))
  // a short table sits in the middle of its space
  const y0 = plot.y + Math.max(0, (plot.h - rowH * (pageRows + 1)) / 2) * 0.6
  // header row
  g.globalAlpha = step.first ? ease((t - 0.15) / 0.4) : 1
  g.fillStyle = th.accent
  rr(g, plot.x, y0, plot.w, rowH, rowH * 0.25); g.fill()
  g.fillStyle = th.accentText
  head.forEach((h, c) => {
    if (!h) return
    const right = isNum(c)
    text(g, fitText(g, h, px, ws[c] - px * 1.2, font), right ? xs[c] + ws[c] - px * 0.8 : xs[c] + px * 0.8, y0 + rowH / 2, px, font, right ? 'right' : 'left')
  })
  g.globalAlpha = 1
  visible.forEach((i, k) => {
    const p = prog(i)!
    if (p <= 0) return
    const y = y0 + rowH * (k + 1)
    g.save()
    g.globalAlpha = p
    g.translate((1 - p) * u * 0.05, 0)
    g.fillStyle = k % 2 ? th.panel2 : th.panel
    rr(g, plot.x, y + 1, plot.w, rowH - 2, rowH * 0.2); g.fill()
    head.forEach((_, c) => {
      const right = isNum(c)
      g.fillStyle = c === 0 ? th.text : right ? th.text : th.sub
      const s = c > 0 && right ? valueText(L, i, c - 1, p, tb.rows[i].cells) : cell(i, c)
      text(g, fitText(g, s, px, ws[c] - px * 1.2, font), right ? xs[c] + ws[c] - px * 0.8 : xs[c] + px * 0.8, y + rowH / 2, px, font, right ? 'right' : 'left')
    })
    g.restore()
  })
}

function drawNumbers(g: CanvasRenderingContext2D, L: Laid, th: DataTheme, ds: DataScene, prog: Progress) {
  const { plot, font, u, portrait } = L
  const rows = ds.table.rows
  const n = rows.length
  const cols = portrait ? (n <= 4 ? 1 : 2) : n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : 4
  const lines = Math.ceil(n / cols)
  const gap = u * 0.03
  const cw = (plot.w - gap * (cols - 1)) / cols
  const ch = Math.min((plot.h - gap * (lines - 1)) / lines, cw * (portrait ? 0.62 : 0.8))
  const y0 = plot.y + (plot.h - (ch * lines + gap * (lines - 1))) / 2
  const j = L.cols[0] ?? 0
  rows.forEach((rw, i) => {
    const p = prog(i)
    if (p == null || p <= 0) return
    const c = i % cols, r = Math.floor(i / cols)
    // a short last line sits in the middle
    const inLine = r === lines - 1 ? n - r * cols : cols
    const x = plot.x + c * (cw + gap) + ((cols - inLine) * (cw + gap)) / 2
    const y = y0 + r * (ch + gap)
    const s = 0.85 + 0.15 * pop(p * 1.4)
    g.save()
    g.globalAlpha = Math.min(1, p * 2.5)
    g.translate(x + cw / 2, y + ch / 2); g.scale(s, s); g.translate(-cw / 2, -ch / 2)
    g.fillStyle = th.panel
    rr(g, 0, 0, cw, ch, u * 0.025); g.fill()
    const color = th.palette[i % th.palette.length]
    g.fillStyle = color
    rr(g, 0, 0, Math.max(6, u * 0.012), ch, 4); g.fill()
    const val = valueText(L, i, j, ease(p), rw.cells)
    const full = valueText(L, i, j, 1, rw.cells)
    let px = ch * 0.38
    setFont(g, px, font)
    const w = g.measureText(full).width
    if (w > cw * 0.84) px *= (cw * 0.84) / w
    g.fillStyle = color
    text(g, val, cw / 2, ch * 0.42, px, font, 'center')
    const lpx = Math.min(ch * 0.13, u * 0.04)
    setFont(g, lpx, font)
    const ll = wrap(g, rw.label, cw * 0.86).slice(0, 2)
    g.fillStyle = th.sub
    ll.forEach((l, k) => text(g, fitText(g, l, lpx, cw * 0.9, font), cw / 2, ch * 0.42 + px * 0.75 + (k + 0.5) * lpx * L.lh, lpx, font, 'center'))
    g.restore()
  })
}

function drawDataFrame(g: CanvasRenderingContext2D, L: Laid, ds: DataScene, plan: DataPlan, t: number) {
  const th = dataThemeOf(ds.settings.theme)
  g.globalAlpha = 1
  background(g, L, th)
  const hl = ds.step.summary ? ease((t - 0.15) / 0.7) : 0
  const top = ds.step.summary ? topRow(ds.table, ds.kind, L.a) : null
  drawChrome(g, L, th, ds, t, plan, hl)
  const prog = progressOf(ds, plan, t)
  if (ds.kind === 'bars') drawBars(g, L, th, ds, prog, hl, top)
  else if (ds.kind === 'columns') drawColumns(g, L, th, ds, prog, hl, top, t)
  else if (ds.kind === 'line') drawLine(g, L, th, ds, prog, hl, top, t)
  else if (ds.kind === 'donut') drawDonut(g, L, th, ds, prog, hl, top)
  else if (ds.kind === 'numbers') drawNumbers(g, L, th, ds, prog)
  else drawTable(g, L, th, ds, prog, t)
  g.globalAlpha = 1
}

async function prepare(ds: DataScene, W: number, H: number) {
  const font = tableLang(ds.table) === 'hi' ? 'Noto Sans Devanagari' : 'Poppins'
  await ensureFont(font) // before measuring any text
  return layout(ds, W, H, font)
}

const png = (c: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the chart'))), 'image/png'))

/** The scene's last picture: its thumbnail, and its stand-in where video can't be made. */
export async function drawDataStill(ds: DataScene, W: number, H: number): Promise<Blob> {
  const L = await prepare(ds, W, H)
  const plan = dataPlan(ds, 0)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  drawDataFrame(c.getContext('2d')!, L, ds, plan, plan.end + 5)
  return png(c)
}

/** A live preview of a whole table as its chart, for the editor sheet. */
export async function drawDataPreview(t: DataTable, st: DataSettings, c: HTMLCanvasElement) {
  const s = st.sort ? sortedTable(t) : t
  const kind = kindOf(s, st.kind)
  const n = s.rows.length
  const step: DataStep = { from: kind === 'table' && n > 12 ? 0 : 0, to: kind === 'table' && n > 12 ? 10 : n, page: kind === 'table' && n > 12, summary: false, first: true }
  const ds: DataScene = { table: s, kind, settings: st, step, phrases: [] }
  const L = await prepare(ds, c.width, c.height)
  drawDataFrame(c.getContext('2d')!, L, ds, dataPlan(ds, 0), 99)
}

/** One moment of a data scene, drawn on a canvas. */
export async function drawDataAt(ds: DataScene, c: HTMLCanvasElement, t: number, voice = 0) {
  const L = await prepare(ds, c.width, c.height)
  drawDataFrame(c.getContext('2d')!, L, ds, dataPlan(ds, voice), t)
}

/**
 * Renders a data scene as a clip of `seconds`. `offset` is how far into the clip the scene really
 * starts (the incoming transition), so the rows come in with the voice.
 */
export async function renderDataVideo(ds: DataScene, plan: DataPlan, W: number, H: number, seconds: number, offset: number) {
  const L = await prepare(ds, W, H)
  const moving = plan.moving.map(([a, b]) => [a + offset, b + offset] as [number, number])
  return renderCanvasVideo(W, H, seconds, moving, (g, t) => drawDataFrame(g, L, ds, plan, Math.max(0, t - offset)))
}

// ---------------------------------------------------------------- scenes

const short = (s: string) => (s.length > 40 ? s.slice(0, 40).replace(/\s+\S*$/, '') + '…' : s)

/** One scene per step of each table, each with its picture and what the voice reads. */
export async function dataToScenes(d: DataDoc, st: DataSettings, W: number, H: number, progress: (p: number) => void): Promise<Scene[]> {
  if (!d.tables.length) throw new Error('No data found')
  const plans = d.tables.map((t0) => {
    const kind = kindOf(t0, st.kind)
    const t = st.sort && kind !== 'line' ? sortedTable(t0) : t0
    return { t, kind, steps: dataSteps(t, kind, st) }
  })
  const total = plans.reduce((s, p) => s + p.steps.length, 0)
  const scenes: Scene[] = []
  for (const { t, kind, steps } of plans) {
    const hi = tableLang(t) === 'hi'
    const name = short(t.title || t.series.filter(Boolean).join(', ') || (hi ? 'चार्ट' : 'Chart'))
    for (const step of steps) {
      progress(scenes.length / total)
      const phrases = phrasesOf(t, kind, step)
      const data: DataScene = { table: t, kind, settings: st, step, phrases }
      const part = step.summary ? `▲ ${LABELS[hi ? 'hi' : 'en'].highest}` : steps.length > 1 ? (step.to - step.from > 1 ? `${step.from + 1}–${step.to}` : t.rows[step.from].label) : ''
      scenes.push({
        id: uid(), image: await drawDataStill(data, W, H), name: part ? `${name} · ${short(part)}` : name,
        text: phrases.map((p) => p.text).filter(Boolean).join(' '), duration: null, data,
      })
    }
  }
  return scenes
}
