import type { Editor } from '../model/useEditor'
import { trackName } from '../model/tracks'
import { Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'
import { Icon } from './Icon'

/** Everything for one track row: name, show, sound, lock, volume, order and delete. */
export function TrackSheet({ ed, id, onClose }: { ed: Editor; id: string; onClose: () => void }) {
  const tracks = ed.project.tracks ?? []
  const tr = tracks.find((x) => x.id === id)
  if (!tr) return null
  const items = ed.project.layers.filter((l) => l.track === id)
  const sound = tr.kind === 'audio' || items.some((l) => l.type === 'media')
  const same = tracks.filter((x) => x.kind === tr.kind)
  const pos = same.indexOf(tr)
  const name = trackName(tracks, tr, t)
  const rename = () => {
    const v = prompt(t('Track name'), name)
    if (v !== null) ed.updateTrack(id, { name: v.trim() || undefined })
  }
  const del = () => {
    if (items.length && !confirm(`${t('Delete this track and everything on it?')} (${items.length})`)) return
    ed.removeTrack(id)
    onClose()
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet track-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h2>{name} <button className="link" onClick={rename}>{t('Rename')}</button></h2>
        <p className="muted small">{items.length} {t('items')} · {tr.kind === 'audio' ? t('Audio track') : t('Video track')}</p>
        {tr.kind === 'visual' && <Toggle label="Show on video" value={!tr.hidden} onChange={(v) => ed.updateTrack(id, { hidden: !v })} />}
        {sound && <Toggle label="Sound" value={!tr.muted} onChange={(v) => ed.updateTrack(id, { muted: !v })} />}
        <Toggle label="Lock (no changes)" value={!!tr.locked} onChange={(v) => ed.updateTrack(id, { locked: v })} />
        {sound && (
          <Slider label="Track volume" value={tr.volume ?? 1} min={0} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`}
            onStart={ed.begin} onEnd={ed.end} onChange={(v) => ed.updateTrack(id, { volume: v })} />
        )}
        <div className="track-actions">
          <button className="btn" disabled={pos <= 0} onClick={() => ed.moveTrack(id, -1)}><Icon name="up" size={18} /> {t('Move up')}</button>
          <button className="btn" disabled={pos >= same.length - 1} onClick={() => ed.moveTrack(id, 1)}><Icon name="down" size={18} /> {t('Move down')}</button>
          <button className="btn danger" onClick={del}><Icon name="trash" size={18} /> {t('Delete track')}</button>
        </div>
        {tr.kind === 'visual' && <p className="muted small">{t('A higher track shows in front of the ones below it.')}</p>}
        <button className="btn wide" onClick={onClose}>{t('Done')}</button>
      </div>
    </div>
  )
}
