import { useRef, useState } from 'react'
import type { Layer, StickerLayer } from '../types'
import type { Editor } from '../model/useEditor'
import { TAG_KINDS, keysFromPath, makeTag, tagOf, tagsIn, type TagKind } from '../model/followTag'
import { boxAt, hasBox } from '../model/keyframes'
import { faceAt, followPath } from '../engine/followTag'
import { warn } from '../lib/blackbox'
import { fmtTime } from '../lib/format'
import { Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

/**
 * Follow tags: put a name tag, arrow, price tag, emoji or ring on a person or thing, and it moves with them.
 * Add the tag (on the face found by AI, or in the middle), drag its pointer onto the thing if needed, tap Follow.
 */
export function FollowTagPanel({ ed, time, onSeek, onToast, onClose }: {
  ed: Editor; time: number; onSeek: (t: number) => void; onToast: (s: string) => void; onClose: () => void
}) {
  const [kind, setKind] = useState<TagKind>('name')
  const [text, setText] = useState('')
  const [onFace, setOnFace] = useState(true)
  const [size, setSize] = useState(0.4)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const stop = useRef(false)
  const def = TAG_KINDS.find((k) => k.id === kind)!
  const tags = tagsIn(ed.project.layers)
  const selLayer = ed.sel?.type === 'layer' ? ed.project.layers.find((l) => l.id === ed.sel!.id) : undefined
  const current = selLayer ? tagOf(selLayer) : null
  const members = current ? tags.get(current) ?? [] : []
  const total = ed.layout.total

  const add = async () => {
    if (!total) return
    const len = Math.max(0.5, Math.min(5, total - time))
    let at = { x: 0.5, y: 0.5 }
    if (onFace) {
      setBusy(t('Finding the face…'))
      const f = await faceAt(ed.project, ed.sources, time).catch((e) => { warn('Follow tag: face finding failed', e); return null })
      setBusy(null)
      if (f && f.x > 0.02 && f.x < 0.98 && f.y > 0.02 && f.y < 0.98) at = f
      else onToast(t('No face found here; the tag is in the middle. Drag it onto the person or thing.'))
    }
    // a name tag points down at the head: its pointer sits just above the face
    const y = def.text ? Math.max(0.16, at.y - 0.12) : at.y
    const layers = makeTag(kind, text, at.x, y, time, len)
    ed.replaceProject({ ...ed.project, layers: [...ed.project.layers, ...layers] })
    ed.setSel({ type: 'layer', id: layers[0].id })
    setResult(t('Tag added. Drag it onto the thing if needed, then tap Follow it.'))
  }

  const follow = async () => {
    const pointer = members.find((l): l is StickerLayer => l.type === 'sticker') ?? (members.find(hasBox) as StickerLayer | undefined)
    if (!pointer) return
    const start = Math.min(...members.map((l) => l.start)), end = Math.max(...members.map((l) => l.end))
    const t0 = Math.max(start, Math.min(end - 1e-3, time))
    const b = boxAt(pointer, t0)
    // a name tag's pointer sits above the head: follow the head just under it
    const fy = Math.min(0.98, b.y + (members.some((l) => l.type === 'text') ? 0.1 : 0))
    stop.current = false
    setResult(null)
    setBusy(`${t('Following…')} 0%`)
    const r = await followPath(ed.project, ed.sources, b.x, fy, t0, start, end, size, (q) => setBusy(`${t('Following…')} ${Math.round(q * 100)}%`), () => stop.current)
      .catch((e: Error) => { warn('Follow tag: tracking failed', e); return null })
    setBusy(null)
    if (stop.current) return
    if (!r) { setResult(t('Could not follow it. Try a bigger area or a spot with more detail.')); return }
    const ids = new Set(members.map((l) => l.id))
    ed.updateLayers((l) => ids.has(l.id), (l) => (hasBox(l) ? { keys: keysFromPath({ ...l, box: boxAt(l, t0) } as Layer & { box: typeof b }, r.path, t0) } : {}) as Partial<Layer>)
    const from = r.path[0].t, to = r.path[r.path.length - 1].t
    setResult(`${t('Following from')} ${fmtTime(from)} ${t('to')} ${fmtTime(to)}${r.lost !== null ? ` · ${t('lost it at')} ${fmtTime(r.lost)}` : ''}`)
    onSeek(from)
  }

  const unfollow = () => { const ids = new Set(members.map((l) => l.id)); ed.updateLayers((l) => ids.has(l.id), () => ({ keys: [] }) as Partial<Layer>) }
  const removeTag = () => {
    const ids = new Set(members.map((l) => l.id))
    ed.replaceProject({ ...ed.project, layers: ed.project.layers.filter((l) => !ids.has(l.id)) })
    ed.setSel(null)
  }

  return (
    <Panel title="Follow tag" onClose={onClose} tall>
      <p className="muted small">{t('A name tag, arrow, price tag, emoji or circle that moves with a person or thing.')}</p>
      <div className="preset-grid">
        {TAG_KINDS.map((k) => (
          <button key={k.id} className={`preset-card${kind === k.id ? ' on' : ''}`} onClick={() => setKind(k.id)}>
            <b><span aria-hidden>{k.icon}</span> {t(k.name)}</b>
          </button>
        ))}
      </div>
      {def.text && <input className="text-input" value={text} maxLength={40} placeholder={t(def.text)} onChange={(e) => setText(e.target.value)} aria-label={t('Tag text')} />}
      <Toggle label="Put it on the face (AI)" value={onFace} onChange={setOnFace} />
      <button className="btn primary" disabled={!!busy || !total} onClick={add}>➕ {t('Add tag here')}</button>

      <span className="field-label">{t('Follow')}</span>
      {current
        ? <p className="muted small">{t('This tag')}: {members.length} {t('items')} · {fmtTime(Math.min(...members.map((l) => l.start)))}–{fmtTime(Math.max(...members.map((l) => l.end)))}</p>
        : <p className="muted small">{t('Select a tag (tap it in the video) to make it follow.')}</p>}
      <Slider label="Area to follow" min={0} max={1} value={size} format={(v) => (v < 0.34 ? t('Small') : v < 0.67 ? t('Medium') : t('Large'))} onChange={setSize} />
      {busy
        ? <div className="row"><span className="muted small">{busy}</span><button className="btn small" onClick={() => { stop.current = true }}>{t('Stop')}</button></div>
        : <button className="btn primary" disabled={!current} onClick={follow}>🎯 {t('Follow it')}</button>}
      {result && <p className="small">{result}</p>}
      {current && !busy && (
        <div className="row">
          <button className="btn small" onClick={unfollow}>{t('Stop following')}</button>
          <button className="btn small" onClick={removeTag}>{t('Delete tag')}</button>
        </div>
      )}
      {tags.size > 0 && <p className="muted small">{tags.size} {t('tags in this video')}</p>}
    </Panel>
  )
}
