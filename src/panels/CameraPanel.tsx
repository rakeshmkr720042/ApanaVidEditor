import { useState } from 'react'
import type { Clip } from '../types'
import type { Editor } from '../model/useEditor'
import { CAMERA_PRESETS, cameraKeys, type CameraId } from '../model/camera'
import { Panel, Slider } from '../ui/kit'
import { t } from '../lib/i18n'

/**
 * Cinematic camera moves: one tap writes a push-in, crash zoom, handheld, shake… as zoom & move keyframes on the
 * clip (or on every clip). Picking another move replaces it; Zoom & move can fine-tune it afterwards.
 */
export function CameraPanel({ ed, clip, onToast, onClose }: { ed: Editor; clip: Clip; onToast: (s: string) => void; onClose: () => void }) {
  const cur = clip.camera ?? null
  const [strength, setStrength] = useState(cur?.strength ?? 0.6)
  const apply = (id: CameraId, s = strength) => ed.updateClip(clip.id, { pos: null, keys: cameraKeys(clip, id, s), camera: { id, strength: s } })
  const toAll = () => {
    if (!cur) return
    const id = cur.id as CameraId
    ed.replaceProject({
      ...ed.project,
      clips: ed.project.clips.map((c) => (ed.sources[c.sourceId]?.kind === 'audio' || c.fromTemplate ? c : { ...c, pos: null, keys: cameraKeys(c, id, strength), camera: { id, strength } })),
    })
    onToast(t('The camera move is on every clip. Undo takes it back.'))
  }
  return (
    <Panel title="Camera moves" onClose={onClose} tall>
      <p className="muted small">{t('Cinematic moves in one tap. They become zoom & move keyframes, so the export looks the same.')}</p>
      <div className="preset-grid camera-moves">
        {CAMERA_PRESETS.map((p) => (
          <button key={p.id} className={`preset-card${cur?.id === p.id ? ' on' : ''}`} onClick={() => apply(p.id)}>
            <b><span aria-hidden>{p.icon}</span> {t(p.name)}</b>
            <small>{t(p.info)}</small>
          </button>
        ))}
      </div>
      <Slider label="Strength" min={0.1} max={1} step={0.05} value={strength} format={(v) => `${Math.round(v * 100)}%`}
        onStart={ed.begin} onEnd={ed.end} onChange={(v) => { setStrength(v); if (cur) apply(cur.id as CameraId, v) }} />
      <div className="row">
        <button className="btn" disabled={!cur} onClick={toAll}>{t('Use on all clips')}</button>
        <button className="btn" disabled={!cur && !clip.keys?.length} onClick={() => ed.updateClip(clip.id, { pos: null, keys: [], camera: null })}>{t('Remove')}</button>
      </div>
    </Panel>
  )
}
