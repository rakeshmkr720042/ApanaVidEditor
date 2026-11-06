import { useEffect, useRef, useState } from 'react'
import type { Clip } from '../types'
import type { Editor } from '../model/useEditor'
import { Chips, Panel } from '../ui/kit'
import { fmtTime } from '../lib/format'
import { t } from '../lib/i18n'
import { localOfSrc } from '../model/clipKeys'
import { DEFAULT_SCENE, findSceneCuts } from '../engine/sceneDetect'

const LEVELS = [{ value: 0.25, label: 'Only clear cuts' }, { value: 0.5, label: 'Normal' }, { value: 0.8, label: 'Soft cuts too' }]

/** Scene detection for one video clip: find its shots, then split it into them or mark them. */
export function ScenePanel({ ed, clip, onSeek, onClose, onToast }: {
  ed: Editor; clip: Clip; onSeek: (t: number) => void; onClose: () => void; onToast: (s: string) => void
}) {
  const [level, setLevel] = useState(0.5)
  const [progress, setProgress] = useState<number | null>(null)
  const [cuts, setCuts] = useState<number[] | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  const src = ed.sources[clip.sourceId]
  const start = ed.layout.items.find((x) => x.clip.id === clip.id)?.start ?? 0
  const timeOf = (s: number) => start + (localOfSrc(clip, s) ?? 0)

  const find = async () => {
    if (!src) return
    abort.current = new AbortController()
    setCuts(null); setProgress(0)
    try {
      const found = await findSceneCuts(src, clip.in, clip.out, { ...DEFAULT_SCENE, sensitivity: level }, setProgress, abort.current.signal)
      setCuts(found)
    } catch (e) { onToast(t((e as Error).message)) } finally { setProgress(null); abort.current = null }
  }
  const split = () => {
    if (!cuts?.length) return
    const n = ed.splitClipAt(clip.id, cuts)
    onToast(`${t('Split into')} ${n + 1} ${t('shots. Undo takes it back.')}`)
    onClose()
  }
  const mark = () => {
    if (!cuts?.length) return
    ed.begin()
    cuts.forEach((c, i) => ed.addMarker(timeOf(c), `${t('Shot')} ${i + 2}`))
    ed.end()
    onToast(`${cuts.length} ${t('markers added')}`)
  }

  if (src?.kind !== 'video') return <Panel title="Find shots" onClose={onClose}><p className="muted small">{t('Pick a video clip.')}</p></Panel>
  return (
    <Panel title="Find shots" onClose={onClose}>
      <p className="muted small">{t('Finds the camera cuts inside this video (a film, a highlights reel, a recording of many shots), so you can split it into its shots in one go.')}</p>
      <Chips options={LEVELS} value={level} onChange={(v) => { setLevel(v); setCuts(null) }} />
      {progress === null
        ? <button className="btn primary wide" onClick={find} data-testid="find-shots">{t('Find shots')}</button>
        : (
          <div className="row">
            <div className="progress" style={{ flex: 1 }}><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <button className="btn small" onClick={() => abort.current?.abort()}>{t('Stop')}</button>
          </div>
        )}
      {cuts && (cuts.length === 0
        ? <p className="small">{t('No cuts found. Try "Soft cuts too".')}</p>
        : (
          <>
            <p className="small"><b>{cuts.length + 1}</b> {t('shots found')}</p>
            <div className="scene-cuts">
              {cuts.map((c, i) => <button key={c} className="btn small" onClick={() => onSeek(timeOf(c))}>{t('Shot')} {i + 2} · {fmtTime(timeOf(c))}</button>)}
            </div>
            <div className="row">
              <button className="btn primary" onClick={split} data-testid="split-shots">{t('Split into shots')}</button>
              <button className="btn" onClick={mark}>{t('Add markers')}</button>
            </div>
          </>
        ))}
    </Panel>
  )
}
