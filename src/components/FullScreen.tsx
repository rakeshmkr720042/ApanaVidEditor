import type { Player } from '../engine/player'
import { t } from '../lib/i18n'
import { Icon } from './Icon'

interface Props {
  player: Player | null
  playing: boolean
  time: number
  total: number
  showTime: (t: number) => string
  rate: number
  onRate: () => void
  onTogglePlay: () => void
  onSkip: (d: number) => void
  /** The edit panel (timeline + tools) is slid in. */
  editing: boolean
  onEdit: () => void
  comparing: boolean
  onCompare: () => void
  onExit: () => void
  idle: boolean
}

/** Buttons over the video in full screen: play, seek bar, before / after, the edit panel and the way out. */
export function FullScreenBar(p: Props) {
  return (
    <div className={`fs-bar${p.idle && p.playing && !p.editing ? ' idle' : ''}`} onPointerDown={(e) => e.stopPropagation()} data-testid="fs-bar">
      <input
        className="fs-seek" type="range" min={0} max={Math.max(0.01, p.total)} step={0.01} value={Math.min(p.time, p.total)}
        onChange={(e) => p.player?.seek(Number(e.target.value))} onPointerUp={(e) => e.currentTarget.blur()} aria-label={t('Seek')}
        style={{ '--done': `${p.total ? (p.time / p.total) * 100 : 0}%` } as React.CSSProperties}
      />
      <div className="fs-row">
        <button className="icon-btn skip" onClick={() => p.onSkip(-5)} aria-label="Back 5 seconds" title={t('Back 5 s (← or J)')}><Icon name="rewind" /></button>
        <button className="icon-btn play" onClick={p.onTogglePlay} aria-label={p.playing ? 'Pause' : 'Play'}><Icon name={p.playing ? 'pause' : 'play'} /></button>
        <button className="icon-btn skip" onClick={() => p.onSkip(5)} aria-label="Forward 5 seconds" title={t('Forward 5 s (→ or L)')}><Icon name="forward" /></button>
        <span className="fs-time">{p.showTime(p.time)} <span className="muted">/ {p.showTime(p.total)}</span></span>
        <span className="fs-spacer" />
        <button className={`rate-btn${p.rate !== 1 ? ' on' : ''}`} onClick={p.onRate} title={t('Playback speed')}>{p.rate}x</button>
        <button className={`fs-btn${p.comparing ? ' on' : ''}`} onClick={p.onCompare} aria-pressed={p.comparing} title={t('Before / after (B)')} data-testid="fs-compare">
          <Icon name="compare" size={18} /><span>{t('Before / after')}</span>
        </button>
        <button className={`fs-btn${p.editing ? ' on' : ''}`} onClick={p.onEdit} aria-pressed={p.editing} title={t('Edit panel (E)')} data-testid="fs-edit">
          <Icon name="adjust" size={18} /><span>{t('Edit panel')}</span>
        </button>
        <button className="fs-btn" onClick={p.onExit} title={t('Exit full screen (F or Esc)')} data-testid="fs-exit">
          <Icon name="fsExit" size={18} /><span>{t('Exit')}</span>
        </button>
      </div>
    </div>
  )
}
