import type { Placement } from '../model/useEditor'
import { fmtTime } from '../lib/format'
import { t } from '../lib/i18n'
import { Icon, type IconName } from './Icon'

const LAST = 'placement'

/** The place picked last time, offered first next time. */
export function lastPlacement(): Placement {
  try {
    const v = localStorage.getItem(LAST)
    return v === 'playhead' || v === 'start' || v === 'end' ? v : 'track'
  } catch { return 'track' }
}

const OPTIONS: { value: Placement; icon: IconName; label: string; hint: string }[] = [
  { value: 'track', icon: 'overlay', label: 'Track at the playhead', hint: 'Shows over the main video, full frame, on the track you picked (or a new one). Drag, trim or Replace it any time.' },
  { value: 'playhead', icon: 'split', label: 'Main video at the playhead', hint: 'The clip under the playhead is split and this goes in between. On the line between two clips, it goes between them (no split).' },
  { value: 'start', icon: 'toStart', label: 'Main video at the start', hint: 'Plays before everything else.' },
  { value: 'end', icon: 'toEnd', label: 'Main video at the end', hint: 'Plays after everything else.' },
]

/** Asks where new photos, videos or a screen recording go on the timeline. */
export function PlaceSheet({ what, time, onPick, onClose }: { what: string; time: number; onPick: (p: Placement) => void; onClose: () => void }) {
  const last = lastPlacement()
  const pick = (p: Placement) => {
    try { localStorage.setItem(LAST, p) } catch { /* private mode */ }
    onPick(p)
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet place-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h2>{t('Where should it go?')}</h2>
        <p className="muted small">{what} · {t('Playhead')} {fmtTime(time)}</p>
        {OPTIONS.map((o) => (
          <button key={o.value} className={`place-option${o.value === last ? ' on' : ''}`} onClick={() => pick(o.value)}>
            <Icon name={o.icon} />
            <span><b>{t(o.label)}</b><small>{t(o.hint)}</small></span>
          </button>
        ))}
        <button className="btn wide" onClick={onClose}>{t('Cancel')}</button>
      </div>
    </div>
  )
}
