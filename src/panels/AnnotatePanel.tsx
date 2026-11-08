import { useEffect, useMemo, useState } from 'react'
import type { AnnoMark, AnnotateLayer, AnnotateStyle } from '../types'
import type { Editor } from '../model/useEditor'
import type { Player } from '../engine/player'
import { Chips, ColorRow, Panel, Slider, Toggle } from '../ui/kit'
import { ANNO_TOOLS, MARK_NAMES, annoClock, markFromStroke, nextBadge, type AnnoTool } from '../model/annotate'
import { annoMatrix, apply, invert, mul, zoomAt, zoomMatrix } from '../engine/annotate'
import { fmtTime, uid } from '../lib/format'
import { t } from '../lib/i18n'

/** What the preview needs to let the user draw on the video with the chosen tool. */
export interface AnnoDraw {
  tool: AnnoTool
  color: string
  /** A finished stroke (or tap): x, y pairs in 0..1 of the preview canvas. */
  onStroke: (pts: number[]) => void
}

interface Props {
  ed: Editor
  layer: AnnotateLayer
  player: Player | null
  time: number
  onSeek: (t: number) => void
  onDraw: (d: AnnoDraw | null) => void
  onToast: (s: string) => void
  onClose: () => void
}

type Tab = 'draw' | 'look' | 'list'

/** Smart Screen Annotate: draw on the video (phone: with a finger), change the look, and edit the marks one by one. */
export function AnnotatePanel({ ed, layer, player, time, onSeek, onDraw, onToast, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('draw')
  const [tool, setTool] = useState<AnnoTool>('auto')
  const [key, setKey] = useState('')
  const st = layer.style
  const setStyle = (patch: Partial<AnnotateStyle>) => ed.updateLayer<AnnotateLayer>(layer.id, (l) => ({ style: { ...l.style, ...patch } }))
  const addMark = (m: AnnoMark) => ed.updateLayer<AnnotateLayer>(layer.id, (l) => ({ marks: [...l.marks, m] }))

  /** The layer's own clock and picture mapping at the playhead (null when its recording is not on screen). */
  const space = () => {
    const r = player?.renderer
    if (!r) return null
    const clock = annoClock(layer, ed.project, ed.layout.items, time)
    if (!clock) return null
    let m = annoMatrix(layer, clock, ed.project, ed.sources, r.W, r.H, (ml) => r.layerRect(ml, ed.sources))
    const z = zoomAt(layer, clock.T)
    if (z && z.s > 1.001) m = mul(zoomMatrix(z, m, r.W, r.H), m)
    // the picture's own shape, so a drawn circle is judged round as it looks
    const [ax, ay] = apply(m, 0, 0), [bx, by] = apply(m, 1, 0), [cx, cy] = apply(m, 0, 1)
    const ar = Math.hypot(bx - ax, by - ay) / Math.max(1e-6, Math.hypot(cx - ax, cy - ay))
    return { clock, inv: invert(m), W: r.W, H: r.H, ar }
  }

  const stroke = (pts: number[]) => {
    const sp = space()
    if (!sp) { onToast(t('Move the playhead over the recording to draw on it')); return }
    const local: number[] = []
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const [x, y] = apply(sp.inv, pts[i] * sp.W, pts[i + 1] * sp.H)
      local.push(x, y)
    }
    // marks start a moment earlier, so the paused frame already shows them fully drawn
    const T = sp.clock.T - (tool === 'tap' ? 0.2 : 0.4)
    const m = markFromStroke(tool, local, sp.ar, T, nextBadge(layer))
    if (!m) return
    addMark(m)
  }

  useEffect(() => {
    onDraw(tab === 'draw' ? { tool, color: st.color, onStroke: stroke } : null)
  })
  useEffect(() => () => onDraw(null), []) // eslint-disable-line react-hooks/exhaustive-deps

  const addKey = () => {
    const sp = space()
    const text = key.trim()
    if (!text) return
    if (!sp) { onToast(t('Move the playhead over the recording to draw on it')); return }
    addMark({ id: uid(), kind: 'key', t: sp.clock.T - 0.2, text })
    setKey('')
  }

  const marks = useMemo(() => [...layer.marks].sort((a, b) => a.t - b.t), [layer.marks])
  /** Timeline time of a mark, to jump to it (the first place its recording shows that moment). */
  const timeOf = (m: AnnoMark) => {
    const shift = layer.shift ?? 0
    if (!layer.sourceId) return layer.start + m.t + shift
    for (let tt = layer.start; tt < layer.end; tt += 0.05) {
      const c = annoClock(layer, ed.project, ed.layout.items, tt)
      if (c && Math.abs(c.T - m.t) < 0.06) return tt
    }
    return null
  }
  const drawings = layer.marks.filter((m) => m.kind !== 'click' && m.kind !== 'key').length
  const clicks = layer.marks.filter((m) => m.kind === 'click').length

  return (
    <Panel title="Annotate" onClose={onClose} tall>
      <Chips options={[{ value: 'draw', label: '✎ Draw' }, { value: 'look', label: '🎨 Look' }, { value: 'list', label: `☰ ${t('Marks')} (${layer.marks.length})` }]} value={tab} onChange={setTab} />
      {tab === 'draw' && (
        <>
          <Chips wrap options={ANNO_TOOLS} value={tool} onChange={setTool} />
          <p className="muted small">{t(tool === 'auto'
            ? 'Draw on the video: circle a word and it becomes a box, draw a line under text and it becomes an underline (it glows first).'
            : tool === 'tap' ? 'Tap on the video where a click should show.'
              : tool === 'badge' ? 'Tap where the next step number should go.'
                : 'Draw on the video with your finger or mouse.')}</p>
          <span className="field-label">{t('Colour')}</span>
          <ColorRow value={st.color} onChange={(c) => setStyle({ color: c ?? '#ff3b30' })} />
          <div className="row">
            <input className="input grow" value={key} placeholder={t('Key shown, e.g. Ctrl+C')} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addKey() }} />
            <button className="btn small" onClick={addKey} disabled={!key.trim()}>+ {t('Key')}</button>
          </div>
          <div className="row">
            <button className="btn small" disabled={!drawings} onClick={() => ed.updateLayer<AnnotateLayer>(layer.id, (l) => ({ marks: l.marks.filter((m) => m.kind === 'click' || m.kind === 'key') }))}>🧹 {t('Clear drawings')}</button>
            <button className="btn small" disabled={!layer.marks.length} onClick={() => ed.updateLayer<AnnotateLayer>(layer.id, (l) => ({ marks: l.marks.slice(0, -1) }))}>↶ {t('Remove last')}</button>
          </div>
        </>
      )}
      {tab === 'look' && (
        <>
          <span className="field-label">{t('Cursor highlight')}</span>
          <Chips options={[{ value: 'glow', label: '✺ Glow' }, { value: 'ring', label: '◯ Ring' }, { value: 'big', label: '⬤ Big' }, { value: 'none', label: 'Off' }]} value={st.cursor} onChange={(cursor) => setStyle({ cursor })} />
          {st.cursor !== 'none' && <ColorRow value={st.cursorColor} onChange={(c) => setStyle({ cursorColor: c ?? '#ffd60a' })} />}
          <span className="field-label">{t('Click effect')} ({clicks})</span>
          <Chips options={[{ value: 'ripple', label: '◎ Ripple' }, { value: 'burst', label: '✳ Burst' }, { value: 'pulse', label: '● Pulse' }, { value: 'none', label: 'Off' }]} value={st.clicks} onChange={(clicks) => setStyle({ clicks })} />
          {st.clicks !== 'none' && <ColorRow value={st.clickColor} onChange={(c) => setStyle({ clickColor: c ?? '#ffd60a' })} />}
          <Toggle label="Click sound" value={st.sound} onChange={(sound) => setStyle({ sound })} />
          <Toggle label="Show keys pressed (Ctrl+C…)" value={st.keys} onChange={(keys) => setStyle({ keys })} />
          <span className="field-label">{t('Spotlight (dim the rest)')}</span>
          <Chips options={[{ value: 'marked', label: 'When switched on' }, { value: 'always', label: 'Always' }, { value: 'off', label: 'Off' }]} value={st.spotlight} onChange={(spotlight) => setStyle({ spotlight })} />
          <span className="field-label">{t('Auto zoom')}</span>
          <Chips wrap options={[{ value: 'clicks', label: '🔍 At clicks' }, { value: 'follow', label: 'Follow cursor' }, { value: 'marked', label: 'When switched on' }, { value: 'off', label: 'Off' }]} value={st.zoom} onChange={(zoom) => setStyle({ zoom })} />
          {st.zoom !== 'off' && <Slider label="Zoom" min={1.2} max={3} step={0.1} value={st.zoomAmount} format={(v) => `${v.toFixed(1)}×`} onStart={ed.begin} onEnd={ed.end} onChange={(zoomAmount) => setStyle({ zoomAmount })} />}
          <span className="field-label">{t('Laser trail')}</span>
          <Chips options={[{ value: 'laser', label: 'In laser mode' }, { value: 'always', label: 'Always' }, { value: 'off', label: 'Off' }]} value={st.trail} onChange={(trail) => setStyle({ trail })} />
          <Slider label="Drawings stay" min={0} max={20} step={0.5} value={st.fade} format={(v) => (v === 0 ? t('Till the end') : `${v} s`)} onStart={ed.begin} onEnd={ed.end} onChange={(fade) => setStyle({ fade })} />
          <Toggle label="Smooth cursor path" value={st.smooth} onChange={(smooth) => setStyle({ smooth })} />
          <Slider label="Sync shift" min={-3} max={3} step={0.05} center value={layer.shift ?? 0} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} s`} onStart={ed.begin} onEnd={ed.end}
            onChange={(shift) => ed.updateLayer<AnnotateLayer>(layer.id, { shift })} />
          <p className="muted small">{t('Sync shift moves every effect earlier or later, if clicks show a little before or after they happen.')}</p>
        </>
      )}
      {tab === 'list' && (
        <div className="anno-list">
          {!marks.length && <p className="muted small">{t('No marks yet. Record your screen in the Windows app with Smart annotate on, or draw on the video.')}</p>}
          {marks.slice(0, 400).map((m) => {
            const at = timeOf(m)
            return (
              <div key={m.id} className="anno-row">
                <button className="link" disabled={at === null} onClick={() => at !== null && onSeek(at + 0.4)}>{at === null ? '—' : fmtTime(at)}</button>
                <span className="grow">{t(MARK_NAMES[m.kind])}{m.text ? ` · ${m.text}` : ''}{m.right ? ` · ${t('right')}` : ''}</span>
                <button className="icon-btn small" aria-label={t('Delete')} onClick={() => ed.updateLayer<AnnotateLayer>(layer.id, (l) => ({ marks: l.marks.filter((x) => x.id !== m.id) }))}>✕</button>
              </div>
            )
          })}
          {marks.length > 400 && <p className="muted small">+{marks.length - 400}</p>}
          {clicks > 0 && (
            <button className="btn small" onClick={() => ed.updateLayer<AnnotateLayer>(layer.id, (l) => ({ marks: l.marks.filter((x) => x.kind !== 'click') }))}>{t('Remove all clicks')}</button>
          )}
        </div>
      )}
    </Panel>
  )
}
