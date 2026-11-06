import { useMemo, useRef, useState } from 'react'
import type { AdjustmentLayer, Clip, CurvePoints, Grade, MediaLayer } from '../types'
import type { Editor } from '../model/useEditor'
import { CURVE_PRESETS, HSL_BANDS, LINE, parseCube, sampleCurve } from '../engine/grade'
import { histOf, matchCurves, thumbsOf, type Hist } from '../engine/colorMatch'
import { Chips, Panel, Slider } from '../ui/kit'
import { uid } from '../lib/format'
import { t } from '../lib/i18n'

type Target = { kind: 'clip'; clip: Clip } | { kind: 'layer'; layer: MediaLayer | AdjustmentLayer }
type Channel = 'all' | 'r' | 'g' | 'b'
const CH_COLOR: Record<Channel, string> = { all: '#ffffff', r: '#ff5c5c', g: '#4cdb6b', b: '#5c9bff' }
const ZERO: [number, number, number] = [0, 0, 0]

/** Pro colour: tone curves, HSL per colour, and imported .cube LUTs, for a clip or an overlay. */
export function ColorPanel({ ed, target, onClose, onToast }: { ed: Editor; target: Target; onClose: () => void; onToast: (s: string) => void }) {
  const item = target.kind === 'clip' ? target.clip : target.layer
  const grade: Grade = item.grade ?? {}
  const isAdj = 'type' in item && item.type === 'adjustment'
  const [tab, setTab] = useState<'curves' | 'hsl' | 'lut' | 'match'>('curves')
  const [ch, setCh] = useState<Channel>('all')
  const [band, setBand] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  const set = (g: Grade) => (target.kind === 'clip' ? ed.updateClip(target.clip.id, { grade: g }) : ed.updateLayer<MediaLayer | AdjustmentLayer>(target.layer.id, { grade: g }))
  const curves = grade.curves ?? {}
  const pts = curves[ch] ?? LINE
  const setPts = (p: CurvePoints) => set({ ...grade, curves: { ...curves, [ch]: p } })
  const hsl = grade.hsl ?? HSL_BANDS.map(() => [...ZERO] as [number, number, number])
  const setHsl = (k: 0 | 1 | 2, v: number) => set({ ...grade, hsl: hsl.map((b, i) => (i === band ? (b.map((x, j) => (j === k ? v : x)) as [number, number, number]) : b)) })
  const luts = ed.project.luts ?? []

  const importCube = async (f: File) => {
    try {
      const lut = parseCube(await f.text(), f.name, uid())
      ed.addLut(lut, { type: target.kind, id: item.id }, 1)
      onToast(`${t('LUT added')}: ${lut.name}`)
    } catch (e) { onToast((e as Error).message) }
  }

  return (
    <Panel
      title="Color" onClose={onClose} tall
      actions={<>
        <button className="btn small" onClick={() => set({})}>{t('Reset')}</button>
        {target.kind === 'clip' && <button className="btn small" onClick={() => ed.updateAllClips(() => ({ grade: item.grade ? structuredClone(item.grade) : null }))}>{t('Apply to all')}</button>}
      </>}
    >
      <Chips options={[{ value: 'curves', label: 'Curves' }, { value: 'hsl', label: 'HSL' }, { value: 'lut', label: 'LUT' }, ...(!isAdj ? [{ value: 'match' as const, label: 'Match' }] : [])]} value={tab} onChange={setTab} />
      {tab === 'curves' && (
        <>
          <Chips options={[{ value: 'all', label: 'All' }, { value: 'r', label: 'Red' }, { value: 'g', label: 'Green' }, { value: 'b', label: 'Blue' }]} value={ch} onChange={setCh} />
          <CurveEditor points={pts} color={CH_COLOR[ch]} onStart={ed.begin} onEnd={ed.end} onChange={setPts} />
          <p className="muted small">{t('Tap the line to add a point, drag to bend it, double-tap a point to remove it.')}</p>
          {ch === 'all' && <Chips options={CURVE_PRESETS.map((p) => ({ value: p.name, label: p.name }))} value={null} onChange={(n) => setPts(CURVE_PRESETS.find((p) => p.name === n)!.all)} wrap />}
        </>
      )}
      {tab === 'hsl' && (
        <>
          <div className="hsl-bands">
            {HSL_BANDS.map((b, i) => (
              <button key={b.name} className={band === i ? 'on' : ''} style={{ background: b.color }} aria-label={t(b.name)} title={t(b.name)} onClick={() => setBand(i)}>
                {hsl[i].some((v) => v !== 0) ? '•' : ''}
              </button>
            ))}
          </div>
          <p className="field-label">{t(HSL_BANDS[band].name)}</p>
          <Slider label="Hue" min={-1} max={1} center value={hsl[band][0]} format={(v) => `${Math.round(v * 30)}°`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => setHsl(0, v)} />
          <Slider label="Saturation" min={-1} max={1} center value={hsl[band][1]} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => setHsl(1, v)} />
          <Slider label="Lightness" min={-1} max={1} center value={hsl[band][2]} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => setHsl(2, v)} />
          <p className="muted small">{t('Change one colour only: e.g. Orange lightness up for brighter skin, Green saturation down for calmer leaves.')}</p>
        </>
      )}
      {tab === 'lut' && (
        <>
          <button className="btn wide" onClick={() => file.current?.click()}>{t('Import .cube LUT')}</button>
          <input ref={file} type="file" accept=".cube" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCube(f); e.target.value = '' }} />
          <div className="lut-list">
            <button className={!grade.lut ? 'on' : ''} onClick={() => set({ ...grade, lut: null })}>{t('None')}</button>
            {luts.map((l) => (
              <button key={l.id} className={grade.lut?.id === l.id ? 'on' : ''} onClick={() => set({ ...grade, lut: { id: l.id, amount: grade.lut?.amount ?? 1 } })}>{l.name}</button>
            ))}
          </div>
          {grade.lut && <Slider label="Strength" min={0} max={1} value={grade.lut.amount} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ ...grade, lut: { ...grade.lut!, amount: v } })} />}
          <p className="muted small">{t('A LUT is a ready colour look (.cube file) from a camera maker or a colourist. It is saved in this project.')}</p>
        </>
      )}
      {tab === 'match' && !isAdj && <MatchTab ed={ed} item={item as Clip | MediaLayer} grade={grade} set={set} onToast={onToast} />}
    </Panel>
  )
}

/** Color match: pick another clip (or a photo) whose colours this one should get. */
function MatchTab({ ed, item, grade, set, onToast }: { ed: Editor; item: Clip | MediaLayer; grade: Grade; set: (g: Grade) => void; onToast: (s: string) => void }) {
  const [ref, setRef] = useState<{ id: string; hist: Hist } | null>(null)
  const [amount, setAmount] = useState(0.8)
  const [busy, setBusy] = useState(false)
  const photo = useRef<HTMLInputElement>(null)
  const own = useRef<Promise<Hist> | null>(null)
  const mine = () => {
    const src = ed.sources[item.sourceId]
    const urls = 'type' in item ? thumbsOf({ in: item.in, dur: (item.end - item.start) * (item.speed ?? 1) }, src) : thumbsOf(item, src)
    own.current ??= histOf(urls)
    return own.current
  }
  const apply = (h: Hist, a: number, base: Hist) => set({ ...grade, curves: { ...(grade.curves ?? {}), ...matchCurves(base, h, a) } })
  const pick = async (id: string, urls: string[]) => {
    if (!urls.length) { onToast(t('This clip has no picture to match.')); return }
    setBusy(true)
    try {
      const [base, h] = await Promise.all([mine(), histOf(urls)])
      setRef({ id, hist: h })
      apply(h, amount, base)
      onToast(t('Colours matched. Fine-tune them in Curves.'))
    } catch (e) { onToast(t((e as Error).message)) } finally { setBusy(false) }
  }
  const readPhoto = (f: File) => {
    const r = new FileReader()
    r.onload = () => void pick('photo', [String(r.result)])
    r.readAsDataURL(f)
  }
  const others = ed.project.clips.filter((c) => c.id !== item.id && ed.sources[c.sourceId]?.thumbs.length)
  return (
    <>
      <p className="muted small">{t('Pick the shot whose colours this one should get, e.g. the main camera. Red, green and blue curves are made; you can change them in Curves.')}</p>
      <div className="match-list">
        {others.map((c) => {
          const urls = thumbsOf(c, ed.sources[c.sourceId])
          return (
            <button key={c.id} className={ref?.id === c.id ? 'on' : ''} disabled={busy} onClick={() => pick(c.id, urls)} title={`${t('Clip')} ${ed.project.clips.indexOf(c) + 1}`}>
              <img src={urls[Math.floor(urls.length / 2)] ?? ed.sources[c.sourceId].thumbs[0]} alt="" />
              <span>{t('Clip')} {ed.project.clips.indexOf(c) + 1}</span>
            </button>
          )
        })}
        <button className={ref?.id === 'photo' ? 'on' : ''} disabled={busy} onClick={() => photo.current?.click()}>
          <span className="match-photo">🖼</span><span>{t('A photo')}</span>
        </button>
      </div>
      <input ref={photo} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readPhoto(f); e.target.value = '' }} />
      {ref && (
        <Slider label="Strength" min={0} max={1} value={amount} format={(v) => `${Math.round(v * 100)}%`} onStart={ed.begin} onEnd={ed.end}
          onChange={(v) => { setAmount(v); void mine().then((base) => apply(ref.hist, v, base)) }} />
      )}
      {busy && <p className="muted small">{t('Matching…')}</p>}
      {(grade.curves?.r || grade.curves?.g || grade.curves?.b) && (
        <button className="btn small" onClick={() => { setRef(null); set({ ...grade, curves: grade.curves?.all ? { all: grade.curves.all } : null }) }}>{t('Remove the match')}</button>
      )}
    </>
  )
}

/** A square curve editor: points dragged with mouse or finger; the ends move only up and down. */
function CurveEditor({ points, color, onChange, onStart, onEnd }: { points: CurvePoints; color: string; onChange: (p: CurvePoints) => void; onStart: () => void; onEnd: () => void }) {
  const box = useRef<SVGSVGElement>(null)
  const drag = useRef<{ i: number } | null>(null)
  const lastTap = useRef<{ i: number; at: number } | null>(null)
  const S = 240
  const sorted = useMemo(() => [...points].sort((a, b) => a[0] - b[0]), [points])
  const path = useMemo(() => {
    const ys = sampleCurve(sorted, 64)
    return Array.from(ys, (y, i) => `${i ? 'L' : 'M'}${((i / 63) * S).toFixed(1)},${((1 - y) * S).toFixed(1)}`).join('')
  }, [sorted])
  const at = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))] as [number, number]
  }
  const down = (e: React.PointerEvent) => {
    const [x, y] = at(e)
    let i = sorted.findIndex((p) => Math.hypot(p[0] - x, p[1] - y) < 0.07)
    if (i >= 0 && lastTap.current?.i === i && Date.now() - lastTap.current.at < 350 && i > 0 && i < sorted.length - 1) {
      onStart(); onChange(sorted.filter((_, k) => k !== i)); onEnd()
      lastTap.current = null
      return
    }
    onStart()
    if (i < 0) {
      if (sorted.length >= 8) return
      const next = [...sorted, [x, y] as [number, number]].sort((a, b) => a[0] - b[0])
      i = next.findIndex((p) => p[0] === x && p[1] === y)
      onChange(next)
    }
    lastTap.current = { i, at: Date.now() }
    drag.current = { i }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return
    const [x, y] = at(e)
    const i = drag.current.i
    const next = sorted.map((p) => [...p] as [number, number])
    const lo = i > 0 ? next[i - 1][0] + 0.01 : 0, hi = i < next.length - 1 ? next[i + 1][0] - 0.01 : 1
    next[i] = [i === 0 ? 0 : i === next.length - 1 ? 1 : Math.min(hi, Math.max(lo, x)), y]
    onChange(next)
  }
  const up = () => { if (drag.current) { drag.current = null; onEnd() } }
  return (
    <svg ref={box} className="curve-editor" viewBox={`0 0 ${S} ${S}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {[1, 2, 3].map((k) => <g key={k}><line x1={(k * S) / 4} y1={0} x2={(k * S) / 4} y2={S} /><line x1={0} y1={(k * S) / 4} x2={S} y2={(k * S) / 4} /></g>)}
      <line className="diag" x1={0} y1={S} x2={S} y2={0} />
      <path d={path} stroke={color} />
      {sorted.map((p, i) => <circle key={i} cx={p[0] * S} cy={(1 - p[1]) * S} r={7} fill={color} />)}
    </svg>
  )
}
