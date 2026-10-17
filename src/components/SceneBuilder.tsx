import { useEffect, useMemo, useRef, useState } from 'react'
import type { MediaSource } from '../types'
import type { Editor } from '../model/useEditor'
import { defaultSceneOptions, placeScenes, sceneLengths, type BuiltScene, type Scene, type SceneOptions } from '../model/scenes'
import { filesToScenes } from '../lib/sceneImport'
import { loadSource } from '../lib/media'
import { saveMedia } from '../lib/db'
import { fmtTime } from '../lib/format'
import { VOICES, langName, speakLines } from '../engine/ai'
import { encodeWav } from '../engine/music'
import { Chips, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

// remembered while the app is open, so the next deck starts with the same choices
let memo: SceneOptions = defaultSceneOptions()

const TRANSITIONS = [
  { value: 'none', label: 'None' }, { value: 'fade', label: 'Fade' }, { value: 'slideleft', label: 'Slide' },
  { value: 'zoomin', label: 'Zoom' }, { value: 'mix', label: 'Mix' },
]

function Thumb({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return <img src={url} alt="" />
}

const extOf = (b: Blob) => (b.type === 'image/png' ? 'png' : b.type === 'image/webp' ? 'webp' : 'jpg')

/** Slides, PDF pages or photos → scenes you can script and time → clips on the timeline. */
export function SceneBuilder({ ed, onClose, onDone }: { ed: Editor; onClose: () => void; onDone: (msg: string) => void }) {
  const [scenes, setScenes] = useState<Scene[]>([])
  const [o, setO] = useState(memo)
  const [track, setTrack] = useState<MediaSource | null>(null)
  const [busy, setBusy] = useState<{ label: string; p: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const trackInput = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<SceneOptions>) => setO((v) => (memo = { ...v, ...patch }))

  useEffect(() => { fileInput.current?.click() }, [])

  const addFiles = async (files: File[]) => {
    if (!files.length) return
    setError(null)
    setBusy({ label: t('Reading files…'), p: 0 })
    try {
      const got = await filesToScenes(files, (label, p) => setBusy({ label, p }))
      setScenes((s) => [...s, ...got])
      // pages that came with text are worth reading aloud: suggest the voice
      if (!scenes.length && o.voice === 'none' && got.some((s) => s.text) && VOICES[o.lang]) set({ voice: 'ai', captions: true })
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const pickTrack = async (f: File | undefined) => {
    if (!f) return
    try {
      const src = await loadSource(f, f.name)
      if (src.kind !== 'audio' && src.kind !== 'video') throw new Error(t('Pick an audio file'))
      setTrack(src)
      set({ voice: 'track' })
    } catch (e) { setError((e as Error).message) }
  }

  const update = (id: string, patch: Partial<Scene>) => setScenes((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const move = (i: number, d: number) => setScenes((list) => {
    const j = i + d
    if (j < 0 || j >= list.length) return list
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  const speaking = o.voice === 'ai'
  const noVoice = o.voice === 'none' || (o.voice === 'track' && !track)
  // rough length shown before voices exist: about 14 characters a second when spoken
  const estimate = useMemo(() => {
    const fake = scenes.map((scene) => ({
      scene, source: null as unknown as MediaSource,
      voice: speaking && scene.text.trim() ? ({ duration: scene.text.length / 14 } as MediaSource) : null,
    }))
    return sceneLengths(fake, o, o.voice === 'track' ? track : null).reduce((a, b) => a + b, 0)
  }, [scenes, o, track, speaking])

  const create = async () => {
    setError(null)
    try {
      const built: BuiltScene[] = []
      for (let i = 0; i < scenes.length; i++) {
        setBusy({ label: t('Adding scenes…'), p: i / scenes.length })
        const s = scenes[i]
        const src = await loadSource(s.image, `${s.name}.${extOf(s.image)}`)
        ed.addSource(src)
        await saveMedia(src)
        built.push({ scene: s, source: src, voice: null })
      }
      if (speaking) {
        setBusy({ label: t('Recording voice-over…'), p: 0 })
        const bufs = await speakLines(scenes.map((s) => s.text), o.lang, (stage, p) =>
          setBusy({ label: stage === 'download' ? t('Downloading AI model (first time only)') : t('Recording voice-over…'), p }))
        for (let i = 0; i < bufs.length; i++) {
          const b = bufs[i]
          if (!b) continue
          const src = await loadSource(encodeWav(b), `${scenes[i].name} ${t('Voice-over')}.wav`)
          ed.addSource(src)
          await saveMedia(src)
          built[i].voice = src
        }
      }
      if (o.voice === 'track' && track) { ed.addSource(track); await saveMedia(track) }
      ed.replaceProject(placeScenes(ed.project, built, o, o.voice === 'track' ? track : null))
      onDone(`${built.length} ${t('scenes added to the timeline. Everything can be edited there.')}`)
    } catch (e) {
      setError((e as Error).message)
    } finally { setBusy(null) }
  }

  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet scene-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h2>{t('Slides to video')} {scenes.length > 0 && <span className="muted small">{scenes.length} {t('scenes')} · ~{fmtTime(estimate)}</span>}</h2>
        <p className="muted small">{t('Pick a PDF, a PowerPoint (.pptx) or photos. Each page becomes a scene; write what should be said on it.')}</p>
        <div className="row">
          <button className="btn" disabled={!!busy} onClick={() => fileInput.current?.click()}>{t(scenes.length ? 'Add more' : 'Pick files')}</button>
          {scenes.length > 0 && <button className="btn" disabled={!!busy} onClick={() => setScenes([])}>{t('Clear')}</button>}
        </div>

        {scenes.length > 0 && (
          <div className="scene-list">
            {scenes.map((s, i) => (
              <div className="scene-row" key={s.id}>
                <div className="scene-thumb">
                  <Thumb blob={s.image} />
                  <span>{i + 1}</span>
                </div>
                <div className="scene-main">
                  <textarea className="text-input" rows={3} value={s.text} placeholder={t(speaking ? 'What the voice says on this scene' : 'Caption (optional)')}
                    onChange={(e) => update(s.id, { text: e.target.value })} />
                  <div className="scene-tools">
                    <label className="small muted">
                      {t('Seconds')}{' '}
                      <input className="scene-secs" type="number" min={0.5} max={120} step={0.5} placeholder={t('auto')} value={s.duration ?? ''}
                        onChange={(e) => update(s.id, { duration: e.target.value ? Math.max(0.5, Number(e.target.value)) : null })} />
                    </label>
                    <span className="grow" />
                    <button className="btn small ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                    <button className="btn small ghost" disabled={i === scenes.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                    <button className="btn small ghost" onClick={() => setScenes((l) => l.filter((x) => x.id !== s.id))} aria-label="Remove">✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {scenes.length > 0 && (
          <>
            <span className="field-label">{t('Voice')}</span>
            <Chips options={[{ value: 'none', label: 'No voice' }, { value: 'ai', label: 'AI voice' }, { value: 'track', label: 'My audio' }]}
              value={o.voice} onChange={(voice) => { if (voice === 'track' && !track) trackInput.current?.click(); else set({ voice }) }} />
            {speaking && (
              <>
                <select className="select" value={o.lang} onChange={(e) => set({ lang: e.target.value })}>
                  {Object.keys(VOICES).map((c) => <option key={c} value={c}>{langName(c)}</option>)}
                </select>
                <p className="muted small">{t('Each scene lasts as long as its voice. The voice runs on your device; the model downloads once.')}</p>
              </>
            )}
            {o.voice === 'track' && track && (
              <p className="muted small">♪ {track.name} ({fmtTime(track.duration)}) · {t('shared across the scenes; set seconds on a scene to keep its time.')}{' '}
                <button className="btn small ghost" onClick={() => trackInput.current?.click()}>{t('Change')}</button></p>
            )}
            {noVoice && (
              <Slider label="Each scene" min={1} max={20} step={0.5} value={o.seconds} format={(v) => `${v.toFixed(1)}s`} onChange={(seconds) => set({ seconds })} />
            )}
            <Toggle label="Show the text as captions" value={o.captions} onChange={(captions) => set({ captions })} />
            <span className="field-label">{t('Transition')}</span>
            <Chips options={TRANSITIONS} value={o.transition ?? 'none'} onChange={(v) => set({ transition: v === 'none' ? null : v })} wrap />
            <Toggle label="Slow zoom" value={o.kenBurns} onChange={(kenBurns) => set({ kenBurns })} />
            <Toggle label="Fill frame (crop photos)" value={o.fill} onChange={(fill) => set({ fill })} />
            <button className="btn primary wide" disabled={!!busy || (speaking && !scenes.some((s) => s.text.trim()))} onClick={create}>{t('Create video')}</button>
            {speaking && !scenes.some((s) => s.text.trim()) && <p className="small warn">{t('Write some text on the scenes for the voice to read.')}</p>}
          </>
        )}

        {busy && (
          <div className="ai-status">
            <span className="small">{busy.label} {Math.round(busy.p * 100)}%</span>
            <div className="progress"><div style={{ width: `${Math.round(busy.p * 100)}%` }} /></div>
          </div>
        )}
        {error && <p className="small error-text">{error}</p>}

        <input ref={fileInput} type="file" multiple hidden
          accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx,image/*"
          onChange={(e) => { if (e.target.files) addFiles([...e.target.files]); e.target.value = '' }} />
        <input ref={trackInput} type="file" accept="audio/*" hidden onChange={(e) => { pickTrack(e.target.files?.[0]); e.target.value = '' }} />
      </div>
    </div>
  )
}
