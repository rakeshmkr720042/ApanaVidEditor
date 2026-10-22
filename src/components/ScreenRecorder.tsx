import { useEffect, useRef, useState } from 'react'
import type { Box, Crop, MediaLayer } from '../types'
import { Chips, Slider, Toggle } from '../ui/kit'
import { Icon } from './Icon'
import { t } from '../lib/i18n'
import { fmtTime } from '../lib/format'
import { desktop, type ScreenSource } from '../lib/desktop'
import {
  canRecordCamera, canRecordScreen, captureScreen, finishRecording, listCameras, micStream, mixStreams, openCamera, recorderMime, type Surface,
} from '../lib/screenrec'

/** A camera recording made next to a screen recording, and where its bubble sits on the screen video. */
export interface CamTake { file: File; box: Box; mask: MediaLayer['mask'] }

interface Props {
  /** 'screen' records the screen (optionally with a camera bubble), 'camera' records only the camera. */
  mode: 'screen' | 'camera'
  onClose: () => void
  /** The finished recording, the area to keep when "Custom area" was chosen, and the camera bubble if one was on. */
  onDone: (file: File, crop: Crop | null, cam: CamTake | null) => Promise<void>
}

type Phase = 'setup' | 'pick' | 'ready' | 'countdown' | 'recording' | 'saving'

/** Bubble centre (0..1 of the preview) and diameter (share of the preview's short side). */
interface Bubble { x: number; y: number; d: number }

const stampName = (what: string, type: string) => {
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.')
  return `${what} ${stamp}.${type.includes('mp4') ? 'mp4' : 'webm'}`
}

/** One MediaRecorder with its chunks; stop() resolves with the recorded file. */
function startRecorder(stream: MediaStream, bits: number) {
  const mime = recorderMime()
  const mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: bits })
  const chunks: Blob[] = []
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  mr.start(1000)
  const stop = async () => {
    if (mr.state !== 'inactive') {
      const stopped = new Promise((r) => { mr.onstop = r })
      mr.stop()
      await stopped
    }
    const type = (mr.mimeType || 'video/webm').split(';')[0]
    return { blob: new Blob(chunks, { type }), type }
  }
  const cancel = () => { if (mr.state !== 'inactive') { mr.onstop = null; mr.stop() } }
  return { mr, stop, cancel }
}
type Rec = ReturnType<typeof startRecorder>

/**
 * Records the whole screen, a window or a tab (optionally just part of it, optionally with the camera in a
 * bubble), or just the camera, straight into the project.
 */
export function ScreenRecorder({ mode, onClose, onDone }: Props) {
  const cameraOnly = mode === 'camera'
  const [phase, setPhase] = useState<Phase>('setup')
  const [surface, setSurface] = useState<Surface>('monitor')
  const [area, setArea] = useState<'full' | 'custom'>('full')
  const [sysAudio, setSysAudio] = useState(true)
  const [micOn, setMicOn] = useState(cameraOnly)
  const [camOn, setCamOn] = useState(false)
  const [shape, setShape] = useState<'circle' | 'rounded'>('circle')
  const [bubble, setBubble] = useState<Bubble>({ x: 0.86, y: 0.78, d: 0.3 })
  const [camAr, setCamAr] = useState(16 / 9)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [camId, setCamId] = useState<string | null>(null)
  const [camLive, setCamLive] = useState(false)
  const [crop, setCrop] = useState<Crop>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<ScreenSource[]>([])
  const [count, setCount] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [size, setSize] = useState({ w: 16, h: 9 })

  const video = useRef<HTMLVideoElement>(null)
  const camVideo = useRef<HTMLVideoElement>(null)
  const screen = useRef<MediaStream | null>(null)
  const cam = useRef<MediaStream | null>(null)
  const mixer = useRef<{ stream: MediaStream; stop: () => void } | null>(null)
  const recs = useRef<{ main: Rec; cam: Rec | null } | null>(null)
  const clock = useRef({ start: 0, pausedAt: 0, pausedFor: 0 })
  const areaRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: string; x0: number; y0: number; c0: Crop; b0: Bubble } | null>(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  // read by stop(), which can also run from the share-ended listener set up earlier
  const picks = useRef({ area, crop, bubble, shape, size, camAr })
  picks.current = { area, crop, bubble, shape, size, camAr }

  const stopCam = () => {
    cam.current?.getTracks().forEach((tr) => tr.stop())
    cam.current = null
    setCamLive(false)
  }
  const release = () => {
    screen.current?.getTracks().forEach((tr) => tr.stop())
    screen.current = null
    stopCam()
    mixer.current?.stop()
    mixer.current = null
  }
  useEffect(() => () => {
    recs.current?.main.cancel()
    recs.current?.cam?.cancel()
    release()
    desktop?.pickScreen?.(null)
  }, [])

  // the Windows app asks us to show its list of screens and windows
  useEffect(() => (cameraOnly ? undefined : desktop?.onPickScreen?.((list) => { setSources(list); setPhase('pick') })), [cameraOnly])

  useEffect(() => {
    if (phase !== 'recording') return
    const id = setInterval(() => {
      const c = clock.current
      setElapsed(((c.pausedAt || performance.now()) - c.start - c.pausedFor) / 1000)
    }, 250)
    return () => clearInterval(id)
  }, [phase])

  const show = (el: HTMLVideoElement | null, s: MediaStream, onSize?: (w: number, h: number) => void) => {
    if (!el) return
    el.srcObject = s
    el.onloadedmetadata = () => onSize?.(el.videoWidth || 16, el.videoHeight || 9)
    el.play().catch(() => {})
  }

  /** Opens the camera for the bubble (screen mode) or as the whole picture (camera mode). */
  const startCam = async (id: string | null) => {
    stopCam()
    const s = await openCamera(id, cameraOnly)
    cam.current = s
    setCamLive(true)
    setCameras(await listCameras())
    setCamId(s.getVideoTracks()[0]?.getSettings().deviceId ?? id)
    return s
  }

  const camFailed = (e: unknown) => {
    const name = (e as Error).name
    return name === 'NotAllowedError' || name === 'SecurityError'
      ? t('Camera permission was denied. Allow the camera for this app in your device settings and try again.')
      : name === 'NotFoundError' || name === 'OverconstrainedError' ? t('No camera was found on this device.') : (e as Error).message
  }

  const bubbleOn = async (on: boolean, id = camId) => {
    setCamOn(on)
    if (!on) { stopCam(); return }
    setMicOn(true)
    if (phaseRef.current !== 'ready') return
    try {
      const s = await startCam(id)
      requestAnimationFrame(() => show(camVideo.current, s, (w, h) => setCamAr(w / h)))
    } catch (e) {
      setCamOn(false)
      setError(camFailed(e))
    }
  }

  const ended = () => {
    // sharing stopped from the browser's own bar (or the camera unplugged): keep what was recorded
    if (phaseRef.current === 'recording') stop()
    else if (phaseRef.current !== 'saving') { release(); setPhase('setup') }
  }

  const share = async () => {
    setError(null)
    if (cameraOnly) {
      try {
        const s = await startCam(camId)
        screen.current = s
        s.getVideoTracks()[0]?.addEventListener('ended', ended)
        setPhase('ready')
        requestAnimationFrame(() => show(video.current, s, (w, h) => setSize({ w, h })))
      } catch (e) {
        setPhase('setup')
        setError(camFailed(e))
      }
      return
    }
    try {
      const s = await captureScreen(surface, sysAudio)
      screen.current = s
      s.getVideoTracks()[0].addEventListener('ended', ended)
      setPhase('ready')
      requestAnimationFrame(() => show(video.current, s, (w, h) => setSize({ w, h })))
    } catch (e) {
      setPhase('setup')
      const name = (e as Error).name
      if (name !== 'NotAllowedError' && name !== 'AbortError') setError((e as Error).message)
      return
    }
    if (camOn) {
      try {
        const c = await startCam(camId)
        requestAnimationFrame(() => show(camVideo.current, c, (w, h) => setCamAr(w / h)))
      } catch (e) {
        setCamOn(false)
        setError(camFailed(e))
      }
    }
  }

  /** Next camera (front / back on phones, built-in / USB on laptops). */
  const switchCamera = async () => {
    if (cameras.length < 2) return
    const i = cameras.findIndex((c) => c.deviceId === camId)
    const next = cameras[(i + 1) % cameras.length].deviceId
    if (!cameraOnly) { await bubbleOn(true, next); return }
    try {
      screen.current?.getTracks().forEach((tr) => tr.stop())
      const s = await startCam(next)
      screen.current = s
      s.getVideoTracks()[0]?.addEventListener('ended', ended)
      show(video.current, s, (w, h) => setSize({ w, h }))
    } catch (e) {
      setError(camFailed(e))
    }
  }

  const pickSource = (id: string | null) => {
    desktop?.pickScreen?.(id)
    setSources([])
    if (!id) setPhase('setup')
  }

  const begin = async () => {
    if (!screen.current) return
    let mic: MediaStream | null = null
    if (micOn) {
      try { mic = await micStream() }
      catch { setError(t('Microphone permission was denied, recording without it.')) }
    }
    // in camera mode the camera stream is the picture; its tracks are stopped by release(), not by the mixer
    mixer.current = mixStreams(new MediaStream(screen.current.getTracks()), mic)
    setPhase('countdown')
    for (let n = 3; n > 0; n--) {
      setCount(n)
      await new Promise((r) => setTimeout(r, 1000))
      if (phaseRef.current !== 'countdown') return
    }
    // the bubble is its own video (no sound), started at the same moment so the two stay in step
    const bubbleCam = !cameraOnly && cam.current ? cam.current : null
    recs.current = {
      main: startRecorder(mixer.current.stream, cameraOnly ? 6_000_000 : 8_000_000),
      cam: bubbleCam ? startRecorder(new MediaStream(bubbleCam.getVideoTracks()), 3_000_000) : null,
    }
    clock.current = { start: performance.now(), pausedAt: 0, pausedFor: 0 }
    setElapsed(0)
    setPaused(false)
    setPhase('recording')
  }

  const togglePause = () => {
    const r = recs.current
    if (!r) return
    const c = clock.current
    const all = [r.main.mr, ...(r.cam ? [r.cam.mr] : [])]
    if (r.main.mr.state === 'recording') { all.forEach((m) => m.state === 'recording' && m.pause()); c.pausedAt = performance.now(); setPaused(true) }
    else if (r.main.mr.state === 'paused') { all.forEach((m) => m.state === 'paused' && m.resume()); c.pausedFor += performance.now() - c.pausedAt; c.pausedAt = 0; setPaused(false) }
  }

  /** Where the bubble sits on the recorded picture (after "Custom area"), as an overlay box. */
  const bubbleBox = (): Box => {
    const { area: a, crop: cr, bubble: b, size: sz } = picks.current
    const c = a === 'custom' ? cr : { x: 0, y: 0, w: 1, h: 1 }
    const px = b.x * sz.w, py = b.y * sz.h, dpx = b.d * Math.min(sz.w, sz.h)
    const cw = c.w * sz.w, ch = c.h * sz.h
    const d = dpx / Math.min(cw, ch)
    // the renderer makes the bubble's short side min(W, H) * 0.5 * scale
    const scale = 2 * d
    const clamp = (v: number) => Math.max(0, Math.min(1, v))
    return { x: clamp((px - c.x * sz.w) / cw), y: clamp((py - c.y * sz.h) / ch), scale, rotation: 0, opacity: 1 }
  }

  const stop = async () => {
    const r = recs.current
    if (!r) return
    recs.current = null
    setPhase('saving')
    const [main, camRec] = await Promise.all([r.main.stop(), r.cam?.stop() ?? null])
    release()
    try {
      const blob = await finishRecording(main.blob)
      const file = new File([blob], stampName(cameraOnly ? 'Camera' : 'Screen', main.type), { type: blob.type || main.type })
      let take: CamTake | null = null
      if (camRec && camRec.blob.size) {
        const cb = await finishRecording(camRec.blob)
        take = { file: new File([cb], stampName('Camera', camRec.type), { type: cb.type || camRec.type }), box: bubbleBox(), mask: picks.current.shape }
      }
      const { area: a, crop: cr } = picks.current
      const c = !cameraOnly && a === 'custom' && !(cr.w > 0.99 && cr.h > 0.99) ? cr : null
      await onDone(file, c, take)
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setPhase('setup')
    }
  }

  const cancel = () => {
    recs.current?.main.cancel()
    recs.current?.cam?.cancel()
    recs.current = null
    release()
    onClose()
  }

  // bubble size on the preview, as a share of its width and height (same shape the renderer draws)
  const base = bubble.d * Math.min(size.w, size.h)
  const bw = (shape === 'circle' || camAr < 1 ? base : base * camAr) / size.w
  const bh = (shape === 'circle' || camAr >= 1 ? base : base / camAr) / size.h

  // custom area box (same handles as the crop editor) and the camera bubble
  const onDown = (e: React.PointerEvent, mode: string) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, x0: e.clientX, y0: e.clientY, c0: crop, b0: bubble }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !areaRef.current) return
    const r = areaRef.current.getBoundingClientRect()
    const dx = (e.clientX - d.x0) / r.width, dy = (e.clientY - d.y0) / r.height
    if (d.mode === 'bubble') {
      // the whole bubble stays on the picture
      const hx = Math.min(0.5, bw / 2), hy = Math.min(0.5, bh / 2)
      setBubble({ ...d.b0, x: Math.max(hx, Math.min(1 - hx, d.b0.x + dx)), y: Math.max(hy, Math.min(1 - hy, d.b0.y + dy)) })
      return
    }
    const c = { ...d.c0 }
    if (d.mode === 'move') {
      c.x = Math.max(0, Math.min(1 - c.w, c.x + dx)); c.y = Math.max(0, Math.min(1 - c.h, c.y + dy))
    } else {
      let x1 = c.x, y1 = c.y, x2 = c.x + c.w, y2 = c.y + c.h
      if (d.mode.includes('l')) x1 = Math.min(x2 - 0.05, Math.max(0, x1 + dx))
      if (d.mode.includes('r')) x2 = Math.max(x1 + 0.05, Math.min(1, x2 + dx))
      if (d.mode.includes('t')) y1 = Math.min(y2 - 0.05, Math.max(0, y1 + dy))
      if (d.mode.includes('b')) y2 = Math.max(y1 + 0.05, Math.min(1, y2 + dy))
      c.x = x1; c.y = y1; c.w = x2 - x1; c.h = y2 - y1
    }
    setCrop(c)
  }

  const live = phase === 'ready' || phase === 'countdown' || phase === 'recording'
  const showArea = !cameraOnly && area === 'custom' && live
  const showBubble = !cameraOnly && camOn && live && camLive
  const pickList = sources.filter((s) => (surface === 'monitor' ? s.screen : !s.screen))
  const shownSources = pickList.length ? pickList : sources
  const available = cameraOnly ? canRecordCamera() : canRecordScreen()

  return (
    <div className="modal screen-rec">
      <div className="modal-head">
        <button className="icon-btn" onClick={cancel} aria-label="Cancel"><Icon name="close" /></button>
        <b>{t(cameraOnly ? 'Camera recording' : 'Screen recording')}</b>
        {phase === 'recording' ? (
          <span className={`rec-time${paused ? ' paused' : ''}`}><i />{fmtTime(elapsed)}</span>
        ) : <span style={{ width: 40 }} />}
      </div>

      <div className="crop-stage" onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        {!available && (
          <p className="muted center-text">{cameraOnly
            ? t('Camera recording is not available here. Open the app in Chrome, Edge or the Windows / Android app.')
            : t('Screen recording is not available on this device. Use the Windows app or Chrome / Edge on a computer. On a phone you can use Record camera.')}</p>
        )}
        {available && phase === 'setup' && (
          <div className="rec-setup">
            <Icon name={cameraOnly ? 'camera' : 'screen'} size={56} />
            <p className="muted">{t(cameraOnly
              ? 'Record yourself with the camera and microphone. The video goes straight into your timeline.'
              : 'Record your screen and the video goes straight into your timeline.')}</p>
          </div>
        )}
        {phase === 'pick' && (
          <div className="screen-pick">
            {shownSources.map((s) => (
              <button key={s.id} onClick={() => pickSource(s.id)}>
                <img src={s.thumb} alt="" />
                <span>{s.screen ? `🖥 ${s.name}` : s.name}</span>
              </button>
            ))}
          </div>
        )}
        {live && (
          <div className="crop-area" ref={areaRef} style={{ aspectRatio: `${size.w} / ${size.h}`, '--ar': size.w / size.h } as React.CSSProperties}>
            <video ref={video} muted playsInline />
            {showArea && (
              <>
                <div className="crop-shade" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${crop.x * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${(crop.y + crop.h) * 100}%, ${(crop.x + crop.w) * 100}% ${(crop.y + crop.h) * 100}%, ${(crop.x + crop.w) * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${crop.y * 100}%)` }} />
                <div className="crop-box" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }} onPointerDown={(e) => onDown(e, 'move')}>
                  {['tl', 'tr', 'bl', 'br'].map((m) => <div key={m} className={`crop-h ${m}`} onPointerDown={(e) => onDown(e, m)} />)}
                </div>
              </>
            )}
            {showBubble && (
              <div className={`cam-bubble ${shape}`} onPointerDown={(e) => onDown(e, 'bubble')} aria-label={t('Camera bubble')}
                style={{ left: `${bubble.x * 100}%`, top: `${bubble.y * 100}%`, width: `${bw * 100}%`, height: `${bh * 100}%` }}>
                <video ref={camVideo} muted playsInline />
              </div>
            )}
            {phase === 'countdown' && <div className="rec-count">{count}</div>}
          </div>
        )}
        {phase === 'saving' && <p className="muted">{t('Adding the recording to your timeline…')}</p>}
      </div>

      <div className="modal-foot">
        {error && <p className="error-text">{error}</p>}
        {phase === 'setup' && available && !cameraOnly && (
          <>
            <span className="field-label">{t('What to record')}</span>
            <Chips options={[{ value: 'monitor', label: '🖥 Full screen' }, { value: 'window', label: '🗔 Window' }, { value: 'browser', label: '🌐 Browser tab' }]} value={surface} onChange={setSurface} />
            <span className="field-label">{t('Area')}</span>
            <Chips options={[{ value: 'full', label: 'Whole screen' }, { value: 'custom', label: '✥ Custom area' }]} value={area} onChange={setArea} />
            {area === 'custom' && <p className="muted small">{t('After you choose the screen, drag the box over the part you want to keep. You can change it later with Crop.')}</p>}
            <Toggle label="Computer sound" value={sysAudio} onChange={setSysAudio} />
            <Toggle label="Microphone" value={micOn} onChange={setMicOn} />
            {canRecordCamera() && <Toggle label="Camera bubble (your face over the screen)" value={camOn} onChange={(v) => bubbleOn(v)} />}
            <button className="btn primary wide" onClick={share}>{t('Choose screen')}</button>
          </>
        )}
        {phase === 'setup' && available && cameraOnly && (
          <>
            <Toggle label="Microphone" value={micOn} onChange={setMicOn} />
            <button className="btn primary wide" onClick={share}>{t('Open camera')}</button>
          </>
        )}
        {phase === 'pick' && <button className="btn wide" onClick={() => pickSource(null)}>{t('Cancel')}</button>}
        {(phase === 'ready' || phase === 'recording') && !cameraOnly && camOn && (
          <>
            <div className="row">
              <Chips options={[{ value: 'circle', label: '● Circle' }, { value: 'rounded', label: '▢ Rounded' }]} value={shape} onChange={setShape} />
              {cameras.length > 1 && phase === 'ready' && <button className="btn small" onClick={switchCamera}>⟲ {t('Switch camera')}</button>}
            </div>
            <Slider label="Bubble size" value={bubble.d} min={0.12} max={0.7} format={(v) => `${Math.round(v * 100)}%`} onChange={(d) => setBubble((b) => ({ ...b, d }))} />
            {phase === 'ready' && <p className="muted small">{t('Drag the bubble to where you want it. It is added as its own track, so you can still move, resize or hide it later.')}</p>}
          </>
        )}
        {phase === 'ready' && !cameraOnly && !camOn && canRecordCamera() && (
          <button className="btn wide" onClick={() => bubbleOn(true)}><Icon name="camera" size={16} /> {t('Add camera bubble')}</button>
        )}
        {phase === 'ready' && (
          <div className="row">
            <button className="btn" onClick={() => { release(); setPhase('setup') }}>{t('Back')}</button>
            {cameraOnly && cameras.length > 1 && <button className="btn" onClick={switchCamera}>⟲ {t('Switch camera')}</button>}
            <button className="btn primary grow" onClick={begin}>● {t('Start recording')}</button>
          </div>
        )}
        {phase === 'recording' && (
          <div className="row">
            <button className="btn" onClick={togglePause}>{paused ? `▶ ${t('Resume')}` : `❚❚ ${t('Pause')}`}</button>
            <button className="btn primary grow rec-stop" onClick={stop}>■ {t('Stop & add')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
