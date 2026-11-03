import { useState } from 'react'
import { PART_LABELS, type CopiedStyle, type StylePart } from '../model/styleCopy'
import { SheetClose, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'
import { Icon } from './Icon'

/** Paste style: pick which parts of the copied style go on the selected item(s). */
export function PasteStyleSheet({ style, parts, count, onPaste, onClose }: {
  style: CopiedStyle; parts: StylePart[]; count: number; onPaste: (parts: StylePart[]) => void; onClose: () => void
}) {
  const [on, setOn] = useState<StylePart[]>(parts)
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} data-testid="paste-style-sheet">
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} />
        <h2><Icon name="paste" size={20} /> {t('Paste style')}</h2>
        <p className="muted small">{t('Copied from')}: <b>{style.name}</b>{count > 1 ? ` · ${t('goes on')} ${count} ${t('items')}` : ''}</p>
        {parts.length ? (
          <div className="style-parts">
            {parts.map((p) => <Toggle key={p} label={PART_LABELS[p]} value={on.includes(p)} onChange={(v) => setOn(v ? [...on, p] : on.filter((x) => x !== p))} />)}
          </div>
        ) : <p className="muted">{t('Nothing of the copied style fits this item.')}</p>}
        <button className="btn primary wide" disabled={!on.length} onClick={() => onPaste(on)}>{t('Paste')}</button>
        <p className="muted small">{t('Only the style changes: what the item shows and where it sits stay the same. Undo takes it back.')}</p>
      </div>
    </div>
  )
}
