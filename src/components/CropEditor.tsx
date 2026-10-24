import { useEffect, useRef, useState } from 'react'
import type { Clip, Crop, MediaLayer, MediaSource } from '../types'
import type { Editor } from '../model/useEditor'
import { Chips } from '../ui/kit'
import { Icon } from './Icon'
import { t } from '../lib/i18n'
import { useBack } from '../lib/back'

/** Crops a main-video clip, or an overlay video/photo (`layer`; it turns with its box, so no Rotate here). */
interface Props { ed: Editor; clip?: Clip; layer?: MediaLayer; source: MediaSource; time: number; onClose: () => void }

const RATIOS: { value: string; label: string; r: number | null }[] = [
  { value: 'free', label: 'Free', r: null }, { value: '1:1', label: '1:1', r: 1 }, { value: '9:16', label: '9:16', r: 9 / 16 },
  { value: '16:9', label: '16:9', r: 16 / 9 }, { value: '4:5', label: '4:5', r: 4 / 5 }, { value: '4:3', label: '4:3', r: 4 / 3 },
]

/** Crop, rotate and flip a clip. The crop is stored relative to the source frame. */
export function CropEditor({ ed, clip, layer, source, time, onClose }: Props) {
  const [img, setImg] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>((clip ?? layer)?.crop ?? { x: 0, y: 0, w: 1, h: 1 })
  const [ratio, setRatio] = useState('free')
  const [rotate, setRotate] = useState<Clip['rotate']>(clip?.rotate ?? 0)
  const [flipH, setFlipH] = useState(!!(clip ?? layer)?.flipH)
  const [flipV, setFlipV] = useState(!!(clip ?? layer)?.flipV)
  const area = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: string; x0: number; y0: number; c0: Crop } | null>(null)

  useEffect(() => {
    if (source.kind === 'image') { setImg(source.url); return }
    const v = document.createElement('video')
    v.muted = true; v.preload = 'auto'; v.src = source.url
    v.addEventListener('loadeddata', () => { v.currentTime = Math.max(0, Math.min(source.duration - 0.05, time)) }, { once: true })
    v.addEventListener('seeked', () => {
      const c = document.createElement('canvas')
      const s = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight))
      c.width = v.videoWidth * s; c.height = v.videoHeight * s
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
      setImg(c.toDataURL('image/jpeg', 0.85))
      v.removeAttribute('src'); v.load()
    }, { once: true })
  }, [source, time])

  const srcAR = source.width / source.height
  // "Frame" crops to the project's frame shape, so the clip is reframed for 9:16, 1:1, 4:5… without bars
  const aspect = ed.project.settings.aspect
  const frameR = aspect === 'original' ? null : (([a, b]) => a / b)(aspect.split(':').map(Number))
  const ratios = frameR ? [{ value: 'frame', label: `${t('Frame')} ${aspect}`, r: frameR }, ...RATIOS] : RATIOS

  const applyRatio = (val: string, rot = rotate) => {
    setRatio(val)
    const r = ratios.find((x) => x.value === val)?.r
    if (!r) return
    // r is the visible ratio; convert to normalised source units
    const want = (rot % 180 ? 1 / r : r) / srcAR
    let w = 1, h = w / want
    if (h > 1) { h = 1; w = want }
    setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w, h })
  }

  const onDown = (e: React.PointerEvent, mode: string) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, x0: e.clientX, y0: e.clientY, c0: crop }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const r = area.current!.getBoundingClientRect()
    const dx = (e.clientX - d.x0) / r.width, dy = (e.clientY - d.y0) / r.height
    const c = { ...d.c0 }
    const fixed = ratios.find((x) => x.value === ratio)?.r
    if (d.mode === 'move') {
      c.x = Math.max(0, Math.min(1 - c.w, c.x + dx)); c.y = Math.max(0, Math.min(1 - c.h, c.y + dy))
    } else {
      let x1 = c.x, y1 = c.y, x2 = c.x + c.w, y2 = c.y + c.h
      if (d.mode.includes('l')) x1 = Math.min(x2 - 0.05, Math.max(0, x1 + dx))
      if (d.mode.includes('r')) x2 = Math.max(x1 + 0.05, Math.min(1, x2 + dx))
      if (d.mode.includes('t')) y1 = Math.min(y2 - 0.05, Math.max(0, y1 + dy))
      if (d.mode.includes('b')) y2 = Math.max(y1 + 0.05, Math.min(1, y2 + dy))
      c.x = x1; c.y = y1; c.w = x2 - x1; c.h = y2 - y1
      if (fixed) {
        const want = (rotate % 180 ? 1 / fixed : fixed) / srcAR
        c.h = Math.min(1 - c.y, c.w / want)
        c.w = c.h * want
      }
    }
    setCrop(c)
  }

  const done = () => {
    const full = crop.x < 0.001 && crop.y < 0.001 && crop.w > 0.999 && crop.h > 0.999
    if (clip) ed.updateClip(clip.id, { crop: full ? null : crop, rotate, flipH, flipV })
    else if (layer) ed.updateLayer<MediaLayer>(layer.id, { crop: full ? null : crop, flipH, flipV })
    onClose()
  }

  useBack(true, onClose)
  return (
    <div className="modal">
      <div className="modal-head">
        <button className="icon-btn" onClick={onClose} aria-label="Cancel"><Icon name="close" /></button>
        <b>{t('Crop')}</b>
        <button className="btn small primary" onClick={done}>{t('Done')}</button>
      </div>
      <div className="crop-stage" onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <div className="crop-area" ref={area} style={{ aspectRatio: `${source.width} / ${source.height}`, '--ar': source.width / source.height } as React.CSSProperties}>
          {img && <img src={img} alt="" draggable={false} />}
          <div className="crop-shade" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${crop.x * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${(crop.y + crop.h) * 100}%, ${(crop.x + crop.w) * 100}% ${(crop.y + crop.h) * 100}%, ${(crop.x + crop.w) * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${crop.y * 100}%)` }} />
          <div className="crop-box" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }} onPointerDown={(e) => onDown(e, 'move')}>
            {['tl', 'tr', 'bl', 'br'].map((m) => <div key={m} className={`crop-h ${m}`} onPointerDown={(e) => onDown(e, m)} />)}
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <Chips options={ratios} value={ratio} onChange={applyRatio} />
        <div className="row">
          {clip && <button className="btn" onClick={() => { const r = ((rotate + 90) % 360) as Clip['rotate']; setRotate(r); applyRatio(ratio, r) }}>⟳ {t('Rotate')} {rotate ? `${rotate}°` : ''}</button>}
          <button className={`btn${flipH ? ' primary' : ''}`} onClick={() => setFlipH(!flipH)}>⇋ {t('Flip')}</button>
          <button className={`btn${flipV ? ' primary' : ''}`} onClick={() => setFlipV(!flipV)}>⇵</button>
          <button className="btn" onClick={() => { setCrop({ x: 0, y: 0, w: 1, h: 1 }); setRotate(0); setFlipH(false); setFlipV(false); setRatio('free') }}>{t('Reset')}</button>
        </div>
      </div>
    </div>
  )
}
