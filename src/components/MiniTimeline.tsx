import { useRef } from 'react'
import type { Editor } from '../model/useEditor'
import { t as tr } from '../lib/i18n'
import { Icon } from './Icon'

const LAYER_TINT: Record<string, string> = { text: '#8b5cf6', sticker: '#f59e0b', media: '#14b8a6', blur: '#64748b', audio: '#22c55e', wave: '#0ea5e9' }

/**
 * The timeline folded into one thin bar (more room for the video): the whole project fits its width, with the
 * clips, a thin line for each other item, markers and the playhead. Tap or drag to jump; the zoom still works
 * for when the timeline opens again.
 */
export function MiniTimeline({ ed, t, pps, setPps, onScrub, onExpand }: {
  ed: Editor; t: number; pps: number; setPps: (f: (p: number) => number) => void; onScrub: (t: number) => void; onExpand: () => void
}) {
  const bar = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const total = Math.max(0.001, ed.layout.total)
  const at = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect()
    return Math.max(0, Math.min(total, ((clientX - r.left) / r.width) * total))
  }
  const sel = ed.sel
  const pc = (s: number) => `${(s / total) * 100}%`
  return (
    <div className="mini-tl" data-testid="mini-timeline">
      <button className="icon-btn mini-tl-open" onClick={onExpand} aria-label={tr('Show timeline')} title={tr('Show timeline (Shift+T)')}><Icon name="up" size={20} /></button>
      <div
        className="mini-tl-bar" ref={bar}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; onScrub(at(e.clientX)) }}
        onPointerMove={(e) => { if (dragging.current) onScrub(at(e.clientX)) }}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
      >
        {ed.layout.items.map((it) => {
          const src = ed.sources[it.clip.sourceId]
          return (
            <div key={it.clip.id} className={`mini-tl-clip${sel?.type === 'clip' && sel.id === it.clip.id ? ' on' : ''}`} style={{ left: pc(it.start), width: pc(it.dur) }}>
              {src?.thumbs[0] && <img src={src.thumbs[0]} alt="" draggable={false} />}
            </div>
          )
        })}
        <div className="mini-tl-layers">
          {ed.project.layers.map((l) => (
            <i key={l.id} className={sel?.type === 'layer' && sel.id === l.id ? 'on' : ''} style={{ left: pc(l.start), width: pc(Math.max(0, l.end - l.start)), background: LAYER_TINT[l.type] }} />
          ))}
        </div>
        {(ed.project.markers ?? []).map((m) => <i key={m.id} className="mini-tl-marker" style={{ left: pc(m.t), background: m.color }} />)}
        <div className="mini-tl-head" style={{ left: pc(Math.min(t, total)) }} />
      </div>
      <span className="mini-tl-zoom">
        <button className="icon-btn" onClick={() => setPps((z) => Math.max(4, z / 1.5))} aria-label="Zoom out" title={tr('Zoom out')}><Icon name="minus" size={18} /></button>
        <span className="muted small" title={tr('Timeline zoom')}>{Math.round((pps / 40) * 100)}%</span>
        <button className="icon-btn" onClick={() => setPps((z) => Math.min(400, z * 1.5))} aria-label="Zoom in" title={tr('Zoom in')}><Icon name="plus" size={18} /></button>
      </span>
    </div>
  )
}
