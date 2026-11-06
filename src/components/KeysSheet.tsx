import { SheetClose } from '../ui/kit'
import { t } from '../lib/i18n'
import { Icon } from './Icon'
import { KEYS, MOUSE } from '../help/shortcuts'
import { openHelp } from '../help/open'

/** Every keyboard shortcut and mouse control of the editor. */
export function KeysSheet({ onClose }: { onClose: () => void }) {
  const list = (rows: [string, string][]) => (
    <dl className="keys-list">
      {rows.map(([k, v]) => [<dt key={`k${k}`}><kbd>{t(k)}</kbd></dt>, <dd key={`v${k}`}>{t(v)}</dd>])}
    </dl>
  )
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet keys-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} />
        <h2><Icon name="keyboard" size={20} /> {t('Keyboard & mouse')}</h2>
        <h3>{t('Keyboard')}</h3>
        {list(KEYS)}
        <h3>{t('Mouse')}</h3>
        {list(MOUSE)}
        <p className="muted small">{t('On a phone: tap ⋯ on a track for copy / paste, or use Copy track in the toolbar. Paste track is in the toolbar and under + Add track.')}</p>
        <button className="btn wide" onClick={() => { onClose(); openHelp() }}><Icon name="book" size={18} /> {t('Full user guide (F1)')}</button>
        <button className="btn wide" onClick={onClose}>{t('Done')}</button>
      </div>
    </div>
  )
}
