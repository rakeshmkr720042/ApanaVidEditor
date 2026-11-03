import type { PasteTrackHow, TrackCopy } from '../model/trackCopy'
import { SheetClose } from '../ui/kit'
import { fmtTime } from '../lib/format'
import { t } from '../lib/i18n'
import { Icon, type IconName } from './Icon'

/** Where a copied track goes: a new row at the playhead or at the original time; the main video also back into the main video. */
export function PasteTrackSheet({ copy, time, mainLocked, onPaste, onClose }: {
  copy: TrackCopy; time: number; mainLocked: boolean; onPaste: (how: PasteTrackHow) => void; onClose: () => void
}) {
  const main = copy.kind === 'main'
  const count = main ? copy.clips.length : copy.layers.length
  const opt = (how: PasteTrackHow, icon: IconName, label: string, hint: string, disabled = false) => (
    <button key={how} className="btn wide paste-opt" disabled={disabled} onClick={() => onPaste(how)}>
      <Icon name={icon} size={18} />
      <span><b>{t(label)}</b><small className="muted">{hint}</small></span>
    </button>
  )
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet track-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} />
        <h2><Icon name="paste" size={20} /> {t('Paste track')}</h2>
        <p className="muted small">
          {t('Copied')}: <b>{copy.name}</b> · {count} {t(main ? 'clips' : 'items')} · {fmtTime(copy.start, false)}–{fmtTime(copy.end, false)}
        </p>
        {main && opt('main-playhead', 'insert', 'Main video: at the playhead', `${t('The copied clips go into the main video at')} ${fmtTime(time, false)}`, mainLocked)}
        {main && opt('main-end', 'toEnd', 'Main video: at the end', t('The copied clips play again after the last clip.'), mainLocked)}
        {opt('playhead', 'overlay', main ? 'New video track: at the playhead' : 'New track: at the playhead', `${t('Starts at')} ${fmtTime(time, false)}`)}
        {opt('same', 'copy', main ? 'New video track: same time' : 'New track: same time', `${t('Same time as the original')} (${fmtTime(copy.start, false)})`)}
        {main && mainLocked && <p className="muted small">{t('The main video is locked. Unlock it to paste into it.')}</p>}
        <p className="muted small">{t('Every item comes with its settings (look, sound, animation, keyframes). The copy stays ready: you can paste it again, also in another project.')}</p>
        <button className="btn wide" onClick={onClose}>{t('Done')}</button>
      </div>
    </div>
  )
}
