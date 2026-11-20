import { useRef, useState } from 'react'
import type { AspectRatio, Project } from '../types'
import type { Editor } from '../model/useEditor'
import { REFRAME_SHAPES, lookTimes, reframeProject, type ReframeStyle } from '../model/reframe'
import { findLooks } from '../engine/reframe'
import { warn } from '../lib/blackbox'
import { Chips, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

const KEY = 'auto-reframe'
interface Saved { aspect: AspectRatio; style: ReframeStyle; zoom: number; copy: boolean }
function load(): Saved {
  const d: Saved = { aspect: '9:16', style: 'follow', zoom: 1, copy: true }
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return d }
}

/**
 * Auto reframe: a wide (16:9) video made into a 9:16 Reel / Short (or 1:1, 4:5), the picture following the
 * person's face. The face is found on this device; the moves become zoom & move keyframes on each clip.
 */
export function ReframePanel({ ed, onToast, onCopy, onClose }: {
  ed: Editor; onToast: (s: string) => void; onCopy: (p: Project, label: string) => void; onClose: () => void
}) {
  const [s, setS] = useState(load)
  const [busy, setBusy] = useState<string | null>(null)
  const stop = useRef(false)
  const set = (patch: Partial<Saved>) => setS((o) => { const n = { ...o, ...patch }; try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { /* private mode */ } return n })
  const hasVideo = ed.project.clips.some((c) => ed.sources[c.sourceId]?.kind === 'video' || ed.sources[c.sourceId]?.kind === 'image')

  const run = async () => {
    stop.current = false
    setBusy(`${t('Finding the face…')} 0%`)
    const times = lookTimes(ed.project, ed.sources)
    const res = await findLooks(ed.sources, times, (q) => setBusy(`${t('Finding the face…')} ${Math.round(q * 100)}%`), () => stop.current)
      .catch((e) => { warn('Auto reframe: face finding failed, using the middle', e); return { ok: false, looks: {} } })
    if (stop.current) { setBusy(null); return }
    const next = reframeProject(ed.project, ed.sources, res.looks, { aspect: s.aspect, style: s.style, zoom: s.zoom })
    setBusy(null)
    if (!res.ok) onToast(t('Face finding does not work on this device; the video is framed in the middle'))
    if (s.copy) onCopy(next, `${t('Reframe')} ${s.aspect}`)
    else {
      ed.replaceProject(next)
      onToast(`✅ ${t('Reframed to')} ${s.aspect}. ${t('Undo takes it back.')}`)
    }
  }

  return (
    <Panel title="Auto reframe" onClose={onClose} tall>
      <p className="muted small">{t('Makes a wide video tall for Reels and Shorts. The picture follows the person’s face, like a camera operator. Found on this device, nothing is uploaded.')}</p>
      <span className="field-label">{t('New shape')}</span>
      <Chips options={REFRAME_SHAPES.map((x) => ({ value: x.value, label: x.label }))} value={s.aspect} onChange={(aspect) => set({ aspect })} />
      <span className="field-label">{t('Camera')}</span>
      <Chips options={[{ value: 'follow' as const, label: 'Smooth follow' }, { value: 'steady' as const, label: 'Steady camera' }]} value={s.style} onChange={(style) => set({ style })} />
      <p className="muted small">{s.style === 'follow' ? t('Glides with the person all the time. Best for vlogs and people walking.') : t('Stays still and moves only when the person leaves the middle. Best for talking videos and podcasts.')}</p>
      <Slider label="Zoom closer" min={1} max={1.5} step={0.05} value={s.zoom} format={(v) => `${Math.round(v * 100)}%`} onChange={(zoom) => set({ zoom })} />
      <Toggle label="Save as a new project (keep this one as it is)" value={s.copy} onChange={(copy) => set({ copy })} />
      {busy && <p className="muted small">{busy}</p>}
      {busy
        ? <button className="btn" onClick={() => { stop.current = true }}>✋ {t('Stop')}</button>
        : <button className="btn primary" disabled={!hasVideo} onClick={run}>📱 {t('Auto reframe')}</button>}
      <p className="muted small">{t('It replaces the clips’ zoom & move keyframes. Fine-tune any clip later in Zoom & move.')}</p>
    </Panel>
  )
}
