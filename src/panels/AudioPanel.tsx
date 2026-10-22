import { useEffect, useRef, useState } from 'react'
import type { Editor } from '../model/useEditor'
import type { MediaSource } from '../types'
import { encodeWav, MUSIC, renderSfx, renderTrack, SFX } from '../engine/music'
import { loadSource, sharedAudioContext } from '../lib/media'
import { saveMedia } from '../lib/db'
import { fmtTime } from '../lib/format'
import { Chips, Panel } from '../ui/kit'
import { t } from '../lib/i18n'
import { desktop } from '../lib/desktop'
import { canRecordScreen } from '../lib/screenrec'

interface Props {
  ed: Editor
  time: number
  onClose: () => void
  onRecordStart: () => void
  onRecordStop: () => void
  /** The video pauses with the recording so the voice stays in step with it. */
  onRecordPause: (paused: boolean) => void
  startTab?: 'music' | 'sfx' | 'mine' | 'voice' | 'system'
}

interface Rec { mr: MediaRecorder; stream: MediaStream; system: boolean; at: number; start: number; pausedAt: number; pausedFor: number; ctl: { discard: boolean } }

const rendered = new Map<string, Promise<AudioBuffer>>()
const render = (id: string, sfx: boolean) => {
  const key = (sfx ? 'sfx:' : 'm:') + id
  if (!rendered.has(key)) rendered.set(key, sfx ? renderSfx(id) : renderTrack(id))
  return rendered.get(key)!
}

export function AudioPanel({ ed, time, onClose, onRecordStart, onRecordStop, onRecordPause, startTab = 'music' }: Props) {
  const [tab, setTab] = useState<string>(startTab)
  const [busy, setBusy] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const node = useRef<AudioBufferSourceNode | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const [mood, setMood] = useState('All')
  const [rec, setRec] = useState<Rec | null>(null)
  const [now, setNow] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<Rec | null>(null)
  recRef.current = rec

  useEffect(() => () => {
    node.current?.stop()
    // panel closed mid-recording: keep what was said
    const r = recRef.current
    if (r && r.mr.state !== 'inactive') r.mr.stop()
  }, [])
  useEffect(() => {
    if (!rec) return
    const i = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(i)
  }, [rec])

  // microphone level meter while recording
  useEffect(() => {
    if (!rec) return
    const ctx = sharedAudioContext()
    const an = ctx.createAnalyser()
    an.fftSize = 1024
    const srcNode = ctx.createMediaStreamSource(rec.stream)
    srcNode.connect(an)
    const buf = new Float32Array(an.fftSize)
    let raf = 0
    const tick = () => {
      an.getFloatTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v))
      setLevel((l) => Math.max(peak, l * 0.85))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelAnimationFrame(raf); srcNode.disconnect(); setLevel(0) }
  }, [rec?.stream]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopPreview = () => { node.current?.stop(); node.current = null; setPlaying(null) }

  const preview = async (id: string, sfx: boolean) => {
    if (playing === id) { stopPreview(); return }
    stopPreview()
    setBusy(id)
    const buf = await render(id, sfx)
    setBusy(null)
    const ctx = sharedAudioContext()
    await ctx.resume()
    const n = ctx.createBufferSource()
    n.buffer = buf
    n.connect(ctx.destination)
    n.start(0, sfx ? 0 : Math.min(8, buf.duration / 4))
    n.onended = () => setPlaying((p) => (p === id ? null : p))
    node.current = n
    setPlaying(id)
  }

  const add = async (src: MediaSource, kind: 'music' | 'sound' | 'voice', label: string, at = time) => {
    ed.addSource(src)
    await saveMedia(src)
    ed.addAudio(at, src, kind, label)
  }

  const addGenerated = async (id: string, sfx: boolean, name: string) => {
    stopPreview()
    setBusy(id)
    try {
      const buf = await render(id, sfx)
      const src = await loadSource(encodeWav(buf), `${name}.wav`)
      await add(src, sfx ? 'sound' : 'music', name)
    } finally { setBusy(null) }
  }

  const importFile = async (f: File) => {
    setError(null)
    try {
      const src = await loadSource(f, f.name)
      await add(src, 'music', f.name.replace(/\.[^.]+$/, ''))
    } catch (e) { setError((e as Error).message) }
  }

  /** Sound of the computer (Windows app, Chrome / Edge): shared like a screen, only its sound is kept. */
  const captureSystem = async () => {
    // the Windows app asks which screen to share; any screen gives the whole computer's sound
    const off = desktop?.onPickScreen?.((list) => desktop?.pickScreen?.((list.find((x) => x.screen) ?? list[0])?.id ?? null))
    try {
      const share = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 320 }, height: { ideal: 180 }, frameRate: { ideal: 1 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: 'include', selfBrowserSurface: 'include', monitorTypeSurfaces: 'include',
      } as DisplayMediaStreamOptions)
      if (!share.getAudioTracks().length) {
        share.getTracks().forEach((tr) => tr.stop())
        throw new Error(t('No sound was shared. Pick "Entire screen" and turn on "Share system audio" (or pick a tab and turn on "Share tab audio").'))
      }
      return share
    } finally { off?.() }
  }

  const startRec = async (system = false) => {
    setError(null)
    let stream: MediaStream
    let share: MediaStream | null = null
    try {
      if (system) {
        share = await captureSystem()
        stream = new MediaStream(share.getAudioTracks())
      } else stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      const name = (e as Error).name
      if (system) { if (name !== 'NotAllowedError' && name !== 'AbortError') setError((e as Error).message) }
      else setError(t('Microphone permission is needed to record a voiceover.'))
      return
    }
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    const mime = types.find((m) => MediaRecorder.isTypeSupported(m))
    const mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: system ? 192_000 : 128_000 })
    const parts: Blob[] = []
    const r: Rec = { mr, stream, system, at: time, start: Date.now(), pausedAt: 0, pausedFor: 0, ctl: { discard: false } }
    mr.ondataavailable = (e) => { if (e.data.size) parts.push(e.data) }
    mr.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop())
      share?.getTracks().forEach((tr) => tr.stop())
      onRecordStop()
      if (r.ctl.discard || !parts.length) return
      const blob = new Blob(parts, { type: mr.mimeType || 'audio/webm' })
      const name = system ? 'Computer sound' : 'Voice'
      try {
        const src = await loadSource(blob, `${name} ${new Date().toLocaleTimeString()}.${blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'}`)
        await add(src, 'voice', system ? 'Computer sound' : 'Voiceover', r.at)
      } catch (e) { setError((e as Error).message) }
    }
    // sharing stopped from the browser's own bar: keep what was recorded
    share?.getTracks().forEach((tr) => tr.addEventListener('ended', () => { if (mr.state !== 'inactive') { mr.stop(); setRec(null) } }))
    mr.start(1000)
    setRec(r)
    setNow(Date.now())
    onRecordStart()
  }
  const stopRec = (discard = false) => {
    if (!rec) return
    rec.ctl.discard = discard
    if (rec.mr.state !== 'inactive') rec.mr.stop()
    setRec(null)
  }
  const togglePause = () => {
    if (!rec) return
    if (rec.mr.state === 'recording') {
      rec.mr.pause()
      setRec({ ...rec, pausedAt: Date.now() })
      onRecordPause(true)
    } else if (rec.mr.state === 'paused') {
      rec.mr.resume()
      setRec({ ...rec, pausedFor: rec.pausedFor + Date.now() - rec.pausedAt, pausedAt: 0 })
      onRecordPause(false)
    }
  }
  const recSecs = rec ? ((rec.pausedAt || now) - rec.start - rec.pausedFor) / 1000 : 0

  const moods = ['All', ...new Set(MUSIC.map((m) => m.mood))]

  return (
    <Panel title="Audio" onClose={() => { stopPreview(); if (rec) stopRec(); onClose() }} tall>
      <Chips options={[
        { value: 'mine', label: 'Upload audio file' }, { value: 'voice', label: '🎙 Record voice' }, { value: 'system', label: '🔊 Record computer sound' },
        { value: 'music', label: 'Music' }, { value: 'sfx', label: 'Sound effects' },
      ]} value={tab} onChange={(v) => { if (!rec) setTab(v) }} />
      {error && <p className="error-text">{error}</p>}
      {tab === 'music' && (
        <>
          <Chips options={moods.map((m) => ({ value: m, label: m }))} value={mood} onChange={setMood} />
          <div className="track-list">
            {MUSIC.filter((m) => mood === 'All' || m.mood === mood).map((m) => (
              <div key={m.id} className="track">
                <button className="icon-btn" onClick={() => preview(m.id, false)} aria-label="Preview">{busy === m.id ? '…' : playing === m.id ? '■' : '▶'}</button>
                <div><b>{m.name}</b><small className="muted">{m.mood} · {m.bpm} BPM</small></div>
                <button className="btn small primary" disabled={!!busy} onClick={() => addGenerated(m.id, false, m.name)}>{t('Add')}</button>
              </div>
            ))}
          </div>
          <p className="muted small">{t('All tracks are made on your device and are free to use anywhere, including YouTube and Instagram.')}</p>
        </>
      )}
      {tab === 'sfx' && (
        <div className="track-list">
          {SFX.map((s) => (
            <div key={s.id} className="track">
              <button className="icon-btn" onClick={() => preview(s.id, true)} aria-label="Preview">{busy === s.id ? '…' : playing === s.id ? '■' : '▶'}</button>
              <div><b>{s.name}</b></div>
              <button className="btn small primary" disabled={!!busy} onClick={() => addGenerated(s.id, true, s.name)}>{t('Add')}</button>
            </div>
          ))}
        </div>
      )}
      {tab === 'mine' && (
        <>
          <button className="btn wide" onClick={() => file.current?.click()}>{t('Pick a song or audio file')}</button>
          <p className="muted small">{t('MP3, M4A, WAV and OGG work. You can also pick a video to use only its sound.')}</p>
          <input ref={file} type="file" accept="audio/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} />
        </>
      )}
      {(tab === 'voice' || tab === 'system') && (
        <div className="rec">
          {rec ? (
            <>
              <div className={`rec-time${rec.pausedAt ? ' paused' : ''}`}><i className="rec-dot" /> {fmtTime(Math.max(0, recSecs))}</div>
              <div className="mic-meter" aria-label={t('Microphone level')}><span style={{ width: `${Math.min(100, Math.sqrt(level) * 100)}%` }} className={level > 0.95 ? 'loud' : ''} /></div>
              <p className="muted small">{rec.pausedAt ? t('Paused. The video waits too.')
                : level < 0.02 ? t(rec.system ? 'Play something on your computer… (no sound yet? check that sound sharing is on)' : 'Speak now… (no sound yet? check the microphone)') : `${t('Recording into a new audio track from')} ${fmtTime(rec.at)}`}</p>
              <div className="row wide">
                <button className="btn" onClick={() => stopRec(true)}>{t('Discard')}</button>
                <button className="btn" onClick={togglePause}>{rec.pausedAt ? `▶ ${t('Resume')}` : `❚❚ ${t('Pause')}`}</button>
                <button className="btn primary grow rec-stop" onClick={() => stopRec()}>■ {t('Stop & add')}</button>
              </div>
            </>
          ) : (
            <>
              {tab === 'system' && !canRecordScreen() ? (
                <p className="muted small">{t('Computer sound can be recorded in the Windows app or in Chrome / Edge on a computer. Android does not let apps record other apps\' sound: record with your phone\'s screen recorder and add it with Upload audio file.')}</p>
              ) : (
                <>
                  <button className="rec-btn" onClick={() => startRec(tab === 'system')} aria-label="Record"><span /></button>
                  <p className="muted small">{t(tab === 'system'
                    ? 'Records the sound playing on your computer (YouTube, a call, a game…). In Chrome pick "Entire screen" and turn on "Share system audio". The video here plays muted.'
                    : 'Recording starts at the playhead and the video plays muted so you can talk over it.')}</p>
                </>
              )}
              <p className="muted small">{t('Playhead')} {fmtTime(time)}</p>
            </>
          )}
        </div>
      )}
    </Panel>
  )
}
