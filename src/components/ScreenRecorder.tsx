import { useEffect, useRef, useState } from 'react'
import type { Crop } from '../types'
import { Chips, Toggle } from '../ui/kit'
import { Icon } from './Icon'
import { t } from '../lib/i18n'
import { fmtTime } from '../lib/format'
import { desktop, type ScreenSource } from '../lib/desktop'
import { canRecordScreen, captureScreen, finishRecording, mixStreams, recorderMime, type Surface } from '../lib/screenrec'

interface Props {
  onClose: () => void
  /** The finished recording, and the area to keep when "Custom area" was chosen. */
  onDone: (file: File, crop: Crop | null) => Promise<void>
}

type Phase = 'setup' | 'pick' | 'ready' | 'countdown' | 'recording' | 'saving'

/** Records the whole screen, a window or a tab (optionally just part of it) straight into the project. */
export function ScreenRecorder({ onClose, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('setup')
  const [surface, setSurface] = useState<Surface>('monitor')
  const [area, setArea] = useState<'full' | 'custom'>('full')
  const [sysAudio, setSysAudio] = useState(true)
  const [micOn, setMicOn] = useState(false)
  const [crop, setCrop] = useState<Crop>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<ScreenSource[]>([])
  const [count, setCount] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [size, setSize] = useState({ w: 16, h: 9 })

  const video = useRef<HTMLVideoElement>(null)
  const screen = useRef<MediaStream | null>(null)
  const mixer = useRef<{ stream: MediaStream; stop: () => void } | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const clock = useRef({ start: 0, pausedAt: 0, pausedFor: 0 })
  const areaRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: string; x0: number; y0: number; c0: Crop } | null>(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  // read by stop(), which can also run from the share-ended listener set up earlier
  const areaPick = useRef({ area, crop })
  areaPick.current = { area, crop }

  const release = () => {
    screen.current?.getTracks().forEach((tr) => tr.stop())
    screen.current = null
    mixer.current?.stop()
    mixer.current = null
  }
  useEffect(() => () => {
    if (recorder.current?.state !== 'inactive') recorder.current?.stop()
    release()
    desktop?.pickScreen?.(null)
  }, [])

  // the Windows app asks us to show its list of screens and windows
  useEffect(() => desktop?.onPickScreen?.((list) => { setSources(list); setPhase('pick') }), [])

  useEffect(() => {
    if (phase !== 'recording') return
    const id = setInterval(() => {
      const c = clock.current
      setElapsed(((c.pausedAt || performance.now()) - c.start - c.pausedFor) / 1000)
    }, 250)
    return () => clearInterval(id)
  }, [phase])

  const share = async () => {
    setError(null)
    try {
      const s = await captureScreen(surface, sysAudio)
      screen.current = s
      const track = s.getVideoTracks()[0]
      // sharing stopped from the browser's own bar: keep what was recorded
      track.addEventListener('ended', () => {
        if (phaseRef.current === 'recording') stop()
        else if (phaseRef.current !== 'saving') { release(); setPhase('setup') }
      })
      setPhase('ready')
      requestAnimationFrame(() => {
        const v = video.current
        if (!v) return
        v.srcObject = s
        v.onloadedmetadata = () => setSize({ w: v.videoWidth || 16, h: v.videoHeight || 9 })
        v.play().catch(() => {})
      })
    } catch (e) {
      setPhase('setup')
      const name = (e as Error).name
      if (name !== 'NotAllowedError' && name !== 'AbortError') setError((e as Error).message)
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
      try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) }
      catch { setError(t('Microphone permission was denied, recording without it.')) }
    }
    mixer.current = mixStreams(screen.current, mic)
    setPhase('countdown')
    for (let n = 3; n > 0; n--) {
      setCount(n)
      await new Promise((r) => setTimeout(r, 1000))
      if (phaseRef.current !== 'countdown') return
    }
    const mime = recorderMime()
    const mr = new MediaRecorder(mixer.current.stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 8_000_000 })
    chunks.current = []
    mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
    mr.start(1000)
    recorder.current = mr
    clock.current = { start: performance.now(), pausedAt: 0, pausedFor: 0 }
    setElapsed(0)
    setPaused(false)
    setPhase('recording')
  }

  const togglePause = () => {
    const mr = recorder.current
    if (!mr) return
    const c = clock.current
    if (mr.state === 'recording') { mr.pause(); c.pausedAt = performance.now(); setPaused(true) }
    else if (mr.state === 'paused') { mr.resume(); c.pausedFor += performance.now() - c.pausedAt; c.pausedAt = 0; setPaused(false) }
  }

  const stop = async () => {
    const mr = recorder.current
    if (!mr || mr.state === 'inactive') return
    setPhase('saving')
    const stopped = new Promise((r) => { mr.onstop = r })
    mr.stop()
    await stopped
    release()
    const type = (mr.mimeType || 'video/webm').split(';')[0]
    const raw = new Blob(chunks.current, { type })
    chunks.current = []
    try {
      const blob = await finishRecording(raw)
      const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.')
      const file = new File([blob], `Screen ${stamp}.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type: blob.type || type })
      const { area: a, crop: cr } = areaPick.current
      const c = a === 'custom' && !(cr.w > 0.99 && cr.h > 0.99) ? cr : null
      await onDone(file, c)
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setPhase('setup')
    }
  }

  const cancel = () => {
    if (recorder.current && recorder.current.state !== 'inactive') { recorder.current.onstop = null; recorder.current.stop() }
    recorder.current = null
    chunks.current = []
    release()
    onClose()
  }

  // custom area box, same handles as the crop editor
  const onDown = (e: React.PointerEvent, mode: string) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, x0: e.clientX, y0: e.clientY, c0: crop }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !areaRef.current) return
    const r = areaRef.current.getBoundingClientRect()
    const dx = (e.clientX - d.x0) / r.width, dy = (e.clientY - d.y0) / r.height
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

  const showArea = area === 'custom' && (phase === 'ready' || phase === 'countdown' || phase === 'recording')
  const live = phase === 'ready' || phase === 'countdown' || phase === 'recording'
  const pickList = sources.filter((s) => (surface === 'monitor' ? s.screen : !s.screen))
  const shownSources = pickList.length ? pickList : sources

  return (
    <div className="modal screen-rec">
      <div className="modal-head">
        <button className="icon-btn" onClick={cancel} aria-label="Cancel"><Icon name="close" /></button>
        <b>{t('Screen recording')}</b>
        {phase === 'recording' ? (
          <span className={`rec-time${paused ? ' paused' : ''}`}><i />{fmtTime(elapsed)}</span>
        ) : <span style={{ width: 40 }} />}
      </div>

      <div className="crop-stage" onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        {!canRecordScreen() && (
          <p className="muted center-text">{t('Screen recording is not available on this device. Use the Windows app or Chrome / Edge on a computer.')}</p>
        )}
        {canRecordScreen() && phase === 'setup' && (
          <div className="rec-setup">
            <Icon name="screen" size={56} />
            <p className="muted">{t('Record your screen and the video goes straight into your timeline.')}</p>
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
          <div className="crop-area" ref={areaRef} style={{ aspectRatio: `${size.w} / ${size.h}` }}>
            <video ref={video} muted playsInline />
            {showArea && (
              <>
                <div className="crop-shade" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${crop.x * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${(crop.y + crop.h) * 100}%, ${(crop.x + crop.w) * 100}% ${(crop.y + crop.h) * 100}%, ${(crop.x + crop.w) * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${crop.y * 100}%)` }} />
                <div className="crop-box" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }} onPointerDown={(e) => onDown(e, 'move')}>
                  {['tl', 'tr', 'bl', 'br'].map((m) => <div key={m} className={`crop-h ${m}`} onPointerDown={(e) => onDown(e, m)} />)}
                </div>
              </>
            )}
            {phase === 'countdown' && <div className="rec-count">{count}</div>}
          </div>
        )}
        {phase === 'saving' && <p className="muted">{t('Adding the recording to your timeline…')}</p>}
      </div>

      <div className="modal-foot">
        {error && <p className="error-text">{error}</p>}
        {phase === 'setup' && canRecordScreen() && (
          <>
            <span className="field-label">{t('What to record')}</span>
            <Chips options={[{ value: 'monitor', label: '🖥 Full screen' }, { value: 'window', label: '🗔 Window' }, { value: 'browser', label: '🌐 Browser tab' }]} value={surface} onChange={setSurface} />
            <span className="field-label">{t('Area')}</span>
            <Chips options={[{ value: 'full', label: 'Whole screen' }, { value: 'custom', label: '✥ Custom area' }]} value={area} onChange={setArea} />
            {area === 'custom' && <p className="muted small">{t('After you choose the screen, drag the box over the part you want to keep. You can change it later with Crop.')}</p>}
            <Toggle label="Computer sound" value={sysAudio} onChange={setSysAudio} />
            <Toggle label="Microphone" value={micOn} onChange={setMicOn} />
            <button className="btn primary wide" onClick={share}>{t('Choose screen')}</button>
          </>
        )}
        {phase === 'pick' && <button className="btn wide" onClick={() => pickSource(null)}>{t('Cancel')}</button>}
        {phase === 'ready' && (
          <div className="row">
            <button className="btn" onClick={() => { release(); setPhase('setup') }}>{t('Back')}</button>
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
