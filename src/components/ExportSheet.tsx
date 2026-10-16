import { useEffect, useState } from 'react'
import type { Clip, MediaSource } from '../types'
import type { ExportMode, Resolution } from '../lib/export'
import { exportTimeline } from '../lib/export'
import { resetFFmpeg } from '../lib/ffmpeg'
import { isNative, saveNative } from '../lib/save'

interface Props {
  clips: Clip[]
  sources: Record<string, MediaSource>
  onClose: () => void
}

type Phase =
  | { kind: 'options' }
  | { kind: 'running'; progress: number; label: string }
  | { kind: 'done'; url: string; blob: Blob; name: string }
  | { kind: 'error'; message: string }

export function ExportSheet({ clips, sources, onClose }: Props) {
  const [mode, setMode] = useState<ExportMode>('fast')
  const [res, setRes] = useState<Resolution>('720')
  const [phase, setPhase] = useState<Phase>({ kind: 'options' })
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => () => { if (phase.kind === 'done') URL.revokeObjectURL(phase.url) }, [phase])

  const start = async () => {
    setPhase({ kind: 'running', progress: 0, label: 'Loading editor engine…' })
    try {
      const { blob, ext } = await exportTimeline(clips, sources, { mode, resolution: res }, (progress, label) =>
        setPhase({ kind: 'running', progress, label }),
      )
      const name = `clipcut-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`
      setPhase({ kind: 'done', blob, url: URL.createObjectURL(blob), name })
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const cancel = async () => {
    await resetFFmpeg()
    setPhase({ kind: 'options' })
  }

  const share = async () => {
    if (phase.kind !== 'done') return
    if (isNative) { await saveNative(phase.blob, phase.name, true).catch(() => {}); return }
    const file = new File([phase.blob], phase.name, { type: phase.blob.type })
    await navigator.share({ files: [file] }).catch(() => {})
  }
  const saveApp = async () => {
    if (phase.kind !== 'done') return
    try {
      await saveNative(phase.blob, phase.name, false)
      setSaved(`Saved to Documents/ClipCut/${phase.name}`)
    } catch (e) {
      setSaved(`Could not save: ${e instanceof Error ? e.message : e}`)
    }
  }
  const canShare = isNative || phase.kind === 'done' && !!navigator.canShare?.({ files: [new File([phase.blob], phase.name, { type: phase.blob.type })] })

  return (
    <div className="sheet-backdrop" onClick={phase.kind === 'running' ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        {phase.kind === 'options' && (
          <>
            <h2>Export video</h2>
            <label className="field-label">Quality</label>
            <div className="seg">
              <button className={mode === 'fast' ? 'on' : ''} onClick={() => setMode('fast')}>
                <b>Fast</b><small>Original quality, cuts at nearest keyframe</small>
              </button>
              <button className={mode === 'accurate' ? 'on' : ''} onClick={() => setMode('accurate')}>
                <b>Accurate</b><small>Frame-exact, re-encodes (slower)</small>
              </button>
            </div>
            {mode === 'accurate' && (
              <>
                <label className="field-label">Resolution</label>
                <div className="chips">
                  {(['480', '720', '1080', 'original'] as const).map((r) => (
                    <button key={r} className={res === r ? 'on' : ''} onClick={() => setRes(r)}>
                      {r === 'original' ? 'Original' : `${r}p`}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button className="btn primary wide" onClick={start}>Export MP4</button>
          </>
        )}
        {phase.kind === 'running' && (
          <>
            <h2>{phase.label}</h2>
            <div className="progress"><div style={{ width: `${Math.round(phase.progress * 100)}%` }} /></div>
            <p className="muted">{Math.round(phase.progress * 100)}% · keep this screen open</p>
            <button className="btn wide" onClick={cancel}>Cancel</button>
          </>
        )}
        {phase.kind === 'done' && (
          <>
            <h2>Ready</h2>
            <video className="result" src={phase.url} controls playsInline />
            <p className="muted">{saved ?? `${(phase.blob.size / 1024 / 1024).toFixed(1)} MB`}</p>
            <div className="row">
              {isNative
                ? <button className="btn primary" onClick={saveApp}>Save</button>
                : <a className="btn primary" href={phase.url} download={phase.name}>Save</a>}
              {canShare && <button className="btn" onClick={share}>Share</button>}
              <button className="btn" onClick={onClose}>Done</button>
            </div>
          </>
        )}
        {phase.kind === 'error' && (
          <>
            <h2>Export failed</h2>
            <p className="muted">{phase.message}</p>
            <div className="row">
              <button className="btn primary" onClick={() => setPhase({ kind: 'options' })}>Try again</button>
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
