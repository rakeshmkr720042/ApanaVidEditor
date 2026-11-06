import { useEffect, useRef, useState } from 'react'
import type { MediaSource } from '../types'
import { SheetClose, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'
import { makeProxy, wantsProxy } from '../engine/proxy'
import { Cancelled } from '../engine/exporter'
import { Icon } from './Icon'

const mb = (b: number) => `${(b / 1048576).toFixed(b > 100 * 1048576 ? 0 : 1)} MB`

/**
 * Preview copies of the project's videos: make them (one by one, with progress), play them while editing,
 * delete them. Exporting always uses the original files.
 */
export function ProxySheet({ videos, use, onUse, onMade, onDelete, onClose, onToast }: {
  videos: MediaSource[]
  use: boolean; onUse: (v: boolean) => void
  onMade: (id: string, blob: Blob) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void; onToast: (s: string) => void
}) {
  const [job, setJob] = useState<{ id: string; p: number } | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const make = async (list: MediaSource[]) => {
    abort.current = new AbortController()
    const signal = abort.current.signal
    let made = 0
    try {
      for (const s of list) {
        if (signal.aborted) break
        setJob({ id: s.id, p: 0 })
        const blob = await makeProxy(s, (p) => setJob({ id: s.id, p }), signal)
        if (signal.aborted) break
        await onMade(s.id, blob)
        made++
      }
      if (made) onToast(`${made} ${t('preview copies made. The preview now plays them; export still uses the originals.')}`)
    } catch (e) {
      if (!(e instanceof Cancelled) && !signal.aborted) onToast(t((e as Error).message))
    } finally { setJob(null); abort.current = null }
  }

  const big = videos.filter((s) => wantsProxy(s) && !s.proxy)
  return (
    <div className="sheet-backdrop" onClick={job ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} data-testid="proxy-sheet">
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} disabled={!!job} />
        <h2><Icon name="compress" size={20} /> {t('Preview copies')}</h2>
        <p className="muted small">{t('Big videos (4K, long phone recordings) can make the preview slow. A preview copy is a light 540p copy that plays while you edit. The exported video always uses the original files, in full quality.')}</p>
        <Toggle label="Play preview copies while editing" value={use} onChange={onUse} />
        {big.length > 0 && <button className="btn primary wide" disabled={!!job} onClick={() => make(big)}>{t('Make copies for big videos')} ({big.length})</button>}
        <div className="relink-list">
          {videos.map((s) => (
            <div className="relink-row" key={s.id}>
              <span className="relink-icon"><Icon name="film" size={20} /></span>
              <span className="relink-text">
                <b>{s.name}</b>
                <span className="muted small">{s.width}×{s.height} · {mb(s.file.size)}{s.proxy ? ` · ${t('copy')} ${mb(s.proxy.file.size)}` : ''}</span>
                {job?.id === s.id && <span className="progress" style={{ marginTop: 4 }}><div style={{ width: `${Math.round(job.p * 100)}%` }} /></span>}
              </span>
              {job?.id === s.id
                ? <button className="btn small" onClick={() => abort.current?.abort()}>{t('Stop')}</button>
                : s.proxy
                  ? <button className="btn small" disabled={!!job} onClick={() => onDelete(s.id)}>{t('Delete copy')}</button>
                  : <button className="btn small" disabled={!!job} onClick={() => make([s])}>{t('Make copy')}</button>}
            </div>
          ))}
        </div>
        {videos.length === 0 && <p className="small">{t('This project has no videos.')}</p>}
      </div>
    </div>
  )
}
