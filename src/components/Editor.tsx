import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MediaLayer, MediaSource, Project, StickerLayer, TextLayer } from '../types'
import { useEditor } from '../model/useEditor'
import { Player } from '../engine/player'
import { activeAt } from '../model/timeline'
import { loadSource, restoreSource, videoWave } from '../lib/media'
import { getMedia, getProject, saveMedia, saveProject } from '../lib/db'
import { fmtTime } from '../lib/format'
import { projectToFile } from '../lib/projectFile'
import { isNative, saveNative } from '../lib/save'
import { t } from '../lib/i18n'
import { onPendingFiles, takePendingFiles } from '../lib/desktop'
import { Timeline } from './Timeline'
import { Preview } from './Preview'
import { ExportSheet } from './ExportSheet'
import { CropEditor } from './CropEditor'
import { Icon, type IconName } from './Icon'
import { AdjustPanel, FilterPanel, FormatPanel, SpeedPanel, TransitionPanel, VolumePanel } from '../panels/ClipPanels'
import { BlurPanel, OverlayPanel, StickerPanel, SubtitlePanel, TextPanel } from '../panels/LayerPanels'
import { AudioPanel } from '../panels/AudioPanel'
import { AIPanel } from '../panels/AIPanel'
import { WatermarkPanel } from '../panels/WatermarkPanel'

interface Loaded { id: string; name: string; project: Project; sources: Record<string, MediaSource> }

export function Editor({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      const rec = await getProject(projectId)
      if (!rec) { setError('Project not found'); return }
      const sources: Record<string, MediaSource> = {}
      for (const id of rec.mediaIds) {
        const m = await getMedia(id)
        if (m) sources[id] = restoreSource(m.meta, m.blob)
      }
      setLoaded({ id: rec.id, name: rec.name, project: rec.data, sources })
    })().catch((e) => setError(String(e)))
  }, [projectId])
  if (error) return <div className="center-msg">{error} <button className="btn" onClick={onBack}>{t('Back')}</button></div>
  if (!loaded) return <div className="center-msg muted">{t('Opening project…')}</div>
  return <EditorView initial={loaded} onBack={onBack} />
}

type PanelName = 'speed' | 'volume' | 'filters' | 'adjust' | 'transition' | 'format' | 'crop' | 'text' | 'text-style' | 'text-anim'
  | 'stickers' | 'overlay' | 'chroma' | 'blur' | 'subtitles' | 'audio' | 'ai' | 'watermark' | null

function EditorView({ initial, onBack }: { initial: Loaded; onBack: () => void }) {
  const ed = useEditor(initial.project)
  const [name, setName] = useState(initial.name)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pps, setPps] = useState(40)
  const [snap, setSnap] = useState(() => { try { return localStorage.getItem('snap') !== 'off' } catch { return true } })
  const toggleSnap = () => setSnap((v) => { try { localStorage.setItem('snap', v ? 'off' : 'on') } catch { /* private mode */ } return !v })
  const [panel, setPanel] = useState<PanelName>(null)
  const [transitionFor, setTransitionFor] = useState<string | null>(null)
  const [importing, setImporting] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const mainInput = useRef<HTMLInputElement>(null)
  const overlayInput = useRef<HTMLInputElement>(null)

  // restore sources once; videos imported before waveforms existed get one in the background
  useEffect(() => {
    Object.values(initial.sources).forEach(ed.addSource)
    let live = true
    ;(async () => {
      for (const s of Object.values(initial.sources)) {
        if (s.kind !== 'video' || s.wave !== undefined || !live) continue
        const wave = await videoWave(s.file, s.duration).catch(() => '')
        if (!live) return
        const next = { ...s, wave }
        ed.addSource(next)
        saveMedia(next).catch(() => {})
      }
    })()
    return () => { live = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = new Player(canvasRef.current!, Math.min(screen.width, screen.height) > 700 ? 720 : 540)
    p.onTick = (tt, pl) => { setTime(tt); setPlaying(pl) }
    setPlayer(p)
    return () => p.destroy()
  }, [])

  useEffect(() => { player?.setProject(ed.project, ed.sources) }, [player, ed.project, ed.sources])

  const saveNow = useCallback(() => {
    const first = ed.project.clips[0]
    return saveProject({
      id: initial.id, name, updatedAt: Date.now(), data: ed.project, mediaIds: Object.keys(ed.sources),
      thumb: first ? ed.sources[first.sourceId]?.thumbs[0] ?? null : null, duration: ed.layout.total,
    }).then(() => true, () => { setToast(t('Could not save the project (storage full?)')); return false })
  }, [ed.project, ed.sources, name, initial.id, ed.layout.total])

  // autosave
  useEffect(() => {
    const id = setTimeout(saveNow, 600)
    return () => clearTimeout(id)
  }, [saveNow])

  const [saveMenu, setSaveMenu] = useState(false)
  const saveToApp = async () => { setSaveMenu(false); if (await saveNow()) setToast(t('Project saved')) }
  const saveToFile = async () => {
    setSaveMenu(false)
    setToast(t('Preparing project file…'))
    try {
      const blob = await projectToFile(name, ed.project, ed.sources)
      const file = `${name.replace(/[^\w\- ]+/g, '').trim() || 'project'}.avp`
      if (isNative) { await saveNative(blob, file, true); setToast(`${t('Saved to')} Documents/ApanaVidEditor/${file}`); return }
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = file; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
      setToast(null)
    } catch (e) { setToast((e as Error).message) }
  }

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(id)
  }, [toast])

  const togglePlay = useCallback(() => { if (!player) return; if (player.playing) player.pause(); else player.play() }, [player])
  const seek = useCallback((tt: number) => { if (player?.playing) player.pause(); player?.seek(tt) }, [player])

  const importFiles = async (files: FileList | File[], target: 'main' | 'overlay') => {
    const list = [...files]
    if (!list.length) return
    setImporting((n) => n + list.length)
    const added: MediaSource[] = []
    for (const f of list) {
      try {
        const src = await loadSource(f, f.name)
        if (src.kind === 'audio' && target === 'main') {
          ed.addSource(src); await saveMedia(src)
          ed.addAudio(time, src, 'music', f.name.replace(/\.[^.]+$/, ''))
          continue
        }
        ed.addSource(src)
        await saveMedia(src)
        added.push(src)
      } catch (e) {
        setToast((e as Error).message)
      } finally {
        setImporting((n) => n - 1)
      }
    }
    if (!added.length) return
    if (target === 'main') ed.appendClips(added)
    else for (const s of added) ed.addOverlay(time, s)
  }

  // desktop app: File > Open Video / files opened from Explorer
  const importRef = useRef(importFiles)
  useEffect(() => { importRef.current = importFiles })
  useEffect(() => {
    const flush = () => { const f = takePendingFiles(); if (f.length) importRef.current(f, 'main') }
    flush()
    return onPendingFiles(flush)
  }, [])

  // desktop drag & drop
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault()
    const drop = (e: DragEvent) => { e.preventDefault(); if (e.dataTransfer?.files.length) importFiles(e.dataTransfer.files, 'main') }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop) }
  })

  const sel = ed.sel
  const selClip = sel?.type === 'clip' ? ed.project.clips.find((c) => c.id === sel.id) ?? null : null
  const selLayer = sel?.type === 'layer' ? ed.project.layers.find((l) => l.id === sel.id) ?? null : null
  // clip under the playhead, used when a clip tool is chosen with nothing selected
  const clipAtPlayhead = useMemo(() => activeAt(ed.layout.items, time).a?.item.clip ?? null, [ed.layout.items, time])
  const targetClip = selClip ?? clipAtPlayhead

  useEffect(() => { if (!sel && panel && !['text', 'stickers', 'audio', 'format', 'subtitles', 'ai', 'watermark', 'filters', 'adjust', 'speed', 'volume', 'crop'].includes(panel)) setPanel(null) }, [sel, panel])

  const openClipPanel = (p: PanelName) => {
    if (!targetClip) return
    if (!selClip) ed.setSel({ type: 'clip', id: targetClip.id })
    setPanel(p)
  }

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || exporting) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) ed.redo(); else ed.undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); ed.redo() }
      else if (e.key === ' ') { e.preventDefault(); togglePlay() }
      else if (e.key === 's' && !mod) ed.split(time)
      else if (e.key === 'Delete' || e.key === 'Backspace') ed.remove()
      else if (e.key === 'ArrowLeft') seek(time - (e.shiftKey ? 1 : 1 / 30))
      else if (e.key === 'ArrowRight') seek(time + (e.shiftKey ? 1 : 1 / 30))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const snapshot = useCallback(async (tt: number) => {
    if (!player) return null
    player.seek(tt)
    await new Promise((r) => setTimeout(r, 350))
    player.draw()
    return canvasRef.current!.toDataURL('image/jpeg', 0.8)
  }, [player])

  const rename = () => {
    const n = prompt(t('Project name'), name)
    if (n?.trim()) setName(n.trim())
  }

  const empty = ed.project.clips.length === 0

  // ---- toolbar for the current selection
  type Tool = { icon: IconName; label: string; on: () => void; disabled?: boolean; active?: boolean }
  let tools: Tool[]
  if (selClip) {
    tools = [
      { icon: 'split', label: 'Split', on: () => ed.split(time) },
      { icon: 'speed', label: 'Speed', on: () => setPanel('speed') },
      { icon: 'volume', label: 'Volume', on: () => setPanel('volume') },
      { icon: 'filter', label: 'Filters', on: () => setPanel('filters') },
      { icon: 'adjust', label: 'Adjust', on: () => setPanel('adjust') },
      { icon: 'crop', label: 'Crop', on: () => setPanel('crop') },
      { icon: 'transition', label: 'Transition', on: () => { setTransitionFor(selClip.id); setPanel('transition') }, disabled: ed.project.clips.at(-1)?.id === selClip.id },
      { icon: 'fit', label: selClip.fit === 'fit' ? 'Fill' : 'Fit', on: () => ed.updateClip(selClip.id, { fit: selClip.fit === 'fit' ? 'fill' : 'fit' }) },
      { icon: 'copy', label: 'Duplicate', on: ed.duplicate },
      { icon: 'trash', label: 'Delete', on: ed.remove },
    ]
  } else if (selLayer) {
    const common: Tool[] = [
      { icon: 'split', label: 'Split', on: () => ed.split(time) },
      { icon: 'copy', label: 'Duplicate', on: ed.duplicate },
      { icon: 'trash', label: 'Delete', on: ed.remove },
    ]
    const specific: Tool[] = {
      text: [
        { icon: 'text', label: 'Edit', on: () => setPanel('text') } as Tool,
        { icon: 'adjust', label: 'Style', on: () => setPanel('text-style') } as Tool,
        { icon: 'anim', label: 'Animation', on: () => setPanel('text-anim') } as Tool,
      ],
      sticker: [{ icon: 'sticker', label: 'Stickers', on: () => setPanel('stickers') } as Tool],
      media: [
        { icon: 'overlay', label: 'Overlay', on: () => setPanel('overlay') } as Tool,
        { icon: 'chroma', label: 'Green screen', on: () => setPanel('chroma') } as Tool,
        { icon: 'filter', label: 'Filters', on: () => setPanel('filters') } as Tool,
        { icon: 'adjust', label: 'Adjust', on: () => setPanel('adjust') } as Tool,
      ],
      blur: [{ icon: 'blur', label: 'Blur', on: () => setPanel('blur') } as Tool],
      audio: [{ icon: 'volume', label: 'Volume', on: () => setPanel('volume') } as Tool],
    }[selLayer.type]
    tools = [...specific, ...common]
  } else {
    tools = [
      { icon: 'music', label: 'Audio', on: () => setPanel('audio') },
      { icon: 'text', label: 'Text', on: () => { ed.addText(time); setPanel('text') }, disabled: empty },
      { icon: 'subtitles', label: 'Subtitles', on: () => setPanel('subtitles'), disabled: empty },
      { icon: 'ai', label: 'AI Dub', on: () => { player?.pause(); setPanel('ai') }, disabled: empty },
      { icon: 'sticker', label: 'Stickers', on: () => setPanel('stickers'), disabled: empty },
      { icon: 'overlay', label: 'Overlay', on: () => overlayInput.current?.click(), disabled: empty },
      { icon: 'blur', label: 'Blur', on: () => ed.addBlur(time), disabled: empty },
      { icon: 'watermark', label: 'Watermark', on: () => setPanel('watermark'), disabled: empty },
      { icon: 'filter', label: 'Filters', on: () => openClipPanel('filters'), disabled: !targetClip },
      { icon: 'adjust', label: 'Adjust', on: () => openClipPanel('adjust'), disabled: !targetClip },
      { icon: 'speed', label: 'Speed', on: () => openClipPanel('speed'), disabled: !targetClip },
      { icon: 'format', label: 'Format', on: () => setPanel('format') },
    ]
  }

  const closePanel = () => setPanel(null)
  let panelView: React.ReactNode = null
  const tclip = targetClip
  if (panel === 'speed' && tclip) panelView = <SpeedPanel ed={ed} clip={tclip} onClose={closePanel} />
  else if (panel === 'volume' && selLayer?.type === 'audio') panelView = <VolumePanel ed={ed} target={{ kind: 'layer', id: selLayer.id, volume: selLayer.volume, fadeIn: selLayer.fadeIn, fadeOut: selLayer.fadeOut }} onClose={closePanel} />
  else if (panel === 'volume' && tclip) panelView = <VolumePanel ed={ed} target={{ kind: 'clip', clip: tclip }} onClose={closePanel} />
  else if (panel === 'filters' && selLayer?.type === 'media') panelView = <FilterPanel ed={ed} target={{ kind: 'layer', layer: selLayer }} onClose={closePanel} />
  else if (panel === 'filters' && tclip) panelView = <FilterPanel ed={ed} target={{ kind: 'clip', clip: tclip }} onClose={closePanel} />
  else if (panel === 'adjust' && selLayer?.type === 'media') panelView = <AdjustPanel ed={ed} target={{ kind: 'layer', layer: selLayer }} onClose={closePanel} />
  else if (panel === 'adjust' && tclip) panelView = <AdjustPanel ed={ed} target={{ kind: 'clip', clip: tclip }} onClose={closePanel} />
  else if (panel === 'transition') {
    const c = ed.project.clips.find((x) => x.id === transitionFor)
    if (c) panelView = <TransitionPanel ed={ed} clip={c} onClose={closePanel} />
  } else if (panel === 'format') panelView = <FormatPanel ed={ed} onClose={closePanel} />
  else if ((panel === 'text' || panel === 'text-style' || panel === 'text-anim') && selLayer?.type === 'text')
    panelView = <TextPanel key={panel} ed={ed} layer={selLayer} onClose={closePanel} startTab={panel === 'text' ? 'edit' : panel === 'text-style' ? 'style' : 'anim'} />
  else if (panel === 'stickers') panelView = <StickerPanel ed={ed} layer={selLayer?.type === 'sticker' ? (selLayer as StickerLayer) : null} t={time} onClose={closePanel} />
  else if ((panel === 'overlay' || panel === 'chroma') && selLayer?.type === 'media') panelView = <OverlayPanel ed={ed} layer={selLayer as MediaLayer} chroma={panel === 'chroma'} onClose={closePanel} />
  else if (panel === 'blur' && selLayer?.type === 'blur') panelView = <BlurPanel ed={ed} layer={selLayer} onClose={closePanel} />
  else if (panel === 'watermark') panelView = <WatermarkPanel ed={ed} time={time} onClose={closePanel} />
  else if (panel === 'ai') panelView = <AIPanel ed={ed} onClose={closePanel} />
  else if (panel === 'subtitles') panelView = <SubtitlePanel ed={ed} t={time} onClose={closePanel} onSeek={seek} />
  else if (panel === 'audio') panelView = (
    <AudioPanel ed={ed} time={time} onClose={closePanel}
      onRecordStart={() => { if (player) { player.muted = true; player.play() } }}
      onRecordStop={() => { if (player) { player.pause(); player.muted = false } }} />
  )

  return (
    <div className="app editor">
      <header className="top">
        <button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        <button className="title" onClick={rename}>{name}</button>
        <div className="top-actions">
          <button className="icon-btn" disabled={!ed.canUndo} onClick={ed.undo} aria-label="Undo"><Icon name="undo" /></button>
          <button className="icon-btn" disabled={!ed.canRedo} onClick={ed.redo} aria-label="Redo"><Icon name="redo" /></button>
          <span className="menu-anchor">
            <button className="icon-btn" onClick={() => setSaveMenu((v) => !v)} aria-label="Save project"><Icon name="save" /></button>
            {saveMenu && <div className="menu-backdrop" onClick={() => setSaveMenu(false)} />}
            {saveMenu && (
              <div className="menu">
                <button onClick={saveToApp}><Icon name="save" size={18} /> {t('Save project')}</button>
                <button onClick={saveToFile}><Icon name="download" size={18} /> {t('Save as .avp file')}</button>
              </div>
            )}
          </span>
          <button className="btn primary small" disabled={empty || importing > 0} onClick={() => { player?.pause(); setExporting(true) }}>{t('Export')}</button>
        </div>
      </header>

      <div className="stage-wrap">
        <Preview ed={ed} player={player} canvasRef={canvasRef} t={time} onTogglePlay={togglePlay}
          onEditText={() => setPanel('text')} wmEdit={panel === 'watermark'} />
        {empty && (
          <div className="empty">
            <button className="import-big" onClick={() => mainInput.current?.click()}>
              <Icon name="plus" size={44} />
              <span>{t('Import video')}</span>
            </button>
            <p className="muted">{t('Pick videos or photos from your phone. Everything stays on your device.')}</p>
          </div>
        )}
        {importing > 0 && <div className="toast">{t('Opening')}… ({importing})</div>}
        {toast && <div className="toast error" onClick={() => setToast(null)}>{toast}</div>}
      </div>

      <div className="transport">
        <span className="time">{fmtTime(time)} <span className="muted">/ {fmtTime(ed.layout.total)}</span></span>
        <button className="icon-btn play" disabled={empty} onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <span className="zoom">
          <button className={`icon-btn snap${snap ? ' on' : ''}`} onClick={toggleSnap} aria-label="Snap" aria-pressed={snap} title={t('Magnetic snap')}><Icon name="magnet" /></button>
          <button className="icon-btn" onClick={() => setPps((z) => Math.max(4, z / 1.5))} aria-label="Zoom out"><Icon name="minus" /></button>
          <button className="icon-btn" onClick={() => setPps((z) => Math.min(400, z * 1.5))} aria-label="Zoom in"><Icon name="plus" /></button>
        </span>
      </div>

      {!empty && (
        <Timeline
          ed={ed} t={time} pps={pps} setPps={setPps}
          onScrub={seek}
          onTrimPreview={(id, st) => { if (!player) return; if (id) { player.pause(); player.previewSource(id, st) } else player.endPreviewSource() }}
          onTransition={(id) => { ed.setSel({ type: 'clip', id }); setTransitionFor(id); setPanel('transition') }}
          onAdd={() => mainInput.current?.click()}
          snap={snap}
        />
      )}

      <nav className="tools">
        {sel && <button className="tool back" onClick={() => { ed.setSel(null); setPanel(null) }}><Icon name="back" /><span>{t('Back')}</span></button>}
        {tools.map((tl) => (
          <button key={tl.label} className="tool" disabled={tl.disabled} onClick={tl.on}>
            <Icon name={tl.icon} />
            <span>{t(tl.label)}</span>
          </button>
        ))}
        {!sel && <button className="tool" onClick={() => mainInput.current?.click()}><Icon name="add" /><span>{t('Add')}</span></button>}
      </nav>

      {panelView && <div className="panel-wrap">{panelView}</div>}
      {panel === 'crop' && targetClip && ed.sources[targetClip.sourceId] && (
        <CropEditor ed={ed} clip={targetClip} source={ed.sources[targetClip.sourceId]} time={targetClip.in + 0.1} onClose={closePanel} />
      )}

      <input ref={mainInput} type="file" accept="video/*,image/*,audio/*" multiple hidden onChange={(e) => { if (e.target.files) importFiles(e.target.files, 'main'); e.target.value = '' }} />
      <input ref={overlayInput} type="file" accept="video/*,image/*" hidden onChange={(e) => { if (e.target.files) importFiles(e.target.files, 'overlay'); e.target.value = '' }} />

      {exporting && <ExportSheet project={ed.project} sources={ed.sources} name={name} snapshot={snapshot} onClose={() => setExporting(false)} />}
    </div>
  )
}

export type { TextLayer }
