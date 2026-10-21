import { useEffect, useRef, useState } from 'react'
import type { AudioLayer, TextLayer } from '../types'
import type { Editor } from '../model/useEditor'
import { Chips, Panel, Slider, Toggle } from '../ui/kit'
import { toSrt, type Cue } from '../lib/srt'
import { uid } from '../lib/format'
import { t } from '../lib/i18n'
import { ensureFont, subtitleStyle } from '../engine/text'
import { encodeWav } from '../engine/music'
import { decodeAudio, loadSource, sharedAudioContext } from '../lib/media'
import { deleteVoiceSample, getVoiceSample, saveMedia, saveVoiceSample } from '../lib/db'
import { getLocalAI, localAI, setLocalAI } from '../lib/localai'
import { CLONE_LANGS, referenceWav, voiceCloneSpace } from '../engine/voiceclone'
import {
  ASR_MODELS, LANGUAGES, SPOKEN, VOICES, buildVoiceOver, getEmail, langName, sampleVoice, setEmail, transcribe, translateCues,
  translator, type Progress,
} from '../engine/ai'
import { modelStates, type ModelState } from '../engine/offline'
import { fileBase, saveTextFiles } from '../lib/save'

interface P { ed: Editor; name: string; onClose: () => void }

// remembered while the editor is open, so closing the panel loses nothing
const memo = { tab: 'captions', model: ASR_MODELS[1].id, picked: false, spoken: 'auto', toEnglish: false, subLang: 'auto', target: 'hi', voice: 'hi', duck: 0.15, mine: false,
  targets: ['en', 'hi'] }

/** One language of the "many languages" subtitle batch. */
interface Made { code: string; cues?: Cue[]; error?: string; original?: boolean }

const DEVANAGARI = ['hi', 'mr', 'ne']

const download = (name: string, text: string) => saveTextFiles([{ name, text }]).catch(() => {})

const LangSelect = ({ value, onChange, codes, auto }: { value: string; onChange: (v: string) => void; codes?: string[]; auto?: boolean }) => (
  <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
    {auto && <option value="auto">{t('Detect automatically')}</option>}
    {(codes ?? LANGUAGES.map((l) => l.code)).filter((c) => c !== 'auto').map((c) => <option key={c} value={c}>{langName(c)}</option>)}
  </select>
)

/** Whether the chosen model works offline now, or downloads once first. */
const NetLine = ({ ok }: { ok: boolean }) => (
  <p className={`small ${ok ? 'ok-text' : 'muted'}`}>{ok ? `✓ ${t('Works offline on this device')}` : `⬇ ${t('Downloads once (needs internet), then works offline')}`}</p>
)

export function AIPanel({ ed, name, onClose }: P) {
  const [tab, setTab] = useState(memo.tab)
  const [, rerender] = useState(0)
  const set = (patch: Partial<typeof memo>) => { Object.assign(memo, patch); rerender((n) => n + 1) }
  const [busy, setBusy] = useState<{ label: string; p: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [email, setEmailState] = useState(getEmail())
  const [local, setLocal] = useState(() => (localAI() ? getLocalAI() : null))
  const [made, setMade] = useState<Made[]>([])
  const playing = useRef<AudioBufferSourceNode | null>(null)
  useEffect(() => () => playing.current?.stop(), [])
  useEffect(() => { memo.tab = tab }, [tab])

  // which models already work offline here (built into the app or downloaded before)
  const [states, setStates] = useState<Record<string, ModelState>>({})
  const ready = (id?: string) => !!id && !!states[id] && states[id] !== 'none'
  const refreshStates = () => modelStates([
    ...ASR_MODELS.map((m) => ({ id: m.id, kind: 'asr' as const })),
    ...Object.values(VOICES).map((id) => ({ id, kind: 'tts' as const })),
  ]).then((st) => {
    // until the user picks a quality, prefer a model that needs no download
    if (!memo.picked && st[memo.model] === 'none') {
      const have = ASR_MODELS.find((m) => st[m.id] !== 'none')
      if (have) memo.model = have.id
    }
    setStates(st)
  })
  useEffect(() => { refreshStates() }, [])
  const [route, setRoute] = useState<'local' | 'offline' | 'online'>('online')

  // ---- the user's own voice sample, for cloning
  const [sample, setSample] = useState<{ blob: Blob; secs: number } | null>(null)
  const [rec, setRec] = useState<{ mr: MediaRecorder; start: number } | null>(null)
  const [now, setNow] = useState(0)
  // personal voice cloning appears only when switched on in the Local AI sheet
  const [cloneOn] = useState(() => !!voiceCloneSpace())
  const mine = cloneOn && memo.mine
  useEffect(() => {
    if (!cloneOn) return
    getVoiceSample().then(async (blob) => {
      if (!blob) return
      const b = await decodeAudio(blob)
      setSample({ blob, secs: b?.duration ?? 0 })
    }).catch(() => {})
  }, [cloneOn])
  useEffect(() => {
    if (!rec) return
    const i = setInterval(() => {
      setNow(Date.now())
      if (Date.now() - rec.start > 30000) rec.mr.stop()
    }, 250)
    return () => clearInterval(i)
  }, [rec])
  useEffect(() => () => { if (rec && rec.mr.state !== 'inactive') rec.mr.stop() }, [rec])

  const keepSample = async (raw: Blob) => {
    const buf = await decodeAudio(raw)
    if (!buf) throw new Error(t('Could not read this audio'))
    if (buf.duration < 5) throw new Error(t('The voice sample is too short. Speak for at least 10 seconds.'))
    const wav = await referenceWav(buf)
    await saveVoiceSample(wav).catch(() => {})
    setSample({ blob: wav, secs: Math.min(30, buf.duration) })
  }

  const startRec = async () => {
    setError(null); setDone(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mr = new MediaRecorder(stream)
      const parts: Blob[] = []
      mr.ondataavailable = (e) => parts.push(e.data)
      mr.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop())
        setRec(null)
        keepSample(new Blob(parts, { type: mr.mimeType || 'audio/webm' })).catch((e) => setError((e as Error).message))
      }
      mr.start()
      setRec({ mr, start: Date.now() })
      setNow(Date.now())
    } catch {
      setError(t('Microphone permission is needed to record a voiceover.'))
    }
  }

  const importSample = (f: File | undefined) => {
    if (!f) return
    setError(null); setDone(null)
    keepSample(f).catch((e) => setError((e as Error).message))
  }

  const playSample = async () => {
    if (!sample) return
    stopSample()
    const buf = await decodeAudio(sample.blob)
    if (!buf) return
    const ctx = sharedAudioContext()
    await ctx.resume()
    const n = ctx.createBufferSource()
    n.buffer = buf
    n.connect(ctx.destination)
    n.start()
    playing.current = n
  }

  const removeSample = () => { stopSample(); setSample(null); deleteVoiceSample().catch(() => {}) }
  const reference = mine ? sample?.blob ?? null : null
  const voiceCodes = mine ? CLONE_LANGS : Object.keys(VOICES)

  const { subLang, target } = memo
  useEffect(() => { translator(subLang, target).then(setRoute) }, [subLang, target, local?.translate])

  const subs = ed.project.layers.filter((l): l is TextLayer => l.type === 'text' && l.subtitle).sort((a, b) => a.start - b.start)
  const cues: Cue[] = subs.map((s) => ({ start: s.start, end: s.end, text: s.text }))
  const total = ed.layout.total

  const progress = (label: string): Progress => (stage, p) =>
    setBusy({ label: stage === 'download' ? `${t('Downloading AI model (first time only)')}` : label, p })

  const run = async (label: string, fn: () => Promise<string>) => {
    setError(null); setDone(null)
    setBusy({ label, p: 0 })
    try { setDone(await fn()) } catch (e) { setError(t((e as Error).message)) } finally { setBusy(null); refreshStates() }
  }

  /** Swaps the subtitle layers for new cues in one undo step. */
  const replaceSubs = (next: Cue[], lang: string, translated = true) => {
    const p = ed.project
    // the first time the spoken-language subtitles give way to a translation, keep a copy so their .srt stays available
    const originalSubs = !translated ? null : p.originalSubs ?? (cues.length ? { lang: memo.subLang, cues } : null)
    const style = subs[0]?.style ?? subtitleStyle()
    const font = DEVANAGARI.includes(lang) ? 'Noto Sans Devanagari' : style.font === 'Noto Sans Devanagari' ? subtitleStyle().font : style.font
    ensureFont(font)
    const y = subs[0]?.box.y ?? 0.86
    const layers: TextLayer[] = next.map((c) => ({
      id: uid(), type: 'text', text: c.text, subtitle: true, start: c.start, end: Math.min(c.end, total || c.end),
      style: { ...style, font }, box: { x: 0.5, y, scale: 1, rotation: 0, opacity: 1 }, animIn: 'none', animOut: 'none',
      frame: subs[0]?.frame ? { ...subs[0].frame, rect: { ...subs[0].frame.rect } } : null,
    }))
    ed.replaceProject({ ...p, originalSubs, layers: [...p.layers.filter((l) => !(l.type === 'text' && l.subtitle)), ...layers] })
    memo.subLang = lang
    if ((mine ? CLONE_LANGS : Object.keys(VOICES)).includes(lang)) memo.voice = lang
  }

  const generate = () => run(t('Listening to the video…'), async () => {
    if (subs.length && !confirm(t('Replace the subtitles you already have?'))) return ''
    const out = await transcribe(ed.project, ed.sources, { model: memo.model, language: memo.spoken, toEnglish: memo.toEnglish }, progress(t('Listening to the video…')))
    if (!out.length) throw new Error(t('No speech was found in this video'))
    replaceSubs(out, memo.toEnglish ? 'en' : memo.spoken, false)
    return `${out.length} ${t('captions added. Edit any line in Subtitles.')}`
  })

  // YouTube reads the language from its own menu, so "<video>.<code>.srt" just keeps the files easy to tell apart
  const base = fileBase(name)
  const srtName = (code: string) => `${base}.${code === 'auto' ? 'original' : code}.srt`

  // what the video's speech says: the kept copy when the subtitles were swapped for a translation, else the subtitles themselves
  const kept = ed.project.originalSubs
  const original: Made = kept ? { code: kept.lang, cues: kept.cues, original: true } : { code: memo.subLang, cues, original: true }
  const fromCues = kept ? kept.cues : cues
  const fromLang = kept ? kept.lang : memo.subLang

  const translate = (apply: boolean) => run(t('Translating…'), async () => {
    const out = await translateCues(fromCues, fromLang, memo.target, (p) => setBusy({ label: t('Translating…'), p }))
    download(srtName(memo.target), toSrt(out))
    if (apply) {
      replaceSubs(out, memo.target)
    }
    return apply ? `${t('Subtitles are now in')} ${langName(memo.target)}. ${t('The .srt file was downloaded too.')}` : t('Translated .srt downloaded.')
  })

  /** Translates the subtitles into every picked language; one failing language does not stop the rest. */
  const makeMany = () => run(t('Translating…'), async () => {
    const codes = memo.targets.filter((c) => c !== fromLang)
    // the spoken-language file comes first, so "Download all" gives the original and every translation
    const out: Made[] = [original]
    setMade(out)
    for (const [i, code] of codes.entries()) {
      const label = `${t('Translating…')} ${langName(code)} (${i + 1}/${codes.length})`
      setBusy({ label, p: 0 })
      try {
        out.push({ code, cues: await translateCues(fromCues, fromLang, code, (p) => setBusy({ label, p })) })
      } catch (e) {
        out.push({ code, error: t((e as Error).message) })
      }
      setMade([...out])
    }
    const ok = out.filter((m) => m.cues && !m.original).length
    if (!ok) throw new Error(out[1]?.error ?? 'Translation failed')
    return `${ok} ${t('.srt files ready. Check them below, then download.')}`
  })

  const saveMade = (list: Made[]) => saveTextFiles(list.filter((m) => m.cues).map((m) => ({ name: srtName(m.code), text: toSrt(m.cues!) })))
    .catch((e) => setError((e as Error).message))

  const stopSample = () => { playing.current?.stop(); playing.current = null }
  const preview = () => run(t('Making a sample…'), async () => {
    stopSample()
    const buf = await sampleVoice(cues[0]?.text ?? 'Hello', memo.voice, progress(t('Making a sample…')), reference)
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
    const buf = await buildVoiceOver(cues, memo.voice, total, progress(t('Recording voice-over…')), reference)
    const name = `${t(mine ? 'My voice' : 'Voice-over')} (${langName(memo.voice)})`
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
          <Chips options={ASR_MODELS.map((m) => ({ value: m.id, label: `${ready(m.id) ? '✓ ' : ''}${t(m.label)} ${m.size}` }))} value={memo.model}
            onChange={(model) => set({ model, picked: true })} wrap />
          <NetLine ok={ready(memo.model)} />
          <Toggle label="Write captions in English" value={memo.toEnglish} onChange={(toEnglish) => set({ toEnglish })} />
          <div className="row">
            <button className="btn primary" disabled={!!busy || !total} onClick={generate}>{t('Generate captions')}</button>
            <button className="btn" disabled={!!busy || !cues.length} onClick={() => download(srtName(memo.toEnglish ? 'en' : memo.subLang), toSrt(cues))}>{t('Download .srt')}</button>
          </div>
        </>
      )}

      {tab === 'translate' && (
        <>
          <p className="muted small">{t(route === 'local' ? 'Translates your subtitles with Local AI on your computer and keeps their timing.'
            : route === 'offline' ? 'Translates your subtitles on this device with the offline model and keeps their timing.'
            : 'Translates your subtitles and keeps their timing. Needs internet.')}</p>
          <p className={`small ${route === 'online' ? 'warn' : 'ok-text'}`}>{route === 'local' ? `✓ ${t('Local AI (no internet)')}` : route === 'offline' ? `✓ ${t('Offline model')}`
            : `🌐 ${t(memo.subLang === 'auto' ? 'Online (MyMemory). For offline translation, pick the From language and download that language pair in Offline & online on the home screen.' : 'Online (MyMemory). For offline translation, download the language pair in Offline & online on the home screen.')}`}</p>
          {local && <Toggle label={`${t('Use Local AI')} (${local.model})`} value={local.translate} onChange={(translate) => setLocal(setLocalAI({ translate }))} />}
          {!cues.length && <p className="small warn">{t('Add subtitles first: use Auto captions or import an .srt file.')}</p>}
          <span className="field-label">{t('From')}</span>
          <LangSelect value={memo.subLang} auto onChange={(subLang) => set({ subLang })} />
          <span className="field-label">{t('To')}</span>
          <LangSelect value={memo.target} onChange={(target) => set({ target })} />
          <div className="row">
            <button className="btn primary" disabled={!!busy || !cues.length} onClick={() => translate(true)}>{t('Translate subtitles')}</button>
            <button className="btn" disabled={!!busy || !cues.length} onClick={() => translate(false)}>{t('Only download .srt')}</button>
          </div>
          <div className="srt-many">
            <span className="field-label">{t('YouTube subtitles: one .srt for each language')}</span>
            <p className="muted small">{t('Pick languages. You get the original .srt plus one for each language, with the same timing, and your video stays as it is. On YouTube Studio: Subtitles > Add language > Add > Upload file > With timing.')}</p>
            <div className="chips wrap">
              {memo.targets.map((c) => (
                <button key={c} className={c === fromLang ? '' : 'on'} title={t('Remove')}
                  onClick={() => set({ targets: memo.targets.filter((x) => x !== c) })}>{langName(c)} ✕</button>
              ))}
            </div>
            <select className="select" value="" onChange={(e) => e.target.value && set({ targets: [...memo.targets, e.target.value] })}>
              <option value="">+ {t('Add language')}</option>
              {LANGUAGES.filter((l) => !memo.targets.includes(l.code)).map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
            {fromLang !== 'auto' && memo.targets.includes(fromLang) && (
              <p className="muted small">{langName(fromLang)}: {t('this is the language of the original subtitles, so it comes as the Original file.')}</p>
            )}
            <div className="row">
              <button className="btn primary" disabled={!!busy || !cues.length || !memo.targets.some((c) => c !== fromLang)} onClick={makeMany}>
                {t('Make .srt files')} ({memo.targets.filter((c) => c !== fromLang).length})
              </button>
              {made.some((m) => m.cues) && <button className="btn" disabled={!!busy} onClick={() => saveMade(made)}>{t('Download all')}</button>}
            </div>
            {(made.length ? made : cues.length ? [original] : []).map((m) => (
              <div key={`${m.original ? 'o-' : ''}${m.code}`} className="srt-made">
                <div className="row">
                  <b>{m.original ? `${t('Original')}${m.code === 'auto' ? '' : ` (${langName(m.code)})`}` : langName(m.code)}</b>
                  <span className="muted small">{srtName(m.code)}</span>
                </div>
                {m.error ? <p className="small warn">{m.error}</p> : (
                  <>
                    <ol className="srt-peek small">
                      {m.cues!.slice(0, 3).map((c, i) => <li key={i}><span className="muted">{m.original || c.text === fromCues[i]?.text ? '' : `${fromCues[i]?.text} → `}</span>{c.text}</li>)}
                    </ol>
                    <div className="row">
                      <button className="btn small" disabled={!!busy} onClick={() => saveMade([m])}>{t('Download .srt')}</button>
                      <button className="btn small" disabled={!!busy} onClick={() => {
                        if (!confirm(`${t('Show these subtitles in the video instead of the current ones?')} (${langName(m.code)})`)) return
                        replaceSubs(m.cues!, m.code, !m.original); setDone(`${t('Subtitles are now in')} ${langName(m.code)}.`)
                      }}>{t('Use in video')}</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          {route === 'online' && (
            <>
              <span className="field-label">{t('Email (optional, raises the free limit to 50,000 characters a day)')}</span>
              <input className="text-input" type="email" value={email} placeholder="you@example.com"
                onChange={(e) => { setEmailState(e.target.value); setEmail(e.target.value.trim()) }} />
            </>
          )}
        </>
      )}

      {tab === 'dub' && (
        <>
          <p className="muted small">{t('Reads every subtitle aloud at its time and lays the voice over your video. Translate first to dub into another language.')}</p>
          {!cues.length && <p className="small warn">{t('Add subtitles first: use Auto captions or import an .srt file.')}</p>}
          {cloneOn && <>
          <span className="field-label">{t('Voice')}</span>
          <Chips options={[{ value: 'ai', label: 'AI voice (offline)' }, { value: 'mine', label: 'My voice (clone)' }]} value={mine ? 'mine' : 'ai'}
            onChange={(v) => {
              const next = v === 'mine'
              const codes = next ? CLONE_LANGS : Object.keys(VOICES)
              set({ mine: next, voice: codes.includes(memo.voice) ? memo.voice : codes.includes(memo.subLang) ? memo.subLang : codes[1] ?? codes[0] })
            }} />
          </>}
          {mine && (
            <div className="clone-box">
              <p className="muted small">{t('Record 15 to 30 seconds of yourself speaking clearly in a quiet room. Your voice is sent to your voice cloning server to make the voice-over, so this needs internet.')}</p>
              {rec ? (
                <div className="row">
                  <span className="small rec-live">● {t('Recording')} {Math.floor((now - rec.start) / 1000)}s / 30s</span>
                  <button className="btn primary" onClick={() => rec.mr.stop()}>{t('Stop')}</button>
                </div>
              ) : (
                <div className="row">
                  <button className="btn" disabled={!!busy} onClick={startRec}>🎙 {t(sample ? 'Record again' : 'Record my voice')}</button>
                  <label className="btn">
                    {t('Import audio')}
                    <input type="file" accept="audio/*,video/*" hidden onChange={(e) => { importSample(e.target.files?.[0]); e.target.value = '' }} />
                  </label>
                </div>
              )}
              {sample && !rec && (
                <div className="row">
                  <span className="small ok-text">✓ {t('Voice sample ready')} ({Math.round(sample.secs)}s)</span>
                  <button className="btn" onClick={playSample}>▶</button>
                  <button className="btn" onClick={removeSample}>{t('Delete')}</button>
                </div>
              )}
            </div>
          )}
          <span className="field-label">{t('Voice language (should match the subtitles)')}</span>
          <LangSelect value={memo.voice} codes={voiceCodes} onChange={(voice) => set({ voice })} />
          {mine ? <p className="small warn">🌐 {t('Online (your voice cloning server)')}</p> : <NetLine ok={ready(VOICES[memo.voice])} />}
          {memo.subLang !== 'auto' && !voiceCodes.includes(memo.subLang) && (
            <p className="small warn">{langName(memo.subLang)}: {t('no offline voice yet. Voices available:')} {voiceCodes.map(langName).join(', ')}.</p>
          )}
          <Slider label="Original sound" min={0} max={1} value={memo.duck} format={(v) => `${Math.round(v * 100)}%`} onChange={(duck) => set({ duck })} />
          <div className="row">
            <button className="btn" disabled={!!busy || !!rec || !cues.length || (mine && !sample)} onClick={preview}>▶ {t('Hear sample')}</button>
            <button className="btn primary" disabled={!!busy || !!rec || !cues.length || (mine && !sample)} onClick={dub}>{t('Create voice-over')}</button>
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
