import { useEffect, useState } from 'react'
import type { AudioLayer, BeatFx } from '../types'
import type { Editor } from '../model/useEditor'
import { findBeats, layerBeats } from '../engine/beats'
import { beatSync } from '../model/beatsync'
import { SPEED_RAMPS } from '../model/timeline'
import { Chips, Panel, Slider } from '../ui/kit'
import { t } from '../lib/i18n'

const EVERY = [{ value: 1, label: 'Every beat' }, { value: 2, label: 'Every 2' }, { value: 4, label: 'Every 4 (bar)' }] as const
const KINDS: { value: BeatFx['kind'] | ''; label: string }[] = [
  { value: '', label: 'None' }, { value: 'zoom', label: 'Zoom punch' }, { value: 'shake', label: 'Shake' }, { value: 'flash', label: 'Flash' }, { value: 'blur', label: 'Blur hit' },
]
const VELOCITY = [{ value: '', label: 'No' }, ...['montage', 'hero', 'bullet', 'jump', 'flash-in'].map((id) => ({ value: id, label: SPEED_RAMPS.find((r) => r.id === id)!.name }))]

/**
 * Beat tools: finds the beats of the music, cuts the main clips on them (optionally with a velocity speed ramp),
 * and hits the video on every beat (zoom, shake, flash, blur).
 */
export function BeatPanel({ ed, onToast, onMusic, onClose }: { ed: Editor; onToast: (s: string) => void; onMusic: () => void; onClose: () => void }) {
  const music = ed.project.layers.filter((l): l is AudioLayer => l.type === 'audio' && l.kind !== 'voice')
  const fx = ed.project.beatFx ?? null
  const sel = ed.sel?.type === 'layer' ? music.find((l) => l.id === ed.sel!.id) : undefined
  const [id, setId] = useState(() => sel?.id ?? fx?.layer ?? music.find((l) => l.beats?.length)?.id ?? music[0]?.id ?? '')
  const layer = music.find((l) => l.id === id) ?? music[0]
  const [busy, setBusy] = useState(false)
  const [every, setEvery] = useState<1 | 2 | 4>(2)
  const [ramp, setRamp] = useState('')

  // find the beats as soon as a music track without them is picked
  useEffect(() => {
    if (!layer || layer.beats || busy) return
    const src = ed.sources[layer.sourceId]
    if (!src) return
    setBusy(true)
    findBeats(src).then((r) => {
      setBusy(false)
      if (!r || !r.beats.length) { onToast(t('No clear beat found in this sound')); return }
      ed.updateLayer<AudioLayer>(layer.id, { beats: r.beats, bpm: r.bpm })
    })
  }, [layer?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!layer) {
    return (
      <Panel title="Beat sync" onClose={onClose}>
        <p className="muted small">{t('Add music first: the beats come from it.')}</p>
        <button className="btn" onClick={onMusic}>♪ {t('Add music')}</button>
      </Panel>
    )
  }

  const beats = layer.beats ? layerBeats(layer) : []
  const sync = () => {
    const cuts = layerBeats(layer, every)
    if (!cuts.length || !ed.project.clips.length) return
    const clips = beatSync(ed.project.clips, cuts, ed.sources, ramp || null)
    ed.replaceProject({ ...ed.project, clips })
    onToast(t('Clips now change on the beat. Undo takes it back.'))
  }
  const setFx = (patch: Partial<BeatFx>) => ed.setBeatFx({ kind: 'zoom', strength: 0.6, every: 1, ...fx, layer: layer.id, ...patch })

  return (
    <Panel title="Beat sync" onClose={onClose} tall>
      {music.length > 1 && (
        <>
          <span className="field-label">{t('Music')}</span>
          <Chips options={music.map((m) => ({ value: m.id, label: m.label || t('Music') }))} value={layer.id} onChange={setId} wrap />
        </>
      )}
      <p className="muted small">
        {busy ? t('Listening for the beat…') : layer.beats ? `${layer.bpm ?? '?'} BPM · ${beats.length} ${t('beats (yellow marks = every 4th)')}` : ''}
      </p>
      {layer.beats && (
        <>
          <span className="field-label">{t('Cut clips on the beat')}</span>
          <Chips options={EVERY.map((e) => ({ value: e.value, label: e.label }))} value={every} onChange={(v) => setEvery(v as 1 | 2 | 4)} />
          <span className="field-label">{t('Velocity (speed ramp on each clip)')}</span>
          <Chips options={VELOCITY} value={ramp} onChange={setRamp} wrap />
          <button className="btn" disabled={!ed.project.clips.length} onClick={sync}>🥁 {t('Cut clips to the beat')}</button>

          <span className="field-label">{t('Beat effect on the video')}</span>
          <Chips options={KINDS} value={fx?.kind ?? ''} onChange={(v) => (v ? setFx({ kind: v as BeatFx['kind'] }) : ed.setBeatFx(null))} wrap />
          {fx && (
            <>
              <Chips options={EVERY.map((e) => ({ value: e.value, label: e.label }))} value={fx.every} onChange={(v) => setFx({ every: v as 1 | 2 | 4 })} />
              <Slider label="Strength" min={0.1} max={1} value={fx.strength} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(strength) => setFx({ strength })} />
            </>
          )}
        </>
      )}
    </Panel>
  )
}
