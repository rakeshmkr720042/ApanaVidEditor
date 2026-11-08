import { useRef, useState } from 'react'
import type { Clip, Layer, Photo3D, TextLayer } from '../types'
import type { Editor } from '../model/useEditor'
import { findShake } from '../engine/motion'
import { makeDepth } from '../engine/photo3d'
import { videoFps } from '../engine/frames'
import { isTracked, trackLayer } from '../engine/tracker'
import { hasBox } from '../model/keyframes'
import { rampPoints } from '../model/timeline'
import { canInterpolate } from '../engine/interp'
import { fmtTime } from '../lib/format'
import { Chips, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

const MOTIONS: { value: Photo3D['motion']; label: string }[] = [
  { value: 'in', label: 'Zoom in' }, { value: 'out', label: 'Zoom out' }, { value: 'left', label: 'Slide left' },
  { value: 'right', label: 'Slide right' }, { value: 'up', label: 'Rise' }, { value: 'orbit', label: 'Orbit' },
]

export const slowSomewhere = (c: Clip) => (rampPoints(c) ?? [c.speed]).some((s) => s < 1)

type SlowMode = 'off' | 'blend' | 'flow'
const slowModeOf = (c: Clip): SlowMode => (!c.smoothSlow ? 'off' : c.slowMode === 'flow' ? 'flow' : 'blend')

/** Turns smooth slow motion on (blend or ultra smooth) or off for a clip; finds the video's frame rate once. */
export async function setSlowMode(ed: Editor, clip: Clip, mode: SlowMode, extra: Partial<Clip> = {}) {
  if (mode === 'off') { ed.updateClip(clip.id, { smoothSlow: null, slowMode: undefined, ...extra }); return }
  const src = ed.sources[clip.sourceId]
  const fps = clip.smoothSlow ?? Math.max(10, Math.min(120, Math.round((src ? await videoFps(src.file).catch(() => null) : null) ?? 30)))
  ed.updateClip(clip.id, { smoothSlow: fps, slowMode: mode, ...extra })
}

/** Off / Blend / Ultra smooth chips for a slowed-down video clip (Speed and Motion tools). */
export function SlowSmooth({ ed, clip }: { ed: Editor; clip: Clip }) {
  const mode = slowModeOf(clip)
  const slow = slowSomewhere(clip)
  return (
    <>
      <span className="field-label">{t('Smooth slow motion')}</span>
      <Chips options={[{ value: 'off', label: 'Off' }, { value: 'blend', label: 'Blend frames' }, { value: 'flow', label: 'Ultra smooth' }]} value={mode}
        onChange={(m) => void setSlowMode(ed, clip, m as SlowMode)} />
      <p className="muted small">
        {!slow
          ? t('Set a speed below 1x (Speed tool) to use it.')
          : mode === 'flow'
            ? canInterpolate()
              ? t('New in-between frames are made from the movement, so moving things glide. Shows when paused and in the exported video.')
              : t('This device cannot make in-between frames, so frames are blended instead.')
            : mode === 'blend'
              ? t('Slowed-down parts glide between frames instead of stuttering, in the exported video.')
              : t('Without it, very slow parts show each frame several times (stutter).')}
      </p>
    </>
  )
}

/** Motion tools for a main-video clip: stabilize, motion blur, smooth slow motion; for photos the 3D zoom. */
export function MotionPanel({ ed, clip, onToast, onClose }: { ed: Editor; clip: Clip; onToast: (s: string) => void; onClose: () => void }) {
  const src = ed.sources[clip.sourceId]
  const photo = src?.kind === 'image'
  const [busy, setBusy] = useState<string | null>(null)
  const set = (patch: Partial<Clip>) => ed.updateClip(clip.id, patch)

  const stabilize = async () => {
    if (!src) return
    setBusy(t('Finding the shake…'))
    const path = await findShake(src, clip.in, clip.out, (p) => setBusy(`${t('Finding the shake…')} ${Math.round(p * 100)}%`))
    setBusy(null)
    if (!path) { onToast(t('Could not read this video')); return }
    set({ stabilize: { strength: clip.stabilize?.strength ?? 0.6, ...path } })
    onToast(t('Shake taken out. The picture is zoomed in a little to hide the edges.'))
  }

  const make3d = async (on: boolean) => {
    if (!on || !src) { set({ photo3d: null }); return }
    setBusy(t('Finding what is near and far…'))
    try {
      const d = await makeDepth(src)
      set({ photo3d: { motion: 'in', amount: 0.6, depth: d.depth } })
      if (!d.person) onToast(t('No person found: the bottom of the photo is taken as near. Works best with a person in front.'))
    } catch (e) { onToast((e as Error).message) } finally { setBusy(null) }
  }

  return (
    <Panel title="Motion" onClose={onClose} tall>
      {busy && <p className="muted small">{busy}</p>}
      {photo ? (
        <>
          <Toggle label="3D zoom" value={!!clip.photo3d} onChange={make3d} />
          <p className="muted small">{t('The photo gets depth: near things (people, the ground) move more than far ones as the camera moves.')}</p>
          {clip.photo3d && (
            <>
              <Chips options={MOTIONS} value={clip.photo3d.motion} onChange={(motion) => set({ photo3d: { ...clip.photo3d!, motion } })} wrap />
              <Slider label="Amount" min={0.2} max={1} value={clip.photo3d.amount} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end}
                onChange={(amount) => set({ photo3d: { ...clip.photo3d!, amount } })} />
            </>
          )}
        </>
      ) : (
        <>
          <span className="field-label">{t('Stabilize')}</span>
          {clip.stabilize ? (
            <>
              <Slider label="Smoothness" min={0} max={1} value={clip.stabilize.strength} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end}
                onChange={(strength) => set({ stabilize: { ...clip.stabilize!, strength } })} />
              <div className="row">
                <button className="btn small" disabled={!!busy} onClick={stabilize}>↻ {t('Look again')}</button>
                <button className="btn small" onClick={() => set({ stabilize: null })}>{t('Turn off')}</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small">{t('Takes the shake out of hand-held video (on this device). The picture zooms in a little to hide the edges.')}</p>
              <button className="btn" disabled={!!busy} onClick={stabilize}>🎥 {t('Stabilize')}</button>
            </>
          )}

          <span className="field-label">{t('Motion blur')}</span>
          <Slider label="Amount" min={0} max={1} value={clip.motionBlur ?? 0} format={(v) => (v ? `${Math.round(v * 100)}` : t('Off'))} onStart={ed.begin} onEnd={ed.end}
            onChange={(v) => set({ motionBlur: v > 0.02 ? v : null })} />
          <p className="muted small">{t('Moving things leave a soft trail, like a fast camera. Shows while playing and in the export.')}</p>

          <SlowSmooth ed={ed} clip={clip} />
        </>
      )}
    </Panel>
  )
}

/** Motion tracking: the selected text, sticker or overlay follows a moving thing in the main video. */
export function TrackPanel({ ed, layer, time, onSeek, onClose }: { ed: Editor; layer: Layer; time: number; onSeek: (t: number) => void; onClose: () => void }) {
  const [busy, setBusy] = useState<number | null>(null)
  const [size, setSize] = useState(0.4)
  const [result, setResult] = useState<string | null>(null)
  const stop = useRef(false)
  const tracked = isTracked(layer)
  const inside = time >= layer.start && time < layer.end

  const run = async () => {
    stop.current = false
    setBusy(0); setResult(null)
    const r = await trackLayer(ed.project, ed.sources, layer.id, time, size, (p) => setBusy(p), () => stop.current)
      .catch((e: Error) => { setResult(e.message); return null })
    setBusy(null)
    if (!r || stop.current) return
    if (r.keys.length < 2) { setResult(t('Could not follow it. Try a bigger area or a spot with more detail.')); return }
    ed.updateLayer(layer.id, { keys: r.keys } as Partial<TextLayer>)
    const from = layer.start + r.keys[0].t, to = layer.start + r.keys[r.keys.length - 1].t
    setResult(`${t('Following from')} ${fmtTime(from)} ${t('to')} ${fmtTime(to)}${r.lost !== null ? ` · ${t('lost it at')} ${fmtTime(r.lost)}` : ''}`)
    onSeek(from)
  }

  if (!hasBox(layer)) return null
  return (
    <Panel title="Track motion" onClose={onClose} tall>
      <p className="muted small">{t('1. Move the playhead to where the thing is clearly seen. 2. Drag this item onto it. 3. Tap Start: the item follows it.')}</p>
      <Slider label="Area to follow" min={0} max={1} value={size} format={(v) => (v < 0.34 ? t('Small') : v < 0.67 ? t('Medium') : t('Large'))} onChange={setSize} />
      {busy !== null
        ? (
          <div className="row">
            <span className="muted small">{t('Following…')} {Math.round(busy * 100)}%</span>
            <button className="btn small" onClick={() => { stop.current = true }}>{t('Stop')}</button>
          </div>
        )
        : <button className="btn primary" disabled={!inside || !ed.project.clips.length} onClick={run}>🎯 {t('Start tracking')}</button>}
      {!inside && <p className="muted small">{t('Move the playhead inside this item first.')}</p>}
      {result && <p className="small">{result}</p>}
      {tracked && busy === null && <button className="btn small" onClick={() => ed.updateLayer(layer.id, { keys: [] } as Partial<TextLayer>)}>{t('Remove tracking')}</button>}
    </Panel>
  )
}
