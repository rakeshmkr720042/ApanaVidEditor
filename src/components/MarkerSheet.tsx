import { useState } from 'react'
import type { Marker } from '../types'
import { SheetClose } from '../ui/kit'
import { fmtTime } from '../lib/format'
import { t } from '../lib/i18n'
import { MARKER_COLORS } from '../model/useEditor'
import { Icon } from './Icon'
import { chaptersText } from '../lib/markers'

/** Every marker: rename, colour, jump to it, delete; add one at the playhead; copy them as YouTube chapters. */
export function MarkerSheet({ markers, focus, time, onAdd, onUpdate, onRemove, onSeek, onClose, onToast }: {
  markers: Marker[]; focus: string | null; time: number
  onAdd: () => void; onUpdate: (id: string, patch: Partial<Omit<Marker, 'id'>>) => void; onRemove: (id: string | 'all') => void
  onSeek: (t: number) => void; onClose: () => void; onToast: (s: string) => void
}) {
  const [colorFor, setColorFor] = useState<string | null>(null)
  const copy = async () => {
    try { await navigator.clipboard.writeText(chaptersText(markers)); onToast(t('Chapters copied. Paste them in the YouTube description.')) }
    catch { onToast(t('Could not copy. Long-press the text to copy it.')) }
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} data-testid="marker-sheet">
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} />
        <h2><Icon name="marker" size={20} /> {t('Markers')}</h2>
        <p className="muted small">{t('A marker is a flag on the timeline to find a moment again. Shift+M adds one, Ctrl+← / Ctrl+→ jump between them.')}</p>
        <button className="btn wide" onClick={onAdd}><Icon name="plus" size={18} /> {t('Add marker at')} {fmtTime(time)}</button>
        <div className="marker-list">
          {markers.map((m) => (
            <div key={m.id} className={`marker-row${focus === m.id ? ' on' : ''}`}>
              <button className="marker-dot" style={{ background: m.color }} onClick={() => setColorFor(colorFor === m.id ? null : m.id)} aria-label={t('Colour')} />
              <button className="btn small" onClick={() => onSeek(m.t)} title={t('Go to this marker')}>{fmtTime(m.t)}</button>
              <input value={m.name} onChange={(e) => onUpdate(m.id, { name: e.target.value })} placeholder={t('Name')} autoFocus={focus === m.id} />
              <button className="icon-btn" onClick={() => onRemove(m.id)} aria-label={t('Delete')}><Icon name="trash" size={18} /></button>
              {colorFor === m.id && (
                <span className="marker-colors" style={{ gridColumn: '1 / -1' }}>
                  {MARKER_COLORS.map((c) => <button key={c} className={`marker-dot${c === m.color ? ' on' : ''}`} style={{ background: c }} onClick={() => { onUpdate(m.id, { color: c }); setColorFor(null) }} aria-label={c} />)}
                  <button className="btn small" onClick={() => { onUpdate(m.id, { t: time }); setColorFor(null) }}>{t('Move here')} ({fmtTime(time)})</button>
                </span>
              )}
            </div>
          ))}
          {!markers.length && <p className="muted small">{t('No markers yet.')}</p>}
        </div>
        {markers.length > 0 && (
          <div className="row">
            <button className="btn" onClick={copy}><Icon name="copy" size={18} /> {t('Copy as YouTube chapters')}</button>
            <button className="btn" onClick={() => { if (confirm(t('Delete all markers?'))) onRemove('all') }}><Icon name="trash" size={18} /> {t('Delete all')}</button>
          </div>
        )}
        <button className="btn wide" onClick={onClose}>{t('Done')}</button>
      </div>
    </div>
  )
}
