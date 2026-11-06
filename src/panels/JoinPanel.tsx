import { useEffect, useRef, useState } from 'react'
import type { Clip } from '../types'
import type { Editor } from '../model/useEditor'
import { Panel } from '../ui/kit'
import { t } from '../lib/i18n'
import { saveMedia } from '../lib/db'
import { renderClips } from '../lib/compound'
import { Cancelled } from '../engine/exporter'

/** Join main-video clips into one compound clip, or break a compound clip apart. */
export function JoinPanel({ ed, clip, onClose, onToast }: { ed: Editor; clip: Clip; onClose: () => void; onToast: (s: string) => void }) {
  const clips = ed.project.clips
  const i = clips.findIndex((c) => c.id === clip.id)
  const [to, setTo] = useState(() => Math.min(clips.length - 1, i + 1))
  const [job, setJob] = useState<{ p: number; label: string } | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  const from = Math.min(i, to), last = Math.max(i, to)

  const join = async () => {
    abort.current = new AbortController()
    setJob({ p: 0, label: 'Starting…' })
    try {
      const src = await renderClips(ed.project, ed.sources, from, last, (p, label) => setJob({ p, label }), abort.current.signal)
      ed.addSource(src)
      await saveMedia(src)
      ed.joinClips(from, last, src)
      onToast(`${last - from + 1} ${t('clips joined into one. Break apart brings them back.')}`)
      onClose()
    } catch (e) {
      if (!(e instanceof Cancelled)) onToast(t((e as Error).message))
    } finally { setJob(null); abort.current = null }
  }

  if (clip.compound) {
    return (
      <Panel title="Join clips" onClose={onClose}>
        <p className="small">{t('This clip was made from')} <b>{clip.compound.clips.length}</b> {t('clips.')}</p>
        <button className="btn primary wide" onClick={() => { ed.breakApart(clip.id); onToast(t('Back to the separate clips.')); onClose() }} data-testid="break-apart">{t('Break apart')}</button>
        <p className="muted small">{t('Break apart puts the original clips back, as they were before joining. Changes made to the joined clip itself go away.')}</p>
      </Panel>
    )
  }
  return (
    <Panel title="Join clips" onClose={onClose}>
      <p className="muted small">{t('Makes several clips one clip (like a nested sequence): it then moves, trims and takes effects, speed and colour as one. The original clips are kept inside, so you can break it apart again.')}</p>
      {clips.length < 2 ? <p className="small">{t('Add another clip first.')}</p> : (
        <>
          <span className="field-label">{t('Join clip')} {i + 1} {t('with clips up to')}</span>
          <div className="join-list">
            {clips.map((c, k) => (
              <button key={c.id} disabled={k === i || !!job} className={k >= from && k <= last ? 'on' : ''} onClick={() => setTo(k)}>
                <img src={ed.sources[c.sourceId]?.thumbs[0]} alt="" /><span>{k + 1}</span>
              </button>
            ))}
          </div>
          {job
            ? (
              <div className="row">
                <div className="progress" style={{ flex: 1 }}><div style={{ width: `${Math.round(job.p * 100)}%` }} /></div>
                <button className="btn small" onClick={() => abort.current?.abort()}>{t('Stop')}</button>
              </div>
            )
            : <button className="btn primary wide" disabled={last === from} onClick={join} data-testid="join-clips">{t('Join clips')} {from + 1}–{last + 1}</button>}
          {job && <p className="muted small">{t(job.label)}</p>}
        </>
      )}
    </Panel>
  )
}
