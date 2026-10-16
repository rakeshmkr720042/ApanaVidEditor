import { useEffect, useRef, useState } from 'react'
import type { MediaSource, Project } from '../types'
import { exportProject, Cancelled, type ExportJob, type Format, type Resolution } from '../engine/exporter'
import { exportFast, isSimpleProject } from '../lib/export'
import { resetFFmpeg } from '../lib/ffmpeg'
import { isNative, saveNative } from '../lib/save'
import { layoutClips } from '../model/timeline'
import { fmtTime } from '../lib/format'
import { Chips, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

interface Props {
  project: Project
  sources: Record<string, MediaSource>
  name: string
  snapshot: (time: number) => Promise<string | null>
  onClose: () => void
}

interface Result { id: string; label: string; blob: Blob; url: string; file: string; cover: Blob | null; info: string }

const FORMATS: { value: Format; label: string }[] = [
  { value: 'mp4', label: 'MP4' }, { value: 'webm', label: 'WebM' }, { value: 'mov', label: 'MOV' }, { value: 'gif', label: 'GIF' }, { value: 'mp3', label: 'MP3 (audio)' },
]
const RES: { value: Resolution; label: string }[] = [
  { value: '480', label: '480p' }, { value: '720', label: '720p' }, { value: '1080', label: '1080p' }, { value: '1440', label: '2K' },
]

const describe = (j: ExportJob) => `${j.format.toUpperCase()}${j.format === 'mp3' ? '' : ` · ${RES.find((r) => r.value === j.resolution)?.label} · ${j.fps}fps`}`

export function ExportSheet({ project, sources, name, snapshot, onClose }: Props) {
  const total = layoutClips(project.clips).total
  const simple = isSimpleProject(project, sources)
  const [format, setFormat] = useState<Format>('mp4')
  const [res, setRes] = useState<Resolution>('1080')
  const [fps, setFps] = useState(30)
  const [watermark, setWatermark] = useState(true)
  const [useCover, setUseCover] = useState(false)
  const [coverT, setCoverT] = useState(Math.min(1, total / 2))
  const [coverImg, setCoverImg] = useState<string | null>(null)
  const [fast, setFast] = useState(false)
  const [batch, setBatch] = useState<ExportJob[]>([])
  const [running, setRunning] = useState<{ i: number; n: number; p: number; label: string } | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => results.forEach((r) => URL.revokeObjectURL(r.url)), [results])
  useEffect(() => {
    if (!useCover) return
    let live = true
    const id = setTimeout(() => snapshot(coverT).then((u) => live && setCoverImg(u)), 150)
    return () => { live = false; clearTimeout(id) }
  }, [useCover, coverT, snapshot])

  const job = (): ExportJob => ({ format, resolution: format === 'gif' ? '480' : res, fps, watermark: watermark ? 'ClipCut' : null, cover: useCover ? coverT : null })

  const run = async (jobs: ExportJob[]) => {
    setError(null)
    abort.current = new AbortController()
    const base = name.replace(/[^\w\- ]+/g, '').trim() || 'clipcut'
    try {
      for (const [i, j] of jobs.entries()) {
        setRunning({ i, n: jobs.length, p: 0, label: 'Starting…' })
        const onP = (p: number, label: string) => setRunning({ i, n: jobs.length, p, label })
        const started = performance.now()
        if (fast && simple && jobs.length === 1) {
          const out = await exportFast(project, sources, onP)
          const file = `${base}.${out.ext}`
          setResults((r) => [...r, { id: crypto.randomUUID(), label: 'Original quality', blob: out.blob, url: URL.createObjectURL(out.blob), file, cover: null, info: `${(out.blob.size / 1048576).toFixed(1)} MB` }])
          continue
        }
        const out = await exportProject(project, sources, j, onP, abort.current.signal)
        const secs = (performance.now() - started) / 1000
        const file = `${base}${jobs.length > 1 ? `-${j.resolution}p` : ''}.${out.ext}`
        setResults((r) => [...r, {
          id: crypto.randomUUID(), label: describe(j), blob: out.blob, url: URL.createObjectURL(out.blob), file, cover: out.cover,
          info: `${(out.blob.size / 1048576).toFixed(1)} MB${out.width ? ` · ${out.width}×${out.height}` : ''} · ${secs.toFixed(0)}s`,
        }])
      }
      setBatch([])
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
      try { await saveNative(r.blob, r.file, false); setToast(`${t('Saved to')} Documents/ClipCut/${r.file}`) } catch (e) { setToast((e as Error).message) }
      return
    }
    const a = document.createElement('a')
    a.href = r.url; a.download = r.file; a.click()
  }
  const share = async (r: Result) => {
    if (isNative) { await saveNative(r.blob, r.file, true).catch(() => {}); return }
    await navigator.share({ files: [new File([r.blob], r.file, { type: r.blob.type })] }).catch(() => {})
  }
  const saveCover = (r: Result) => {
    if (!r.cover) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(r.cover); a.download = r.file.replace(/\.\w+$/, '-cover.jpg'); a.click()
  }
  const canShare = isNative || typeof navigator.canShare === 'function'

  return (
    <div className="sheet-backdrop" onClick={running ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        {running ? (
          <>
            <h2>{running.n > 1 ? `${running.i + 1}/${running.n} · ` : ''}{t(running.label)}</h2>
            <div className="progress"><div style={{ width: `${Math.round(running.p * 100)}%` }} /></div>
            <p className="muted">{Math.round(running.p * 100)}% · {t('keep this screen open')}</p>
            <button className="btn wide" onClick={cancel}>{t('Cancel')}</button>
          </>
        ) : (
          <>
            <h2>{t('Export')} <span className="muted small">{fmtTime(total)}</span></h2>
            {simple && (
              <Toggle label="Keyframe-free cut, original quality" value={fast} onChange={setFast} />
            )}
            {!(fast && simple) && (
              <>
                <span className="field-label">{t('Format')}</span>
                <Chips options={FORMATS} value={format} onChange={setFormat} wrap />
                {format !== 'mp3' && (
                  <>
                    <span className="field-label">{t('Resolution')}</span>
                    <Chips options={format === 'gif' ? RES.slice(0, 1) : RES} value={format === 'gif' ? '480' : res} onChange={setRes} />
                    {format !== 'gif' && (
                      <>
                        <span className="field-label">{t('Frame rate')}</span>
                        <Chips options={[24, 25, 30, 60].map((f) => ({ value: f, label: `${f} fps` }))} value={fps} onChange={setFps} />
                      </>
                    )}
                    <Toggle label="Watermark" value={watermark} onChange={setWatermark} />
                    {(format === 'mp4' || format === 'mov') && <Toggle label="Choose cover image" value={useCover} onChange={setUseCover} />}
                    {useCover && (format === 'mp4' || format === 'mov') && (
                      <div className="cover-pick">
                        {coverImg ? <img src={coverImg} alt="" /> : <div className="cover-empty" />}
                        <Slider label="Cover" min={0} max={Math.max(0.01, total - 0.05)} value={coverT} format={fmtTime} onChange={setCoverT} />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            {batch.length > 0 && (
              <div className="batch">
                <span className="field-label">{t('Batch')} ({batch.length})</span>
                {batch.map((b, i) => (
                  <div key={i} className="batch-row"><span>{describe(b)}</span><button className="icon-btn" onClick={() => setBatch(batch.filter((_, k) => k !== i))}>✕</button></div>
                ))}
              </div>
            )}
            {error && <p className="error-text">{error}</p>}
            <div className="row">
              {!(fast && simple) && <button className="btn" onClick={() => setBatch([...batch, job()])}>+ {t('Batch')}</button>}
              <button className="btn primary grow" disabled={total <= 0} onClick={() => run(batch.length ? batch : [job()])}>
                {batch.length ? `${t('Export all')} (${batch.length})` : t('Export')}
              </button>
            </div>
          </>
        )}
        {results.length > 0 && (
          <div className="results">
            {results.map((r) => (
              <div key={r.id} className="result">
                {r.blob.type.startsWith('video') ? <video src={r.url} controls playsInline /> : r.blob.type.startsWith('image') ? <img src={r.url} alt="" /> : <audio src={r.url} controls />}
                <div className="result-meta"><b>{r.label}</b><span className="muted small">{r.info}</span></div>
                <div className="row">
                  <button className="btn primary" onClick={() => save(r)}>{t('Save')}</button>
                  {canShare && <button className="btn" onClick={() => share(r)}>{t('Share')}</button>}
                  {r.cover && <button className="btn" onClick={() => saveCover(r)}>{t('Cover')}</button>}
                </div>
              </div>
            ))}
          </div>
        )}
        {toast && <p className="muted small">{toast}</p>}
        {!running && <button className="btn wide ghost" onClick={onClose}>{t('Close')}</button>}
      </div>
    </div>
  )
}
