import { useEffect, useRef, useState } from 'react'
import type { BlurLayer, MediaLayer, StickerLayer, TextAnim, TextLayer, WaveLayer } from '../types'
import type { Editor } from '../model/useEditor'
import { isSub, subtitleLook } from '../model/useEditor'
import { CaptionFrameEditor } from './CaptionFramePanel'
import { ANIMS, FONTS, STICKERS, TEXT_PRESETS, ensureFont, prefetchFonts } from '../engine/text'
import { Chips, ColorRow, Panel, Slider, Toggle } from '../ui/kit'
import { parseSrt, toSrt } from '../lib/srt'
import { fileBase, saveTextFiles } from '../lib/save'
import { fmtTime, uid } from '../lib/format'
import { subtitleStyle } from '../engine/text'
import { WAVE_STYLES } from '../engine/visualizer'
import { t } from '../lib/i18n'

interface P { ed: Editor; onClose: () => void }

/** One-tap motion titles shown right where the text is typed: an entry animation with a matching exit. */
const MOTION_PRESETS: { label: string; animIn: TextAnim; animOut: TextAnim }[] = [
  { label: 'Typewriter', animIn: 'typewriter', animOut: 'fade' },
  { label: 'Bounce In', animIn: 'bounce', animOut: 'fade' },
  { label: 'Slide In Left', animIn: 'slide-right', animOut: 'slide-left' },
  { label: 'Slide In Right', animIn: 'slide-left', animOut: 'slide-right' },
  { label: 'Fade In', animIn: 'fade', animOut: 'fade' },
  { label: 'Zoom In', animIn: 'zoom', animOut: 'fade' },
  { label: 'None', animIn: 'none', animOut: 'none' },
]

const animOptions = ANIMS.map((a) => ({ value: a, label: a === 'none' ? 'None' : a.replace('-', ' ').replace(/^\w/, (c) => c.toUpperCase()) }))

export function TextPanel({ ed, layer, onClose, startTab = 'edit' }: P & { layer: TextLayer; startTab?: string }) {
  const [tab, setTab] = useState(startTab)
  const [, fontsReady] = useState(0)
  useEffect(() => { if (tab === 'font' || tab === 'edit') prefetchFonts().then(() => fontsReady((n) => n + 1)) }, [tab])
  // with every caption selected, look and animation changes go to all of them (the words stay per caption)
  const all = layer.subtitle && ed.sel?.type === 'layer' && !!ed.sel.all
  const count = all ? ed.project.layers.filter(isSub).length : 1
  const set = (patch: Partial<TextLayer>) => (all && !('text' in patch) ? ed.updateLayers(isSub, () => patch) : ed.updateLayer<TextLayer>(layer.id, patch))
  const style = (patch: Partial<TextLayer['style']>) => (all
    ? ed.updateLayers(isSub, (l) => ({ style: { ...(l as TextLayer).style, ...patch } }))
    : ed.updateLayer<TextLayer>(layer.id, (l) => ({ style: { ...l.style, ...patch } })))
  const box = (patch: Partial<TextLayer['box']>) => (all
    ? ed.updateLayers(isSub, (l) => ({ box: { ...(l as TextLayer).box, ...patch } }))
    : set({ box: { ...layer.box, ...patch } }))
  return (
    <Panel title="Text" onClose={onClose} tall>
      {layer.subtitle && (
        <div className="row caps-all">
          <span className="muted small">{all ? `${t('Changes go to all')} ${count} ${t('captions')}` : t('Changes go to this caption only')}</span>
          <button className="btn small" onClick={() => ed.setSel({ type: 'layer', id: layer.id, all: !all })}>{all ? t('Only this caption') : t('Select all captions')}</button>
        </div>
      )}
      <Chips options={[{ value: 'edit', label: 'Edit' }, { value: 'font', label: 'Font' }, { value: 'style', label: 'Style' }, { value: 'frame', label: 'Position' }, { value: 'anim', label: 'Animation' }]} value={tab} onChange={setTab} />
      {tab === 'edit' && (
        <>
          <textarea className="text-input" value={layer.text} autoFocus rows={3} onChange={(e) => set({ text: e.target.value })} placeholder={t('Type here')} />
          <span className="field-label">{t('Motion')}</span>
          <Chips
            options={MOTION_PRESETS.map((m) => ({ value: m.label, label: m.label }))}
            value={MOTION_PRESETS.find((m) => m.animIn === layer.animIn && m.animOut === layer.animOut)?.label ?? ''}
            onChange={(v) => { const m = MOTION_PRESETS.find((x) => x.label === v)!; set({ animIn: m.animIn, animOut: m.animOut }) }}
          />
          <div className="preset-grid">
            {TEXT_PRESETS.map((p) => (
              <button key={p.name} onClick={() => { if (p.style.font) ensureFont(p.style.font); style({ ...p.style, ...(p.style.stroke === undefined ? { stroke: null } : {}), ...(p.style.background === undefined ? { background: null } : {}) }) }}
                style={{ fontFamily: p.style.font ?? 'Poppins', color: p.style.color ?? '#fff', background: p.style.background ?? 'var(--panel-2)', WebkitTextStroke: p.style.stroke ? `1px ${p.style.stroke}` : undefined }}>
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}
      {tab === 'font' && (
        <div className="font-grid">
          {FONTS.map((f) => (
            <button key={f} className={layer.style.font === f ? 'on' : ''} style={{ fontFamily: `"${f}"` }} onClick={() => { ensureFont(f); style({ font: f }) }} onPointerEnter={() => ensureFont(f)}>
              {f.includes('Devanagari') || ['Kalam', 'Yatra One', 'Hind', 'Teko'].includes(f) ? 'Aa अआ' : 'Aa'} <small>{f}</small>
            </button>
          ))}
        </div>
      )}
      {tab === 'style' && (
        <>
          <span className="field-label">{t('Colour')}</span>
          <ColorRow value={layer.style.color} onChange={(c) => style({ color: c ?? '#ffffff' })} />
          <span className="field-label">{t('Outline')}</span>
          <ColorRow value={layer.style.stroke} allowNone onChange={(c) => style({ stroke: c })} />
          <span className="field-label">{t('Background')}</span>
          <ColorRow value={layer.style.background} allowNone onChange={(c) => style({ background: c ? c + (c.length === 7 ? 'cc' : '') : null })} />
          <Slider label="Size" min={0.02} max={0.2} value={layer.style.size} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => style({ size: v })} />
          <Slider label="Opacity" min={0} max={1} value={layer.box.opacity} format={(v) => `${Math.round(v * 100)}%`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => box({ opacity: v })} />
          <Slider label="Spacing" min={-0.05} max={0.3} value={layer.style.letterSpacing} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => style({ letterSpacing: v })} />
          <Chips options={[{ value: 'left', label: '⇤ Left' }, { value: 'center', label: '↔ Centre' }, { value: 'right', label: 'Right ⇥' }]} value={layer.style.align} onChange={(align) => style({ align })} />
          <div className="row-toggles">
            <Toggle label="Bold" value={layer.style.bold} onChange={(bold) => style({ bold })} />
            <Toggle label="Italic" value={layer.style.italic} onChange={(italic) => style({ italic })} />
            <Toggle label="Shadow" value={layer.style.shadow} onChange={(shadow) => style({ shadow })} />
          </div>
        </>
      )}
      {tab === 'frame' && (
        <>
          {layer.subtitle && <p className="muted small">{t('Applies to all subtitles.')}</p>}
          <CaptionFrameEditor ed={ed} frame={layer.frame} onChange={(frame) => {
            if (layer.subtitle) ed.updateLayers((l) => l.type === 'text' && l.subtitle, () => ({ frame: frame && { ...frame, rect: { ...frame.rect } } }))
            else set({ frame })
          }} />
        </>
      )}
      {tab === 'anim' && <AnimPicker inA={layer.animIn} outA={layer.animOut} onChange={(p) => set(p)} />}
    </Panel>
  )
}

export function AnimPicker({ inA, outA, onChange, noType }: { inA: TextAnim; outA: TextAnim; onChange: (p: { animIn?: TextAnim; animOut?: TextAnim }) => void; noType?: boolean }) {
  return (
    <>
      <span className="field-label">{t('In')}</span>
      <Chips options={noType ? animOptions.filter((a) => a.value !== 'typewriter') : animOptions} value={inA} onChange={(animIn) => onChange({ animIn })} wrap />
      <span className="field-label">{t('Out')}</span>
      <Chips options={animOptions.filter((a) => a.value !== 'typewriter')} value={outA} onChange={(animOut) => onChange({ animOut })} wrap />
    </>
  )
}

export function StickerPanel({ ed, layer, t: time, onClose }: P & { layer: StickerLayer | null; t: number }) {
  const [cat, setCat] = useState(Object.keys(STICKERS)[0])
  const [tab, setTab] = useState('stickers')
  return (
    <Panel title="Stickers" onClose={onClose} tall>
      {layer && <Chips options={[{ value: 'stickers', label: 'Stickers' }, { value: 'anim', label: 'Animation' }, { value: 'opacity', label: 'Opacity' }]} value={tab} onChange={setTab} />}
      {tab === 'stickers' && (
        <>
          <Chips options={Object.keys(STICKERS).map((c) => ({ value: c, label: c }))} value={cat} onChange={setCat} />
          <div className="emoji-grid">
            {STICKERS[cat].map((e) => (
              <button key={e} onClick={() => (layer ? ed.updateLayer<StickerLayer>(layer.id, { emoji: e }) : ed.addSticker(time, e))}>{e}</button>
            ))}
          </div>
        </>
      )}
      {layer && tab === 'anim' && <AnimPicker inA={layer.animIn} outA={layer.animOut} onChange={(p) => ed.updateLayer<StickerLayer>(layer.id, p)} />}
      {layer && tab === 'opacity' && (
        <Slider label="Opacity" min={0} max={1} value={layer.box.opacity} onStart={ed.begin} onEnd={ed.end} format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => ed.updateLayer<StickerLayer>(layer.id, { box: { ...layer.box, opacity: v } })} />
      )}
    </Panel>
  )
}

export function OverlayPanel({ ed, layer, onClose }: P & { layer: MediaLayer }) {
  const set = (patch: Partial<MediaLayer>) => ed.updateLayer<MediaLayer>(layer.id, patch)
  const isVideo = ed.sources[layer.sourceId]?.kind === 'video'
  return (
    <Panel title="Overlay" onClose={onClose}>
      <Slider label="Opacity" min={0} max={1} value={layer.box.opacity} format={(v) => `${Math.round(v * 100)}%`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ box: { ...layer.box, opacity: v } })} />
      <Slider label="Size" min={0.1} max={4} value={layer.box.scale} format={(v) => `${Math.round(v * 100)}%`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ box: { ...layer.box, scale: v } })} />
      {isVideo && <Slider label="Volume" min={0} max={2} value={layer.volume} format={(v) => `${Math.round(v * 100)}%`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ volume: v })} />}
      <span className="field-label">{t('Shape')}</span>
      <Chips options={[{ value: 'none', label: 'Rectangle' }, { value: 'rounded', label: 'Rounded' }, { value: 'circle', label: 'Circle' }]} value={layer.mask} onChange={(mask) => set({ mask })} />
      <div className="row">
        <button className={`btn small${layer.flipH ? ' primary' : ''}`} onClick={() => set({ flipH: !layer.flipH })}>⇋ {t('Flip')}</button>
        <button className={`btn small${layer.flipV ? ' primary' : ''}`} onClick={() => set({ flipV: !layer.flipV })}>⇵ {t('Flip up-down')}</button>
      </div>
      <Slider label="Border" min={0} max={3} value={layer.border} format={(v) => v.toFixed(1)} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ border: v })} />
      <div className="row">
        <button className="btn small" onClick={() => set({ box: { ...layer.box, x: 0.5, y: 0.5, scale: 2, rotation: 0 } })}>{t('Full screen')}</button>
        <button className="btn small" onClick={() => set({ box: { ...layer.box, x: 0.75, y: 0.25, scale: 0.7, rotation: 0 } })}>{t('Corner')}</button>
      </div>
    </Panel>
  )
}

export function BlurPanel({ ed, layer, onClose }: P & { layer: BlurLayer }) {
  const set = (patch: Partial<BlurLayer>) => ed.updateLayer<BlurLayer>(layer.id, patch)
  return (
    <Panel title="Blur" onClose={onClose}>
      <Chips options={[{ value: 'blur', label: 'Blur' }, { value: 'pixelate', label: 'Pixelate' }]} value={layer.mode} onChange={(mode) => set({ mode })} />
      <Chips options={[{ value: 'ellipse', label: '◯ Oval' }, { value: 'rect', label: '▭ Box' }]} value={layer.shape} onChange={(shape) => set({ shape })} />
      <Slider label="Strength" min={0} max={1} value={layer.strength} format={(v) => `${Math.round(v * 100)}`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ strength: v })} />
      <p className="muted small">{t('Drag the box on the video to cover a face, number plate or anything private.')}</p>
    </Panel>
  )
}

export function WavePanel({ ed, layer, onClose }: P & { layer: WaveLayer }) {
  const set = (patch: Partial<WaveLayer>) => ed.updateLayer<WaveLayer>(layer.id, patch)
  const audio = ed.project.layers.filter((l) => l.type === 'audio' && ed.sources[l.sourceId])
  return (
    <Panel title="Waveform" onClose={onClose}>
      <Chips options={[...WAVE_STYLES]} value={layer.style}
        onChange={(style) => set({ style, box: { ...layer.box, y: style === 'circle' ? 0.5 : layer.style === 'circle' ? 0.87 : layer.box.y } })} />
      <span className="field-label">{t('Colour')}</span>
      <ColorRow value={layer.color} onChange={(c) => set({ color: c ?? '#ffffff' })} />
      <span className="field-label">{t('Tip colour')}</span>
      <ColorRow value={layer.color2} onChange={(c) => set({ color2: c ?? layer.color })} />
      <Slider label="Size" min={0.3} max={2} value={layer.box.scale} format={(v) => `${Math.round(v * 100)}%`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ box: { ...layer.box, scale: v } })} />
      <Slider label="Opacity" min={0.1} max={1} value={layer.box.opacity} format={(v) => `${Math.round(v * 100)}%`} onStart={ed.begin} onEnd={ed.end} onChange={(v) => set({ box: { ...layer.box, opacity: v } })} />
      {audio.length > 1 && (
        <>
          <span className="field-label">{t('Moves with')}</span>
          <select className="select" value={layer.sourceId} onChange={(e) => {
            const a = audio.find((l) => l.type === 'audio' && l.sourceId === e.target.value)
            if (a?.type === 'audio') set({ sourceId: a.sourceId, in: a.in + (layer.start - a.start) })
          }}>
            {audio.map((l) => l.type === 'audio' && <option key={l.id} value={l.sourceId}>{l.label}</option>)}
          </select>
        </>
      )}
      <div className="row">
        <button className="btn small" onClick={() => set({ box: { ...layer.box, x: 0.5, y: layer.style === 'circle' ? 0.5 : 0.87, rotation: 0 } })}>{t(layer.style === 'circle' ? 'Centre' : 'Bottom')}</button>
        <button className="btn small" onClick={() => set({ box: { ...layer.box, x: 0.5, y: layer.style === 'circle' ? 0.5 : 0.13, rotation: 0, scale: layer.style === 'circle' ? 1 : layer.box.scale } })}>{t(layer.style === 'circle' ? 'Reset' : 'Top')}</button>
      </div>
      <p className="muted small">{t('Drag the waveform on the video to move it.')}</p>
    </Panel>
  )
}

export function SubtitlePanel({ ed, name, t: time, onClose, onSeek, onSelectAll }: P & { name: string; t: number; onSeek: (t: number) => void; onSelectAll: () => void }) {
  const file = useRef<HTMLInputElement>(null)
  const subs = ed.project.layers.filter((l): l is TextLayer => l.type === 'text' && l.subtitle).sort((a, b) => a.start - b.start)
  const importSrt = async (f: File) => {
    const cues = parseSrt(await f.text())
    const p = ed.project
    const like = subtitleLook(p.layers)
    const layers: TextLayer[] = cues.map((c) => ({
      id: uid(), type: 'text', text: c.text, subtitle: true, start: c.start, end: c.end, style: like?.style ?? subtitleStyle(),
      box: { x: 0.5, y: like?.y ?? 0.86, scale: 1, rotation: 0, opacity: 1 }, animIn: 'none', animOut: 'none', frame: like?.frame ?? null,
    }))
    ed.replaceProject({ ...p, layers: [...p.layers, ...layers] })
  }
  const exportSrt = () => {
    saveTextFiles([{ name: `${fileBase(name)}.srt`, text: toSrt(subs.map((s) => ({ start: s.start, end: s.end, text: s.text }))) }]).catch(() => {})
  }
  const applyStyleAll = () => {
    const first = subs.find((s) => ed.sel?.type === 'layer' && s.id === ed.sel.id) ?? subs[0]
    if (!first) return
    const p = ed.project
    ed.replaceProject({ ...p, layers: p.layers.map((l) => (l.type === 'text' && l.subtitle ? { ...l, style: { ...first.style }, box: { ...l.box, y: first.box.y }, frame: first.frame ?? null } : l)) })
  }
  return (
    <Panel title="Subtitles" onClose={onClose} tall actions={<button className="btn small" onClick={() => ed.addText(time, true)}>+ {t('Add')}</button>}>
      <div className="row">
        <button className="btn small" onClick={() => file.current?.click()}>{t('Import .srt')}</button>
        <button className="btn small" disabled={!subs.length} onClick={exportSrt}>{t('Export .srt')}</button>
        <button className="btn small" disabled={!subs.length} onClick={applyStyleAll}>{t('Same style for all')}</button>
        <button className="btn small" disabled={!subs.length} onClick={onSelectAll}>{t('Select all captions')}</button>
      </div>
      <input ref={file} type="file" accept=".srt,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importSrt(f); e.target.value = '' }} />
      {subs.length > 0 && (
        <details className="sub-frame">
          <summary>{t('Caption position & frame')}</summary>
          <CaptionFrameEditor ed={ed} frame={subs[0].frame} onChange={(frame) => ed.updateLayers((l) => l.type === 'text' && l.subtitle, () => ({ frame: frame && { ...frame, rect: { ...frame.rect } } }))} />
        </details>
      )}
      {!subs.length && <p className="muted small">{t('Play to the moment someone speaks, tap Add, and type what they say. Each subtitle shows for 2.5 s; drag its ends on the timeline to change that.')}</p>}
      <div className="sub-list">
        {subs.map((s) => (
          <div key={s.id} className={`sub-row${ed.sel?.type === 'layer' && ed.sel.id === s.id ? ' on' : ''}`} onClick={() => { ed.setSel({ type: 'layer', id: s.id }); onSeek(s.start + 0.01) }}>
            <span className="muted small">{fmtTime(s.start)}</span>
            <input value={s.text} onChange={(e) => ed.updateLayer<TextLayer>(s.id, { text: e.target.value })} />
          </div>
        ))}
      </div>
    </Panel>
  )
}
