import { useEffect, useRef, useState } from 'react'
import type { Backdrop, Cutout, MediaLayer, MediaSource } from '../types'
import type { Editor } from '../model/useEditor'
import type { GreenTarget } from './GreenScreenPanel'
import { cutoutFailed, cutoutReady, loadCutout } from '../engine/cutout'
import { loadSource } from '../lib/media'
import { saveMedia } from '../lib/db'
import { Chips, ColorRow, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

const OUTLINES: { value: NonNullable<Cutout['outline']>; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'line', label: 'Line' }, { value: 'glow', label: 'Glow' }, { value: 'scribble', label: 'Scribble' },
]

const defaultCutout = (): Cutout => ({ enabled: true, soft: 0.25, outline: 'none', color: '#ffffff', width: 0.4 })

/**
 * Remove background with AI (no green screen needed): keeps the person, puts a colour, photo or video behind them,
 * draws an outline, and makes clones of them.
 */
export function CutoutPanel({ ed, target, onToast, onClose }: { ed: Editor; target: GreenTarget; onToast: (s: string) => void; onClose: () => void }) {
  const item = target.kind === 'clip' ? target.clip : target.layer
  const cut = item.cutout ?? null
  const on = !!cut?.enabled
  const backdrop = item.backdrop ?? null
  const id = item.id
  const [ready, setReady] = useState(cutoutReady())
  const [failed, setFailed] = useState(cutoutFailed())
  useEffect(() => { if (!ready) loadCutout().then((ok) => { setReady(ok); setFailed(!ok) }) }, [ready])

  const setCut = (patch: Partial<Cutout>) => {
    if (target.kind === 'clip') ed.updateClip(id, (c) => ({ cutout: { ...(c.cutout ?? defaultCutout()), ...patch } }))
    else ed.updateLayer<MediaLayer>(id, (l) => ({ cutout: { ...(l.cutout ?? defaultCutout()), ...patch } }))
  }
  const setBackdrop = (b: Backdrop | null) => {
    if (target.kind === 'clip') ed.updateClip(id, { backdrop: b })
    else ed.updateLayer<MediaLayer>(id, { backdrop: b })
  }
  const patchBackdrop = (patch: Partial<Backdrop>) => backdrop && setBackdrop({ ...backdrop, ...patch })

  const fileRef = useRef<HTMLInputElement>(null)
  const addBackground = async (file: File) => {
    try {
      const s = await loadSource(file, file.name)
      if (s.kind === 'audio') { onToast(t('Pick a photo or video')); return }
      ed.addSource(s)
      await saveMedia(s)
      setBackdrop({ kind: 'media', color: backdrop?.color ?? '#000000', sourceId: s.id, in: 0, fit: 'fill', blur: 0 })
      if (!on) setCut({ enabled: true })
      onToast(s.kind === 'image' ? t('Background photo added behind the person') : t('Background video added behind the person'))
    } catch (e) { onToast((e as Error).message) }
  }
  const bdSrc: MediaSource | undefined = backdrop?.kind === 'media' && backdrop.sourceId ? ed.sources[backdrop.sourceId] : undefined
  const isVideo = ed.sources[item.sourceId]?.kind === 'video'

  const clone = (style: 'side' | 'mirror' | 'echo') => {
    if (ed.addClone(id, style)) onToast(t('Clone added on a new row. Drag it to place it.'))
  }

  return (
    <Panel title="Remove background" onClose={onClose} tall>
      <Toggle label="Remove background (AI)" value={on} onChange={(enabled) => setCut({ enabled })} />
      {failed
        ? <p className="muted small">{t('This device cannot run the background remover.')}</p>
        : !ready && <p className="muted small">{t('Getting the AI ready…')}</p>}
      <p className="muted small">{t('Finds the person in every frame, on this device. No green screen needed. Works best with one person who stands out from the background.')}</p>
      {item.chroma?.enabled && <p className="muted small">{t('Green screen is on for this item, so it is used instead. Turn it off to use the AI.')}</p>}
      {on && (
        <>
          <Slider label="Edge softness" min={0} max={1} value={cut!.soft} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(soft) => setCut({ soft })} />
          <span className="field-label">{t('Outline')}</span>
          <Chips options={OUTLINES} value={cut!.outline ?? 'none'} onChange={(outline) => setCut({ outline })} />
          {(cut!.outline ?? 'none') !== 'none' && (
            <>
              <ColorRow value={cut!.color ?? '#ffffff'} onChange={(c) => setCut({ color: c ?? '#ffffff' })} />
              <Slider label="Thickness" min={0} max={1} value={cut!.width ?? 0.4} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(width) => setCut({ width })} />
            </>
          )}
        </>
      )}

      <span className="field-label">{t('Background')}</span>
      <Chips options={[{ value: 'none', label: target.kind === 'clip' ? 'Plain' : 'See-through' }, { value: 'media', label: 'Photo / video' }, { value: 'color', label: 'Colour' }]} value={backdrop ? backdrop.kind : 'none'}
        onChange={(v) => {
          if (v === 'none') setBackdrop(null)
          else if (v === 'media') fileRef.current?.click()
          else { setBackdrop({ kind: 'color', color: backdrop?.color && backdrop.color !== '#000000' ? backdrop.color : '#30b0ff' }); if (!on) setCut({ enabled: true }) }
        }} />
      <input ref={fileRef} type="file" accept="video/*,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) addBackground(f); e.target.value = '' }} />
      {backdrop?.kind === 'color' && <ColorRow value={backdrop.color} onChange={(c) => c && patchBackdrop({ color: c })} />}
      {backdrop?.kind === 'media' && (
        <>
          <div className="row">
            <span className="muted small gs-name">{bdSrc ? bdSrc.name : t('Missing file')}</span>
            <button className="btn small" onClick={() => fileRef.current?.click()}>{t('Change')}</button>
          </div>
          <Chips options={[{ value: 'fill', label: 'Fill screen' }, { value: 'fit', label: 'Fit whole picture' }]} value={backdrop.fit ?? 'fill'} onChange={(fit) => patchBackdrop({ fit })} />
          <Slider label="Background blur" min={0} max={1} value={backdrop.blur ?? 0} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => patchBackdrop({ blur: v })} />
        </>
      )}

      {isVideo && (
        <>
          <span className="field-label">{t('Clone yourself')}</span>
          <div className="row">
            <button className="btn small" onClick={() => clone('side')}>👯 {t('Beside me')}</button>
            <button className="btn small" onClick={() => clone('mirror')}>🪞 {t('Mirror')}</button>
            <button className="btn small" onClick={() => clone('echo')}>👻 {t('Echo')}</button>
          </div>
          <p className="muted small">{t('Adds a copy of the person (background removed) on its own row in front. Echo follows a moment later, half see-through.')}</p>
        </>
      )}
    </Panel>
  )
}
