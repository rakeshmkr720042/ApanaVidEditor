import { useEffect, useMemo, useRef, useState } from 'react'
import type { MediaSource } from '../types'
import type { Editor } from '../model/useEditor'
import { defaultSceneOptions, placeScenes, planOf, readingTime, sceneLengths, transitionLengths, type BuiltScene, type Scene, type SceneOptions } from '../model/scenes'
import { filesToScenes } from '../lib/sceneImport'
import { CARD_THEMES, drawTextCard, parseScript, scriptToScenes, themeOf } from '../lib/scriptScenes'
import { MAP_THEMES, drawMapPreview, drawMindStill, mindToScenes, node, parseOutline, renderMindVideo, tidy, toOutline, type MapSettings, type MindNode } from '../lib/mindmap'
import { MindTree } from './MindTree'
import { QuizEditor } from './QuizEditor'
import {
  QUIZ_THEMES, countdownSound, deckLang, defaultQuizSettings, drawQuizPreview, drawQuizStill, item, parseQuiz, quizToScenes, quizToText,
  renderQuizVideo, tidyDeck, type QuizDeck, type QuizScene, type QuizSettings,
} from '../lib/quiz'
import { DataGrid } from './DataGrid'
import {
  DATA_THEMES, dataPlan, dataToScenes, dataToText, defaultDataSettings, docLang, drawDataPreview, drawDataStill, parseData, renderDataVideo, row as dataRow,
  table as dataTable, tidyDoc, type ChartKind, type DataDoc, type DataSettings,
} from '../lib/datachart'
import { CANT_OPEN, articleParts, articleToScenes, drawArticlePic, linkOf, readArticle, type ArticleLength } from '../lib/article'
import { clipDuration } from '../model/timeline'
import { outputSize } from '../engine/renderer'
import { loadSource } from '../lib/media'
import { TOO_BIG, isLong } from '../lib/longaudio'
import { saveMedia } from '../lib/db'
import { fmtTime } from '../lib/format'
import { ASR_MODELS, SPOKEN, VOICES, langName, speakLines, transcribeSamples } from '../engine/ai'
import { WAVE_STYLES, analyse, decodeMono, primeWave } from '../engine/visualizer'
import { audioToScenes, bitmapOf, drawAudioCard, findGaps, type AudioLook } from '../lib/audioScenes'
import { fillInOrder, picsFromFiles, type Leftover, type Pic } from '../lib/rawMedia'
import { auxFor, dressScenes, isOwn, livePlan, type AuxKind, type Part } from '../lib/material'
import { AuxBoxes, CoverageMeter, Step, Thumb } from './Material'
import { movingClip } from '../lib/moving'
import type { WaveStyle } from '../types'
import { encodeWav } from '../engine/music'
import { Chips, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'
import { articleKeyPoints, chapterPoints, keyPoints, localAI, makeQuiz } from '../lib/localai'

// remembered while the app is open, so the next deck starts with the same choices
let memo: SceneOptions = defaultSceneOptions()
let draft = '' // pasted script, kept if the sheet is closed before making scenes
// the mind map being written, kept the same way
let mapDraft = { tab: 'outline' as 'outline' | 'tree', outline: '', tree: node('', [node('')]), overview: true }
let mapMemo: MapSettings | null = null
// the audio being turned into a video, and how
/** Cuts [0, length) into pieces of about ten minutes (16 kHz samples), each ending in the pause nearest the mark. */
function listenPieces(length: number, gaps: { start: number; end: number }[]): [number, number][] {
  const R = 16000, step = 600 * R, out: [number, number][] = []
  let a = 0
  while (length - a > step * 1.2) {
    const mark = (a + step) / R
    const g = gaps.filter((x) => Math.abs((x.start + x.end) / 2 - mark) < 60).sort((x, y) => Math.abs((x.start + x.end) / 2 - mark) - Math.abs((y.start + y.end) / 2 - mark))[0]
    const b = g ? Math.round(((g.start + g.end) / 2) * R) : a + step
    out.push([a, b])
    a = b
  }
  out.push([a, length])
  return out
}

let audioDraft = { src: null as MediaSource | null, title: '', look: 'card' as AudioLook, cover: null as Blob | null, target: 12, listen: true, lang: 'auto', model: ASR_MODELS[0].id }
// extra material beside the main file: pictures for the scenes, and music under the video
let matDraft = { pics: [] as Pic[], music: null as MediaSource | null, leftover: 'card' as Leftover }
// the quiz being written, and how it looks
let quizDraft = { tab: 'text' as 'text' | 'list', text: '', deck: { title: '', items: [item('', ['', '', '', ''])] } as QuizDeck, picked: 0 }
let quizMemo: QuizSettings = defaultQuizSettings()
let quizModeSet = false // the user picked quiz or flashcards themselves
// the table being written, and how it is drawn
let dataDraft = { tab: 'text' as 'text' | 'grid', text: '', doc: { tables: [dataTable('', [''], [dataRow(), dataRow(), dataRow()])] } as DataDoc, picked: 0 }
let dataMemo: DataSettings = defaultDataSettings()
// the article being turned into a video
let articleDraft = { url: '', text: '', length: 'short' as ArticleLength, pictures: true, info: '' }
const MAP_SLACK = 4 // extra seconds of still map at the end of each clip, so it can be lengthened on the timeline

const TRANSITIONS = [
  { value: 'none', label: 'None' }, { value: 'fade', label: 'Fade' }, { value: 'slideleft', label: 'Slide' },
  { value: 'zoomin', label: 'Zoom' }, { value: 'mix', label: 'Mix' },
]

/** Accepted as raw material: slides, PDFs, photos, GIFs and video clips. */
const RAW_ACCEPT = 'image/*,video/*,application/pdf,.pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx'

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

const QUIZ_HINT = `# General knowledge

Q: What is the capital of India?
A) Mumbai
B) New Delhi *
C) Kolkata
D) Chennai
Explanation: New Delhi became the capital in 1931.

Q: How many legs does a spider have?
A: Eight`

const QUIZ_SLACK = 2 // extra seconds of still answer at the end of each clip

const DATA_HINT = `# Population of big cities (millions)
City | 2011 | 2024
Mumbai | 18.4 | 21.7
Delhi | 16.3 | 33.8
Kolkata | 14.1 | 15.6
Source: UN estimates

# This year in numbers
Viewers: 12,500
Growth: 38%
Rating: 4.8`

const ARTICLE_HINT = `# Headline of the article

Source: example.com

Paste the article text here, or get it from a link above.

## A section heading
Its paragraphs…

![Picture caption](https://example.com/picture.jpg)`

const CHART_KINDS: { value: 'auto' | ChartKind; label: string }[] = [
  { value: 'auto', label: 'Auto' }, { value: 'bars', label: 'Bars' }, { value: 'columns', label: 'Columns' }, { value: 'line', label: 'Line' },
  { value: 'donut', label: 'Donut' }, { value: 'table', label: 'Table' }, { value: 'numbers', label: 'Big numbers' },
]

/** Puts freshly made quiz (or chart) scenes where the old ones were (or at the end). */
const withMade = (list: Scene[], got: Scene[], of: (s: Scene) => boolean) => {
  const at = list.findIndex(of)
  const rest = list.filter((s) => !of(s))
  if (at < 0) return [...rest, ...got]
  const before = list.slice(0, at).filter((s) => !of(s)).length
  return [...rest.slice(0, before), ...got, ...rest.slice(before)]
}
const withQuiz = (list: Scene[], got: Scene[]) => withMade(list, got, (s) => !!s.quiz)
const withData = (list: Scene[], got: Scene[]) => withMade(list, got, (s) => !!s.data)

/** Waveform colours that suit the picture behind them. */
const waveColors = (look: AudioLook, theme: string): [string, string] => {
  const th = themeOf(theme)
  return look === 'card' ? [th.accent, th.title] : ['#ffffff', '#7dd3fc']
}

const extOf = (b: Blob) => (b.type === 'image/png' ? 'png' : b.type === 'image/webp' ? 'webp' : b.type === 'image/gif' ? 'gif' : 'jpg')

/** Slides, PDF pages, photos or a pasted script → scenes you can script and time → clips on the timeline. */
export function SceneBuilder({ ed, start, onClose, onDone }: { ed: Editor; start: 'files' | 'text' | 'mindmap' | 'audio' | 'quiz' | 'data' | 'article'; onClose: () => void; onDone: (msg: string) => void }) {
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
  const [mat, setMatState] = useState(matDraft)
  const setMat = (patch: Partial<typeof matDraft>) => setMatState((v) => (matDraft = { ...v, ...patch }))
  const [rec, setRec] = useState<{ mr: MediaRecorder; t0: number; now: number } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [quizzing, setQuizzing] = useState(start === 'quiz')
  const [qd, setQd] = useState(quizDraft)
  const setQuizDraft = (patch: Partial<typeof quizDraft>) => setQd((v) => (quizDraft = { ...v, ...patch }))
  const [qs, setQs] = useState(quizMemo)
  const quizPreview = useRef<HTMLCanvasElement>(null)
  const [charting, setCharting] = useState(start === 'data')
  const [dd, setDd] = useState(dataDraft)
  const setDataDraft = (patch: Partial<typeof dataDraft>) => setDd((v) => (dataDraft = { ...v, ...patch }))
  const [ds, setDs] = useState(dataMemo)
  const dataPreview = useRef<HTMLCanvasElement>(null)
  const [reading, setReading] = useState(start === 'article')
  const [art, setArt] = useState(articleDraft)
  const setArticle = (patch: Partial<typeof articleDraft>) => setArt((v) => (articleDraft = { ...v, ...patch }))
  const csvInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const textInput = useRef<HTMLInputElement>(null)
  const textFor = useRef<(text: string) => void>(() => {})
  const coverInput = useRef<HTMLInputElement>(null)
  const swapInput = useRef<HTMLInputElement>(null)
  const swapFor = useRef<string | null>(null)
  const [swapping, setSwapping] = useState<string | null>(null) // the chapter whose picture is being chosen
  const preview = useRef<HTMLCanvasElement>(null)
  const setDraft = (patch: Partial<typeof mapDraft>) => setMd((v) => (mapDraft = { ...v, ...patch }))
  const fileInput = useRef<HTMLInputElement>(null)
  const trackInput = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<SceneOptions>) => setO((v) => (memo = { ...v, ...patch }))

  useEffect(() => { if (start === 'files') fileInput.current?.click() }, [start])

  // ---- Local AI (the user's own Ollama model): shorten text, write quiz questions
  const ai = localAI()
  const [aiUndo, setAiUndo] = useState<{ box: 'script' | 'article' | 'quiz'; text: string } | null>(null)
  const askAI = async (fn: () => Promise<void>) => {
    setError(null); setNote(null)
    setBusy({ label: `${t('Local AI is writing…')} (${ai?.model})`, p: -1 })
    try { await fn() } catch (e) { setError(t((e as Error).message)) } finally { setBusy(null) }
  }
  const withoutPictures = (s: string) => s.split('\n').filter((l) => !/^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(l)).join('\n')
  const aiKeyPoints = (box: 'script' | 'article') => askAI(async () => {
    const before = box === 'script' ? script : art.text
    const out = box === 'script' ? await keyPoints(before) : await articleKeyPoints(before)
    if (box === 'script') setScript(draft = out)
    else setArticle({ text: out, length: 'full' }) // already short; don't cut it again
    setAiUndo({ box, text: before })
    setNote(t('Local AI shortened the text into key points. Check it, then make scenes.'))
  })
  const aiQuiz = (from: string, box: 'script' | 'article' | 'quiz') => askAI(async () => {
    const mode = box === 'quiz' || quizModeSet ? qs.mode : 'quiz'
    const out = await makeQuiz(withoutPictures(from), mode)
    if (box === 'quiz') setAiUndo({ box, text: qd.text })
    setQuizDraft({ tab: 'text' })
    writeQuiz(out)
    setQuizzing(true)
    setNote(`${parseQuiz(out).items.length} ${t('questions written by Local AI. Check the answers before making the video.')}`)
  })
  const undoAI = () => {
    if (!aiUndo) return
    if (aiUndo.box === 'script') setScript(draft = aiUndo.text)
    else if (aiUndo.box === 'article') setArticle({ text: aiUndo.text })
    else writeQuiz(aiUndo.text)
    setAiUndo(null); setNote(null)
  }
  const aiTools = (box: 'script' | 'article' | 'quiz', text: string) => ai && (
    <div className="ai-tools">
      <span className="small muted">✦ {t('Local AI')}:</span>
      {box !== 'quiz' && <button className="btn small" disabled={!!busy || !text.trim()} onClick={() => aiKeyPoints(box)}>{t('Summarize to key points')}</button>}
      <button className="btn small" disabled={!!busy || !text.trim()} onClick={() => aiQuiz(text, box)}>{t(box === 'quiz' ? 'Write questions from this text' : 'Make quiz from this text')}</button>
      {aiUndo?.box === box && <button className="btn small ghost" disabled={!!busy} onClick={undoAI}>{t('Undo')}</button>}
    </div>
  )
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
      const made = await dress(await textScenes(script))
      const got = made.scenes
      setScenes((s) => [...s, ...got])
      setPasting(false)
      setScript(draft = '')
      // the card already shows the words, so no captions (except on the user's pictures); a voice reads them in the text's language
      const lang = hasDeva(got.map((s) => s.text).join(' ')) ? 'hi' : 'en'
      if (!scenes.length) set({ voice: o.voice === 'none' && VOICES[lang] ? 'ai' : o.voice, lang: VOICES[lang] ? lang : o.lang, captions: made.dressed > 0 })
    } catch (e) { setError(t((e as Error).message)) } finally { setBusy(null) }
  }

  /** Puts the user's pictures on the card scenes just made, and says how it went. */
  const dress = async (got: Scene[]) => {
    if (!matDraft.pics.length) return { scenes: got, dressed: 0 }
    setBusy({ label: localAI() ? `${t('Matching pictures to scenes…')} (${localAI()?.model})` : t('Matching pictures to scenes…'), p: -1 })
    const made = await dressScenes(got, matDraft.pics, matDraft.leftover)
    const cards = got.filter((s) => s.card).length
    const parts = [`${made.dressed}/${cards} ${t('text scenes show your pictures')}`]
    if (made.matched) parts.push(`${made.matched} ${t(made.byAI ? 'matched by Local AI to what is said' : 'matched to what is said')}`)
    setNote(`${parts.join(' · ')}. ${t('Tap a picture to change it.')}`)
    return made
  }

  const setTheme = async (theme: string) => {
    set({ theme })
    if (scenes.some((s) => s.audio)) { await redrawAudio(theme, o.wave); return }
    const cards = scenes.filter((s) => (s.card && !s.own) || s.art)
    if (!cards.length) return
    const { w, h } = frame()
    setBusy({ label: t('Making scenes…'), p: 0 })
    try {
      const images = new Map<string, Blob>()
      for (let i = 0; i < cards.length; i++) {
        setBusy({ label: t('Making scenes…'), p: i / cards.length })
        const c = cards[i]
        images.set(c.id, c.art ? await drawArticlePic(c.art, themeOf(theme), w, h) : await drawTextCard(c.card!, themeOf(theme), w, h))
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
    } catch (e) { setError(t((e as Error).message)) } finally { setBusy(null) }
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
      // long recordings are read ten minutes at a time instead of unpacked whole
      const pcm = await decodeMono(src.file, 16000, src.duration, (p) => setBusy({ label: t('Reading the audio…'), p: p * 0.5 }))
      if (!pcm) throw new Error(t(isLong(src.duration, src.file.size) ? TOO_BIG : 'This audio could not be read'))
      setBusy({ label: t('Finding pauses…'), p: 0.5 })
      primeWave(src.id, await analyse(pcm)) // the waveform layer will use this analysis
      const gaps = findGaps(pcm)
      let cues: Awaited<ReturnType<typeof transcribeSamples>> = []
      if (ad.listen) {
        try {
          // a long recording is listened to ten minutes at a time, cut in a pause, so only one piece is copied at once
          const pieces = listenPieces(pcm.length, gaps)
          for (let i = 0; i < pieces.length; i++) {
            const [a, b] = pieces[i]
            const got = await transcribeSamples(pcm.slice(a, b), { model: ad.model, language: ad.lang, toEnglish: false }, (stage, p) =>
              setBusy({ label: stage === 'download' ? t('Downloading AI model (first time only)') : t('Listening to the audio…'), p: (i + p) / pieces.length }))
            const off = a / 16000
            cues.push(...got.map((c) => ({ ...c, start: c.start + off, end: c.end + off })))
          }
          if (!cues.length) setNote(t('No speech was found, so there are no captions. Scenes are cut at the pauses.'))
        } catch (e) {
          const msg = (e as Error).message
          const why = /fetch|network|load/i.test(msg) ? t('The speech model needs internet the first time.') : msg
          setNote(`${t('Captions could not be made')}: ${why} ${t('Scenes are cut at the pauses.')}`)
        }
      }
      const { w, h } = frame()
      const made = await audioToScenes({
        duration: src.duration, gaps, cues, target: ad.target, title: ad.title.trim() || src.name, look: ad.look,
        pics: mat.pics, leftover: mat.leftover, cover: ad.cover, theme: themeOf(o.theme), wave: o.wave, W: w, H: h, points: localAI() ? chapterPoints : undefined,
        progress: (p) => setBusy({ label: ad.look === 'photos' && localAI() ? `${t('Matching pictures to chapters…')} (${localAI()?.model})` : t('Making scenes…'), p }),
      })
      const got = made.scenes
      // the audio is one track under all chapters, so it replaces whatever scenes were there
      setScenes(got)
      setTrack(src)
      setListening(false)
      const shown = got.filter((s) => s.audio?.look === 'photos').length
      const look = shown ? 'photos' : got[0]?.audio?.look ?? 'card'
      const [waveColor, waveColor2] = waveColors(look, o.theme)
      // slides are kept whole; photos fill the frame
      const fill = shown > 0 && !mat.pics.some((p) => p.slide)
      set({ voice: 'track', captions: cues.length > 0, transition: 'fade', transitionDuration: 0.5, kenBurns: look !== 'card', fill, waveColor, waveColor2 })
      if (ad.look === 'photos' && mat.pics.length) {
        const parts = [`${shown}/${got.length} ${t('chapters show your pictures')}`]
        if (made.matched) parts.push(`${made.matched} ${t(made.byAI ? 'matched by Local AI to what is said' : 'matched to what is said')}`)
        if (got.length - shown) parts.push(`${got.length - shown} ${t('got a title card')}`)
        if (made.unused) parts.push(`${made.unused} ${t('pictures were not needed')}`)
        setNote(`${parts.join(' · ')}. ${t('Tap a picture to change it.')}`)
      }
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  /** Adds slides, photos, GIFs or clips to the pictures the scenes can use. */
  const addPics = async (files: File[]) => {
    if (!files.length) return []
    setError(null)
    setBusy({ label: t('Reading files…'), p: 0 })
    try {
      const got = await picsFromFiles(files, (label, p) => setBusy({ label, p }))
      setMat({ pics: [...matDraft.pics, ...got] })
      if (audioDraft.look === 'card') setAudio({ look: 'photos' })
      return got
    } catch (e) { setError(t((e as Error).message)); return [] } finally { setBusy(null) }
  }

  /** A file dropped in one of the extra material boxes. */
  const addMaterial = async (kind: AuxKind, files: File[]) => {
    if (kind !== 'music') { await addPics(files); return }
    setError(null)
    try {
      const src = await loadSource(files[0], files[0].name)
      if (src.kind !== 'audio' && src.kind !== 'video') throw new Error(t('Pick an audio file'))
      setMat({ music: src })
    } catch (e) { setError((e as Error).message) }
  }

  /** Shows one of the pictures on a chapter instead, or a title card when `pic` is null. */
  const choosePicture = async (id: string, pic: Pic | null) => {
    setSwapping(null)
    const s = scenes.find((x) => x.id === id)
    if (s?.card && !s.audio) {
      // a text scene: the picture instead of its card, or the card again
      if (pic) { update(id, { image: pic.image, media: pic.media, own: pic.id }); if (!o.captions) set({ captions: true }); return }
      const { w, h } = frame()
      update(id, { image: await drawTextCard(s.card, themeOf(o.theme), w, h), media: undefined, own: undefined })
      return
    }
    if (!s?.audio) return
    if (pic) { update(id, { image: pic.image, media: pic.media, audio: { ...s.audio, look: 'photos', pic: pic.id } }); return }
    const { w, h } = frame()
    const image = await drawAudioCard({ title: s.audio.title, sub: s.audio.sub, theme: themeOf(o.theme), cover: null, wave: o.wave, W: w, H: h })
    update(id, { image, media: undefined, audio: { ...s.audio, look: 'card', pic: undefined } })
  }

  const swapPicture = async (files: File[]) => {
    const id = swapFor.current
    if (!files.length || !id) return
    const got = await addPics(files)
    if (got[0]) await choosePicture(id, got[0])
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

  // ---- article link → video

  const getArticle = async (raw = art.url) => {
    const url = linkOf(raw)
    if (!url) { setError(t('Type or paste the link of an article, starting with https://')); return }
    setError(null); setNote(null)
    setBusy({ label: t('Opening the article…'), p: 0.3 })
    try {
      const a = await readArticle(url)
      setArticle({ url, text: a.text, info: `${a.title} · ${a.words} ${t('words')} · ${a.pictures} ${t('pictures')}` })
    } catch (e) {
      const msg = (e as Error).message
      setError(t(msg === CANT_OPEN ? CANT_OPEN : msg))
    } finally { setBusy(null) }
  }

  const addArticle = async () => {
    // a link pasted into the text box is opened instead
    if (linkOf(art.text) && !art.text.includes('\n')) { setArticle({ url: art.text.trim(), text: '' }); void getArticle(art.text); return }
    setError(null); setNote(null)
    let missed = 0
    try {
      const { w, h } = frame()
      const made = await dress(await articleToScenes(art.text, { length: art.length, pictures: art.pictures }, themeOf(o.theme), w, h,
        (p) => setBusy({ label: t('Making scenes…'), p }), (ok) => { if (!ok) missed++ }))
      const got = made.scenes
      setScenes((s) => [...s, ...got])
      setReading(false)
      if (missed) setNote((n) => `${n ? `${n} ` : ''}${missed} ${t('pictures could not be downloaded and were left out.')}`)
      // the cards show the words, so no captions; a voice reads them in the article's language
      const lang = hasDeva(got.map((s) => s.text).join(' ')) ? 'hi' : 'en'
      if (!scenes.length) set({ voice: o.voice === 'none' && VOICES[lang] ? 'ai' : o.voice === 'track' ? 'none' : o.voice, lang: VOICES[lang] ? lang : o.lang, captions: made.dressed > 0, transition: 'fade', transitionDuration: 0.5, kenBurns: false, fill: false })
    } catch (e) { setError(t((e as Error).message)) } finally { setBusy(null) }
  }

  // ---- quiz / flashcards → video

  const currentDeck = useMemo((): QuizDeck => (qd.tab === 'text' ? parseQuiz(qd.text) : tidyDeck(qd.deck)), [qd.tab, qd.text, qd.deck])

  const writeQuiz = (text: string) => {
    setQuizDraft({ text })
    // plain question / answer pairs read best as flashcards, until the user picks a mode
    const d = parseQuiz(text)
    if (!quizModeSet && d.items.length) {
      const mode = d.items.some((i) => i.options.length) ? 'quiz' : 'cards'
      if (mode !== qs.mode) setQs((v) => (quizMemo = { ...v, mode }))
    }
  }

  const switchQuizTab = (tab: 'text' | 'list') => {
    if (tab === qd.tab) return
    if (tab === 'list') {
      const d = parseQuiz(qd.text)
      setQuizDraft({ tab, deck: d.items.length ? d : { title: d.title, items: [item('', qs.mode === 'quiz' ? ['', '', '', ''] : [])] }, picked: 0 })
    } else setQuizDraft({ tab, text: currentDeck.items.length || currentDeck.title ? quizToText(currentDeck) : qd.text })
  }

  // live preview of the question being written, with its answer showing
  useEffect(() => {
    const c = quizPreview.current
    if (!c || !quizzing || !currentDeck.items.length) return
    let live = true
    const id = setTimeout(() => {
      const { w, h } = frame()
      const off = document.createElement('canvas')
      off.width = 480; off.height = Math.round((480 * h) / w)
      const index = Math.min(qd.picked, currentDeck.items.length - 1)
      const scene: QuizScene = { deck: currentDeck, settings: qs, part: { kind: 'item', index }, say2: '' }
      void drawQuizPreview(scene, off, 'answer').then(() => {
        if (!live) return
        c.width = off.width; c.height = off.height
        c.getContext('2d')!.drawImage(off, 0, 0)
      })
    }, 150)
    return () => { live = false; clearTimeout(id) }
  }, [currentDeck, qs, qd.picked, quizzing]) // eslint-disable-line react-hooks/exhaustive-deps

  const addQuiz = async () => {
    setError(null)
    try {
      const { w, h } = frame()
      const got = await quizToScenes(currentDeck, qs, w, h, (p) => setBusy({ label: t('Making scenes…'), p }))
      setScenes((list) => withQuiz(list, got))
      setQuizzing(false)
      // the questions are on screen already, so no captions; a voice reads them in the quiz's language
      const lang = deckLang(currentDeck)
      if (!scenes.some((s) => !s.quiz)) {
        set({ voice: o.voice === 'none' && VOICES[lang] ? 'ai' : o.voice === 'track' ? 'none' : o.voice, lang: VOICES[lang] ? lang : o.lang, captions: false, transition: 'fade', transitionDuration: 0.4, kenBurns: false, fill: false })
      }
    } catch (e) { setError(t((e as Error).message)) } finally { setBusy(null) }
  }

  // a new look redraws the quiz scenes already made; a new mode or ending makes them again
  const setQuizSettings = async (patch: Partial<QuizSettings>) => {
    if ('mode' in patch) quizModeSet = true
    const next = quizMemo = { ...qs, ...patch }
    setQs(next)
    const made = scenes.filter((s) => s.quiz)
    if (!made.length) return
    const deck = made[0].quiz!.deck
    const { w, h } = frame()
    setBusy({ label: t('Making scenes…'), p: 0 })
    try {
      if ('mode' in patch || 'recap' in patch || 'explain' in patch) {
        const got = await quizToScenes(deck, next, w, h, (p) => setBusy({ label: t('Making scenes…'), p }))
        setScenes((list) => withQuiz(list, got))
        return
      }
      const done = new Map<string, Partial<Scene>>()
      for (let i = 0; i < made.length; i++) {
        setBusy({ label: t('Making scenes…'), p: i / made.length })
        const quiz = { ...made[i].quiz!, settings: next }
        done.set(made[i].id, { quiz, image: await drawQuizStill(quiz, w, h) })
      }
      setScenes((list) => list.map((s) => (done.has(s.id) ? { ...s, ...done.get(s.id) } : s)))
    } finally { setBusy(null) }
  }

  // ---- data table → chart video

  const currentDoc = useMemo((): DataDoc => (dd.tab === 'text' ? parseData(dd.text) : tidyDoc(dd.doc)), [dd.tab, dd.text, dd.doc])

  const switchDataTab = (tab: 'text' | 'grid') => {
    if (tab === dd.tab) return
    if (tab === 'grid') {
      const d = parseData(dd.text)
      setDataDraft({ tab, doc: d.tables.length ? d : dataDraft.doc, picked: 0 })
    } else setDataDraft({ tab, text: currentDoc.tables.length ? dataToText(currentDoc) : dd.text })
  }

  // live preview of the chart being written
  useEffect(() => {
    const c = dataPreview.current
    if (!c || !charting || !currentDoc.tables.length) return
    let live = true
    const id = setTimeout(() => {
      const { w, h } = frame()
      const off = document.createElement('canvas')
      off.width = 480; off.height = Math.round((480 * h) / w)
      const tb = currentDoc.tables[Math.min(dd.picked, currentDoc.tables.length - 1)]
      void drawDataPreview(tb, ds, off).then(() => {
        if (!live) return
        c.width = off.width; c.height = off.height
        c.getContext('2d')!.drawImage(off, 0, 0)
      })
    }, 150)
    return () => { live = false; clearTimeout(id) }
  }, [currentDoc, ds, dd.picked, charting]) // eslint-disable-line react-hooks/exhaustive-deps

  const addData = async () => {
    setError(null)
    try {
      const { w, h } = frame()
      const got = await dataToScenes(currentDoc, ds, w, h, (p) => setBusy({ label: t('Making scenes…'), p }))
      setScenes((list) => withData(list, got))
      setCharting(false)
      // the numbers are on screen already, so no captions; each scene follows on from the last, so cuts
      const lang = docLang(currentDoc)
      if (!scenes.some((s) => !s.data)) {
        set({ voice: o.voice === 'none' && VOICES[lang] ? 'ai' : o.voice === 'track' ? 'none' : o.voice, lang: VOICES[lang] ? lang : o.lang, captions: false, transition: null, kenBurns: false, fill: false })
      }
    } catch (e) { setError(t((e as Error).message)) } finally { setBusy(null) }
  }

  // a new look redraws the chart scenes already made; anything else makes them again
  const setDataSettings = async (patch: Partial<DataSettings>) => {
    const next = dataMemo = { ...ds, ...patch }
    setDs(next)
    const made = scenes.filter((s) => s.data)
    if (!made.length) return
    const { w, h } = frame()
    setBusy({ label: t('Making scenes…'), p: 0 })
    try {
      if (!('theme' in patch)) {
        // the tables as they were written (a sorted copy keeps the same ids)
        const seen = new Set<string>()
        const tables = made.map((s) => s.data!.table).filter((x) => !seen.has(x.id) && seen.add(x.id))
        const source = new Map(currentDoc.tables.map((x) => [x.id, x]))
        const got = await dataToScenes({ tables: tables.map((x) => source.get(x.id) ?? x) }, next, w, h, (p) => setBusy({ label: t('Making scenes…'), p }))
        setScenes((list) => withData(list, got))
        return
      }
      const done = new Map<string, Partial<Scene>>()
      for (let i = 0; i < made.length; i++) {
        setBusy({ label: t('Making scenes…'), p: i / made.length })
        const data = { ...made[i].data!, settings: next }
        done.set(made[i].id, { data, image: await drawDataStill(data, w, h) })
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
      voice2: speaking && scene.quiz?.say2.trim() ? ({ duration: scene.quiz.say2.length / 14 } as MediaSource) : null,
    }))
    return sceneLengths(fake, o, o.voice === 'track' ? track : null).reduce((a, b) => a + b, 0)
  }, [scenes, o, track, speaking])

  // ---- how much of the video the user's own material fills, counted per scene

  const meter = useMemo((): { box: 'script' | 'article' | 'audio' | 'made'; parts: Part[]; estimate: boolean; known: boolean; rest: string } | null => {
    const repeat = mat.leftover === 'repeat' && mat.pics.length > 0
    const cards = t(repeat ? 'your pictures repeat on them.' : 'the editor makes text cards with their words.')
    const secs = (text: string, s?: Scene) => (speaking && text.trim() ? text.length / 14 + 0.9 : Math.max(o.seconds, s ? readingTime(s) : 0))
    const short = (x: string) => (x.length > 40 ? x.slice(0, 40).replace(/\s+\S*$/, '') + '…' : x)
    if (pasting && script.trim()) {
      const ps = parseScript(script)
      const plan = livePlan(ps.map((x) => x.script), mat.pics)
      const parts = ps.map((x, i) => ({ name: short(x.card.title || x.card.lines[0] || ''), seconds: secs(x.script, { card: x.card } as Scene), covered: plan[i] != null }))
      return { box: 'script', parts, estimate: true, known: true, rest: cards }
    }
    if (reading && art.text.trim() && !(linkOf(art.text) && !art.text.includes('\n'))) {
      const ps = articleParts(art.text, art)
      // the user's pictures go on text cards; the article's own pictures count as given material
      const free = ps.map((x, i) => (x.kind === 'card' ? i : -1)).filter((i) => i >= 0)
      const plan = livePlan(free.map((i) => ps[i].text), mat.pics)
      const parts = ps.map((x, i) => ({ name: x.name, seconds: secs(x.text), covered: x.kind === 'picture' || plan[free.indexOf(i)] != null }))
      return { box: 'article', parts, estimate: true, known: true, rest: cards }
    }
    if (listening && ad.src && ad.look !== 'cover') {
      // chapters are only known after listening; until then, about one every few seconds, pictures spread over them
      const n = Math.max(1, Math.round(ad.src.duration / ad.target))
      const plan = fillInOrder(Array(n).fill(null), ad.look === 'photos' ? Math.min(mat.pics.length, n) : 0, 'card')
      const parts = plan.map((x, i) => ({ name: `${t('Chapter')} ${i + 1}`, seconds: ad.src!.duration / n, covered: x != null }))
      const rest = repeat ? cards : t(localAI() ? 'the editor makes title cards and Local AI writes their key points.' : 'the editor makes title cards with what is said.')
      return { box: 'audio', parts, estimate: true, known: false, rest }
    }
    const made = scenes.filter((s) => !s.mind && !s.quiz && !s.data)
    if (!made.some((s) => s.card || s.art || (s.audio && s.audio.look !== 'cover'))) return null
    const parts = made.map((s) => ({ name: s.name, seconds: s.duration ?? secs(s.text, s), covered: isOwn(s) }))
    const rest = made.some((s) => s.audio) ? t(localAI() ? 'title cards with key points by Local AI.' : 'title cards with what is said.') : t('text cards with their words.')
    return { box: 'made', parts, estimate: false, known: true, rest: `${t('the editor made')} ${rest}` }
  }, [pasting, script, reading, art, listening, ad.src, ad.look, ad.target, mat, scenes, speaking, o.seconds]) // eslint-disable-line react-hooks/exhaustive-deps

  const meterFor = (box: 'script' | 'article' | 'audio' | 'made') => meter?.box === box && <CoverageMeter {...meter} />

  /** The boxes for extra material, shared by every mode that can show the user's pictures. */
  const material = (box: 'script' | 'article' | 'audio', mode: 'text' | 'article' | 'audio') => (
    <>
      <Step n={2} title="Extra material" hint="optional: what you don't give, the editor makes" />
      <AuxBoxes kinds={auxFor(mode)} pics={mat.pics} music={mat.music} busy={!!busy}
        onAdd={(kind, files) => void addMaterial(kind, files)} onRemove={(id) => setMat({ pics: mat.pics.filter((x) => x.id !== id) })}
        onRemoveMusic={() => setMat({ music: null })} onClear={() => setMat({ pics: [] })}>
        {mat.pics.length > 0 && (
          <>
            <span className="field-label">{t('Scenes with no picture')}</span>
            <Chips options={[{ value: 'card', label: 'Editor makes a card' }, { value: 'repeat', label: 'Repeat my pictures' }]}
              value={mat.leftover} onChange={(leftover) => setMat({ leftover })} />
          </>
        )}
        {meterFor(box)}
      </AuxBoxes>
    </>
  )

  /** The pictures a scene can show instead: its drawn card, one of the user's pictures, or a file from the device. */
  const swapPool = (s: Scene) => swapping === s.id && (
    <div className="pic-pool pick">
      <button className="pic card-choice" disabled={!!busy} onClick={() => void choosePicture(s.id, null)}>{t(s.audio ? 'Title card' : 'Text card')}</button>
      {mat.pics.map((p) => (
        <button className={`pic${(s.audio ? s.audio.pic : s.own) === p.id ? ' on' : ''}`} key={p.id} disabled={!!busy} title={p.words || p.name} onClick={() => void choosePicture(s.id, p)}>
          <Thumb blob={p.image} moving={p.media} />
        </button>
      ))}
      <button className="pic card-choice" disabled={!!busy} onClick={() => swapInput.current?.click()}>{t('From device…')}</button>
    </div>
  )

  /** Opens a text file into a box: the main file of the script, mind map and quiz modes. */
  const openText = (into: (text: string) => void) => { textFor.current = into; textInput.current?.click() }

  const create = async () => {
    setError(null)
    try {
      const built: BuiltScene[] = []
      const loaded = new Map<Blob, MediaSource>()
      for (let i = 0; i < scenes.length; i++) {
        setBusy({ label: t('Adding scenes…'), p: i / scenes.length })
        const s = scenes[i]
        if (s.mind || s.quiz || s.data || s.media) { built.push({ scene: s, source: null as unknown as MediaSource, voice: null }); continue } // made below, once its length is known
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
        // quiz answers are read in the same go, after the questions
        const bufs = await speakLines([...scenes.map((s) => s.text), ...scenes.map((s) => s.quiz?.say2 ?? '')], o.lang, (stage, p) =>
          setBusy({ label: stage === 'download' ? t('Downloading AI model (first time only)') : t('Recording voice-over…'), p }))
        for (let k = 0; k < bufs.length; k++) {
          const b = bufs[k]
          if (!b) continue
          const i = k % scenes.length
          const second = k >= scenes.length
          const src = await loadSource(encodeWav(b), `${scenes[i].name} ${t(second ? 'Answer' : 'Voice-over')}.wav`)
          ed.addSource(src)
          await saveMedia(src)
          if (second) built[i].voice2 = src
          else built[i].voice = src
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
      const quizzes = built.filter((b) => b.scene.quiz)
      if (quizzes.length) {
        // each quiz scene becomes a clip as long as its scene, starting after the incoming transition
        const lens = sceneLengths(built, o, o.voice === 'track' ? track : null)
        const trs = transitionLengths(lens, o)
        const last = ed.project.clips[ed.project.clips.length - 1]
        const firstIn = last?.transition ? Math.max(0, Math.min(last.transition.duration, clipDuration(last) / 2, (lens[0] + trs[0]) / 2)) : 0
        const sounds = new Map<number, MediaSource>()
        const { w, h } = frame()
        for (let k = 0; k < quizzes.length; k++) {
          setBusy({ label: t('Animating the quiz…'), p: k / quizzes.length })
          const b = quizzes[k]
          const i = built.indexOf(b)
          const q = b.scene.quiz!
          const plan = planOf(b)!
          const offset = i === 0 ? firstIn : trs[i - 1]
          const video = await renderQuizVideo(q, plan, w, h, offset + lens[i] + trs[i] + QUIZ_SLACK, offset).catch(() => null)
          const src = video
            ? await loadSource(video.blob, `${b.scene.name}.${video.ext}`)
            : await loadSource(b.scene.image, `${b.scene.name}.png`)
          ed.addSource(src)
          await saveMedia(src)
          b.source = src
          if (q.settings.beep && q.part.kind === 'item') {
            let sfx = sounds.get(q.settings.timer)
            if (!sfx) {
              sfx = await loadSource(encodeWav(countdownSound(q.settings.timer)), `${t('Countdown')} ${q.settings.timer}s.wav`)
              ed.addSource(sfx)
              await saveMedia(sfx)
              sounds.set(q.settings.timer, sfx)
            }
            b.sfx = sfx
          }
        }
      }
      const charts = built.filter((b) => b.scene.data)
      if (charts.length) {
        // each chart scene becomes a clip as long as its scene, its rows coming in with the voice
        const lens = sceneLengths(built, o, o.voice === 'track' ? track : null)
        const trs = transitionLengths(lens, o)
        const last = ed.project.clips[ed.project.clips.length - 1]
        const firstIn = last?.transition ? Math.max(0, Math.min(last.transition.duration, clipDuration(last) / 2, (lens[0] + trs[0]) / 2)) : 0
        const { w, h } = frame()
        for (let k = 0; k < charts.length; k++) {
          setBusy({ label: t('Animating the chart…'), p: k / charts.length })
          const b = charts[k]
          const i = built.indexOf(b)
          const d = b.scene.data!
          const plan = dataPlan(d, o.voice === 'ai' ? b.voice?.duration ?? 0 : 0)
          const offset = i === 0 ? firstIn : trs[i - 1]
          const video = await renderDataVideo(d, plan, w, h, offset + lens[i] + trs[i] + QUIZ_SLACK, offset).catch(() => null)
          const src = video
            ? await loadSource(video.blob, `${b.scene.name}.${video.ext}`)
            : await loadSource(b.scene.image, `${b.scene.name}.png`)
          ed.addSource(src)
          await saveMedia(src)
          b.source = src
        }
      }
      const moving = built.filter((b) => b.scene.media)
      if (moving.length) {
        // GIFs and video clips play through their scene, looped when it is longer than they are
        const lens = sceneLengths(built, o, o.voice === 'track' ? track : null)
        const trs = transitionLengths(lens, o)
        const { w, h } = frame()
        for (let k = 0; k < moving.length; k++) {
          setBusy({ label: t('Preparing GIFs and clips…'), p: k / moving.length })
          const b = moving[k]
          const i = built.indexOf(b)
          const clip = await movingClip(b.scene.media!, lens[i] + trs[i], w, h)
          const src = clip
            ? await loadSource(clip.blob, `${b.scene.name}.${clip.ext}`)
            : await loadSource(b.scene.image, `${b.scene.name}.${extOf(b.scene.image)}`)
          ed.addSource(src)
          await saveMedia(src)
          b.source = src
        }
      }
      if (o.voice === 'track' && track) { ed.addSource(track); await saveMedia(track) }
      const music = mat.music
      if (music) { ed.addSource(music); await saveMedia(music) }
      const { w, h } = frame()
      ed.replaceProject(placeScenes(ed.project, built, o, o.voice === 'track' ? track : null, w / h, music))
      onDone(`${built.length} ${t('scenes added to the timeline. Everything can be edited there.')}`)
    } catch (e) {
      setError((e as Error).message)
    } finally { setBusy(null) }
  }

  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet scene-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h2>{t(start === 'article' ? 'Article to video' : start === 'data' ? 'Data to video' : start === 'quiz' ? 'Quiz to video' : start === 'audio' ? 'Audio to video' : start === 'mindmap' ? 'Mind map to video' : start === 'text' ? 'Script to video' : 'Slides to video')} {scenes.length > 0 && <span className="muted small">{scenes.length} {t('scenes')} · ~{fmtTime(estimate)}</span>}</h2>
        <p className="muted small">{t(start === 'article'
          ? 'Paste the link of a blog post or news article. Its headline, sections and pictures become scenes, read by the voice.'
          : start === 'data'
          ? 'Paste a table from a spreadsheet, CSV, or lines like "Delhi: 42". It becomes a chart whose bars, points or rows come in one by one with the voice.'
          : start === 'quiz'
          ? 'Write or paste questions with options, or flashcards. Each one gets a countdown, then the right answer is shown.'
          : start === 'audio'
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
          <button className={`btn${quizzing ? ' on' : ''}`} disabled={!!busy} onClick={() => setQuizzing((v) => !v)}>{t('Quiz')}</button>
          <button className={`btn${charting ? ' on' : ''}`} disabled={!!busy} onClick={() => setCharting((v) => !v)}>{t('Data')}</button>
          <button className={`btn${reading ? ' on' : ''}`} disabled={!!busy} onClick={() => setReading((v) => !v)}>{t('Article')}</button>
          {scenes.length > 0 && <button className="btn" disabled={!!busy} onClick={() => setScenes([])}>{t('Clear')}</button>}
        </div>

        {pasting && (
          <div className="script-box">
            <Step n={1} title="Script" hint="paste it, or open a text file" />
            <div className="row"><button className="btn small" disabled={!!busy} onClick={() => openText((text) => setScript(draft = text))}>{t('Open file')} (.txt, .md)</button></div>
            <textarea className="text-input" rows={9} value={script} placeholder={SCRIPT_HINT} autoFocus
              onChange={(e) => setScript(draft = e.target.value)} />
            <p className="muted small">{t('Tip: a short line on its own is a heading, lines starting with - are points, a blank line starts a new scene.')}</p>
            {aiTools('script', script)}
            {material('script', 'text')}
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
                <p className="muted small">{t('Tip: the first line is the topic, lines starting with - are branches, indent a line to put it under the one above.')}{' '}
                  <button className="btn small ghost" onClick={() => openText((outline) => setDraft({ outline }))}>{t('Open file')}</button></p>
              </>
            ) : <MindTree map={md.tree} onChange={(tree) => setDraft({ tree })} />}
            {currentMap && <canvas ref={preview} className="mind-preview" />}
            <Toggle label="Show the whole map at the end" value={md.overview} onChange={(overview) => setDraft({ overview })} />
            <button className="btn primary" disabled={!!busy || !currentMap} onClick={addMap}>{t('Make scenes')}</button>
          </div>
        )}

        {listening && (
          <div className="script-box audio-box">
            <Step n={1} title="Audio" hint="a podcast, talk or voice note" />
            <div className="row">
              <button className="btn" disabled={!!busy || !!rec} onClick={() => audioInput.current?.click()}>{t(ad.src ? 'Change audio' : 'Pick audio')}</button>
              <button className={`btn${rec ? ' on rec' : ''}`} disabled={!!busy} onClick={record}>
                {rec ? `■ ${t('Stop')} ${fmtTime((rec.now - rec.t0) / 1000)}` : `● ${t('Record')}`}
              </button>
            </div>
            {ad.src && <p className="small">♪ {ad.src.name} · {fmtTime(ad.src.duration)}</p>}
            {ad.src && ad.src.duration > 30 * 60 && <p className="muted small">{t('Long audio: it is read in parts, so making the scenes and captions takes a while. Keep the app open. On a phone, recordings under 30 minutes are safest.')}</p>}
            {material('audio', 'audio')}
            {ad.src && (
              <>
                <Step n={3} title="Settings" />
                <label className="field-label" htmlFor="audio-title">{t('Title')}</label>
                <input id="audio-title" className="text-input" value={ad.title} onChange={(e) => setAudio({ title: e.target.value })} />
                <span className="field-label">{t('Picture')}</span>
                <Chips options={[{ value: 'card', label: 'Title card' }, { value: 'photos', label: 'My pictures' }, { value: 'cover', label: 'Cover image' }]}
                  value={ad.look} onChange={(look) => {
                    setAudio({ look })
                    if (look === 'photos' && !mat.pics.length) photoInput.current?.click()
                    if (look === 'cover' && !ad.cover) coverInput.current?.click()
                  }} />
                {ad.look === 'photos' && !mat.pics.length && <p className="muted small">{t('Add slides, photos, GIFs or clips below. Each chapter gets the one that matches what is said, otherwise the next in order.')}</p>}
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
              </>
            )}
            {ad.src && <button className="btn primary" disabled={!!busy || !!rec} onClick={addAudio}>{t('Make scenes')}</button>}
          </div>
        )}

        {quizzing && (
          <div className="script-box quiz-box">
            <Chips options={[{ value: 'text', label: 'Write or paste' }, { value: 'list', label: 'Edit list' }]} value={qd.tab} onChange={switchQuizTab} />
            {qd.tab === 'text' ? (
              <>
                <textarea className="text-input" rows={10} value={qd.text} placeholder={QUIZ_HINT} autoFocus
                  onChange={(e) => writeQuiz(e.target.value)} />
                <p className="muted small">{t('Tip: start each question with Q:, put options on lines like A) B) C) and mark the right one with *, or add a line "Answer: B". For flashcards write Q: and A: lines, or front | back on one line.')}{' '}
                  <button className="btn small ghost" onClick={() => openText(writeQuiz)}>{t('Open file')}</button></p>
                {ai && <p className="muted small">{t('Or paste notes or a chapter and let Local AI write the questions.')}</p>}
                {aiTools('quiz', qd.text)}
              </>
            ) : <QuizEditor deck={qd.deck} mode={qs.mode} onChange={(deck) => setQuizDraft({ deck })} onPick={(picked) => setQuizDraft({ picked })} />}
            {currentDeck.items.length > 0 && (
              <>
                <p className="muted small">{currentDeck.items.length} {t(qs.mode === 'cards' ? 'cards' : 'questions')}
                  {currentDeck.items.some((i) => !i.options.length && !i.answer) || currentDeck.items.some((i) => i.options.length && i.correct < 0 && !i.answer)
                    ? ` · ${t('some have no answer yet')}` : ''}</p>
                <canvas ref={quizPreview} className="mind-preview" />
              </>
            )}
            <button className="btn primary" disabled={!!busy || !currentDeck.items.length} onClick={addQuiz}>{t('Make scenes')}</button>
          </div>
        )}

        {(quizzing || scenes.some((s) => s.quiz)) && (
          <>
            <Chips options={[{ value: 'quiz', label: 'Quiz' }, { value: 'cards', label: 'Flashcards' }]} value={qs.mode} onChange={(mode) => { if (!busy) void setQuizSettings({ mode }) }} />
            <span className="field-label">{t('Quiz style')}</span>
            <Chips options={QUIZ_THEMES.map((c) => ({ value: c.id, label: c.label }))} value={qs.theme} onChange={(theme) => { if (!busy) void setQuizSettings({ theme }) }} />
            <Slider label="Time to answer" min={3} max={10} step={1} value={qs.timer} format={(v) => `${v}s`}
              onChange={(timer) => { quizMemo = { ...qs, timer }; setQs(quizMemo); setScenes((l) => l.map((s) => (s.quiz ? { ...s, quiz: { ...s.quiz, settings: { ...s.quiz.settings, timer } } } : s))) }} />
            <Toggle label="Ticking sound" value={qs.beep} onChange={(beep) => { if (!busy) void setQuizSettings({ beep }) }} />
            <Toggle label="Show explanations" value={qs.explain} onChange={(explain) => { if (!busy) void setQuizSettings({ explain }) }} />
            <Toggle label="All answers at the end" value={qs.recap} onChange={(recap) => { if (!busy) void setQuizSettings({ recap }) }} />
          </>
        )}

        {charting && (
          <div className="script-box data-box">
            <Chips options={[{ value: 'text', label: 'Write or paste' }, { value: 'grid', label: 'Edit table' }]} value={dd.tab} onChange={switchDataTab} />
            {dd.tab === 'text' ? (
              <>
                <textarea className="text-input" rows={10} value={dd.text} placeholder={DATA_HINT} autoFocus spellCheck={false}
                  onChange={(e) => setDataDraft({ text: e.target.value })} />
                <p className="muted small">{t('Tip: copy cells from Excel or Google Sheets and paste them here, or write one row per line like "Delhi: 42" or "City | 2011 | 2024". A blank line starts a new chart; "# Title" names it.')}{' '}
                  <button className="btn small ghost" onClick={() => csvInput.current?.click()}>{t('Open CSV')}</button></p>
              </>
            ) : <DataGrid doc={dd.doc} onChange={(doc) => setDataDraft({ doc })} onPick={(picked) => setDataDraft({ picked })} />}
            {currentDoc.tables.length > 0 && (
              <>
                <p className="muted small">{currentDoc.tables.length} {t(currentDoc.tables.length === 1 ? 'chart' : 'charts')} · {currentDoc.tables.reduce((s, x) => s + x.rows.length, 0)} {t('rows')}</p>
                {dd.tab === 'text' && currentDoc.tables.length > 1 && (
                  <Chips options={currentDoc.tables.map((x, i) => ({ value: i, label: x.title || `${i + 1}` }))} value={Math.min(dd.picked, currentDoc.tables.length - 1)} onChange={(picked) => setDataDraft({ picked })} wrap />
                )}
                <canvas ref={dataPreview} className="mind-preview" />
              </>
            )}
            <button className="btn primary" disabled={!!busy || !currentDoc.tables.length} onClick={addData}>{t('Make scenes')}</button>
          </div>
        )}

        {reading && (
          <div className="script-box article-box">
            <Step n={1} title="Article" hint="a link, or the text pasted" />
            <form className="row" noValidate onSubmit={(e) => { e.preventDefault(); void getArticle() }}>
              <input className="text-input grow" type="url" inputMode="url" value={art.url} placeholder="https://…" aria-label={t('Article link')} autoFocus
                onChange={(e) => setArticle({ url: e.target.value })} />
              <button className="btn" type="submit" disabled={!!busy || !art.url.trim()}>{t('Get article')}</button>
            </form>
            {art.info && <p className="small">✓ {art.info}</p>}
            <textarea className="text-input" rows={10} value={art.text} placeholder={ARTICLE_HINT}
              onChange={(e) => setArticle({ text: e.target.value })} />
            <p className="muted small">{t('Check the text and remove anything you don\'t want. If a site doesn\'t open, copy the article in your browser and paste it here. Lines like ![caption](link) are pictures.')}</p>
            {aiTools('article', art.text)}
            <Chips options={[{ value: 'short', label: 'Key points' }, { value: 'full', label: 'Full article' }]} value={art.length} onChange={(length) => setArticle({ length })} />
            <Toggle label="Pictures from the article" value={art.pictures} onChange={(pictures) => setArticle({ pictures })} />
            {material('article', 'article')}
            <button className="btn primary" disabled={!!busy || !art.text.trim()} onClick={addArticle}>{t('Make scenes')}</button>
          </div>
        )}

        {(charting || scenes.some((s) => s.data)) && (
          <>
            <span className="field-label">{t('Chart')}</span>
            <Chips options={CHART_KINDS} value={ds.kind} onChange={(kind) => { if (!busy) void setDataSettings({ kind }) }} wrap />
            <span className="field-label">{t('Chart style')}</span>
            <Chips options={DATA_THEMES.map((c) => ({ value: c.id, label: c.label }))} value={ds.theme} onChange={(theme) => { if (!busy) void setDataSettings({ theme }) }} />
            <Toggle label="Biggest first" value={ds.sort} onChange={(sort) => { if (!busy) void setDataSettings({ sort }) }} />
            <Toggle label="A scene for each row" value={ds.steps} onChange={(steps) => { if (!busy) void setDataSettings({ steps }) }} />
            <Toggle label="Point out the top value at the end" value={ds.highlight} onChange={(highlight) => { if (!busy) void setDataSettings({ highlight }) }} />
          </>
        )}

        {(mapping || scenes.some((s) => s.mind)) && (
          <>
            <span className="field-label">{t('Map style')}</span>
            <Chips options={MAP_THEMES.map((c) => ({ value: c.id, label: c.label }))} value={ms.theme} onChange={(theme) => { if (!busy) void setMapSettings({ theme }) }} />
            <Chips options={[{ value: 'radial', label: 'Radial' }, { value: 'tree', label: 'Tree' }]} value={ms.layout} onChange={(layout) => { if (!busy) void setMapSettings({ layout }) }} />
            <Toggle label="Zoom to each branch" value={ms.focus} onChange={(focus) => { if (!busy) void setMapSettings({ focus }) }} />
          </>
        )}

        {(pasting || reading || scenes.some((s) => s.card || s.art) || (listening && ad.look === 'card') || scenes.some((s) => s.audio && s.audio.look === 'card')) && (
          <>
            <span className="field-label">{t('Card style')}</span>
            <Chips options={CARD_THEMES.map((c) => ({ value: c.id, label: c.label }))} value={o.theme} onChange={(v) => { if (!busy) void setTheme(v) }} />
          </>
        )}

        {!pasting && !listening && !reading && (mapping || quizzing || charting || start === 'files' || scenes.length > 0) && !scenes.some((s) => s.audio) && (
          <>
            <span className="field-label">{t('Background music (optional)')}</span>
            <AuxBoxes kinds={['music']} pics={[]} music={mat.music} busy={!!busy} onAdd={(kind, files) => void addMaterial(kind, files)}
              onRemove={() => {}} onRemoveMusic={() => setMat({ music: null })} onClear={() => {}} />
          </>
        )}

        {meterFor('made')}

        {scenes.length > 0 && (
          <div className="scene-list">
            {scenes.map((s, i) => (
              <div className="scene-row" key={s.id}>
                <div className="scene-thumb">
                  <Thumb blob={s.image} moving={s.media} />
                  <span>{i + 1}</span>
                  {(s.audio || s.card) && <button className="scene-swap" disabled={!!busy} onClick={() => { swapFor.current = s.id; if (mat.pics.length) setSwapping(swapping === s.id ? null : s.id); else swapInput.current?.click() }}>{t(s.card && !s.own ? 'Use my picture' : 'Change picture')}</button>}
                </div>
                <div className="scene-main">
                  <textarea className="text-input" rows={3} value={s.text} placeholder={t(speaking ? 'What the voice says on this scene' : 'Caption (optional)')}
                    onChange={(e) => update(s.id, { text: e.target.value })} />
                  {s.quiz && speaking && s.quiz.part.kind === 'item' && (
                    <textarea className="text-input" rows={2} value={s.quiz.say2} placeholder={t('What the voice says when the answer appears')}
                      onChange={(e) => update(s.id, { quiz: { ...s.quiz!, say2: e.target.value } })} />
                  )}
                  {s.quiz || s.data ? null : s.audio ? (
                    <div className="scene-tools">
                      <span className="small muted">{fmtTime(s.audio.start)} – {fmtTime(s.audio.end)}</span>
                      {swapPool(s)}
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
                    {swapPool(s)}
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
            {noVoice && scenes.some((s) => !s.quiz && !s.data) && (
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
            <span className="small">{busy.label}{busy.p >= 0 && ` ${Math.round(busy.p * 100)}%`}</span>
            <div className={`progress${busy.p < 0 ? ' waiting' : ''}`}><div style={{ width: busy.p < 0 ? undefined : `${Math.round(busy.p * 100)}%` }} /></div>
          </div>
        )}
        {note && <p className="small warn">{note}</p>}
        {error && <p className="small error-text">{error}</p>}

        <input ref={fileInput} type="file" multiple hidden
          accept={`${RAW_ACCEPT},text/plain,.txt,.md`}
          onChange={(e) => { if (e.target.files) addFiles([...e.target.files]); e.target.value = '' }} />
        <input ref={trackInput} type="file" accept="audio/*" hidden onChange={(e) => { pickTrack(e.target.files?.[0]); e.target.value = '' }} />
        <input ref={audioInput} type="file" accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAudio(f, f.name); e.target.value = '' }} />
        <input ref={photoInput} type="file" accept={RAW_ACCEPT} multiple hidden
          onChange={(e) => { if (e.target.files?.length) void addPics([...e.target.files]); e.target.value = '' }} />
        <input ref={coverInput} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setAudio({ cover: f, look: 'cover' }); e.target.value = '' }} />
        <input ref={csvInput} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then((text) => setDataDraft({ tab: 'text', text })); e.target.value = '' }} />
        <input ref={textInput} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then((text) => textFor.current(text)); e.target.value = '' }} />
        <input ref={swapInput} type="file" accept={RAW_ACCEPT} hidden onChange={(e) => { if (e.target.files) void swapPicture([...e.target.files]); e.target.value = '' }} />
      </div>
    </div>
  )
}
