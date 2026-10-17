import { useState } from 'react'
import type { Clip, KenBurns } from '../types'
import type { Editor } from '../model/useEditor'
import { KEN_BURNS, MIX_TRANSITIONS, slideshowFrom, type SlideshowOptions } from '../model/slideshow'
import { TRANSITIONS } from '../engine/transitions'
import { Chips, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

const TRANSITION_CHOICES = [
  { value: 'none', label: 'None' }, { value: 'mix', label: 'Mix' },
  ...MIX_TRANSITIONS.map((id) => ({ value: id, label: TRANSITIONS.find((x) => x.id === id)?.name ?? id })),
]

/** Photos → video: every photo on the timeline gets the same duration, transitions and Ken Burns motion. */
export function SlideshowPanel({ ed, onClose, onAddPhotos, onMusic }: { ed: Editor; onClose: () => void; onAddPhotos: (o: SlideshowOptions) => void; onMusic: () => void }) {
  const [o, setO] = useState(() => slideshowFrom(ed.project, ed.sources))
  const photos = ed.project.clips.filter((c) => ed.sources[c.sourceId]?.kind === 'image').length
  const hasMusic = ed.project.layers.some((l) => l.type === 'audio' && l.kind === 'music')
  const set = (patch: Partial<SlideshowOptions>) => {
    const next = { ...o, ...patch }
    setO(next)
    if (photos) ed.setSlideshow(next)
  }
  return (
    <Panel title="Slideshow" onClose={onClose} tall>
      <p className="muted small">
        {photos ? `${photos} ${t('photos on the timeline. Changes apply to all of them.')}` : t('Pick photos and they are laid out one after another as a video.')}
      </p>
      <div className="row">
        <button className="btn" onClick={() => onAddPhotos(o)}>{t('Add photos')}</button>
        <button className="btn" onClick={onMusic}>{t(hasMusic ? 'Change music' : 'Add music')}</button>
      </div>
      <Slider label="Each photo" min={1} max={10} step={0.5} value={o.duration} format={(v) => `${v.toFixed(1)}s`}
        onStart={ed.begin} onEnd={ed.end} onChange={(duration) => set({ duration })} />
      <span className="field-label">{t('Transition')}</span>
      <Chips options={TRANSITION_CHOICES} value={o.transition ?? 'none'} onChange={(v) => set({ transition: v === 'none' ? null : v })} wrap />
      {o.transition && (
        <Slider label="Transition length" min={0.2} max={2} step={0.1} value={o.transitionDuration} format={(v) => `${v.toFixed(1)}s`}
          onStart={ed.begin} onEnd={ed.end} onChange={(transitionDuration) => set({ transitionDuration })} />
      )}
      <Toggle label="Ken Burns (slow pan & zoom)" value={o.kenBurns} onChange={(kenBurns) => set({ kenBurns })} />
      <Toggle label="Fill frame (crop photos)" value={o.fill} onChange={(fill) => set({ fill })} />
    </Panel>
  )
}

/** A single photo: how long it shows and how it moves. */
export function PhotoPanel({ ed, clip, onClose }: { ed: Editor; clip: Clip; onClose: () => void }) {
  const dur = (clip.out - clip.in) / clip.speed
  return (
    <Panel title="Photo" onClose={onClose}>
      <Slider label="Duration" min={0.5} max={20} step={0.1} value={dur} format={(v) => `${v.toFixed(1)}s`}
        onStart={ed.begin} onEnd={ed.end} onChange={(v) => ed.updateClip(clip.id, { in: 0, out: v, speed: 1, ramp: null })} />
      <span className="field-label">{t('Ken Burns')}</span>
      <Chips options={[{ value: 'none', label: 'None' }, ...KEN_BURNS]} value={clip.kenBurns ?? 'none'}
        onChange={(v) => ed.updateClip(clip.id, { kenBurns: v === 'none' ? null : (v as KenBurns) })} wrap />
    </Panel>
  )
}
