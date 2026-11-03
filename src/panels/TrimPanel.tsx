import { useRef, useState } from 'react'
import type { Clip, Project } from '../types'
import type { Editor } from '../model/useEditor'
import { Chips, Panel, Slider } from '../ui/kit'
import { t } from '../lib/i18n'
import { rollRange, roll, slideRange, slide, slipRange, slip, type Range } from '../model/trim'
import { Icon } from '../components/Icon'

type Mode = 'roll' | 'slip' | 'slide'
const sec = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}s`

/**
 * Trim tools for a main-video clip: cut its start / end to the playhead (ripple), roll the cut with the next clip,
 * slip the part of the video it shows, slide it between its neighbours. Each slider moves from 0 and springs back
 * after a drag; Undo takes a change back.
 */
export function TrimPanel({ ed, clip, onTrim, onPreview, onClose }: {
  ed: Editor; clip: Clip; onTrim: (side: 'in' | 'out') => void
  /** Show a source frame of a clip while dragging (null = back to normal). */
  onPreview: (clipId: string | null, sourceTime: number) => void
  onClose: () => void
}) {
  const clips = ed.project.clips
  const i = clips.findIndex((c) => c.id === clip.id)
  const [mode, setMode] = useState<Mode>(i < clips.length - 1 ? 'roll' : 'slip')
  const [v, setV] = useState(0)
  // the clips as they were when the drag started: every move is measured from them
  const base = useRef<Project['clips'] | null>(null)
  const range: Range = mode === 'roll' ? rollRange(clips, i, ed.sources) : mode === 'slip' ? slipRange(clip, ed.sources) : slideRange(clips, i, ed.sources)
  const can = range.max - range.min > 0.01
  // while dragging the limits stay those of the clips as they were at the start
  const [held, setHeld] = useState<Range | null>(null)
  const raw = held ?? range
  // whole hundredths, so the slider's steps land on round numbers and 0
  const r = { min: Math.ceil(raw.min * 100 - 1e-6) / 100, max: Math.floor(raw.max * 100 + 1e-6) / 100 }

  const start = () => { base.current = clips.map((c) => ({ ...c })); setHeld(rangeOf(mode, base.current, i, ed)); ed.begin() }
  const change = (x: number) => {
    const b = base.current
    if (!b) return
    setV(x)
    const patches = mode === 'roll' ? roll(b, i, x) : mode === 'slip' ? slip(b[i], x) : slide(b, i, x)
    ed.patchItems(patches)
    // show the frame that changes: the new cut (roll, slide) or the clip's new first frame (slip)
    if (mode === 'slip') onPreview(clip.id, b[i].in + x)
    else if (mode === 'roll') onPreview(b[i].id, Math.max(b[i].in, b[i].out + x * b[i].speed - 0.04))
    else onPreview(b[i - 1].id, Math.max(b[i - 1].in, b[i - 1].out + x * b[i - 1].speed - 0.04))
  }
  const end = () => { ed.end(); base.current = null; setHeld(null); setV(0); onPreview(null, 0) }

  const hint: Record<Mode, string> = {
    roll: 'Moves the cut between this clip and the next one: one gets longer, the other shorter. The video length stays the same.',
    slip: 'Shows an earlier or later part of this clip\'s video. Its length and place stay the same.',
    slide: 'Moves this clip earlier or later: the clip before gets longer and the clip after shorter. The video length stays the same.',
  }
  const why: Record<Mode, string> = {
    roll: i >= clips.length - 1 ? 'This is the last clip: there is no cut after it.' : 'Not possible here (speed ramp, gap, or no more video to show).',
    slip: 'Photos and clips that already show their whole video cannot slip.',
    slide: 'Slide needs a clip before and after, without gaps or speed ramps.',
  }
  return (
    <Panel title="Trim" onClose={onClose}>
      <div className="row">
        <button className="btn" onClick={() => onTrim('in')} title="Q"><Icon name="toStart" size={18} /> {t('Cut start to playhead')} <kbd>Q</kbd></button>
        <button className="btn" onClick={() => onTrim('out')} title="W"><Icon name="toEnd" size={18} /> {t('Cut end to playhead')} <kbd>W</kbd></button>
      </div>
      <Chips options={[{ value: 'roll', label: 'Roll' }, { value: 'slip', label: 'Slip' }, { value: 'slide', label: 'Slide' }]} value={mode} onChange={(m) => { setMode(m); setV(0) }} />
      <p className="muted small">{t(hint[mode])}</p>
      {can || held ? (
        <Slider label={mode === 'roll' ? 'Move the cut' : mode === 'slip' ? 'Video part' : 'Move the clip'} min={r.min} max={r.max} step={0.01} value={v} center
          format={sec} onStart={start} onChange={change} onEnd={end} />
      ) : <p className="muted small">{t(why[mode])}</p>}
      <p className="muted small">{t('With a mouse: Alt+drag a clip to slip it, Alt+Shift+drag to slide it, Alt+drag its edge to roll the cut.')}</p>
    </Panel>
  )
}

function rangeOf(mode: Mode, clips: Clip[], i: number, ed: Editor): Range {
  return mode === 'roll' ? rollRange(clips, i, ed.sources) : mode === 'slip' ? slipRange(clips[i], ed.sources) : slideRange(clips, i, ed.sources)
}

/** Trim for a track item: cut its start / end to the playhead, or delete it and close the gap on its row. */
export function LayerTrimPanel({ onTrim, onRippleDelete, onClose }: { onTrim: (side: 'in' | 'out') => void; onRippleDelete: () => void; onClose: () => void }) {
  return (
    <Panel title="Trim" onClose={onClose}>
      <div className="row">
        <button className="btn" onClick={() => onTrim('in')} title="Q"><Icon name="toStart" size={18} /> {t('Cut start to playhead')} <kbd>Q</kbd></button>
        <button className="btn" onClick={() => onTrim('out')} title="W"><Icon name="toEnd" size={18} /> {t('Cut end to playhead')} <kbd>W</kbd></button>
      </div>
      <button className="btn" onClick={onRippleDelete}><Icon name="trash" size={18} /> {t('Delete and close the gap')} <kbd>Shift+Del</kbd></button>
      <p className="muted small">{t('Delete and close the gap: the later items on this track move back by its length.')}</p>
    </Panel>
  )
}
