import { useEffect, useState } from 'react'
import { ASR_MODELS, VOICES, VOICE_SIZE, downloadModel, langName } from '../engine/ai'
import { MT_MODELS, MT_SIZE, deleteModel, isEngineCached, modelStates, prefetchEngine, type ModelKind, type ModelState } from '../engine/offline'
import { isCoreCached, prefetchCore } from '../lib/ffmpeg'
import { prefetchFonts } from '../engine/text'
import { storageEstimate } from '../lib/db'
import { localAI } from '../lib/localai'
import { voiceCloneSpace } from '../engine/voiceclone'
import { t } from '../lib/i18n'
import { SheetClose } from '../ui/kit'

interface Model { id: string; kind: ModelKind; label: string; size: string }

const ALL: Model[] = [
  ...ASR_MODELS.map((m) => ({ id: m.id, kind: 'asr' as const, label: m.label, size: m.size })),
  ...Object.entries(VOICES).map(([code, id]) => ({ id, kind: 'tts' as const, label: langName(code), size: VOICE_SIZE })),
  ...MT_MODELS.map((m) => ({ id: m.id, kind: 'mt' as const, label: `${langName(m.from)} → ${langName(m.to)}`, size: MT_SIZE })),
]

/** Badge text and colour for whether something works without internet. */
const Badge = ({ on, text }: { on: boolean; text: string }) => <span className={`net-badge ${on ? 'ok' : 'net'}`}>{on ? '✓ ' : '🌐 '}{t(text)}</span>

/**
 * Shows which features work without internet on this device, and downloads the AI models
 * (speech to text, voices, translation) so they work offline afterwards.
 */
export function OfflineSheet({ onClose }: { onClose: () => void }) {
  const [online, setOnline] = useState(navigator.onLine)
  const [states, setStates] = useState<Record<string, ModelState>>({})
  const [pack, setPack] = useState<'unknown' | 'ready' | 'no' | 'downloading'>('unknown')
  const [busy, setBusy] = useState<{ id: string; p: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pair, setPair] = useState(MT_MODELS[0].id)
  const [usage, setUsage] = useState<string | null>(null)

  const refresh = () => {
    modelStates(ALL).then(setStates)
    Promise.all([isCoreCached(), isEngineCached()]).then(([a, b]) => setPack(a && b ? 'ready' : 'no'))
    storageEstimate().then((e) => e?.usage != null && setUsage(`${(e.usage / 1048576).toFixed(0)} MB`))
  }
  useEffect(() => {
    refresh()
    const on = () => setOnline(navigator.onLine)
    addEventListener('online', on); addEventListener('offline', on)
    return () => { removeEventListener('online', on); removeEventListener('offline', on) }
  }, [])

  const getPack = async () => {
    setPack('downloading'); setError(null)
    try { await Promise.all([prefetchCore(), prefetchFonts(), prefetchEngine()]) } catch { setError(t('Download failed. Check the internet connection and try again.')) }
    refresh()
  }
  const download = async (m: Model) => {
    setBusy({ id: m.id, p: 0 }); setError(null)
    try { await downloadModel(m.id, m.kind, (p) => setBusy({ id: m.id, p })) } catch (e) { setError((e as Error).message) }
    setBusy(null); refresh()
  }
  const remove = async (m: Model) => {
    if (!confirm(`${t('Delete')} "${t(m.label)}"?`)) return
    await deleteModel(m.id); refresh()
  }

  const row = (m: Model) => {
    const s = states[m.id] ?? 'none'
    return (
      <div key={m.id} className="model-row">
        <span className="grow">{t(m.label)} <span className="muted small">{m.size}</span></span>
        {busy?.id === m.id ? <span className="muted small">{t('Downloading…')} {Math.round(busy.p * 100)}%</span>
          : s === 'app' ? <span className="net-badge ok">✓ {t('Built in')}</span>
          : s === 'saved' ? <><span className="net-badge ok">✓ {t('Saved')}</span><button className="btn small ghost" onClick={() => remove(m)}>{t('Delete')}</button></>
          : <button className="btn small" disabled={!!busy || !online} onClick={() => download(m)}>{t('Download')}</button>}
      </div>
    )
  }

  const asr = ALL.filter((m) => m.kind === 'asr')
  const tts = ALL.filter((m) => m.kind === 'tts')
  const mt = ALL.filter((m) => m.kind === 'mt')
  const mtHave = mt.filter((m) => states[m.id] && states[m.id] !== 'none')
  const mtMissing = mt.filter((m) => !states[m.id] || states[m.id] === 'none')
  const pick = mtMissing.find((m) => m.id === pair) ?? mtMissing[0]
  const haveAsr = asr.some((m) => states[m.id] && states[m.id] !== 'none')
  const haveTts = tts.filter((m) => states[m.id] && states[m.id] !== 'none').length
  const local = localAI()

  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet offline-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} disabled={!!busy} />
        <h2>{t('Offline & online')}</h2>
        <p className={`small ${online ? 'ok-text' : 'warn'}`}>{online ? t('You are online.') : t('You are offline. Everything marked ✓ still works.')}</p>

        <h3>{t('Works without internet')}</h3>
        <div className="feature-row"><span className="grow">{t('Editing, effects, text, music, recording and export')}</span>
          {pack === 'ready' ? <Badge on text="Offline" /> : pack === 'downloading' ? <span className="muted small">{t('Downloading…')}</span>
            : pack === 'no' ? <button className="btn small" disabled={!online} onClick={getPack}>{t('Get offline pack')} <span className="muted">~50 MB</span></button> : null}
        </div>
        <div className="feature-row"><span className="grow">{t('Slides, PDF, script, mind map, quiz, data and audio to video')}</span><Badge on text="Offline" /></div>
        <div className="feature-row"><span className="grow">{t('AI captions (speech to text)')}</span><Badge on={haveAsr} text={haveAsr ? 'Offline' : 'Download a model once'} /></div>
        <div className="feature-row"><span className="grow">{t('AI voice (text to speech)')}</span><Badge on={haveTts > 0} text={haveTts ? `${haveTts} ${t(haveTts === 1 ? 'language' : 'languages')}` : 'Download a voice once'} /></div>
        <div className="feature-row"><span className="grow">{t('Translate subtitles')}</span>
          <Badge on={!!local?.translate || mtHave.length > 0} text={local?.translate ? 'Local AI' : mtHave.length ? 'Offline model' : 'Online (MyMemory)'} /></div>
        <div className="feature-row"><span className="grow">{t('Local AI (Ollama on your computer)')}</span>{local ? <Badge on text="On" /> : <span className="muted small">{t('Off')}</span>}</div>

        <h3>{t('Needs internet')}</h3>
        <div className="feature-row"><span className="grow">{t('Article to video from a link')}</span><Badge on={false} text="Online" /></div>
        <div className="feature-row"><span className="grow">{t('My voice (clone)')}</span>{voiceCloneSpace() ? <Badge on={false} text="Online" /> : <span className="muted small">{t('Off')}</span>}</div>
        <div className="feature-row"><span className="grow">{t('Upload to YouTube')}</span><Badge on={false} text="Online" /></div>

        <h3>{t('AI captions')}</h3>
        <p className="muted small">{t('Download once, then captions work with no internet. Bigger models are more accurate but slower.')}</p>
        {asr.map(row)}

        <h3>{t('AI voices')}</h3>
        {tts.map(row)}

        <h3>{t('Offline translation')}</h3>
        <p className="muted small">{local?.translate
          ? t('Local AI translates your subtitles now. Offline models are used when Local AI is off.')
          : t('Without a model for the language pair, subtitles are translated online with MyMemory. Two languages other than English go through English, so both models are needed. Quality is basic.')}</p>
        {mtHave.map(row)}
        {pick && (
          <div className="model-row">
            <select className="select grow" value={pick.id} onChange={(e) => setPair(e.target.value)} aria-label={t('Language pair')}>
              {mtMissing.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {busy?.id === pick.id ? <span className="muted small">{Math.round(busy.p * 100)}%</span>
              : <button className="btn small" disabled={!!busy || !online} onClick={() => download(pick)}>{t('Download')} <span className="muted">{MT_SIZE}</span></button>}
          </div>
        )}

        {error && <p className="error-text small">{error}</p>}
        {usage && <p className="muted small">{t('Storage used')}: {usage}</p>}
        <button className="btn" disabled={!!busy} onClick={onClose}>{t('Done')}</button>
      </div>
    </div>
  )
}
