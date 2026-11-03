import type { Editor } from '../model/useEditor'
import { trackName } from '../model/tracks'
import { Slider, Toggle, SheetClose } from '../ui/kit'
import { t } from '../lib/i18n'
import { Icon } from './Icon'
import { useCopiedTrack } from '../model/trackCopy'

/** Everything for one track row: name, show, sound, lock, volume, order and delete. */
export function TrackSheet({ ed, id, onClose, onSelectAll, onSelectAllClips, onCopy, onPaste }: {
  ed: Editor; id: string; onClose: () => void; onSelectAll?: (firstId: string) => void; onSelectAllClips?: () => void
  /** Copies this track ('main' = the main video) with everything on it. */
  onCopy?: (id: string) => void
  /** Opens the paste choices for the copied track. */
  onPaste?: () => void
}) {
  const copied = useCopiedTrack()
  const copyRow = (n: number) => onCopy && (
    <div className="track-copy">
      <button className="btn" disabled={!n} onClick={() => { onCopy(id); onClose() }}><Icon name="copy" size={18} /> {t('Copy track')}</button>
      <button className="btn" disabled={!copied || !onPaste} onClick={() => { onClose(); onPaste?.() }} title={copied ? copied.name : t('Copy a track first')}>
        <Icon name="paste" size={18} /> {t('Paste track')}
      </button>
    </div>
  )
  if (id === 'main') {
    const n = ed.project.clips.length
    return (
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet track-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grab" />
          <SheetClose onClose={onClose} />
          <h2>{t('Main video')}</h2>
          <p className="muted small">{n} {t('clips')}</p>
          <Toggle label="Sound" value={!ed.project.main?.muted} onChange={(v) => ed.setMain({ muted: !v })} />
          <Toggle label="Lock (no changes)" value={!!ed.project.main?.locked} onChange={(v) => ed.setMain({ locked: v })} />
          {onSelectAllClips && (
            <button className="btn wide" disabled={!n || !!ed.project.main?.locked} onClick={() => { onClose(); onSelectAllClips() }}>
              <Icon name="selectAll" size={18} /> {t('Select all clips')} ({n})
            </button>
          )}
          {copyRow(n)}
          <button className="btn wide" onClick={onClose}>{t('Done')}</button>
        </div>
      </div>
    )
  }
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
        <SheetClose onClose={onClose} />
        <h2>{name} <button className="link" onClick={rename}>{t('Rename')}</button></h2>
        <p className="muted small">{items.length} {t('items')} · {tr.kind === 'audio' ? t('Audio track') : t('Video track')}</p>
        {tr.kind === 'visual' && <Toggle label="Show on video" value={!tr.hidden} onChange={(v) => ed.updateTrack(id, { hidden: !v })} />}
        {sound && <Toggle label="Sound" value={!tr.muted} onChange={(v) => ed.updateTrack(id, { muted: !v })} />}
        <Toggle label="Lock (no changes)" value={!!tr.locked} onChange={(v) => ed.updateTrack(id, { locked: v })} />
        {sound && (
          <Slider label="Track volume" value={tr.volume ?? 1} min={0} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`}
            onStart={ed.begin} onEnd={ed.end} onChange={(v) => ed.updateTrack(id, { volume: v })} />
        )}
        {onSelectAll && (
          <button className="btn wide" disabled={!items.length || tr.locked} onClick={() => { const first = [...items].sort((a, b) => a.start - b.start)[0]; onClose(); onSelectAll(first.id) }}>
            <Icon name="selectAll" size={18} /> {t('Select everything on this track')} ({items.length})
          </button>
        )}
        {copyRow(items.length)}
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
