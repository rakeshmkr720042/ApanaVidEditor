import { useEffect, useRef, useState } from 'react'
import type { AudioLayer, TextLayer } from '../types'
import type { Editor } from '../model/useEditor'
import { Chips, Panel, Slider, Toggle } from '../ui/kit'
import { toSrt, type Cue } from '../lib/srt'
import { uid } from '../lib/format'
import { t } from '../lib/i18n'
import { ensureFont, subtitleStyle } from '../engine/text'
import { encodeWav } from '../engine/music'
import { loadSource, sharedAudioContext } from '../lib/media'
import { saveMedia } from '../lib/db'
import {
  ASR_MODELS, LANGUAGES, SPOKEN, VOICES, buildVoiceOver, getEmail, langName, sampleVoice, setEmail, transcribe, translateCues,
  type Progress,
} from '../engine/ai'

interface P { ed: Editor; onClose: () => void }

// remembered while the editor is open, so closing the panel loses nothing
const memo = { tab: 'captions', model: ASR_MODELS[1].id, spoken: 'auto', toEnglish: false, subLang: 'auto', target: 'hi', voice: 'hi', duck: 0.15 }

const DEVANAGARI = ['hi', 'mr', 'ne']

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const LangSelect = ({ value, onChange, codes, auto }: { value: string; onChange: (v: string) => void; codes?: string[]; auto?: boolean }) => (
  <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
    {auto && <option value="auto">{t('Detect automatically')}</option>}
    {(codes ?? LANGUAGES.map((l) => l.code)).filter((c) => c !== 'auto').map((c) => <option key={c} value={c}>{langName(c)}</option>)}
  </select>
)

export function AIPanel({ ed, onClose }: P) {
  const [tab, setTab] = useState(memo.tab)
  const [, rerender] = useState(0)
  const set = (patch: Partial<typeof memo>) => { Object.assign(memo, patch); rerender((n) => n + 1) }
  const [busy, setBusy] = useState<{ label: string; p: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [email, setEmailState] = useState(getEmail())
  const playing = useRef<AudioBufferSourceNode | null>(null)
  useEffect(() => () => playing.current?.stop(), [])
  useEffect(() => { memo.tab = tab }, [tab])

  const subs = ed.project.layers.filter((l): l is TextLayer => l.type === 'text' && l.subtitle).sort((a, b) => a.start - b.start)
  const cues: Cue[] = subs.map((s) => ({ start: s.start, end: s.end, text: s.text }))
  const total = ed.layout.total

  const progress = (label: string): Progress => (stage, p) =>
    setBusy({ label: stage === 'download' ? `${t('Downloading AI model (first time only)')}` : label, p })

  const run = async (label: string, fn: () => Promise<string>) => {
    setError(null); setDone(null)
    setBusy({ label, p: 0 })
    try { setDone(await fn()) } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  /** Swaps the subtitle layers for new cues in one undo step. */
  const replaceSubs = (next: Cue[], lang: string) => {
    const p = ed.project
    const style = subs[0]?.style ?? subtitleStyle()
    const font = DEVANAGARI.includes(lang) ? 'Noto Sans Devanagari' : style.font === 'Noto Sans Devanagari' ? subtitleStyle().font : style.font
    ensureFont(font)
    const y = subs[0]?.box.y ?? 0.86
    const layers: TextLayer[] = next.map((c) => ({
      id: uid(), type: 'text', text: c.text, subtitle: true, start: c.start, end: Math.min(c.end, total || c.end),
      style: { ...style, font }, box: { x: 0.5, y, scale: 1, rotation: 0, opacity: 1 }, animIn: 'none', animOut: 'none',
      frame: subs[0]?.frame ? { ...subs[0].frame, rect: { ...subs[0].frame.rect } } : null,
    }))
    ed.replaceProject({ ...p, layers: [...p.layers.filter((l) => !(l.type === 'text' && l.subtitle)), ...layers] })
    memo.subLang = lang
    if (VOICES[lang]) memo.voice = lang
  }

  const generate = () => run(t('Listening to the video…'), async () => {
    if (subs.length && !confirm(t('Replace the subtitles you already have?'))) return ''
    const out = await transcribe(ed.project, ed.sources, { model: memo.model, language: memo.spoken, toEnglish: memo.toEnglish }, progress(t('Listening to the video…')))
    if (!out.length) throw new Error(t('No speech was found in this video'))
    replaceSubs(out, memo.toEnglish ? 'en' : memo.spoken)
    return `${out.length} ${t('captions added. Edit any line in Subtitles.')}`
  })

  const translate = (apply: boolean) => run(t('Translating…'), async () => {
    const out = await translateCues(cues, memo.subLang, memo.target, (p) => setBusy({ label: t('Translating…'), p }))
    download(`subtitles.${memo.target}.srt`, toSrt(out))
    if (apply) {
      replaceSubs(out, memo.target)
    }
    return apply ? `${t('Subtitles are now in')} ${langName(memo.target)}. ${t('The .srt file was downloaded too.')}` : t('Translated .srt downloaded.')
  })

  const stopSample = () => { playing.current?.stop(); playing.current = null }
  const preview = () => run(t('Making a sample…'), async () => {
    stopSample()
    const buf = await sampleVoice(cues[0]?.text ?? 'Hello', memo.voice, progress(t('Making a sample…')))
    if (!buf) return ''
    const ctx = sharedAudioContext()
    await ctx.resume()
    const n = ctx.createBufferSource()
    n.buffer = buf
    n.connect(ctx.destination)
    n.start()
    playing.current = n
    return ''
  })

  const dub = () => run(t('Recording voice-over…'), async () => {
    stopSample()
    const buf = await buildVoiceOver(cues, memo.voice, total, progress(t('Recording voice-over…')))
    const name = `${t('Voice-over')} (${langName(memo.voice)})`
    const src = await loadSource(encodeWav(buf), `${name}.wav`)
    ed.addSource(src)
    await saveMedia(src)
    const p = ed.project
    const layer: AudioLayer = {
      id: uid(), type: 'audio', sourceId: src.id, in: 0, start: 0, end: Math.min(src.duration, total),
      volume: 1, fadeIn: 0, fadeOut: 0, label: name, kind: 'voice',
    }
    // one undo step: lower the original sound and add the voice track
    ed.replaceProject({
      ...p,
      clips: p.clips.map((c) => ({ ...c, volume: Math.min(c.volume, memo.duck) })),
      layers: [...p.layers.map((l) => (l.type === 'media' ? { ...l, volume: Math.min(l.volume, memo.duck) } : l)), layer],
    })
    return t('Voice-over added to the timeline. It will be in the exported video.')
  })

  return (
    <Panel title="AI captions & dubbing" onClose={onClose} tall>
      <Chips options={[{ value: 'captions', label: 'Auto captions' }, { value: 'translate', label: 'Translate' }, { value: 'dub', label: 'Voice-over' }]}
        value={tab} onChange={(v) => { setTab(v); setError(null); setDone(null) }} />

      {tab === 'captions' && (
        <>
          <p className="muted small">{t('Turns the speech in your video into subtitles. The AI runs on your device; the model downloads once.')}</p>
          <span className="field-label">{t('Language spoken in the video')}</span>
          <LangSelect value={memo.spoken} codes={SPOKEN} auto onChange={(spoken) => set({ spoken })} />
          <span className="field-label">{t('Quality')}</span>
          <Chips options={ASR_MODELS.map((m) => ({ value: m.id, label: `${t(m.label)} ${m.size}` }))} value={memo.model} onChange={(model) => set({ model })} wrap />
          <Toggle label="Write captions in English" value={memo.toEnglish} onChange={(toEnglish) => set({ toEnglish })} />
          <div className="row">
            <button className="btn primary" disabled={!!busy || !total} onClick={generate}>{t('Generate captions')}</button>
            <button className="btn" disabled={!!busy || !cues.length} onClick={() => download('subtitles.srt', toSrt(cues))}>{t('Download .srt')}</button>
          </div>
        </>
      )}

      {tab === 'translate' && (
        <>
          <p className="muted small">{t('Translates your subtitles and keeps their timing. Needs internet.')}</p>
          {!cues.length && <p className="small warn">{t('Add subtitles first: use Auto captions or import an .srt file.')}</p>}
          <span className="field-label">{t('From')}</span>
          <LangSelect value={memo.subLang} auto onChange={(subLang) => set({ subLang })} />
          <span className="field-label">{t('To')}</span>
          <LangSelect value={memo.target} onChange={(target) => set({ target })} />
          <div className="row">
            <button className="btn primary" disabled={!!busy || !cues.length} onClick={() => translate(true)}>{t('Translate subtitles')}</button>
            <button className="btn" disabled={!!busy || !cues.length} onClick={() => translate(false)}>{t('Only download .srt')}</button>
          </div>
          <span className="field-label">{t('Email (optional, raises the free limit to 50,000 characters a day)')}</span>
          <input className="text-input" type="email" value={email} placeholder="you@example.com"
            onChange={(e) => { setEmailState(e.target.value); setEmail(e.target.value.trim()) }} />
        </>
      )}

      {tab === 'dub' && (
        <>
          <p className="muted small">{t('Reads every subtitle aloud at its time and lays the voice over your video. Translate first to dub into another language.')}</p>
          {!cues.length && <p className="small warn">{t('Add subtitles first: use Auto captions or import an .srt file.')}</p>}
          <span className="field-label">{t('Voice language (should match the subtitles)')}</span>
          <LangSelect value={memo.voice} codes={Object.keys(VOICES)} onChange={(voice) => set({ voice })} />
          {memo.subLang !== 'auto' && !VOICES[memo.subLang] && (
            <p className="small warn">{langName(memo.subLang)}: {t('no offline voice yet. Voices available:')} {Object.keys(VOICES).map(langName).join(', ')}.</p>
          )}
          <Slider label="Original sound" min={0} max={1} value={memo.duck} format={(v) => `${Math.round(v * 100)}%`} onChange={(duck) => set({ duck })} />
          <div className="row">
            <button className="btn" disabled={!!busy || !cues.length} onClick={preview}>▶ {t('Hear sample')}</button>
            <button className="btn primary" disabled={!!busy || !cues.length} onClick={dub}>{t('Create voice-over')}</button>
          </div>
        </>
      )}

      {busy && (
        <div className="ai-status">
          <span className="small">{busy.label} {Math.round(busy.p * 100)}%</span>
          <div className="progress"><div style={{ width: `${Math.round(busy.p * 100)}%` }} /></div>
        </div>
      )}
      {error && <p className="small error-text">{error}</p>}
      {done && <p className="small ok-text">{done}</p>}
    </Panel>
  )
}
