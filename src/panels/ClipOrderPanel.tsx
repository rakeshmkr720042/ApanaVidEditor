import { Fragment, useState } from 'react'
import type { Clip, MediaSource } from '../types'
import type { Editor } from '../model/useEditor'
import { fmtTime } from '../lib/format'
import { Chips, Panel } from '../ui/kit'
import { Icon } from '../components/Icon'
import { t } from '../lib/i18n'

export type OrderMode = 'move' | 'swap' | 'insert'

interface Props {
  ed: Editor
  clip: Clip
  start?: OrderMode
  /** Picks another clip as the one to move or swap. */
  onPick: (id: string) => void
  onSeek: (t: number) => void
  /** Asks for photos or videos to put into the main video at position `at` (0 = before the first clip). */
  onInsert: (at: number) => void
  onClose: () => void
}

const MODES: { value: OrderMode; label: string }[] = [{ value: 'move', label: 'Move' }, { value: 'swap', label: 'Swap' }, { value: 'insert', label: 'Insert' }]

const HINTS: Record<OrderMode, string> = {
  move: 'Tap a ↓ mark to move the picked clip there, or use the arrows. Tap another clip to pick it instead.',
  swap: 'Tap the clip to swap the picked clip with. They trade places.',
  insert: 'Tap a + to put a new photo or video between those two clips.',
}

/** The picture a clip starts with: the thumbnail nearest its trimmed start. */
function thumbOf(c: Clip, src: MediaSource | undefined) {
  if (!src?.thumbs.length) return ''
  if (src.kind === 'image' || !src.duration) return src.thumbs[0]
  return src.thumbs[Math.min(src.thumbs.length - 1, Math.floor((c.in / src.duration) * src.thumbs.length))]
}

/** Every main-video clip in order, to move one to any place, swap two, or insert new media between two. */
export function ClipOrderPanel({ ed, clip, start = 'move', onPick, onSeek, onInsert, onClose }: Props) {
  const [mode, setMode] = useState<OrderMode>(start)
  const { items } = ed.layout
  const from = items.findIndex((it) => it.clip.id === clip.id)
  const n = items.length
  const go = (s: number | null) => { if (s !== null) onSeek(s) }
  // slot k is the place before clip k (k = n: after the last one)
  const moveTo = (k: number) => go(ed.moveClip(clip.id, k > from ? k - 1 : k))
  const slot = (k: number) => {
    if (mode === 'insert') return <button className="co-slot add" onClick={() => onInsert(k)} aria-label={`${t('Insert here')} ${k + 1}`} title={t('Insert here')}>+</button>
    if (mode === 'move' && k !== from && k !== from + 1) return <button className="co-slot" onClick={() => moveTo(k)} aria-label={`${t('Move here')} ${k + 1}`} title={t('Move here')}>↓</button>
    return <span className="co-slot none" />
  }
  return (
    <Panel title="Move / swap clips" onClose={onClose}>
      <Chips options={MODES} value={mode} onChange={setMode} />
      <p className="muted small">{t(HINTS[mode])}</p>
      {mode === 'move' && (
        <div className="row co-arrows">
          <button className="btn small" disabled={from <= 0} onClick={() => go(ed.moveClip(clip.id, 0))}><Icon name="toStart" size={18} /> {t('First')}</button>
          <button className="btn small" disabled={from <= 0} onClick={() => go(ed.moveClip(clip.id, from - 1))}>◀ {t('Earlier')}</button>
          <button className="btn small" disabled={from >= n - 1} onClick={() => go(ed.moveClip(clip.id, from + 1))}>{t('Later')} ▶</button>
          <button className="btn small" disabled={from >= n - 1} onClick={() => go(ed.moveClip(clip.id, n - 1))}>{t('Last')} <Icon name="toEnd" size={18} /></button>
        </div>
      )}
      <div className="co-grid">
        {items.map((it, k) => {
          const c = it.clip
          const picked = c.id === clip.id
          const tap = () => {
            if (mode === 'swap' && !picked) go(ed.swapClips(clip.id, c.id))
            else { onPick(c.id); onSeek(it.start) }
          }
          return (
            <Fragment key={c.id}>
              {slot(k)}
              <button className={`co-card${picked ? ' on' : ''}${mode === 'swap' && !picked ? ' target' : ''}`} onClick={tap}
                aria-label={`${t('Clip')} ${k + 1}${picked ? ` (${t('picked')})` : ''}`}>
                {thumbOf(c, ed.sources[c.sourceId]) ? <img src={thumbOf(c, ed.sources[c.sourceId])} alt="" draggable={false} /> : <span className="co-blank" />}
                <b>{k + 1}</b>
                <small>{fmtTime(it.dur)}</small>
              </button>
            </Fragment>
          )
        })}
        {slot(n)}
      </div>
    </Panel>
  )
}
