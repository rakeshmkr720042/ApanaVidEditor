import { useEffect, useRef, useState } from 'react'
import { compressVideo, hevcSupported, planCompress, probeVideo, type Codec, type CompressPreset, type VideoInfo } from '../engine/compress'
import { Cancelled } from '../engine/exporter'
import { runsInBackground } from '../engine/background'
import { resetFFmpeg } from '../lib/ffmpeg'
import { isNative, saveNative } from '../lib/save'
import { fmtTime } from '../lib/format'
import { Chips } from '../ui/kit'
import { t } from '../lib/i18n'

const PRESETS: { value: CompressPreset; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' }, { value: 'youtube', label: 'YouTube' }, { value: 'small', label: 'Small file' },
  { value: 'smallest', label: 'Smallest' }, { value: 'target', label: 'Target size' },
]
const HINT: Record<CompressPreset, string> = {
  whatsapp: '720p, 30 fps: sends fast and looks good on phones',
  youtube: 'Up to 1080p, keeps the frame rate: good for uploading',
  small: 'Same size picture, fewer bits',
  smallest: '480p: the smallest file, softer picture',
  target: 'Pick the file size you need; the picture size is chosen for you',
}
const PREF_KEY = 'compress-settings'
const mb = (bytes: number) => (bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(2)} GB` : `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`)

interface Prefs { preset: CompressPreset; targetMB: number; short: number; fps: number; codec: Codec }
function loadPrefs(): Prefs {
  const d: Prefs = { preset: 'whatsapp', targetMB: 100, short: 0, fps: 0, codec: 'h264' }
  try { return { ...d, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') } } catch { return d }
}

interface Result { blob: Blob; url: string; file: string; info: string }

/** Shrinks any video file: choose a preset or a target size, see the estimate, compress, then save. */
export function CompressSheet({ file: given, onClose }: { file?: File; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(given ?? null)
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [prefs, setPrefsState] = useState(loadPrefs)
  const [hevc, setHevc] = useState(false)
  const [running, setRunning] = useState<{ p: number; label: string } | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const resultBox = useRef<HTMLDivElement>(null)

  const setPrefs = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p }
    setPrefsState(next)
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)) } catch { /* private mode */ }
  }

  useEffect(() => { hevcSupported().then(setHevc).catch(() => {}) }, [])
  useEffect(() => {
    if (!file) return
    setInfo(null); setError(null)
    probeVideo(file).then(setInfo).catch((e) => setError((e as Error).message))
  }, [file])
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url) }, [result])
  useEffect(() => { if (result) resultBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [result])

  const codec: Codec = hevc ? prefs.codec : 'h264'
  const settings = { ...prefs, codec }
  const plan = info ? planCompress(info, settings) : null
  const srcShort = info ? Math.min(info.width, info.height) : 0
  const sizes = [0, 1080, 720, 540, 480, 360].filter((s) => s === 0 || s < srcShort)

  const start = async () => {
    if (!file || !info || !plan) return
    setError(null); setResult(null)
    abort.current = new AbortController()
    const started = performance.now()
    setRunning({ p: 0, label: 'Starting…' })
    try {
      const out = await compressVideo(file, info, plan, (p, label) => setRunning({ p, label }), abort.current.signal)
      const secs = (performance.now() - started) / 1000
      const base = file.name.replace(/\.\w+$/, '').replace(/[^\w\- ]+/g, '').trim() || 'video'
      setResult({
        blob: out.blob, url: URL.createObjectURL(out.blob), file: `${base}-small.mp4`,
        info: `${out.width}×${out.height} · ${plan.fps} fps · ${codec === 'hevc' ? 'H.265' : 'H.264'} · ${secs.toFixed(0)}s`,
      })
    } catch (e) {
      if (!(e instanceof Cancelled)) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(null)
    }
  }

  const cancel = async () => {
    abort.current?.abort()
    await resetFFmpeg()
  }

  const save = async (r: Result) => {
    if (isNative) {
      try { await saveNative(r.blob, r.file, false); setToast(`${t('Saved to')} Documents/ApanaVidEditor/${r.file}`) } catch (e) { setToast((e as Error).message) }
      return
    }
    const a = document.createElement('a')
    a.href = r.url; a.download = r.file; a.click()
  }
  const share = async (r: Result) => {
    if (isNative) { await saveNative(r.blob, r.file, true).catch(() => {}); return }
    await navigator.share({ files: [new File([r.blob], r.file, { type: r.blob.type })] }).catch(() => {})
  }
  const canShare = isNative || typeof navigator.canShare === 'function'
  const saving = (after: number) => info ? Math.max(0, Math.round((1 - after / info.bytes) * 100)) : 0

  return (
    <div className="sheet-backdrop" onClick={running ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} data-testid="compress-sheet">
        <div className="sheet-grab" />
        <input ref={picker} type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null) } e.target.value = '' }} />
        {running ? (
          <>
            <h2>{t(running.label)}</h2>
            <div className="progress"><div style={{ width: `${Math.round(running.p * 100)}%` }} /></div>
            <p className="muted">{Math.round(running.p * 100)}% · {t(runsInBackground ? 'you can switch to other apps meanwhile' : isNative ? 'keep this screen open' : 'you can switch tabs, just keep this tab open')}</p>
            <button className="btn wide" onClick={cancel}>{t('Cancel')}</button>
          </>
        ) : (
          <>
            <h2>{t('Compress video')}</h2>
            {!file && <p className="muted small">{t('Makes a video file smaller. Works offline; the video never leaves your device.')}</p>}
            <button className="btn wide" onClick={() => picker.current?.click()}>{file ? t('Choose another video') : t('Choose a video')}</button>
            {file && !info && !error && <p className="muted small">{t('Reading the video…')}</p>}
            {info && plan && (
              <>
                <p className="small" data-testid="compress-source"><b>{info.name}</b><br /><span className="muted">{mb(info.bytes)} · {info.width}×{info.height} · {Math.round(info.fps)} fps · {fmtTime(info.duration, false)}</span></p>
                <span className="field-label">{t('Preset')}</span>
                <Chips options={PRESETS.map((o) => ({ ...o, label: t(o.label) }))} value={prefs.preset} onChange={(v) => setPrefs({ preset: v })} wrap />
                <p className="muted small">{t(HINT[prefs.preset])}</p>
                {prefs.preset === 'target' && (
                  <div className="target-size">
                    <span className="field-label">{t('Target size (MB)')}</span>
                    <input className="select" type="number" min={1} step={1} value={prefs.targetMB} aria-label="Target size (MB)"
                      onChange={(e) => setPrefs({ targetMB: Math.max(1, Number(e.target.value) || 1) })} />
                    <Chips options={[16, 25, 50, 100, 500].map((m) => ({ value: m, label: `${m} MB` }))} value={prefs.targetMB} onChange={(v) => setPrefs({ targetMB: v })} wrap />
                  </div>
                )}
                <span className="field-label">{t('Resolution')}</span>
                <Chips options={sizes.map((s) => ({ value: s, label: s ? `${s}p` : t('Auto') }))} value={sizes.includes(prefs.short) ? prefs.short : 0} onChange={(v) => setPrefs({ short: v })} />
                <span className="field-label">{t('Frame rate')}</span>
                <Chips options={[0, 30, 24].map((f) => ({ value: f, label: f ? `${f} fps` : t('Auto') }))} value={prefs.fps} onChange={(v) => setPrefs({ fps: v })} />
                {hevc && (
                  <>
                    <span className="field-label">{t('Codec')}</span>
                    <Chips options={[{ value: 'h264' as Codec, label: t('H.264 (plays everywhere)') }, { value: 'hevc' as Codec, label: t('H.265 (smaller)') }]} value={codec} onChange={(v) => setPrefs({ codec: v })} wrap />
                  </>
                )}
                <p className="compress-estimate" data-testid="compress-estimate">
                  {t('Estimated size')}: <b>~{mb(plan.bytes)}</b> <span className="muted">({t('now')} {mb(info.bytes)}, −{saving(plan.bytes)}%) · {plan.width}×{plan.height} · {plan.fps} fps</span>
                </p>
                {plan.capped && <p className="muted small">{t('This video is already well compressed, so it will not shrink much at this setting. Try a lower resolution or Target size.')}</p>}
                {prefs.preset === 'target' && plan.bytes < info.bytes && plan.videoBitrate < 300e3 && <p className="muted small">{t('Very small target for this length: the picture will be soft.')}</p>}
                <button className="btn primary wide" onClick={start} data-testid="compress-start">{t('Compress')}</button>
              </>
            )}
            {error && <p className="error-text">{error}</p>}
          </>
        )}
        {result && info && (
          <div className="results" ref={resultBox}>
            <div className="result">
              <video src={result.url} controls playsInline />
              <div className="result-meta">
                <b data-testid="compress-result">{mb(info.bytes)} → {mb(result.blob.size)} (−{saving(result.blob.size)}%)</b>
                <span className="muted small">{result.info}</span>
              </div>
              {result.blob.size >= info.bytes && <p className="muted small">{t('The new file is not smaller. Keep the original, or try a lower setting.')}</p>}
              <div className="row">
                <button className="btn primary" onClick={() => save(result)}>{t('Save')}</button>
                {canShare && <button className="btn" onClick={() => share(result)}>{t('Share')}</button>}
              </div>
            </div>
          </div>
        )}
        {toast && <p className="muted small">{toast}</p>}
        {!running && <button className="btn wide ghost" onClick={onClose}>{t('Close')}</button>}
      </div>
    </div>
  )
}
