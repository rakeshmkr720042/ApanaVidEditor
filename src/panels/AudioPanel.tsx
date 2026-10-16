import { useEffect, useRef, useState } from 'react'
import type { Editor } from '../model/useEditor'
import type { MediaSource } from '../types'
import { encodeWav, MUSIC, renderSfx, renderTrack, SFX } from '../engine/music'
import { loadSource, sharedAudioContext } from '../lib/media'
import { saveMedia } from '../lib/db'
import { fmtTime } from '../lib/format'
import { Chips, Panel } from '../ui/kit'
import { t } from '../lib/i18n'

interface Props {
  ed: Editor
  time: number
  onClose: () => void
  onRecordStart: () => void
  onRecordStop: () => void
}

const rendered = new Map<string, Promise<AudioBuffer>>()
const render = (id: string, sfx: boolean) => {
  const key = (sfx ? 'sfx:' : 'm:') + id
  if (!rendered.has(key)) rendered.set(key, sfx ? renderSfx(id) : renderTrack(id))
  return rendered.get(key)!
}

export function AudioPanel({ ed, time, onClose, onRecordStart, onRecordStop }: Props) {
  const [tab, setTab] = useState('music')
  const [busy, setBusy] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const node = useRef<AudioBufferSourceNode | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const [mood, setMood] = useState('All')
  const [rec, setRec] = useState<{ start: number; mr: MediaRecorder; at: number } | null>(null)
  const [now, setNow] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => { node.current?.stop() }, [])
  useEffect(() => {
    if (!rec) return
    const i = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(i)
  }, [rec])

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

  const startRec = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mr = new MediaRecorder(stream)
      const parts: Blob[] = []
      const at = time
      mr.ondataavailable = (e) => parts.push(e.data)
      mr.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop())
        onRecordStop()
        const blob = new Blob(parts, { type: mr.mimeType || 'audio/webm' })
        try {
          const src = await loadSource(blob, `Voice ${new Date().toLocaleTimeString()}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`)
          await add(src, 'voice', 'Voiceover', at)
        } catch (e) { setError((e as Error).message) }
      }
      mr.start()
      setRec({ start: Date.now(), mr, at })
      setNow(Date.now())
      onRecordStart()
    } catch {
      setError(t('Microphone permission is needed to record a voiceover.'))
    }
  }
  const stopRec = () => { rec?.mr.stop(); setRec(null) }

  const moods = ['All', ...new Set(MUSIC.map((m) => m.mood))]

  return (
    <Panel title="Audio" onClose={() => { stopPreview(); if (rec) stopRec(); onClose() }} tall>
      <Chips options={[{ value: 'music', label: 'Music' }, { value: 'sfx', label: 'Sound effects' }, { value: 'mine', label: 'My audio' }, { value: 'voice', label: 'Record voice' }]} value={tab} onChange={setTab} />
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
      {tab === 'voice' && (
        <div className="rec">
          {rec ? (
            <>
              <div className="rec-time"><i className="rec-dot" /> {fmtTime((now - rec.start) / 1000)}</div>
              <button className="btn primary wide" onClick={stopRec}>■ {t('Stop')}</button>
            </>
          ) : (
            <>
              <button className="rec-btn" onClick={startRec} aria-label="Record"><span /></button>
              <p className="muted small">{t('Recording starts at the playhead and the video plays muted so you can talk over it.')}</p>
            </>
          )}
        </div>
      )}
    </Panel>
  )
}
