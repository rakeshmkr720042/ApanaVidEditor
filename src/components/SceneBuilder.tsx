import { useEffect, useMemo, useRef, useState } from 'react'
import type { MediaSource } from '../types'
import type { Editor } from '../model/useEditor'
import { defaultSceneOptions, placeScenes, sceneLengths, type BuiltScene, type Scene, type SceneOptions } from '../model/scenes'
import { filesToScenes } from '../lib/sceneImport'
import { CARD_THEMES, drawTextCard, scriptToScenes, themeOf } from '../lib/scriptScenes'
import { MAP_THEMES, drawMapPreview, drawMindStill, mindToScenes, node, parseOutline, renderMindVideo, tidy, toOutline, type MapSettings, type MindNode } from '../lib/mindmap'
import { MindTree } from './MindTree'
import { outputSize } from '../engine/renderer'
import { loadSource } from '../lib/media'
import { saveMedia } from '../lib/db'
import { fmtTime } from '../lib/format'
import { ASR_MODELS, SPOKEN, VOICES, langName, speakLines, transcribeSamples } from '../engine/ai'
import { WAVE_STYLES, analyse, decodeMono, primeWave } from '../engine/visualizer'
import { audioToScenes, bitmapOf, drawAudioCard, findGaps, type AudioLook } from '../lib/audioScenes'
import type { WaveStyle } from '../types'
import { encodeWav } from '../engine/music'
import { Chips, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

// remembered while the app is open, so the next deck starts with the same choices
let memo: SceneOptions = defaultSceneOptions()
let draft = '' // pasted script, kept if the sheet is closed before making scenes
// the mind map being written, kept the same way
let mapDraft = { tab: 'outline' as 'outline' | 'tree', outline: '', tree: node('', [node('')]), overview: true }
let mapMemo: MapSettings | null = null
// the audio being turned into a video, and how
let audioDraft = { src: null as MediaSource | null, title: '', look: 'card' as AudioLook, photos: [] as Blob[], cover: null as Blob | null, target: 12, listen: true, lang: 'auto', model: ASR_MODELS[0].id }
const MAP_SLACK = 4 // extra seconds of still map at the end of each clip, so it can be lengthened on the timeline

const TRANSITIONS = [
  { value: 'none', label: 'None' }, { value: 'fade', label: 'Fade' }, { value: 'slideleft', label: 'Slide' },
  { value: 'zoomin', label: 'Zoom' }, { value: 'mix', label: 'Mix' },
]

function Thumb({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return <img src={url} alt="" />
}

const isText = (f: File) => /^text\/(plain|markdown)/.test(f.type) || /\.(txt|md|markdown)$/i.test(f.name)
const hasDeva = (s: string) => /[ऀ-ॿ]/.test(s)

const SCRIPT_HINT = `# My topic

Introduction
A short paragraph about what this video covers.

Key points:
- First point
- Second point
- Third point

> A line worth remembering.`

const MAP_HINT = `Healthy life
- Food
  - Fruits and vegetables
  - Enough water
- Exercise
  - Walk every day
  - Yoga
- Sleep
  - 7 to 8 hours`

/** Waveform colours that suit the picture behind them. */
const waveColors = (look: AudioLook, theme: string): [string, string] => {
  const th = themeOf(theme)
  return look === 'card' ? [th.accent, th.title] : ['#ffffff', '#7dd3fc']
}

const extOf = (b: Blob) => (b.type === 'image/png' ? 'png' : b.type === 'image/webp' ? 'webp' : 'jpg')

/** Slides, PDF pages, photos or a pasted script → scenes you can script and time → clips on the timeline. */
export function SceneBuilder({ ed, start, onClose, onDone }: { ed: Editor; start: 'files' | 'text' | 'mindmap' | 'audio'; onClose: () => void; onDone: (msg: string) => void }) {
  const [scenes, setScenes] = useState<Scene[]>([])
  // a new audio → video run starts with the waveform and captions on
  const [o, setO] = useState(() => (start === 'audio' && !memo.wave ? (memo = { ...memo, wave: 'bars', captions: true, theme: memo.theme === 'clean' ? 'dark' : memo.theme }) : memo))
  const [track, setTrack] = useState<MediaSource | null>(null)
  const [busy, setBusy] = useState<{ label: string; p: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pasting, setPasting] = useState(start === 'text')
  const [script, setScript] = useState(draft)
  const [mapping, setMapping] = useState(start === 'mindmap')
  const [md, setMd] = useState(mapDraft)
  const [ms, setMs] = useState<MapSettings>(() => {
    if (mapMemo) return mapMemo
    const { w, h } = outputSize(ed.project, ed.sources, 1080)
    return { theme: 'light', layout: w >= h ? 'radial' : 'tree', focus: true } // portrait frames fit a top-down tree better
  })
  const [listening, setListening] = useState(start === 'audio')
  const [ad, setAd] = useState(audioDraft)
  const setAudio = (patch: Partial<typeof audioDraft>) => setAd((v) => (audioDraft = { ...v, ...patch }))
  const [rec, setRec] = useState<{ mr: MediaRecorder; t0: number; now: number } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const swapInput = useRef<HTMLInputElement>(null)
  const swapFor = useRef<string | null>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const setDraft = (patch: Partial<typeof mapDraft>) => setMd((v) => (mapDraft = { ...v, ...patch }))
  const fileInput = useRef<HTMLInputElement>(null)
  const trackInput = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<SceneOptions>) => setO((v) => (memo = { ...v, ...patch }))

  useEffect(() => { if (start === 'files') fileInput.current?.click() }, [start])
  useEffect(() => {
    if (!rec) return
    const id = setInterval(() => setRec((r) => (r ? { ...r, now: Date.now() } : r)), 250)
    return () => clearInterval(id)
  }, [rec?.t0]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => rec?.mr.stream.getTracks().forEach((tr) => tr.stop()), [rec?.mr]) // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = async (files: File[]) => {
    if (!files.length) return
    setError(null)
    setBusy({ label: t('Reading files…'), p: 0 })
    try {
      const texts = files.filter(isText)
      const got = await filesToScenes(files.filter((f) => !isText(f)), (label, p) => setBusy({ label, p }))
      for (const f of texts) got.push(...await textScenes(await f.text()))
      setScenes((s) => [...s, ...got])
      // pages that came with text are worth reading aloud: suggest the voice
      if (!scenes.length && o.voice === 'none' && got.some((s) => s.text) && VOICES[o.lang]) set({ voice: 'ai', captions: !got.every((s) => s.card) })
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  // text cards are drawn at the project's frame size (16:9 for a new project)
  const frame = () => { const { w, h } = outputSize(ed.project, ed.sources, 1080); return { w, h } }

  const textScenes = (raw: string) => {
    const { w, h } = frame()
    return scriptToScenes(raw, themeOf(o.theme), w, h, (p) => setBusy({ label: t('Making scenes…'), p }))
  }

  const addScript = async () => {
    setError(null)
    try {
      const got = await textScenes(script)
      setScenes((s) => [...s, ...got])
      setPasting(false)
      setScript(draft = '')
      // the card already shows the words, so no captions; a voice reads them in the text's language
      const lang = hasDeva(got.map((s) => s.text).join(' ')) ? 'hi' : 'en'
      if (!scenes.length) set({ voice: o.voice === 'none' && VOICES[lang] ? 'ai' : o.voice, lang: VOICES[lang] ? lang : o.lang, captions: false })
    } catch (e) { setError(t((e as Error).message)) } finally { setBusy(null) }
  }

  const setTheme = async (theme: string) => {
    set({ theme })
    if (scenes.some((s) => s.audio)) { await redrawAudio(theme, o.wave); return }
    const cards = scenes.filter((s) => s.card)
    if (!cards.length) return
    const { w, h } = frame()
    setBusy({ label: t('Making scenes…'), p: 0 })
    try {
      const images = new Map<string, Blob>()
      for (let i = 0; i < cards.length; i++) {
        setBusy({ label: t('Making scenes…'), p: i / cards.length })
        images.set(cards[i].id, await drawTextCard(cards[i].card!, themeOf(theme), w, h))
      }
      setScenes((list) => list.map((s) => (images.has(s.id) ? { ...s, image: images.get(s.id)! } : s)))
    } finally { setBusy(null) }
  }

  // ---- audio → video

  const pickAudio = async (f: Blob | undefined, name: string) => {
    if (!f) return
    setError(null)
    setBusy({ label: t('Reading the audio…'), p: 0 })
    try {
      const src = await loadSource(f, name)
      if (src.kind !== 'audio' && src.kind !== 'video') throw new Error(t('Pick an audio file'))
      setAudio({ src, title: ad.title && ad.src ? ad.title : name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') })
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const record = async () => {
    if (rec) { rec.mr.stop(); return }
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mr = new MediaRecorder(stream)
      const parts: Blob[] = []
      mr.ondataavailable = (e) => { if (e.data.size) parts.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop())
        setRec(null)
        const type = (mr.mimeType || 'audio/webm').split(';')[0]
        void pickAudio(new Blob(parts, { type: type.startsWith('audio/') ? type : 'audio/webm' }), `${t('Recording')}.webm`)
      }
      mr.start(1000)
      setRec({ mr, t0: Date.now(), now: Date.now() })
    } catch { setError(t('Microphone permission is needed to record a voiceover.')) }
  }

  /** Redraws the cards of audio chapters for a new card style or waveform shape. */
  const redrawAudio = async (theme: string, wave: WaveStyle | null) => {
    const drawn = scenes.filter((s) => s.audio && s.audio.look !== 'photos')
    if (!drawn.length) return
    const { w, h } = frame()
    setBusy({ label: t('Making scenes…'), p: 0 })
    try {
      const cover = await bitmapOf(ad.cover)
      const images = new Map<string, Blob>()
      for (let i = 0; i < drawn.length; i++) {
        setBusy({ label: t('Making scenes…'), p: i / drawn.length })
        const a = drawn[i].audio!
        images.set(drawn[i].id, await drawAudioCard({ title: a.title, sub: a.sub, theme: themeOf(theme), cover: a.look === 'cover' ? cover : null, wave, W: w, H: h }))
      }
      cover?.close()
      setScenes((list) => list.map((s) => (images.has(s.id) ? { ...s, image: images.get(s.id)! } : s)))
      if (drawn[0].audio!.look === 'card') { const [waveColor, waveColor2] = waveColors('card', theme); set({ waveColor, waveColor2 }) }
    } finally { setBusy(null) }
  }

  const setWave = (wave: WaveStyle | null) => {
    if (busy) return
    set({ wave })
    void redrawAudio(o.theme, wave)
  }

  const addAudio = async () => {
    const src = ad.src
    if (!src) return
    setError(null); setNote(null)
    try {
      setBusy({ label: t('Reading the audio…'), p: 0 })
      const pcm = await decodeMono(src.file)
      if (!pcm) throw new Error(t('This audio could not be read'))
      setBusy({ label: t('Finding pauses…'), p: 0.5 })
      primeWave(src.id, await analyse(pcm)) // the waveform layer will use this analysis
      const gaps = findGaps(pcm)
      let cues: Awaited<ReturnType<typeof transcribeSamples>> = []
      if (ad.listen) {
        try {
          cues = await transcribeSamples(pcm.slice(), { model: ad.model, language: ad.lang, toEnglish: false }, (stage, p) =>
            setBusy({ label: stage === 'download' ? t('Downloading AI model (first time only)') : t('Listening to the audio…'), p }))
          if (!cues.length) setNote(t('No speech was found, so there are no captions. Scenes are cut at the pauses.'))
        } catch (e) {
          const msg = (e as Error).message
          const why = /fetch|network|load/i.test(msg) ? t('The speech model needs internet the first time.') : msg
          setNote(`${t('Captions could not be made')}: ${why} ${t('Scenes are cut at the pauses.')}`)
        }
      }
      const { w, h } = frame()
      const got = await audioToScenes({
        duration: src.duration, gaps, cues, target: ad.target, title: ad.title.trim() || src.name, look: ad.look,
        photos: ad.photos, cover: ad.cover, theme: themeOf(o.theme), wave: o.wave, W: w, H: h,
        progress: (p) => setBusy({ label: t('Making scenes…'), p }),
      })
      // the audio is one track under all chapters, so it replaces whatever scenes were there
      setScenes(got)
      setTrack(src)
      setListening(false)
      const look = got[0]?.audio?.look ?? 'card'
      const [waveColor, waveColor2] = waveColors(look, o.theme)
      set({ voice: 'track', captions: cues.length > 0, transition: 'fade', transitionDuration: 0.5, kenBurns: look !== 'card', fill: look === 'photos', waveColor, waveColor2 })
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const swapPicture = async (f: File | undefined) => {
    const id = swapFor.current
    if (!f || !id) return
    setScenes((list) => list.map((s) => (s.id === id ? { ...s, image: f, audio: s.audio && { ...s.audio, look: 'photos' } } : s)))
  }

  const currentMap = useMemo((): MindNode | null => {
    const m = md.tab === 'outline' ? parseOutline(md.outline, t('Mind map')) : tidy(md.tree)
    return m && m.text ? m : null
  }, [md.tab, md.outline, md.tree])

  const switchTab = (tab: 'outline' | 'tree') => {
    if (tab === md.tab) return
    if (tab === 'tree') setDraft({ tab, tree: parseOutline(md.outline, t('Mind map')) ?? md.tree })
    else setDraft({ tab, outline: md.tree.text.trim() ? toOutline(tidy(md.tree)) : md.outline })
  }

  // live preview of the whole map while it is written
  useEffect(() => {
    const c = preview.current
    if (!c || !currentMap) return
    let live = true
    const id = setTimeout(() => {
      const { w, h } = frame()
      const off = document.createElement('canvas')
      off.width = 480; off.height = Math.round((480 * h) / w)
      void drawMapPreview(currentMap, ms, off).then(() => {
        if (!live) return
        c.width = off.width; c.height = off.height
        c.getContext('2d')!.drawImage(off, 0, 0)
      })
    }, 150)
    return () => { live = false; clearTimeout(id) }
  }, [currentMap, ms]) // eslint-disable-line react-hooks/exhaustive-deps

  const addMap = async () => {
    if (!currentMap) return
    setError(null)
    try {
      const { w, h } = frame()
      const got = await mindToScenes(currentMap, ms, md.overview, w, h, (p) => setBusy({ label: t('Making scenes…'), p }), t('Whole map'))
      setScenes((s) => [...s, ...got])
      setMapping(false)
      // each step starts where the last one ended, so plain cuts look seamless; the map itself moves
      const lang = /[ऀ-ॿ]/.test(got.map((s) => s.text).join(' ')) ? 'hi' : 'en'
      if (!scenes.length) set({ voice: o.voice === 'none' && VOICES[lang] ? 'ai' : o.voice, lang: VOICES[lang] ? lang : o.lang, captions: false, transition: null, kenBurns: false })
    } catch (e) { setError(t((e as Error).message)) } finally { setBusy(null) }
  }

  // a new look or layout redraws the map scenes already made
  const setMapSettings = async (patch: Partial<MapSettings>) => {
    const next = mapMemo = { ...ms, ...patch }
    setMs(next)
    const maps = scenes.filter((s) => s.mind)
    if (!maps.length) return
    const { w, h } = frame()
    setBusy({ label: t('Making scenes…'), p: 0 })
    try {
      const done = new Map<string, Partial<typeof maps[number]>>()
      for (let i = 0; i < maps.length; i++) {
        setBusy({ label: t('Making scenes…'), p: i / maps.length })
        const mind = { ...maps[i].mind!, settings: next }
        done.set(maps[i].id, { mind, image: await drawMindStill(mind, w, h) })
      }
      setScenes((list) => list.map((s) => (done.has(s.id) ? { ...s, ...done.get(s.id) } : s)))
    } finally { setBusy(null) }
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

  const fromAudio = scenes.some((s) => s.audio)
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
      const loaded = new Map<Blob, MediaSource>()
      for (let i = 0; i < scenes.length; i++) {
        setBusy({ label: t('Adding scenes…'), p: i / scenes.length })
        const s = scenes[i]
        if (s.mind) { built.push({ scene: s, source: null as unknown as MediaSource, voice: null }); continue } // made below, once its length is known
        // a photo shown on several chapters is stored once
        let src = loaded.get(s.image)
        if (!src) {
          src = await loadSource(s.image, `${s.name}.${extOf(s.image)}`)
          ed.addSource(src)
          await saveMedia(src)
          loaded.set(s.image, src)
        }
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
      const maps = built.filter((b) => b.scene.mind)
      if (maps.length) {
        // each map step becomes a clip as long as its scene: lines draw, points pop in, then it holds
        const lens = sceneLengths(built, o, o.voice === 'track' ? track : null)
        const { w, h } = frame()
        for (let k = 0; k < maps.length; k++) {
          setBusy({ label: t('Animating the mind map…'), p: k / maps.length })
          const b = maps[k]
          const secs = lens[built.indexOf(b)] + (o.transition ? o.transitionDuration : 0) + MAP_SLACK
          const video = await renderMindVideo(b.scene.mind!, w, h, secs).catch(() => null)
          const src = video
            ? await loadSource(video.blob, `${b.scene.name}.${video.ext}`)
            : await loadSource(b.scene.image, `${b.scene.name}.png`)
          ed.addSource(src)
          await saveMedia(src)
          b.source = src
        }
      }
      if (o.voice === 'track' && track) { ed.addSource(track); await saveMedia(track) }
      const { w, h } = frame()
      ed.replaceProject(placeScenes(ed.project, built, o, o.voice === 'track' ? track : null, w / h))
      onDone(`${built.length} ${t('scenes added to the timeline. Everything can be edited there.')}`)
    } catch (e) {
      setError((e as Error).message)
    } finally { setBusy(null) }
  }

  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet scene-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h2>{t(start === 'audio' ? 'Audio to video' : start === 'mindmap' ? 'Mind map to video' : start === 'text' ? 'Script to video' : 'Slides to video')} {scenes.length > 0 && <span className="muted small">{scenes.length} {t('scenes')} · ~{fmtTime(estimate)}</span>}</h2>
        <p className="muted small">{t(start === 'audio'
          ? 'Pick or record a podcast, talk or voice note. It is cut into chapters at its pauses; each gets a picture, captions of what is said, and a moving waveform.'
          : start === 'mindmap'
          ? 'Write an outline or build the map. The topic comes first, then each branch grows out with its points, one scene at a time.'
          : start === 'text'
          ? 'Paste a script or report. Headings, paragraphs and bullet lists each become a scene with a text card, read by the voice.'
          : 'Pick a PDF, a PowerPoint (.pptx) or photos. Each page becomes a scene; write what should be said on it.')}</p>
        <div className="row">
          <button className="btn" disabled={!!busy} onClick={() => fileInput.current?.click()}>{t(scenes.length ? 'Add more' : 'Pick files')}</button>
          <button className={`btn${pasting ? ' on' : ''}`} disabled={!!busy} onClick={() => setPasting((v) => !v)}>{t('Paste text')}</button>
          <button className={`btn${mapping ? ' on' : ''}`} disabled={!!busy} onClick={() => setMapping((v) => !v)}>{t('Mind map')}</button>
          <button className={`btn${listening ? ' on' : ''}`} disabled={!!busy} onClick={() => setListening((v) => !v)}>{t('Audio')}</button>
          {scenes.length > 0 && <button className="btn" disabled={!!busy} onClick={() => setScenes([])}>{t('Clear')}</button>}
        </div>

        {pasting && (
          <div className="script-box">
            <textarea className="text-input" rows={9} value={script} placeholder={SCRIPT_HINT} autoFocus
              onChange={(e) => setScript(draft = e.target.value)} />
            <p className="muted small">{t('Tip: a short line on its own is a heading, lines starting with - are points, a blank line starts a new scene.')}</p>
            <button className="btn primary" disabled={!!busy || !script.trim()} onClick={addScript}>{t('Make scenes')}</button>
          </div>
        )}

        {mapping && (
          <div className="script-box mind-box">
            <Chips options={[{ value: 'outline', label: 'Write outline' }, { value: 'tree', label: 'Build map' }]} value={md.tab} onChange={switchTab} />
            {md.tab === 'outline' ? (
              <>
                <textarea className="text-input" rows={9} value={md.outline} placeholder={MAP_HINT} autoFocus
                  onChange={(e) => setDraft({ outline: e.target.value })} />
                <p className="muted small">{t('Tip: the first line is the topic, lines starting with - are branches, indent a line to put it under the one above.')}</p>
              </>
            ) : <MindTree map={md.tree} onChange={(tree) => setDraft({ tree })} />}
            {currentMap && <canvas ref={preview} className="mind-preview" />}
            <Toggle label="Show the whole map at the end" value={md.overview} onChange={(overview) => setDraft({ overview })} />
            <button className="btn primary" disabled={!!busy || !currentMap} onClick={addMap}>{t('Make scenes')}</button>
          </div>
        )}

        {listening && (
          <div className="script-box audio-box">
            <div className="row">
              <button className="btn" disabled={!!busy || !!rec} onClick={() => audioInput.current?.click()}>{t(ad.src ? 'Change audio' : 'Pick audio')}</button>
              <button className={`btn${rec ? ' on rec' : ''}`} disabled={!!busy} onClick={record}>
                {rec ? `■ ${t('Stop')} ${fmtTime((rec.now - rec.t0) / 1000)}` : `● ${t('Record')}`}
              </button>
            </div>
            {ad.src && (
              <>
                <p className="small">♪ {ad.src.name} · {fmtTime(ad.src.duration)}</p>
                <label className="field-label" htmlFor="audio-title">{t('Title')}</label>
                <input id="audio-title" className="text-input" value={ad.title} onChange={(e) => setAudio({ title: e.target.value })} />
                <span className="field-label">{t('Picture')}</span>
                <Chips options={[{ value: 'card', label: 'Title card' }, { value: 'photos', label: 'My photos' }, { value: 'cover', label: 'Cover image' }]}
                  value={ad.look} onChange={(look) => {
                    setAudio({ look })
                    if (look === 'photos' && !ad.photos.length) photoInput.current?.click()
                    if (look === 'cover' && !ad.cover) coverInput.current?.click()
                  }} />
                {ad.look === 'photos' && (
                  <p className="muted small">{ad.photos.length} {t('photos, shown one per chapter with a slow zoom.')}{' '}
                    <button className="btn small ghost" onClick={() => photoInput.current?.click()}>{t(ad.photos.length ? 'Change' : 'Pick photos')}</button></p>
                )}
                {ad.look === 'cover' && (
                  <p className="muted small">{t(ad.cover ? 'The cover sits on a blurred copy of itself.' : 'Pick a cover image.')}{' '}
                    <button className="btn small ghost" onClick={() => coverInput.current?.click()}>{t(ad.cover ? 'Change' : 'Pick')}</button></p>
                )}
                <Slider label="New picture about every" min={4} max={60} step={1} value={ad.target} format={(v) => `${v}s`} onChange={(target) => setAudio({ target })} />
                <span className="field-label">{t('Waveform')}</span>
                <Chips options={[...WAVE_STYLES, { value: 'none', label: 'None' }]} value={o.wave ?? 'none'} onChange={(v) => set({ wave: v === 'none' ? null : v })} />
                <Toggle label="Auto captions (speech to text)" value={ad.listen} onChange={(listen) => setAudio({ listen })} />
                {ad.listen && (
                  <div className="row">
                    <select className="select" value={ad.lang} onChange={(e) => setAudio({ lang: e.target.value })} aria-label={t('Language spoken')}>
                      {SPOKEN.map((c) => <option key={c} value={c}>{c === 'auto' ? t('Detect automatically') : langName(c)}</option>)}
                    </select>
                    <select className="select" value={ad.model} onChange={(e) => setAudio({ model: e.target.value })} aria-label={t('Quality')}>
                      {ASR_MODELS.map((m) => <option key={m.id} value={m.id}>{t(m.label)} ({m.size})</option>)}
                    </select>
                  </div>
                )}
                {ad.listen && <p className="muted small">{t('Speech is turned into text on your device; the model downloads once.')}</p>}
                <button className="btn primary" disabled={!!busy || !!rec} onClick={addAudio}>{t('Make scenes')}</button>
              </>
            )}
          </div>
        )}

        {(mapping || scenes.some((s) => s.mind)) && (
          <>
            <span className="field-label">{t('Map style')}</span>
            <Chips options={MAP_THEMES.map((c) => ({ value: c.id, label: c.label }))} value={ms.theme} onChange={(theme) => { if (!busy) void setMapSettings({ theme }) }} />
            <Chips options={[{ value: 'radial', label: 'Radial' }, { value: 'tree', label: 'Tree' }]} value={ms.layout} onChange={(layout) => { if (!busy) void setMapSettings({ layout }) }} />
            <Toggle label="Zoom to each branch" value={ms.focus} onChange={(focus) => { if (!busy) void setMapSettings({ focus }) }} />
          </>
        )}

        {(pasting || scenes.some((s) => s.card) || (listening && ad.look === 'card') || scenes.some((s) => s.audio && s.audio.look === 'card')) && (
          <>
            <span className="field-label">{t('Card style')}</span>
            <Chips options={CARD_THEMES.map((c) => ({ value: c.id, label: c.label }))} value={o.theme} onChange={(v) => { if (!busy) void setTheme(v) }} />
          </>
        )}

        {scenes.length > 0 && (
          <div className="scene-list">
            {scenes.map((s, i) => (
              <div className="scene-row" key={s.id}>
                <div className="scene-thumb">
                  <Thumb blob={s.image} />
                  <span>{i + 1}</span>
                  {s.audio && <button className="scene-swap" disabled={!!busy} onClick={() => { swapFor.current = s.id; swapInput.current?.click() }}>{t('Change picture')}</button>}
                </div>
                <div className="scene-main">
                  <textarea className="text-input" rows={3} value={s.text} placeholder={t(speaking ? 'What the voice says on this scene' : 'Caption (optional)')}
                    onChange={(e) => update(s.id, { text: e.target.value })} />
                  {s.audio ? (
                    <div className="scene-tools">
                      <span className="small muted">{fmtTime(s.audio.start)} – {fmtTime(s.audio.end)}</span>
                    </div>
                  ) : (
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
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {scenes.length > 0 && (
          <>
            {!fromAudio && (
              <>
                <span className="field-label">{t('Voice')}</span>
                <Chips options={[{ value: 'none', label: 'No voice' }, { value: 'ai', label: 'AI voice' }, { value: 'track', label: 'My audio' }]}
                  value={o.voice} onChange={(voice) => { if (voice === 'track' && !track) trackInput.current?.click(); else set({ voice }) }} />
              </>
            )}
            {speaking && (
              <>
                <select className="select" value={o.lang} onChange={(e) => set({ lang: e.target.value })}>
                  {Object.keys(VOICES).map((c) => <option key={c} value={c}>{langName(c)}</option>)}
                </select>
                <p className="muted small">{t('Each scene lasts as long as its voice. The voice runs on your device; the model downloads once.')}</p>
              </>
            )}
            {o.voice === 'track' && track && !fromAudio && (
              <p className="muted small">♪ {track.name} ({fmtTime(track.duration)}) · {t('shared across the scenes; set seconds on a scene to keep its time.')}{' '}
                <button className="btn small ghost" onClick={() => trackInput.current?.click()}>{t('Change')}</button></p>
            )}
            {fromAudio && track && <p className="muted small">♪ {track.name} ({fmtTime(track.duration)}) · {t('each scene is one chapter of it. Edit a scene\'s text to change its captions.')}</p>}
            {o.voice === 'track' && track && !listening && (
              <>
                <span className="field-label">{t('Waveform')}</span>
                <Chips options={[...WAVE_STYLES, { value: 'none', label: 'None' }]} value={o.wave ?? 'none'} onChange={(v) => setWave(v === 'none' ? null : v)} />
              </>
            )}
            {noVoice && (
              <Slider label="Each scene" min={1} max={20} step={0.5} value={o.seconds} format={(v) => `${v.toFixed(1)}s`} onChange={(seconds) => set({ seconds })} />
            )}
            <Toggle label="Show the text as captions" value={o.captions} onChange={(captions) => set({ captions })} />
            {o.captions && !ed.project.layers.some((l) => l.type === 'text' && l.subtitle) && (
              <Chips options={[{ value: 'auto', label: 'Free' }, { value: 'bottom', label: '▁ Bottom strip' }, { value: 'top', label: '▔ Top strip' }, { value: 'center', label: '▣ Centre box' }]}
                value={o.captionFrame} onChange={(captionFrame) => set({ captionFrame })} wrap />
            )}
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
        {note && <p className="small warn">{note}</p>}
        {error && <p className="small error-text">{error}</p>}

        <input ref={fileInput} type="file" multiple hidden
          accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx,image/*,text/plain,.txt,.md"
          onChange={(e) => { if (e.target.files) addFiles([...e.target.files]); e.target.value = '' }} />
        <input ref={trackInput} type="file" accept="audio/*" hidden onChange={(e) => { pickTrack(e.target.files?.[0]); e.target.value = '' }} />
        <input ref={audioInput} type="file" accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAudio(f, f.name); e.target.value = '' }} />
        <input ref={photoInput} type="file" accept="image/*" multiple hidden
          onChange={(e) => { if (e.target.files?.length) setAudio({ photos: [...e.target.files], look: 'photos' }); e.target.value = '' }} />
        <input ref={coverInput} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setAudio({ cover: f, look: 'cover' }); e.target.value = '' }} />
        <input ref={swapInput} type="file" accept="image/*" hidden onChange={(e) => { void swapPicture(e.target.files?.[0]); e.target.value = '' }} />
      </div>
    </div>
  )
}
