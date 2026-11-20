import { useEffect, useState } from 'react'
import type { Clip, SceneFx, ScenePack } from '../types'
import type { Editor } from '../model/useEditor'
import { Chips, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'
import { isAllowed, usePremium } from '../lib/premium'
import { cutoutFailed, loadCutout } from '../engine/cutout'
import { SCENE_MODES, SCENE_PACKS, defaultScene, drawSceneThumb, noPersonSeen, sceneBehind, sceneFront, scenePremium } from '../engine/scenery'

const MOVES: { value: SceneFx['move']; label: string }[] = [{ value: 'none', label: 'Still' }, { value: 'push', label: 'Slow push in' }, { value: 'pan', label: 'Slow pan' }]
const SIDES: { value: SceneFx['side']; label: string }[] = [{ value: 'left', label: 'Me on the left' }, { value: 'right', label: 'Me on the right' }]

/** Small pictures of the scenes, drawn once per app run. */
const thumbs = new Map<ScenePack, string>()
function thumbOf(pack: ScenePack) {
  let url = thumbs.get(pack)
  if (!url) {
    const c = document.createElement('canvas')
    c.width = 192; c.height = 144
    const x = c.getContext('2d')
    if (!x) return ''
    drawSceneThumb(x, pack, c.width, c.height)
    url = c.toDataURL('image/jpeg', 0.85)
    thumbs.set(pack, url)
  }
  return url
}

/**
 * Scenes: a beautiful place with the clip. A frame in front of any video (leaves, flowers, mist), or the scene
 * behind the person (the AI person cutout takes the real background away), or both, or side by side.
 */
export function SceneryPanel({ ed, clip, onToast, onClose, onPaywall }: {
  ed: Editor; clip: Clip; onToast: (s: string) => void; onClose: () => void; onPaywall: () => void
}) {
  const { premium, locked } = usePremium()
  const cur = clip.scene ?? null
  const [mode, setMode] = useState<SceneFx['mode']>(cur?.mode ?? (isAllowed('scenery') ? 'sandwich' : 'behind'))
  const [noPerson, setNoPerson] = useState(false)
  const [aiFailed, setAiFailed] = useState(cutoutFailed())
  const crown = (s: Pick<SceneFx, 'pack' | 'mode'>) => locked && !premium && scenePremium(s)

  // the person cutout gets ready while the panel is open, and the panel says when nobody is found
  useEffect(() => {
    if (!sceneBehind(cur)) return
    loadCutout().then((ok) => setAiFailed(!ok))
    const id = setInterval(() => setNoPerson(!!noPersonSeen.get(clip.id)), 600)
    return () => clearInterval(id)
  }, [clip.id, cur])

  const apply = (s: SceneFx) => {
    if (scenePremium(s) && !isAllowed('scenery')) { onPaywall(); return false }
    ed.updateClip(clip.id, { scene: s })
    return true
  }
  const pick = (pack: ScenePack) => {
    if (apply({ ...(cur ?? defaultScene(pack, mode)), pack, mode })) {
      if (!cur) onToast(sceneBehind({ ...defaultScene(pack), mode }) ? t('Scene added. The AI puts it behind the person.') : t('Scene frame added in front of the video.'))
    }
  }
  const pickMode = (m: SceneFx['mode']) => {
    if (cur) { if (apply({ ...cur, mode: m })) setMode(m) }
    else if ((m === 'sandwich' || m === 'side') && !isAllowed('scenery')) onPaywall()
    else setMode(m)
  }
  const patch = (p: Partial<SceneFx>) => cur && ed.updateClip(clip.id, { scene: { ...cur, ...p } })
  const shownMode = cur?.mode ?? mode

  return (
    <Panel title="Scenes" onClose={onClose} tall
      actions={cur && <button className="btn small" onClick={() => ed.updateClip(clip.id, { scene: null })}>{t('Remove')}</button>}>
      <p className="muted small">{t('Put yourself in front of the Eiffel Tower, mountains or a waterfall, or put leaves and flowers in front of any video.')}</p>
      <b className="small">{t('1. How')}</b>
      <div className="chips wrap">
        {SCENE_MODES.map((o) => (
          <button key={o.value} className={o.value === shownMode ? 'on' : ''} onClick={() => pickMode(o.value)}>
            {t(o.label)}{crown({ pack: 'garden', mode: o.value }) ? ' 👑' : ''}
          </button>
        ))}
      </div>
      <p className="muted small">{t(shownMode === 'front' ? 'Leaves, flowers or mist close to the camera. Works on every video.'
        : shownMode === 'behind' ? 'The AI takes away the real background and puts the scene behind the person.'
          : shownMode === 'sandwich' ? 'Scene behind you and leaves or flowers in front of you, like the camera is hidden in the trees.'
            : 'You on one side, the scene\'s landmark on the other.')}</p>
      <b className="small">{t('2. Scene')}</b>
      <div className="filter-grid scene-grid">
        {SCENE_PACKS.map((p) => (
          <button key={p.id} className={cur?.pack === p.id ? 'on' : ''} onClick={() => pick(p.id)} data-pack={p.id}>
            <span className="fthumb"><img src={thumbOf(p.id)} alt="" />{crown({ pack: p.id, mode: shownMode }) && <i className="thumb-badge">👑</i>}</span>
            {p.emoji} {t(p.name)}
          </button>
        ))}
      </div>

      {cur && sceneBehind(cur) && (aiFailed
        ? <p className="muted small">{t('This device cannot run the background remover, so only the front frame shows.')}</p>
        : noPerson && <p className="muted small warn">{t('No person found in this part of the clip, so only the front frame shows here. The scene goes behind people only.')}</p>)}
      {cur && clip.chroma?.enabled && sceneBehind(cur) && <p className="muted small">{t('Green screen is on: the scene shows through the green screen.')}</p>}

      {cur && (
        <>
          {cur.mode === 'side' && <Chips options={SIDES} value={cur.side} onChange={(side) => patch({ side })} />}
          {sceneBehind(cur) && (
            <>
              <Slider label="Background blur" min={0} max={1} value={cur.blur} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(blur) => patch({ blur })} />
              <span className="field-label">{t('Camera move')}</span>
              <Chips options={MOVES} value={cur.move} onChange={(move) => patch({ move })} />
              <Toggle label="Match the light" value={cur.light} onChange={(light) => patch({ light })} />
              <Toggle label="Shadow under the feet" value={cur.shadow} onChange={(shadow) => patch({ shadow })} />
            </>
          )}
          {sceneFront(cur) && <Slider label="Front frame size" min={0} max={1} value={cur.front} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(front) => patch({ front })} />}
          <Toggle label="Living scene (water, clouds, birds move)" value={cur.living} onChange={(living) => patch({ living })} />
          <button className="btn small" onClick={() => ed.updateAllClips((c) => (c.id === clip.id ? {} : { scene: { ...cur } }))}>{t('Same scene on all clips')}</button>
        </>
      )}
      <p className="muted small">{t('The scene goes behind people only (the AI finds people). A video without a person gets the front frame.')}</p>
    </Panel>
  )
}
