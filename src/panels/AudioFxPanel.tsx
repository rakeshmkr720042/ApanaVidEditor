import { useEffect, useState } from 'react'
import type { AudioFx, AudioLayer, Clip, MediaLayer } from '../types'
import type { Editor } from '../model/useEditor'
import { cleanState, hasSound, hearingOriginal, onCleanChange, setHearOriginal } from '../engine/denoise'
import { EQ_PRESETS, fullFx, isNeutralFx, LOUDNESS, VOICES } from '../engine/soundfx'
import { Chips, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

type Target = { kind: 'clip'; clip: Clip } | { kind: 'layer'; layer: MediaLayer | AudioLayer }
type Tab = 'eq' | 'voice' | 'space' | 'loud' | 'stereo' | 'duck'

let lastTab: Tab = 'eq'

const db = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)} dB`

/**
 * Sound effects for a clip's or layer's sound: equalizer, voice changer and pitch, echo and reverb,
 * loudness (compressor, target loudness, limiter), stereo, reverse, and auto-lowering music under voices.
 */
export function AudioFxPanel({ ed, target, onClose }: { ed: Editor; target: Target; onClose: () => void }) {
  const item = target.kind === 'clip' ? target.clip : target.layer
  const fx = fullFx(item.fx)
  const audio = target.kind === 'layer' && target.layer.type === 'audio' ? target.layer : null
  const [tab, setTabState] = useState<Tab>(lastTab === 'duck' && !audio ? 'eq' : lastTab)
  const setTab = (v: Tab) => { lastTab = v; setTabState(v) }
  const [, redraw] = useState(0)
  useEffect(() => onCleanChange(() => redraw((n) => n + 1)), [])
  useEffect(() => () => setHearOriginal(false), [])

  const set = (next: AudioFx | null) => {
    const v = next && isNeutralFx(next) ? null : next
    if (target.kind === 'clip') ed.updateClip(target.clip.id, { fx: v })
    else ed.updateLayer<MediaLayer | AudioLayer>(target.layer.id, { fx: v })
  }
  const patch = (p: Partial<AudioFx>) => set({ ...fx, ...p })
  const slide = { onStart: ed.begin, onEnd: ed.end }
  const st = !isNeutralFx(fx) ? cleanState(item.sourceId, item.denoise, fx) : undefined
  const withSound = target.kind === 'clip' ? ed.project.clips.filter((c) => hasSound(ed.sources[c.sourceId])) : []
  const eqPreset = EQ_PRESETS.find((p) => p.bass === fx.bass && p.mid === fx.mid && p.treble === fx.treble)?.id ?? null

  const tabs: { value: Tab; label: string }[] = [
    { value: 'eq', label: 'Equalizer' }, { value: 'voice', label: 'Voice changer' }, { value: 'space', label: 'Echo & reverb' },
    { value: 'loud', label: 'Loudness' }, { value: 'stereo', label: 'Stereo' },
    ...(audio ? [{ value: 'duck' as Tab, label: 'Auto-lower' }] : []),
  ]

  return (
    <Panel
      title="Audio effects" onClose={onClose} tall
      actions={!isNeutralFx(fx) ? <button className="btn small" onClick={() => set(null)}>{t('Reset')}</button> : undefined}
    >
      <Chips options={tabs} value={tab} onChange={setTab} />

      {tab === 'eq' && (
        <>
          <Chips options={EQ_PRESETS.map((p) => ({ value: p.id, label: p.name }))} value={eqPreset} wrap
            onChange={(id) => { const p = EQ_PRESETS.find((x) => x.id === id)!; patch({ bass: p.bass, mid: p.mid, treble: p.treble }) }} />
          <Slider label="Bass" min={-12} max={12} step={1} center value={fx.bass} format={db} {...slide} onChange={(bass) => patch({ bass })} />
          <Slider label="Mid" min={-12} max={12} step={1} center value={fx.mid} format={db} {...slide} onChange={(mid) => patch({ mid })} />
          <Slider label="Treble" min={-12} max={12} step={1} center value={fx.treble} format={db} {...slide} onChange={(treble) => patch({ treble })} />
        </>
      )}

      {tab === 'voice' && (
        <>
          <div className="trans-grid voice-grid">
            {VOICES.map((v) => (
              <button key={v.id} className={fx.voice === v.id ? 'on' : ''} onClick={() => patch({ voice: v.id })}>
                <span className="voice-emoji">{v.emoji}</span>{t(v.name)}
              </button>
            ))}
          </div>
          <Slider label="Pitch" min={-12} max={12} step={1} center value={fx.pitch} {...slide}
            format={(v) => `${v > 0 ? '+' : ''}${v}`} onChange={(pitch) => patch({ pitch })} />
          <p className="muted small">{t('Pitch makes the voice higher or lower (in semitones); the speed stays the same.')}</p>
        </>
      )}

      {tab === 'space' && (
        <>
          <Slider label="Echo" min={0} max={1} step={0.05} value={fx.echo} format={(v) => `${Math.round(v * 100)}%`} {...slide} onChange={(echo) => patch({ echo })} />
          <Slider label="Reverb" min={0} max={1} step={0.05} value={fx.reverb} format={(v) => `${Math.round(v * 100)}%`} {...slide} onChange={(reverb) => patch({ reverb })} />
          <Chips options={[{ value: 'room', label: 'Room' }, { value: 'hall', label: 'Hall' }, { value: 'cave', label: 'Cave' }]} value={fx.room} onChange={(room) => patch({ room, reverb: fx.reverb || 0.4 })} />
        </>
      )}

      {tab === 'loud' && (
        <>
          <span className="field-label">{t('Even out loud and quiet parts')}</span>
          <Chips options={[{ value: 0, label: 'Off' }, { value: 1, label: 'Light' }, { value: 2, label: 'Medium' }, { value: 3, label: 'Strong' }]} value={fx.compress}
            onChange={(v) => patch({ compress: v as AudioFx['compress'] })} />
          <span className="field-label">{t('Loudness (normalize)')}</span>
          <Chips options={[{ value: 0, label: 'As it is' }, ...LOUDNESS]} value={fx.loudness ?? 0} wrap onChange={(v) => patch({ loudness: v === 0 ? null : v })} />
          <Toggle label="Limiter (no clipping or distortion)" value={fx.limiter || fx.loudness != null} onChange={(limiter) => patch({ limiter })} />
          <p className="muted small">{t('Loudness makes every clip equally loud. -14 suits YouTube, Instagram and WhatsApp.')}</p>
        </>
      )}

      {tab === 'stereo' && (
        <>
          <Chips options={[{ value: 'stereo', label: 'Stereo' }, { value: 'mono', label: 'Mono' }, { value: 'left', label: 'Left only' }, { value: 'right', label: 'Right only' }, { value: 'swap', label: 'Swap sides' }]}
            value={fx.channels} wrap onChange={(channels) => patch({ channels })} />
          <Slider label="Balance" min={-1} max={1} step={0.05} center value={fx.pan} {...slide}
            format={(v) => (Math.abs(v) < 0.01 ? t('Centre') : `${Math.round(Math.abs(v) * 100)}% ${t(v < 0 ? 'left' : 'right')}`)} onChange={(pan) => patch({ pan })} />
          {audio && <Toggle label="Play backwards (reverse)" value={!!fx.reverse} onChange={(reverse) => patch({ reverse })} />}
          {fx.channels === 'stereo' && <p className="muted small">{t('Mic only on one side? Pick Left only or Right only, or Mono.')}</p>}
        </>
      )}

      {tab === 'duck' && audio && (
        <>
          <Toggle label="Lower this sound when someone speaks" value={audio.duck != null}
            onChange={(v) => ed.updateLayer<AudioLayer>(audio.id, { duck: v ? 0.25 : null })} />
          {audio.duck != null && (
            <Slider label="Volume while speaking" min={0} max={0.8} step={0.05} value={audio.duck} format={(v) => `${Math.round(v * 100)}%`} {...slide}
              onChange={(duck) => ed.updateLayer<AudioLayer>(audio.id, { duck })} />
          )}
          <p className="muted small">{t('Music goes down by itself under the voice in your video, overlays and voice recordings, and comes back up in the pauses.')}</p>
        </>
      )}

      {st?.status === 'working' && (
        <>
          <p className="muted small">{t('Applying effects…')} {Math.round(st.progress * 100)}%</p>
          <div className="progress"><div style={{ width: `${Math.round(st.progress * 100)}%` }} /></div>
        </>
      )}
      {st?.status === 'error' && <p className="error-text small">{t('Could not apply the effects. The original sound is used.')}</p>}
      {st?.status === 'ready' && (
        <div className="row noise-row">
          <span className="muted small">{t('Listen')}</span>
          <Chips options={[{ value: 'fx', label: 'With effects' }, { value: 'original', label: 'Original' }]} value={hearingOriginal() ? 'original' : 'fx'} onChange={(v) => setHearOriginal(v === 'original')} />
        </div>
      )}
      {withSound.length > 1 && !isNeutralFx(fx) && (
        <button className="btn small" onClick={() => ed.updateAllClips((c) => (hasSound(ed.sources[c.sourceId]) ? { fx: { ...fx } } : {}))}>{t('Apply to all clips')}</button>
      )}
    </Panel>
  )
}
