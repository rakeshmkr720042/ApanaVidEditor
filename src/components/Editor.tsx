import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Clip, Crop, MediaLayer, MediaSource, Project, StickerLayer, TextLayer } from '../types'
import { isSub, selectedIds, useEditor, type CamBubble, type Placed, type Placement, type Selection } from '../model/useEditor'
import { Player } from '../engine/player'
import { activeAt, layoutClips, sourceAt } from '../model/timeline'
import { ColorPanel } from '../panels/ColorPanel'
import { SplitPanel } from '../panels/SplitPanel'
import type { SplitLayout } from '../model/split'
import { gradeIsEmpty } from '../engine/grade'
import { REVERSE_MAX, reverseClip as reverseVideo, stillFrame } from '../engine/reverse'
import { loadSource, restoreSource, videoWave } from '../lib/media'
import { deleteProxy, getMedia, getProject, getProxy, saveMedia, saveProject, saveProxy } from '../lib/db'
import { fmtTime, fmtTimecode, uid } from '../lib/format'
import { projectToFile } from '../lib/projectFile'
import { isNative, saveNative } from '../lib/save'
import { t } from '../lib/i18n'
import { onPendingFiles, takePendingFiles } from '../lib/desktop'
import { Timeline } from './Timeline'
import { Preview } from './Preview'
import { ExportSheet } from './ExportSheet'
import { SceneBuilder } from './SceneBuilder'
import { CropEditor } from './CropEditor'
import { Icon } from './Icon'
import { AdjustPanel, FilterPanel, EffectsPanel, FormatPanel, LayerSpeedPanel, NoisePanel, SpeedPanel, TransitionPanel, VolumePanel } from '../panels/ClipPanels'
import { hasSound } from '../engine/denoise'
import { isNeutralFx } from '../engine/soundfx'
import { AudioFxPanel } from '../panels/AudioFxPanel'
import { AdjustmentPanel, BlurPanel, OverlayPanel, StickerPanel, SubtitlePanel, TextPanel, WavePanel } from '../panels/LayerPanels'
import { AudioPanel } from '../panels/AudioPanel'
import { AIPanel } from '../panels/AIPanel'
import { WatermarkPanel } from '../panels/WatermarkPanel'
import { PresenterPanel } from '../panels/PresenterPanel'
import { PhotoPanel, SlideshowPanel } from '../panels/SlideshowPanel'
import { defaultSlideshow, type SlideshowOptions } from '../model/slideshow'
import { TemplatesPanel } from '../panels/TemplatesPanel'
import { ScreenRecorder, type CamTake } from './ScreenRecorder'
import { PlaceSheet } from './PlaceSheet'
import { FeedbackSheet } from './FeedbackSheet'
import { playable, trackName } from '../model/tracks'
import { copyTrack, useCopiedTrack, type PasteTrackHow } from '../model/trackCopy'
import { PasteTrackSheet } from './PasteTrackSheet'
import { KeysSheet } from './KeysSheet'
import { MarkerSheet } from './MarkerSheet'
import { RelinkSheet } from './RelinkSheet'
import { ProxySheet } from './ProxySheet'
import { proxiesWanted, setProxiesWanted } from '../engine/proxy'
import { Scopes } from './Scopes'
import { mediaInfoOf, missingSources, unreadable, usedSources, type MediaInfo } from '../lib/relink'
import { ScenePanel } from '../panels/ScenePanel'
import { JoinPanel } from '../panels/JoinPanel'
import { TrimPanel, LayerTrimPanel } from '../panels/TrimPanel'
import { ZoomMovePanel } from '../panels/ClipKeysPanel'
import { MaskPanel } from '../panels/MaskPanel'
import { clipSrcAt, layerSrcAt } from '../model/clipKeys'
import { rippleDeleteLayer, trimClipToPlayhead, trimLayerToPlayhead } from '../model/trim'
import { PasteStyleSheet } from './PasteStyleSheet'
import { AudioMeter } from './AudioMeter'
import { meterWanted, setMeterWanted } from '../engine/meter'
import { copyStyle, pasteableParts, pastePatches, PARTS, useCopiedStyle, type StylePart } from '../model/styleCopy'
import { atTime } from '../model/keyframes'
import { ArrangePanel, BlendPanel, KeyframePanel, MediaAnimPanel } from '../panels/LayerTools'
import { ClipOrderPanel, type OrderMode } from '../panels/ClipOrderPanel'
import { GreenScreenPanel } from '../panels/GreenScreenPanel'
import { CutoutPanel } from '../panels/CutoutPanel'
import { BeatPanel } from '../panels/BeatPanel'
import { SmartCutPanel } from '../panels/SmartCutPanel'
import { MotionPanel, TrackPanel } from '../panels/MotionPanel'
import { isTracked } from '../engine/tracker'
import { loadCutout } from '../engine/cutout'
import { BACK, useBack } from '../lib/back'
import { FullScreenBar } from './FullScreen'
import { enterNativeFullScreen, leaveNativeFullScreen, useIdle } from '../lib/fullscreen'
import { acceptHabits, describe as describeHabit, nextStep, noteShown, observe, patchFor, rejectHabits, toolUsed, useHabitsVersion, usualFor, type Habit, type NextStep } from '../lib/habits'
import { HabitBar, HabitsSheet } from './HabitsSheet'
import { ToolBar, useDock, type Tool } from './ToolBar'
import { PremiumSheet } from './PremiumSheet'
import { isAllowed, usePremium, type Feature } from '../lib/premium'

/** Premium tools: the panel they open and their toolbar labels (crown shown while the lock is on). */
const PREMIUM_PANELS: Partial<Record<string, Feature>> = { ai: 'dub', noise: 'audio', audiofx: 'audio', chroma: 'greenscreen', presenter: 'presenter' }
const PREMIUM_TOOLS: Record<string, Feature> = {
  'AI Dub': 'dub', 'Remove noise': 'audio', 'Audio effects': 'audio', 'Green screen': 'greenscreen',
  'Slides to video': 'scenes', 'Script to video': 'scenes', 'Mind map to video': 'scenes', 'Audio to video': 'scenes',
  'Quiz to video': 'scenes', 'Data to video': 'scenes', 'Article to video': 'scenes',
}


/** Look tools of an adjustment layer (they change everything under it). */
const ADJ_LOOKS = (setPanel: (p: PanelName) => void) => [
  { icon: 'adjust', label: 'Adjust', on: () => setPanel('adjust') },
  { icon: 'filter', label: 'Filters', on: () => setPanel('filters') },
  { icon: 'color', label: 'Color', on: () => setPanel('color') },
  { icon: 'effects', label: 'Effects', on: () => setPanel('effects') },
] as Tool[]

const SKIP = 5 // seconds jumped by fast backward / forward
const RATES = [1, 1.5, 2, 4, 0.5]

interface Loaded { id: string; name: string; project: Project; sources: Record<string, MediaSource>; mediaInfo: Record<string, MediaInfo> }

export function Editor({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      const rec = await getProject(projectId)
      if (!rec) { setError('Project not found'); return }
      const sources: Record<string, MediaSource> = {}
      const mediaInfo: Record<string, MediaInfo> = { ...rec.mediaInfo }
      const ids = new Set([...rec.mediaIds, ...usedSources(rec.data).keys()])
      for (const id of ids) {
        if (id.startsWith('proxy:')) continue
        const m = await getMedia(id)
        if (!m) continue
        if (m.meta?.name) mediaInfo[id] = { name: m.meta.name, kind: m.meta.kind, duration: m.meta.duration }
        // a stored file that can no longer be read counts as missing, so it can be found again
        if (!(await unreadable(m.blob))) sources[id] = restoreSource(m.meta, m.blob)
      }
      // preview copies of big videos
      for (const s of Object.values(sources)) {
        if (s.kind !== 'video') continue
        const b = await getProxy(s.id).catch(() => null)
        if (b && !(await unreadable(b))) sources[s.id] = { ...s, proxy: { file: b, url: URL.createObjectURL(b) } }
      }
      setLoaded({ id: rec.id, name: rec.name, project: rec.data, sources, mediaInfo })
    })().catch((e) => setError(String(e)))
  }, [projectId])
  if (error) return <div className="center-msg">{error} <button className="btn" onClick={onBack}>{t('Back')}</button></div>
  if (!loaded) return <div className="center-msg muted">{t('Opening project…')}</div>
  return <EditorView initial={loaded} onBack={onBack} />
}

type PanelName = 'speed' | 'volume' | 'filters' | 'effects' | 'color' | 'split' | 'showers' | 'adjust' | 'transition' | 'format' | 'crop' | 'text' | 'text-titles' | 'text-style' | 'text-anim' | 'text-words'
  | 'stickers' | 'overlay' | 'chroma' | 'cutout' | 'beat' | 'smartcut' | 'motion' | 'track' | 'blur' | 'subtitles' | 'audio' | 'ai' | 'watermark' | 'presenter' | 'templates' | 'slideshow' | 'photo' | 'wave'
  | 'arrange' | 'media-anim' | 'blend' | 'keys' | 'layer-crop' | 'noise' | 'audiofx' | 'order' | 'trim' | 'zoommove' | 'mask' | 'adjlayer' | 'scenes' | 'join' | null

function EditorView({ initial, onBack }: { initial: Loaded; onBack: () => void }) {
  const ed = useEditor(initial.project)
  const [name, setName] = useState(initial.name)
  const [notesSheet, setNotesSheet] = useState(false)
  const [habitsSheet, setHabitsSheet] = useState(false)
  const [paywall, setPaywall] = useState<Feature | null>(null)
  usePremium()
  const habitsVersion = useHabitsVersion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [time, setTime] = useState(0)
  useEffect(() => ed.setNow(time), [ed, time])
  const [playing, setPlaying] = useState(false)
  const [pps, setPps] = useState(40)
  const [snap, setSnap] = useState(() => { try { return localStorage.getItem('snap') !== 'off' } catch { return true } })
  // video scopes over the preview (waveform, parade, histogram, vectorscope); remembered on this device
  const [scopes, setScopes] = useState(() => { try { return localStorage.getItem('scopes') === 'on' } catch { return false } })
  const getCanvas = useCallback(() => canvasRef.current, [])
  const toggleScopes = () => setScopes((v) => { try { localStorage.setItem('scopes', v ? 'off' : 'on') } catch { /* private mode */ } return !v })
  const toggleSnap = () => setSnap((v) => { try { localStorage.setItem('snap', v ? 'off' : 'on') } catch { /* private mode */ } return !v })
  const [panel, showPanel] = useState<PanelName>(null)
  // a locked Premium tool opens the plans instead
  const setPanel = (p: PanelName) => { const f = p && PREMIUM_PANELS[p]; if (f && !isAllowed(f)) setPaywall(f); else showPanel(p) }
  const [transitionFor, setTransitionFor] = useState<string | null>(null)
  const [importing, setImporting] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [scenes, showScenes] = useState<'files' | 'text' | 'mindmap' | 'audio' | 'quiz' | 'data' | 'article' | null>(null)
  const setScenes = (v: typeof scenes) => { if (v && !isAllowed('scenes')) setPaywall('scenes'); else showScenes(v) }
  const [audioTab, setAudioTab] = useState<'mine' | 'voice'>('mine')
  const [screenRec, setScreenRec] = useState<'screen' | 'camera' | null>(null)
  // new photos/videos/recordings waiting for the user to say where they go
  const [pending, setPending] = useState<{ srcs: MediaSource[]; crop: Crop | null; what: string; dur?: number; cam?: CamBubble | null } | null>(null)
  const mainInput = useRef<HTMLInputElement>(null)
  const overlayInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  // new photos/videos picked to go into the main video between two clips, at this position
  const insertInput = useRef<HTMLInputElement>(null)
  const insertAt = useRef(0)
  const pickInsert = (at: number) => { insertAt.current = at; insertInput.current?.click() }
  const [orderMode, setOrderMode] = useState<OrderMode>('move')
  // Swap: the clip or track item waiting for the user to tap the one to trade places with
  const [swapFrom, setSwapFrom] = useState<Selection>(null)
  const slideOpts = useRef<SlideshowOptions>(defaultSlideshow())
  const pickPhotos = (o: SlideshowOptions) => { slideOpts.current = o; photoInput.current?.click() }

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
    p.meterOn = meterWanted()
    setPlayer(p)
    return () => p.destroy()
  }, [])

  // what plays: hidden track rows left out, muted rows silent, top row in front
  const output = useMemo(() => playable(ed.project), [ed.project])
  // the preview plays the light copies of big videos (when there are any and they are switched on); export never does
  const [useProxies, setUseProxies] = useState(proxiesWanted)
  const previewSources = useMemo(() => {
    if (!useProxies || !Object.values(ed.sources).some((s) => s.proxy)) return ed.sources
    return Object.fromEntries(Object.entries(ed.sources).map(([id, s]) => [id, s.proxy ? { ...s, url: s.proxy.url } : s]))
  }, [ed.sources, useProxies])
  useEffect(() => { player?.setProject(output, previewSources) }, [player, output, previewSources])

  // files the project uses that are not here any more (storage cleared): found again in the Missing files sheet
  const mediaInfo = useRef(initial.mediaInfo)
  const missing = useMemo(() => missingSources(ed.project, ed.sources, initial.mediaInfo), [ed.project, ed.sources, initial.mediaInfo])
  const [relinkSheet, setRelinkSheet] = useState(false)
  const [proxySheet, setProxySheet] = useState(false)

  const saveNow = useCallback(() => {
    const first = ed.project.clips.find((c) => !c.fromTemplate) ?? ed.project.clips[0]
    mediaInfo.current = mediaInfoOf(ed.sources, mediaInfo.current, ed.project)
    return saveProject({
      id: initial.id, name, updatedAt: Date.now(), data: ed.project,
      // missing files stay listed, so they are still cleaned up with the project and can be found again
      mediaIds: [...new Set([...Object.keys(ed.sources), ...missing.map((m) => m.id), ...Object.values(ed.sources).filter((x) => x.proxy).map((x) => `proxy:${x.id}`)])],
      thumb: first ? ed.sources[first.sourceId]?.thumbs[0] ?? null : null, duration: ed.layout.total, mediaInfo: mediaInfo.current,
    }).then(() => true, () => { setToast(t('Could not save the project (storage full?)')); return false })
  }, [ed.project, ed.sources, name, initial.id, ed.layout.total, missing])

  // a Short made by Smart cut: saved as a new project next to this one, then opened
  const makeShort = useCallback(async (data: Project, label: string) => {
    if (!(await saveNow())) return
    const id = uid()
    const first = data.clips[0]
    const dur = layoutClips(data.clips).total
    try {
      await saveProject({ id, name: `${name} · ${label}`, updatedAt: Date.now(), data, mediaIds: Object.keys(ed.sources),
        thumb: first ? ed.sources[first.sourceId]?.thumbs[0] ?? null : null, duration: dur })
    } catch { setToast(t('Could not save the project (storage full?)')); return }
    location.hash = `p=${id}`
  }, [saveNow, name, ed.sources])

  // autosave
  useEffect(() => {
    const id = setTimeout(saveNow, 600)
    return () => clearTimeout(id)
  }, [saveNow])

  // Smart shortcuts learn from how the items end up (on this device only)
  useEffect(() => {
    const id = setTimeout(() => observe(initial.id, ed.project, ed.sources), 1500)
    return () => clearTimeout(id)
  }, [ed.project, ed.sources, initial.id])

  const [saveMenu, setSaveMenu] = useState(false)
  const saveToApp = async () => { setSaveMenu(false); if (await saveNow()) setToast(t('Project saved')) }
  const saveToFile = async () => {
    setSaveMenu(false)
    setToast(t('Preparing project file…'))
    try {
      const blob = await projectToFile(name, ed.project, ed.sources)
      const file = `${name.replace(/[^\w\- ]+/g, '').trim() || 'project'}.avp`
      if (isNative) { await saveNative(blob, file, true); setToast(`${t('Saved to')} Documents/Apna Editor/${file}`); return }
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
  /** Fast backward / forward: jumps without stopping playback. */
  const skip = useCallback((d: number) => { if (player) player.seek(player.t + d) }, [player])

  // ---- time display: m:ss.t or editor timecode HH:MM:SS:FF (tap the time to switch)
  const [timecode, setTimecode] = useState(() => { try { return localStorage.getItem('time-format') === 'tc' } catch { return false } })
  const toggleTimecode = () => setTimecode((v) => { try { localStorage.setItem('time-format', v ? 'm' : 'tc') } catch { /* private mode */ } return !v })
  const showTime = (tt: number) => (timecode ? fmtTimecode(tt, ed.project.settings.fps) : fmtTime(tt))
  // ---- audio meter (tap it to switch off / on)
  const [meter, setMeter] = useState(meterWanted)
  const toggleMeter = () => setMeter((v) => { setMeterWanted(!v); if (player) player.meterOn = !v; return !v })

  // ---- markers
  const [markerSheet, setMarkerSheet] = useState<{ focus: string | null } | null>(null)
  const markers = ed.project.markers ?? []
  const addMarkerHere = (open = false) => {
    const m = ed.addMarker(time)
    setToast(`${t('Marker added at')} ${fmtTime(time)}. ${t('Tap the flag on the ruler to name it.')}`)
    if (open) setMarkerSheet({ focus: m.id })
  }
  /** Jumps to the marker before / after the playhead (with none: to the clip edge). */
  const jumpMarker = (dir: -1 | 1) => {
    const list = markers.map((m) => m.t)
    const edges = list.length ? list : ed.layout.items.flatMap((it) => [it.start, it.start + it.dur])
    const next = dir > 0 ? edges.filter((x) => x > time + 0.02).sort((a, b) => a - b)[0] : edges.filter((x) => x < time - 0.02).sort((a, b) => b - a)[0]
    if (next !== undefined) seek(next)
  }

  // ---- pro trims: ripple trim to the playhead (Q / W), ripple delete (Shift+Delete)
  const trimToPlayhead = (side: 'in' | 'out') => {
    const l = sel?.type === 'layer' ? ed.project.layers.find((x) => x.id === sel.id) : undefined
    if (l) {
      if (ed.project.tracks?.find((x) => x.id === l.track)?.locked) { setToast(t('This track is locked. Unlock it first.')); return }
      const patch = trimLayerToPlayhead(l, time, side)
      if (!patch) { setToast(t('Put the playhead inside the selected item first.')); return }
      ed.patchItems({ [l.id]: patch })
      return
    }
    if (ed.project.main?.locked) { setToast(t('The main video is locked. Unlock it first.')); return }
    const r = trimClipToPlayhead(ed.project, time, side, sel?.type === 'clip' ? sel.id : undefined)
    if (!r) { setToast(t('Put the playhead inside a clip first.')); return }
    ed.patchItems(r.patch)
    seek(r.at)
    setToast(t(side === 'in' ? 'Start cut to the playhead; the video closed up.' : 'End cut to the playhead; the video closed up.'))
  }
  const rippleDelete = () => {
    if (!sel) return
    if (sel.type === 'clip' || sel.all) { ed.remove(false); return }
    const l = ed.project.layers.find((x) => x.id === sel.id)
    if (!l || ed.project.tracks?.find((x) => x.id === l.track)?.locked) return
    ed.replaceProject(rippleDeleteLayer(ed.project, l.id))
    ed.setSel(null)
    setToast(t('Deleted; the later items on this track moved back to close the gap.'))
  }

  // ---- copy style / paste style (look, sound, speed, crop, animation, text style)
  const styleCopied = useCopiedStyle()
  const [styleSheet, setStyleSheet] = useState(false)
  const itemOf = (id: string) => ed.project.clips.find((c) => c.id === id) ?? ed.project.layers.find((l) => l.id === id)
  const itemName = (id: string) => {
    const c = ed.project.clips.find((x) => x.id === id)
    if (c) return `${t('Clip')} ${ed.project.clips.indexOf(c) + 1}`
    const l = ed.project.layers.find((x) => x.id === id)
    return l ? (l.type === 'text' ? `"${l.text.slice(0, 20)}"` : t({ sticker: 'Sticker', media: 'Overlay', blur: 'Blur', audio: 'Audio', wave: 'Waveform', text: 'Text', adjustment: 'Adjustment layer' }[l.type])) : ''
  }
  const copyStyleOf = (id: string) => {
    const x = itemOf(id)
    if (!x) return
    const st = copyStyle(x, ed.sources, itemName(id))
    setToast(st ? t('Style copied. Select other clips or items and tap Paste style (Ctrl+Alt+V).') : t('This item has no style to copy.'))
  }
  /** Ids the paste goes on: the selected group, else the selected item. */
  const styleTargets = () => (sel ? selectedIds(ed.project, sel) : [])
  const styleParts = (): StylePart[] => {
    if (!styleCopied) return []
    const set = new Set<StylePart>()
    for (const id of styleTargets()) { const x = itemOf(id); if (x) for (const p of pasteableParts(styleCopied, x, ed.sources)) set.add(p) }
    return PARTS.filter((p) => set.has(p))
  }
  const pasteStyle = (parts: StylePart[]) => {
    setStyleSheet(false)
    if (!styleCopied) return
    const patches = pastePatches(styleCopied, ed.project, styleTargets(), parts, ed.sources)
    const n = Object.keys(patches).length
    if (!n) { setToast(t('Nothing of the copied style fits this item.')); return }
    ed.patchItems(patches)
    setToast(`${t('Style pasted on')} ${n} ${t(n === 1 ? 'item' : 'items')}. ${t('Undo takes it back.')}`)
  }
  const [rate, setRate] = useState(1)
  const nextRate = () => {
    const r = RATES[(RATES.indexOf(rate) + 1) % RATES.length]
    setRate(r)
    player?.setRate(r)
  }

  // Full screen: the video fills the screen; the edit panel (timeline + tools) slides in beside it on demand,
  // and before / after shows the original next to the edit.
  const [fs, setFs] = useState(false)
  const [fsEdit, setFsEdit] = useState(false)
  const [compare, setCompare] = useState<number | null>(null)
  const fsIdle = useIdle(fs)
  const nativeFs = useRef(false)
  const enterFs = () => {
    if (empty) return
    setFs(true)
    const r = player?.renderer
    void enterNativeFullScreen(!r || r.W >= r.H).then((ok) => { nativeFs.current = ok })
  }
  const exitFs = useCallback(() => {
    setFs(false); setFsEdit(false); setCompare(null)
    nativeFs.current = false
    leaveNativeFullScreen()
  }, [])
  const toggleCompare = () => setCompare((c) => (c === null ? 0.5 : null))
  // leaving the browser's / window's full screen (Esc, F11, the phone's gesture) leaves ours too
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement && nativeFs.current) exitFs() }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [exitFs])
  useEffect(() => () => leaveNativeFullScreen(), [])
  // Back / Esc: a tool panel first, then the edit panel, then the selection, then full screen itself
  useBack(fs, exitFs, BACK.selection - 0.5)
  useBack(fs && fsEdit, () => setFsEdit(false), BACK.selection + 0.5)

  /** Jumps to what was just added and says where it went, so nothing lands out of sight. */
  const announce = (placed: Placed | null, what: string) => {
    if (!placed) return
    if (player?.playing) player.pause()
    player?.seek(placed.start)
    const at = fmtTime(placed.start)
    const first = placed.where === 'end' && placed.start === 0
    const where = first ? t('to the timeline') : placed.where === 'track' ? `${t('on a track at')} ${at}`
      : placed.where === 'playhead' ? `${t('to the main video at')} ${at}`
        : placed.where === 'start' ? t('to the start of the main video') : `${t('to the end of the main video')} (${at})`
    setToast(`${what} ${t('added')} ${where}${placed.cut ? `. ${t('It stops where the main video ends.')}` : ''}`)
  }

  /** Moves the sound of these videos to an audio row and says where it went (or why nothing happened). */
  const detach = (ids: string[]) => {
    player?.pause()
    const made = ed.detachAudio(ids)
    if (!made.length) { setToast(t('No sound to detach: the video is muted (volume 0) or its track is locked')); return }
    setToast(`${t('Audio detached to its own audio track')} (${fmtTime(made[0].start)}). ${t('The video is now silent; Undo puts it back.')}`)
  }

  const describe = (srcs: MediaSource[]) => {
    if (srcs.length > 1) return `${srcs.length} ${t('files')}`
    return srcs[0].kind === 'image' ? t('Photo') : t('Video')
  }

  /** Photos and videos for the main track: an empty project takes them as is, otherwise ask where. */
  const addVisual = (srcs: MediaSource[], crop: Crop | null, what: string, dur?: number, cam?: CamBubble | null) => {
    if (!srcs.length) return
    if (ed.project.clips.length === 0) announce(ed.place(srcs, 'end', time, { crop, dur, cam }), what)
    else { player?.pause(); setPending({ srcs, crop, what, dur, cam }) }
  }

  const importFiles = async (files: FileList | File[], target: 'main' | 'overlay' | 'slides' | 'insert') => {
    const list = [...files]
    if (!list.length) return
    setImporting((n) => n + list.length)
    const added: MediaSource[] = []
    for (const f of list) {
      try {
        const src = await loadSource(f, f.name)
        if (src.kind === 'audio' && (target === 'main' || target === 'insert')) {
          ed.addSource(src); await saveMedia(src)
          const a = ed.addAudio(time, src, 'music', f.name.replace(/\.[^.]+$/, ''))
          setToast(`${t('Audio')} ${t('added')} ${t('on a new track at')} ${fmtTime(a.start)}`)
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
    if (target === 'slides') {
      const photos = added.filter((s) => s.kind === 'image')
      // a main video with videos in it is not a slideshow: ask where the photos go (default: at the playhead)
      const hasVideo = ed.project.clips.some((c) => ed.sources[c.sourceId]?.kind !== 'image')
      if (hasVideo) { setPanel(null); addVisual(photos, null, describe(photos), slideOpts.current.duration) }
      else {
        ed.addSlides(photos, slideOpts.current)
        setToast(`${photos.length} ${t('photos added to the slideshow in the main video')}`)
      }
    } else if (target === 'main') addVisual(added, null, describe(added))
    else if (target === 'insert') {
      const placed = ed.place(added, 'playhead', time, { at: insertAt.current })
      announce(placed, describe(added))
      if (placed) setToast(`${describe(added)} ${t('added')} ${t('between clips')} ${insertAt.current} ${t('and')} ${insertAt.current + 1} (${fmtTime(placed.start)})`)
    }
    else for (const s of added) {
      const l = ed.addOverlay(time, s)
      announce({ sel: { type: 'layer', id: l.id }, start: l.start, where: 'track', cut: false }, t('Overlay'))
    }
  }

  /**
   * A finished screen or camera recording, cropped to the chosen area, goes where the user picks.
   * A camera bubble recorded with the screen follows it on its own row.
   */
  const addRecording = async (file: File, crop: Crop | null, take: CamTake | null) => {
    const src = await loadSource(file, file.name)
    ed.addSource(src)
    await saveMedia(src)
    let cam: CamBubble | null = null
    if (take) {
      try {
        const c = await loadSource(take.file, take.file.name)
        ed.addSource(c)
        await saveMedia(c)
        cam = { src: c, box: take.box, mask: take.mask }
      } catch (e) { setToast((e as Error).message) }
    }
    addVisual([src], crop, screenRec === 'camera' ? t('Camera recording') : cam ? t('Screen + camera recording') : t('Screen recording'), undefined, cam)
  }

  const placePending = (where: Placement) => {
    if (!pending) return
    setPending(null)
    announce(ed.place(pending.srcs, where, time, { crop: pending.crop, dur: pending.dur, cam: pending.cam }), pending.what)
  }

  /** Split screen / collage: loads the picked files and puts one in each cell of the layout, from the playhead. */
  const addSplit = async (files: File[], layout: SplitLayout, gap: number, border: number) => {
    player?.pause()
    setImporting((n) => n + files.length)
    const srcs: MediaSource[] = []
    for (const f of files.slice(0, layout.cells.length)) {
      try {
        const src = await loadSource(f, f.name)
        if (src.kind === 'audio') continue
        ed.addSource(src)
        await saveMedia(src)
        srcs.push(src)
      } catch (e) { setToast((e as Error).message) } finally { setImporting((n) => n - 1) }
    }
    setImporting((n) => Math.max(0, n - Math.max(0, files.length - layout.cells.length)))
    if (!srcs.length) return
    ed.addSplit(srcs, layout, time, gap, border)
    setPanel(null)
    const empty = layout.cells.length - srcs.length
    setToast(empty > 0 ? `${t('Split screen added')}. ${empty} ${t('cells are empty: add more with Split screen again or move items there.')}` : t('Split screen added'))
  }

  /** Freeze frame: the clip under the playhead holds its picture there for 3 seconds. */
  const freeze = async () => {
    const c = targetClip
    const src = c && ed.sources[c.sourceId]
    if (!c || !src) return
    player?.pause()
    const it = ed.layout.items.find((x) => x.clip.id === c.id)
    if (!it) return
    const local = Math.max(0, Math.min(it.dur - 0.01, time - it.start))
    try {
      const still = await stillFrame(src, sourceAt(c, local).time)
      ed.addSource(still)
      await saveMedia(still)
      if (ed.freezeFrame(Math.max(it.start, Math.min(it.start + it.dur - 0.01, time)), still)) setToast(t('Freeze frame added (3 s). Drag its end to change how long it holds.'))
      else setToast(t('Freeze frame needs a clip without a speed ramp'))
    } catch (e) { setToast((e as Error).message) }
  }

  /** Reverse: the clip plays backwards (picture and sound). Made once, offline. */
  const [reversing, setReversing] = useState<number | null>(null)
  const reverse = async () => {
    const c = selClip
    const src = c && ed.sources[c.sourceId]
    if (!c || !src || src.kind !== 'video' || reversing !== null) return
    player?.pause()
    if (c.out - c.in > REVERSE_MAX) { setToast(t('Reverse works on up to 5 minutes. Split the clip first.')); return }
    setReversing(0)
    try {
      const rev = await reverseVideo(c, src, (p) => setReversing(p))
      ed.addSource(rev)
      await saveMedia(rev)
      ed.reverseClip(c.id, rev)
      setToast(t('Clip reversed. Undo takes it back.'))
    } catch (e) { setToast((e as Error).message) } finally { setReversing(null) }
  }

  /** Puts another photo or video in place of the selected one, keeping its time, size and look. */
  const replaceWith = async (file: File) => {
    const target = ed.sel
    try {
      const src = await loadSource(file, file.name)
      if (src.kind === 'audio') { setToast(t('Pick a photo or video')); return }
      ed.addSource(src)
      await saveMedia(src)
      if (ed.replaceMedia(target, src)) setToast(src.kind === 'image' ? t('Photo replaced') : t('Video replaced'))
    } catch (e) {
      setToast((e as Error).message)
    }
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

  /** Second tap of Swap: trades places with the clip or track item tapped. */
  const swapWith = (target: NonNullable<Selection>) => {
    const from = swapFrom
    setSwapFrom(null)
    if (!from || target.id === from.id) return
    if (from.type === 'clip' && target.type === 'clip') {
      const at = ed.swapClips(from.id, target.id)
      if (at !== null) { seek(at); setToast(t('Clips swapped')) }
    } else if (from.type === 'layer' && target.type === 'layer') {
      if (ed.swapLayers(from.id, target.id)) setToast(t('Swapped'))
      else setToast(t('Pick an item of the same kind (video/photo/text with each other, audio with audio)'))
    } else setToast(t('A main-video clip can only swap with another main-video clip'))
    ed.setSel(from)
  }
  // several items picked together: every clip of the main video, every item on a row, or every caption
  const group = useMemo(() => (sel?.all ? selectedIds(ed.project, sel) : null), [sel, ed.project])
  const groupCaps = sel?.type === 'layer' && !!sel.all && (() => { const l = ed.project.layers.find((x) => x.id === sel.id); return !!l && isSub(l) })()
  const groupText = !group ? '' : sel?.type === 'clip' ? `${group.length} ${t('clips selected')}` : groupCaps ? `${group.length} ${t('captions selected')}` : `${group.length} ${t('items on this track selected')}`
  /** Picks every clip of the main video, starting from the selected one (or the one under the playhead). */
  const selectAllClips = () => {
    const id = (sel?.type === 'clip' ? sel.id : null) ?? targetClip?.id ?? ed.project.clips[0]?.id
    if (!id || ed.project.main?.locked) return
    setPanel(null)
    ed.setSel({ type: 'clip', id, all: true })
    setToast(`${ed.project.clips.length} ${t('clips selected. Speed, volume, filters and Delete now change all of them.')}`)
  }
  const selectRow = (id: string) => {
    setPanel(null)
    ed.setSel({ type: 'layer', id, all: true })
  }
  // ---- copy a whole track (a row, or the main video) and paste it as a new track / back into the main video
  const copied = useCopiedTrack()
  const [pasteSheet, setPasteSheet] = useState(false)
  const copyRow = (id: string) => {
    const label = rowLabel(id)
    const done = copyTrack(ed.project, ed.sources, id, label)
    setToast(done ? `${label}: ${t('track copied. Paste it from + Add track or the Paste track tool.')}` : t('This track is empty: nothing to copy.'))
  }
  const rowLabel = (id: string) => {
    const tracks = ed.project.tracks ?? []
    const tr = tracks.find((x) => x.id === id)
    return id === 'main' ? t('Main video') : tr ? trackName(tracks, tr, t) : ''
  }
  /** The track the keyboard works on: the picked row, else the row of the selected item (a clip: the main video). */
  const currentRow = () => ed.track ?? (sel?.type === 'clip' ? 'main' : sel ? ed.project.layers.find((l) => l.id === sel.id)?.track ?? null : null)
  const [keysSheet, setKeysSheet] = useState(false)
  /** Double-click / Enter on an item: its main tool. */
  const openItem = (s: NonNullable<Selection>) => {
    ed.setSel({ type: s.type, id: s.id } as Selection)
    if (s.type === 'clip') { setPanel('adjust'); return }
    const l = ed.project.layers.find((x) => x.id === s.id)
    if (!l) return
    const p: Record<typeof l.type, PanelName> = { text: 'text', sticker: 'stickers', media: 'overlay', blur: 'blur', audio: 'volume', wave: 'wave', adjustment: 'adjlayer' }
    setPanel(p[l.type])
  }
  /** A copy of the whole track on a new row at the same time (the main video: as a video track). */
  const duplicateRow = (row: string) => {
    const label = rowLabel(row)
    const c = copyTrack(ed.project, ed.sources, row, label)
    if (c) { ed.pasteTrack(c, 'same', time); setToast(`${label}: ${t('track duplicated. Undo takes it back.')}`) }
    else setToast(t('This track is empty: nothing to copy.'))
  }
  const pasteRow = (how: PasteTrackHow) => {
    if (!copied) return
    // media from another project: kept in this project's storage too
    for (const s of copied.sources) if (!ed.sources[s.id]) saveMedia(s).catch(() => {})
    setPasteSheet(false)
    setPanel(null)
    const placed = ed.pasteTrack(copied, how, time)
    if (!placed) return
    if (how === 'same' || how === 'main-end') {
      const at = how === 'same' ? copied.start : ed.layout.total
      if (how === 'same' && Math.abs(at - time) > 0.05) seek(at)
      if (how === 'main-end') seek(at)
    }
    setToast(t(how === 'main-end' || how === 'main-playhead' ? 'Track pasted into the main video. Undo takes it back.' : 'Track pasted as a new track. Undo takes it back.'))
  }
  const selectOne = () => { if (sel) ed.setSel({ type: sel.type, id: sel.id } as Selection) }
  // Delete with several items selected removes them all, so check first
  const removeSel = () => {
    if (group && group.length > 1 && !confirm(`${t(groupCaps ? 'Delete all captions?' : sel?.type === 'clip' ? 'Delete all clips?' : 'Delete everything on this track?')} (${group.length})`)) return
    ed.remove(!snap)
  }
  // the phone's Back button (and Esc) first closes a panel, then lets go of the selection
  useBack(!!sel, () => { setPanel(null); setSwapFrom(null); ed.setSel(null) }, BACK.selection)
  const selClip = sel?.type === 'clip' ? ed.project.clips.find((c) => c.id === sel.id) ?? null : null
  const selStored = sel?.type === 'layer' ? ed.project.layers.find((l) => l.id === sel.id) ?? null : null
  // panels show (and change) a keyframed layer as it is at the playhead
  const selLayer = selStored ? atTime(selStored, time) : null
  // clip under the playhead, used when a clip tool is chosen with nothing selected
  const clipAtPlayhead = useMemo(() => activeAt(ed.layout.items, time).a?.item.clip ?? null, [ed.layout.items, time])
  const targetClip = selClip ?? (ed.project.main?.locked ? null : clipAtPlayhead)

  useEffect(() => { if (!sel && panel && !['text', 'stickers', 'showers', 'split', 'beat', 'smartcut', 'audio', 'format', 'subtitles', 'ai', 'watermark', 'presenter', 'templates', 'slideshow', 'filters', 'effects', 'color', 'adjust', 'speed', 'volume', 'crop'].includes(panel)) setPanel(null) }, [sel, panel])

  const openClipPanel = (p: PanelName) => {
    if (!targetClip) return
    if (!selClip) ed.setSel({ type: 'clip', id: targetClip.id })
    setPanel(p)
  }

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || exporting || scenes) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) ed.redo(); else ed.undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); ed.redo() }
      // ---- track shortcuts (see the Keyboard & mouse sheet, "?")
      else if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); setKeysSheet(true) }
      // ---- style, markers, timecode
      else if (mod && e.altKey && key === 'c') { if (sel) { e.preventDefault(); copyStyleOf(sel.id) } }
      else if (mod && e.altKey && key === 'v') { if (sel && styleCopied) { e.preventDefault(); pasteStyle(styleParts()) } }
      else if (mod && e.shiftKey && key === 'm') { e.preventDefault(); setMarkerSheet({ focus: null }) }
      else if (!mod && e.shiftKey && key === 'm') { e.preventDefault(); addMarkerHere() }
      else if (mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); jumpMarker(e.key === 'ArrowLeft' ? -1 : 1) }
      else if (!mod && key === 'k' && !e.shiftKey) { if (player?.playing) player.pause() }
      else if (!mod && key === 't' && !e.shiftKey) toggleTimecode()
      else if (!mod && !e.altKey && key === 'q') trimToPlayhead('in')
      else if (!mod && !e.altKey && key === 'w') trimToPlayhead('out')
      else if (e.shiftKey && e.key === 'Delete') { e.preventDefault(); rippleDelete() }
      else if (mod && !e.shiftKey && key === 'c' && !window.getSelection()?.toString()) {
        // copy the picked track row (or the row of the selected item; the main video for a clip)
        const row = currentRow()
        if (row) { e.preventDefault(); copyRow(row) }
      } else if (mod && !e.shiftKey && key === 'v' && copied) {
        e.preventDefault()
        pasteRow(copied.kind === 'main' && !ed.project.main?.locked ? 'main-playhead' : 'playhead')
      } else if (mod && e.shiftKey && key === 'v' && copied) { e.preventDefault(); setPasteSheet(true) }
      else if (mod && key === 'x') {
        // cut = copy the row, then delete it (the main video is only copied)
        const row = currentRow()
        if (!row) return
        e.preventDefault()
        if (row === 'main') { copyRow('main'); return }
        if (ed.project.tracks?.find((x) => x.id === row)?.locked) { setToast(t('This track is locked. Unlock it first.')); return }
        if (copyTrack(ed.project, ed.sources, row, rowLabel(row))) { ed.removeTrack(row); setToast(`${rowLabel(row)}: ${t('track cut. Ctrl+V pastes it at the playhead.')}`) }
      } else if (mod && !e.shiftKey && key === 'd') { if (sel) { e.preventDefault(); ed.duplicate() } }
      else if (mod && e.shiftKey && key === 'd') {
        // duplicate the whole track: a copy on a new row at the same time
        const row = currentRow()
        if (!row) return
        e.preventDefault()
        duplicateRow(row)
      } else if (mod && key === 'a') {
        e.preventDefault()
        const row = currentRow()
        if (row === 'main' || !row) selectAllClips()
        else { const first = ed.project.layers.filter((l) => l.track === row).sort((a, b) => a.start - b.start)[0]; if (first) selectRow(first.id) }
      } else if (!mod && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        // the picked row one place up or down
        const row = currentRow()
        if (row && row !== 'main') { e.preventDefault(); ed.moveTrack(row, e.key === 'ArrowUp' ? -1 : 1) }
      } else if (!mod && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        // pick the row above / below (top = the main video)
        const rows = ed.project.tracks ?? []
        if (!rows.length) return
        e.preventDefault()
        const i = ed.track ? rows.findIndex((x) => x.id === ed.track) : -1
        const j = e.key === 'ArrowUp' ? (i < 0 ? rows.length - 1 : i - 1) : i + 1
        ed.setTrack(j >= 0 && j < rows.length ? rows[j].id : null)
      } else if (!mod && key === 'm') {
        const row = currentRow()
        if (row === 'main' || !row) ed.setMain({ muted: !ed.project.main?.muted })
        else { const tr = ed.project.tracks?.find((x) => x.id === row); if (tr) ed.updateTrack(row, { muted: !tr.muted }) }
      } else if (!mod && key === 'h') {
        const tr = ed.project.tracks?.find((x) => x.id === currentRow())
        if (tr?.kind === 'visual') ed.updateTrack(tr.id, { hidden: !tr.hidden })
      } else if (!mod && e.shiftKey && key === 'l') {
        const row = currentRow()
        if (row === 'main' || !row) ed.setMain({ locked: !ed.project.main?.locked })
        else { const tr = ed.project.tracks?.find((x) => x.id === row); if (tr) ed.updateTrack(row, { locked: !tr.locked }) }
      } else if (!mod && (e.key === '+' || e.key === '=')) setPps((z) => Math.min(400, z * 1.5))
      else if (!mod && (e.key === '-' || e.key === '_')) setPps((z) => Math.max(4, z / 1.5))
      else if (e.key === 'Enter' && sel) { e.preventDefault(); openItem(sel) }
      else if (!mod && !e.altKey && key === 'f') { if (fs) exitFs(); else enterFs() }
      else if (!mod && !e.altKey && key === 'b' && !empty) toggleCompare()
      else if (!mod && !e.altKey && key === 'e' && fs) setFsEdit((v) => !v)
      else if (e.key === ' ') { e.preventDefault(); togglePlay() }
      else if (e.key === 's' && !mod) ed.split(time)
      else if (e.key === 'Delete' || e.key === 'Backspace') removeSel()
      else if (e.key === 'Home') { e.preventDefault(); player?.seek(0) }
      else if (e.key === 'End') { e.preventDefault(); seek(ed.layout.total) }
      // while playing the arrows (and J / L) jump 5 s and keep playing; while paused they step a frame (Shift: 1 s)
      else if (e.key === 'ArrowLeft' && player?.playing) skip(-SKIP)
      else if (e.key === 'ArrowRight' && player?.playing) skip(SKIP)
      else if (e.key === 'j' && !mod) skip(-SKIP)
      else if (e.key === 'l' && !mod) skip(SKIP)
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
  // where the tool row sits: under the video, or beside it (Toolbar settings)
  // (full screen keeps the tools in its slide-in edit panel, so they sit at the bottom there)
  const sideDock = useDock()
  const dock = fs ? 'bottom' : sideDock

  // ---- toolbar for the current selection
  let tools: Tool[]
  if (selClip && group) {
    // the same change for every clip: look and sound tools only
    const sound = ed.project.clips.some((c) => hasSound(ed.sources[c.sourceId]))
    tools = [
      { icon: 'selectAll', label: 'One clip', on: selectOne, active: true },
      { icon: 'speed', label: 'Speed', on: () => setPanel('speed') },
      { icon: 'volume', label: 'Volume', on: () => setPanel('volume') },
      ...(sound ? [{ icon: 'denoise', label: 'Remove noise', on: () => setPanel('noise') } as Tool, { icon: 'audiofx', label: 'Audio effects', on: () => setPanel('audiofx') } as Tool] : []),
      ...(sound ? [{ icon: 'detach', label: 'Detach audio', on: () => detach(ed.project.clips.map((c) => c.id)) } as Tool] : []),
      { icon: 'filter', label: 'Filters', on: () => setPanel('filters') },
      { icon: 'effects', label: 'Effects', on: () => setPanel('effects') },
      { icon: 'adjust', label: 'Adjust', on: () => setPanel('adjust') },
      { icon: 'color', label: 'Color', on: () => setPanel('color') },
      { icon: 'transition', label: 'Transition', on: () => { setTransitionFor(selClip.id); setPanel('transition') } },
      { key: 'fit', icon: 'fit', label: selClip.fit === 'fit' ? 'Fill' : 'Fit', on: () => ed.updateAllClips(() => ({ fit: selClip.fit === 'fit' ? 'fill' : 'fit' })) },
      ...(styleCopied ? [{ icon: 'paste', label: 'Paste style', on: () => setStyleSheet(true) } as Tool] : []),
      { icon: 'trash', label: 'Delete', on: removeSel },
    ]
  } else if (selClip) {
    const photo = ed.sources[selClip.sourceId]?.kind === 'image'
    tools = [
      { icon: 'selectAll', label: 'Select all', on: selectAllClips },
      // a video/photo on top of this one (picture-in-picture), at the playhead
      { icon: 'overlay', label: 'Add overlay', on: () => overlayInput.current?.click() },
      { icon: 'move', label: 'Move / swap', on: () => { setOrderMode('move'); setPanel('order') }, disabled: ed.project.clips.length < 2 },
      { icon: 'swap', label: 'Swap', on: () => { setPanel(null); setSwapFrom({ type: 'clip', id: selClip.id }) }, disabled: ed.project.clips.length < 2, active: swapFrom?.id === selClip.id },
      { icon: 'insert', label: 'Insert after', on: () => pickInsert(ed.project.clips.findIndex((c) => c.id === selClip.id) + 1) },
      ...(photo ? [{ icon: 'image', label: 'Photo', on: () => setPanel('photo') } as Tool] : []),
      { icon: 'replace', label: 'Replace', on: () => replaceInput.current?.click() },
      // remove a green/blue screen and put a photo, video or colour behind the person
      { icon: 'user', label: 'Remove BG', on: () => setPanel('cutout'), active: !!selClip.cutout?.enabled },
      { icon: 'chroma', label: 'Green screen', on: () => setPanel('chroma'), active: !!selClip.chroma?.enabled },
      { icon: 'split', label: 'Split', on: () => ed.split(time) },
      { icon: 'trim', label: 'Trim', on: () => setPanel('trim') },
      ...(!photo ? [{ icon: 'film', label: 'Find shots', on: () => setPanel('scenes') } as Tool] : []),
      { icon: 'layers', label: selClip.compound ? 'Break apart' : 'Join clips', on: () => setPanel('join'), active: !!selClip.compound },
      { icon: 'keyframe', label: 'Zoom & move', on: () => setPanel('zoommove'), active: !!(selClip.keys?.length || selClip.pos) },
      { icon: 'speed', label: 'Speed', on: () => setPanel('speed') },
      { key: 'motion', icon: 'motion', label: photo ? '3D zoom' : 'Motion', on: () => setPanel('motion'), active: !!(selClip.stabilize || selClip.motionBlur || selClip.smoothSlow || selClip.photo3d) },
      { icon: 'freeze', label: 'Freeze frame', on: freeze, disabled: !!selClip.ramp },
      ...(!photo ? [{ key: 'reverse', icon: 'reverse', label: reversing !== null ? `${Math.round(reversing * 100)}%` : 'Reverse', on: reverse, disabled: reversing !== null } as Tool] : []),
      { icon: 'volume', label: 'Volume', on: () => setPanel('volume') },
      // the clip's sound as its own item on an audio row (the clip goes silent)
      ...(hasSound(ed.sources[selClip.sourceId]) ? [{ icon: 'detach', label: 'Detach audio', on: () => detach([selClip.id]) } as Tool] : []),
      ...(hasSound(ed.sources[selClip.sourceId]) ? [
        { icon: 'denoise', label: 'Remove noise', on: () => setPanel('noise'), active: !!selClip.denoise } as Tool,
        { icon: 'audiofx', label: 'Audio effects', on: () => setPanel('audiofx'), active: !isNeutralFx(selClip.fx) } as Tool,
      ] : []),
      { icon: 'filter', label: 'Filters', on: () => setPanel('filters') },
      { icon: 'effects', label: 'Effects', on: () => setPanel('effects'), active: !!selClip.effect },
      { icon: 'adjust', label: 'Adjust', on: () => setPanel('adjust') },
      { icon: 'color', label: 'Color', on: () => setPanel('color'), active: !gradeIsEmpty(selClip.grade) },
      { icon: 'crop', label: 'Crop', on: () => setPanel('crop') },
      { icon: 'mask', label: 'Mask', on: () => setPanel('mask'), active: !!selClip.shapeMask },
      { icon: 'transition', label: 'Transition', on: () => { setTransitionFor(selClip.id); setPanel('transition') }, disabled: ed.project.clips.at(-1)?.id === selClip.id },
      { key: 'fit', icon: 'fit', label: selClip.fit === 'fit' ? 'Fill' : 'Fit', on: () => ed.updateClip(selClip.id, { fit: selClip.fit === 'fit' ? 'fill' : 'fit' }) },
      { icon: 'copy', label: 'Duplicate', on: ed.duplicate },
      { icon: 'brush', label: 'Copy style', on: () => copyStyleOf(selClip.id) },
      ...(styleCopied ? [{ icon: 'paste', label: 'Paste style', on: () => setStyleSheet(true) } as Tool] : []),
      { icon: 'copy', label: 'Copy track', on: () => copyRow('main') },
      ...(copied ? [{ icon: 'paste', label: 'Paste track', on: () => setPasteSheet(true) } as Tool] : []),
      { icon: 'trash', label: 'Delete', on: removeSel },
    ]
  } else if (selLayer && group && !groupCaps) {
    // every item on the row: tools that change the look or sound of all items of this kind there
    const media = selLayer.type === 'media'
    const looks: Tool[] = {
      text: [
        { icon: 'adjust', label: 'Style', on: () => setPanel('text-style') } as Tool,
        { icon: 'anim', label: 'Animation', on: () => setPanel('text-anim') } as Tool,
      ],
      sticker: [],
      media: [
        { icon: 'anim', label: 'Animation', on: () => setPanel('media-anim') } as Tool,
        { icon: 'blend', label: 'Blend', on: () => setPanel('blend') } as Tool,
        ...(media && ed.sources[selLayer.sourceId]?.kind === 'video' ? [{ icon: 'speed', label: 'Speed', on: () => setPanel('speed') } as Tool] : []),
        ...(media && hasSound(ed.sources[selLayer.sourceId]) ? [{ icon: 'denoise', label: 'Remove noise', on: () => setPanel('noise') } as Tool, { icon: 'audiofx', label: 'Audio effects', on: () => setPanel('audiofx') } as Tool] : []),
        ...(media && hasSound(ed.sources[selLayer.sourceId]) ? [{ icon: 'detach', label: 'Detach audio', on: () => detach(selectedIds(ed.project, sel)) } as Tool] : []),
        { icon: 'filter', label: 'Filters', on: () => setPanel('filters') } as Tool,
        { icon: 'effects', label: 'Effects', on: () => setPanel('effects') } as Tool,
        { icon: 'adjust', label: 'Adjust', on: () => setPanel('adjust') } as Tool,
        { icon: 'color', label: 'Color', on: () => setPanel('color') } as Tool,
      ],
      blur: [{ icon: 'blur', label: 'Blur', on: () => setPanel('blur') } as Tool],
      audio: [
        { icon: 'speed', label: 'Speed', on: () => setPanel('speed') } as Tool,
        { icon: 'volume', label: 'Volume', on: () => setPanel('volume') } as Tool,
        { icon: 'denoise', label: 'Remove noise', on: () => setPanel('noise') } as Tool,
        { icon: 'audiofx', label: 'Audio effects', on: () => setPanel('audiofx') } as Tool,
      ],
      wave: [{ icon: 'wave', label: 'Waveform', on: () => setPanel('wave') } as Tool],
      adjustment: ADJ_LOOKS(setPanel),
    }[selLayer.type]
    tools = [
      { icon: 'selectAll', label: 'One item', on: selectOne, active: true },
      // a row with different kinds of items: the look tools change the ones like the picked item
      ...looks,
      ...(styleCopied ? [{ icon: 'paste', label: 'Paste style', on: () => setStyleSheet(true) } as Tool] : []),
      { icon: 'trash', label: 'Delete', on: removeSel },
    ]
  } else if (selLayer) {
    const common: Tool[] = [
      ...(selLayer.type !== 'audio' ? [{ icon: 'layers', label: 'Layer order', on: () => setPanel('arrange') } as Tool] : []),
      ...(!isSub(selLayer) ? [{ icon: 'selectAll', label: 'Select all', on: () => selectRow(selLayer.id) } as Tool] : []),
      { icon: 'swap', label: 'Swap', on: () => { setPanel(null); setSwapFrom({ type: 'layer', id: selLayer.id }) }, active: swapFrom?.id === selLayer.id },
      ...('box' in selLayer ? [{ icon: 'keyframe', label: 'Keyframes', on: () => setPanel('keys'), active: !!selLayer.keys?.length } as Tool] : []),
      ...('box' in selLayer ? [{ icon: 'track', label: 'Track', on: () => setPanel('track'), active: !!selStored && isTracked(selStored) } as Tool] : []),
      { icon: 'split', label: 'Split', on: () => ed.split(time) },
      { icon: 'trim', label: 'Trim', on: () => setPanel('trim') },
      { icon: 'copy', label: 'Duplicate', on: ed.duplicate },
      ...(selLayer.type !== 'blur' && selLayer.type !== 'wave' ? [{ icon: 'brush', label: 'Copy style', on: () => copyStyleOf(selLayer.id) } as Tool] : []),
      ...(styleCopied ? [{ icon: 'paste', label: 'Paste style', on: () => setStyleSheet(true) } as Tool] : []),
      ...(selLayer.track ? [{ icon: 'copy', label: 'Copy track', on: () => copyRow(selLayer.track!) } as Tool] : []),
      ...(copied ? [{ icon: 'paste', label: 'Paste track', on: () => setPasteSheet(true) } as Tool] : []),
      { icon: 'trash', label: 'Delete', on: removeSel },
    ]
    const capsAll = selLayer.type === 'text' && selLayer.subtitle
      ? [
          { key: 'captions', icon: 'subtitles', label: sel?.type === 'layer' && sel.all ? 'One caption' : 'All captions', on: () => ed.setSel({ type: 'layer', id: selLayer.id, all: !(sel?.type === 'layer' && sel.all) }) } as Tool,
          { icon: 'ai', label: 'Listen again', on: () => { player?.pause(); ed.setSel({ type: 'layer', id: selLayer.id }); setPanel('ai') } } as Tool,
        ]
      : []
    const specific: Tool[] = {
      text: [
        { icon: 'text', label: 'Edit', on: () => setPanel('text') } as Tool,
        { icon: 'adjust', label: 'Style', on: () => setPanel('text-style') } as Tool,
        { icon: 'anim', label: 'Animation', on: () => setPanel('text-anim') } as Tool,
        { icon: 'subtitles', label: 'Caption style', on: () => setPanel('text-words'), active: selLayer.type === 'text' && !!selLayer.words } as Tool,
        {
          icon: 'user', label: 'Behind person', active: selLayer.type === 'text' && !!selLayer.behind,
          on: () => {
            if (selLayer.type !== 'text') return
            const behind = !selLayer.behind
            ed.updateLayer<TextLayer>(selLayer.id, { behind })
            if (behind) loadCutout()
            setToast(t(behind ? 'Text goes behind the person in the video' : 'Text is in front again'))
          },
        } as Tool,
      ],
      sticker: [{ icon: (selLayer as StickerLayer).shower ? 'shower' : 'sticker', label: (selLayer as StickerLayer).shower ? 'Shower' : 'Stickers', on: () => setPanel('stickers') } as Tool],
      media: [
        { icon: 'overlay', label: 'Size & opacity', on: () => setPanel('overlay') } as Tool,
        { icon: 'crop', label: 'Crop', on: () => setPanel('layer-crop') } as Tool,
        { icon: 'mask', label: 'Mask', on: () => setPanel('mask'), active: !!(selLayer as MediaLayer).shapeMask } as Tool,
        { icon: 'anim', label: 'Animation', on: () => setPanel('media-anim') } as Tool,
        { icon: 'blend', label: 'Blend', on: () => setPanel('blend') } as Tool,
        { icon: 'chroma', label: 'Green screen', on: () => setPanel('chroma'), active: !!(selLayer as MediaLayer).chroma?.enabled } as Tool,
        { icon: 'user', label: 'Remove BG', on: () => setPanel('cutout'), active: !!(selLayer as MediaLayer).cutout?.enabled } as Tool,
        ...(ed.sources[(selLayer as MediaLayer).sourceId]?.kind === 'video' ? [{ icon: 'speed', label: 'Speed', on: () => setPanel('speed') } as Tool] : []),
        ...(hasSound(ed.sources[(selLayer as MediaLayer).sourceId]) ? [{ icon: 'volume', label: 'Volume', on: () => setPanel('volume'), active: !!(selLayer as MediaLayer).volKeys?.length } as Tool] : []),
        ...(hasSound(ed.sources[(selLayer as MediaLayer).sourceId]) ? [{ icon: 'detach', label: 'Detach audio', on: () => detach([selLayer.id]) } as Tool] : []),
        ...(hasSound(ed.sources[(selLayer as MediaLayer).sourceId]) ? [
          { icon: 'denoise', label: 'Remove noise', on: () => setPanel('noise'), active: !!(selLayer as MediaLayer).denoise } as Tool,
          { icon: 'audiofx', label: 'Audio effects', on: () => setPanel('audiofx'), active: !isNeutralFx((selLayer as MediaLayer).fx) } as Tool,
        ] : []),
        { icon: 'replace', label: 'Replace', on: () => replaceInput.current?.click() } as Tool,
        { icon: 'filter', label: 'Filters', on: () => setPanel('filters') } as Tool,
        { icon: 'effects', label: 'Effects', on: () => setPanel('effects') } as Tool,
        { icon: 'adjust', label: 'Adjust', on: () => setPanel('adjust') } as Tool,
        { icon: 'color', label: 'Color', on: () => setPanel('color') } as Tool,
      ],
      blur: [{ icon: 'blur', label: 'Blur', on: () => setPanel('blur') } as Tool],
      audio: [
        { icon: 'speed', label: 'Speed', on: () => setPanel('speed') } as Tool,
        { icon: 'volume', label: 'Volume', on: () => setPanel('volume') } as Tool,
        { icon: 'denoise', label: 'Remove noise', on: () => setPanel('noise'), active: selLayer.type === 'audio' && !!selLayer.denoise } as Tool,
        { icon: 'audiofx', label: 'Audio effects', on: () => setPanel('audiofx'), active: selLayer.type === 'audio' && (!isNeutralFx(selLayer.fx) || selLayer.duck != null) } as Tool,
        { icon: 'wave', label: 'Waveform', on: () => { if (selLayer.type === 'audio') { ed.addWave(selLayer); setPanel('wave') } } } as Tool,
        { icon: 'music', label: 'Beats', on: () => setPanel('beat'), active: selLayer.type === 'audio' && !!selLayer.beats } as Tool,
      ],
      wave: [{ icon: 'wave', label: 'Waveform', on: () => setPanel('wave') } as Tool],
      adjustment: [{ icon: 'layers', label: 'Strength', on: () => setPanel('adjlayer') } as Tool, ...ADJ_LOOKS(setPanel)],
    }[selLayer.type]
    // an overlay's own tools come first, then where it sits (order, keyframes), then the rest
    tools = selLayer.type === 'media'
      ? [...specific.slice(0, 4), ...common.slice(0, 3), ...specific.slice(4), ...common.slice(3)]
      : [...capsAll, ...specific, ...common]
  } else {
    // everyday editing first (Add, Overlay, Text...), the "... to video" makers after, so Overlay is never off-screen
    tools = [
      { icon: 'add', label: 'Add', on: () => mainInput.current?.click() },
      ...(copied ? [{ icon: 'paste', label: 'Paste track', on: () => setPasteSheet(true) } as Tool] : []),
      { icon: 'overlay', label: 'Overlay', on: () => overlayInput.current?.click(), disabled: empty },
      { icon: 'text', label: 'Text', on: () => { ed.addText(time); setPanel('text') }, disabled: empty },
      { icon: 'splitscreen', label: 'Split screen', on: () => setPanel('split'), disabled: empty },
      { icon: 'title', label: 'Titles', on: () => { ed.addText(time); setPanel('text-titles') }, disabled: empty },
      { icon: 'move', label: 'Move / swap', on: () => { setOrderMode('move'); openClipPanel('order') }, disabled: !targetClip || ed.project.clips.length < 2 },
      { icon: 'selectAll', label: 'Select all', on: selectAllClips, disabled: empty || !!ed.project.main?.locked },
      { key: 'marker', icon: 'marker', label: markers.length ? `${t('Markers')} (${markers.length})` : 'Add marker', on: () => (markers.length ? setMarkerSheet({ focus: null }) : addMarkerHere(true)), disabled: empty },
      { icon: 'music', label: 'Audio', on: () => { setAudioTab('mine'); setPanel('audio') } },
      { icon: 'mic', label: 'Record voice', on: () => { player?.pause(); setAudioTab('voice'); setPanel('audio') } },
      { icon: 'smartcut', label: 'Smart cut', on: () => setPanel('smartcut'), disabled: empty },
      { icon: 'music', label: 'Beat sync', on: () => setPanel('beat'), disabled: empty, active: !!ed.project.beatFx },
      { icon: 'subtitles', label: 'Subtitles', on: () => setPanel('subtitles'), disabled: empty },
      { icon: 'chroma', label: 'Green screen', on: () => openClipPanel('chroma'), disabled: !targetClip },
      { icon: 'speed', label: 'Speed', on: () => openClipPanel('speed'), disabled: !targetClip },
      { icon: 'sticker', label: 'Stickers', on: () => setPanel('stickers'), disabled: empty },
      { icon: 'shower', label: 'Showers', on: () => setPanel('showers'), disabled: empty },
      { icon: 'freeze', label: 'Freeze frame', on: freeze, disabled: !targetClip || !!targetClip.ramp },
      { icon: 'filter', label: 'Filters', on: () => openClipPanel('filters'), disabled: !targetClip },
      { icon: 'effects', label: 'Effects', on: () => openClipPanel('effects'), disabled: !targetClip },
      { icon: 'adjust', label: 'Adjust', on: () => openClipPanel('adjust'), disabled: !targetClip },
      { icon: 'color', label: 'Color', on: () => openClipPanel('color'), disabled: !targetClip },
      { icon: 'layers', label: 'Adjustment layer', on: () => { ed.addAdjustment(time); setPanel('adjlayer') }, disabled: empty },
      { icon: 'chart', label: 'Scopes', on: toggleScopes, disabled: empty, active: scopes },
      { icon: 'compress', label: 'Preview copies', on: () => { player?.pause(); setProxySheet(true) }, disabled: !Object.values(ed.sources).some((x) => x.kind === 'video'), active: useProxies && Object.values(ed.sources).some((x) => x.proxy) },
      { icon: 'blur', label: 'Blur', on: () => ed.addBlur(time), disabled: empty },
      { icon: 'ai', label: 'AI Dub', on: () => { player?.pause(); setPanel('ai') }, disabled: empty },
      { icon: 'watermark', label: 'Watermark', on: () => setPanel('watermark'), disabled: empty },
      { icon: 'format', label: 'Format', on: () => setPanel('format') },
      { icon: 'screen', label: 'Record screen', on: () => { player?.pause(); setScreenRec('screen') } },
      { icon: 'camera', label: 'Record camera', on: () => { player?.pause(); setScreenRec('camera') } },
      { icon: 'template', label: 'Intro/Outro', on: () => { player?.pause(); setPanel('templates') } },
      { icon: 'image', label: 'Slideshow', on: () => setPanel('slideshow') },
      { icon: 'slides', label: 'Slides to video', on: () => { player?.pause(); setScenes('files') } },
      { icon: 'script', label: 'Script to video', on: () => { player?.pause(); setScenes('text') } },
      { icon: 'mindmap', label: 'Mind map to video', on: () => { player?.pause(); setScenes('mindmap') } },
      { icon: 'podcast', label: 'Audio to video', on: () => { player?.pause(); setScenes('audio') } },
      { icon: 'quiz', label: 'Quiz to video', on: () => { player?.pause(); setScenes('quiz') } },
      { icon: 'chart', label: 'Data to video', on: () => { player?.pause(); setScenes('data') } },
      { icon: 'article', label: 'Article to video', on: () => { player?.pause(); setScenes('article') } },
    ]
  }

  // ---- Smart shortcuts: "Your usual" for what is selected (or the project), and the usual next tool
  const usual = useMemo((): { hs: Habit[]; key: string; patches: Record<string, object>; project: boolean } | null => {
    void habitsVersion
    const p = ed.project
    const lastId = p.clips.at(-1)?.id
    // the project's own usual (its format…) when the selected item has none
    const setup = () => {
      if (empty) return null
      const hs = usualFor(p, ed.sources, `p:${initial.id}`)
      return hs.length ? { hs, key: `p:${initial.id}`, patches: {}, project: true } : null
    }
    if (!sel) return setup()
    const anchor: Project['clips'][number] | Project['layers'][number] | undefined = sel.type === 'clip' ? p.clips.find((c) => c.id === sel.id) : p.layers.find((l) => l.id === sel.id)
    if (!anchor) return setup()
    const hs = usualFor(anchor, ed.sources, anchor.id, anchor.id === lastId)
    if (!hs.length) return setup()
    // a group gets the same habits on each of its items of the same kind that lacks them
    const ids = group ?? [anchor.id]
    const want = new Set(hs.map((h) => h.id))
    const patches: Record<string, object> = {}
    for (const id of ids) {
      const x = sel.type === 'clip' ? p.clips.find((c) => c.id === id) : p.layers.find((l) => l.id === id)
      if (!x) continue
      const mine = id === anchor.id ? hs : usualFor(x, ed.sources, id, id === lastId).filter((h) => want.has(h.id))
      if (mine.length) patches[id] = patchFor(x, mine)
    }
    return { hs, key: `${sel.all ? 'all:' : ''}${sel.id}`, patches, project: false }
  }, [sel, group, ed.project, ed.sources, empty, initial.id, habitsVersion])
  // suggestions waved away this session (the "Your usual" tool still works for them)
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [next, setNext] = useState<NextStep | null>(null)
  useEffect(() => {
    if (!next) return
    const id = setTimeout(() => setNext(null), 20000)
    return () => clearTimeout(id)
  }, [next])
  const applyUsual = () => {
    if (!usual) return
    if (usual.project) ed.setSettings(patchFor(ed.project, usual.hs).settings!)
    else ed.patchItems(usual.patches)
    acceptHabits(usual.hs.map((h) => h.id))
    const n = Object.keys(usual.patches).length
    setToast(`${t('Your usual applied')}${n > 1 ? ` (${n})` : ''}: ${usual.hs.map((h) => t(describeHabit(h))).join(', ')}. ${t('Undo takes it back.')}`)
  }
  const sayPaused = (names: string[]) => {
    if (names.length) setToast(`${t('OK, no more suggestions for')} ${names.join(', ')}. ${t('Turn them back on in Smart shortcuts.')}`)
  }
  // what was selected when a tool was tapped, so "after Split comes Delete" is learned for clips, not for text
  const ctx = selClip ? (group ? 'clips' : 'clip') : selStored ? `${group ? 'row' : 'layer'}:${selStored.type}` : 'none'
  const runTool = (tl: Tool) => {
    setNext(null)
    if (tl.label !== 'Your usual' && tl.label !== 'Smart shortcuts') {
      toolUsed(ctx, tl.label)
      const n = nextStep(ctx, tl.label)
      if (n) setNext(n)
    }
    tl.on()
  }
  if (usual && sel && !usual.project) tools = [{ icon: 'habit', label: 'Your usual', on: applyUsual }, ...tools]
  if (!sel) tools = [...tools, { icon: 'habit', label: 'Smart shortcuts', on: () => setHabitsSheet(true) }]
  const nextTool = next ? tools.find((x) => x.label === next.label && !x.disabled) ?? null : null
  const quiet = !!panel || !!swapFrom || playing || !!pending
  const habitBar: { key: string; text: string; action: string; apply: () => void; notNow: () => void } | null = quiet ? null
    : nextTool && next ? {
      key: next.id, text: `${t('Usually next')}: ${t(next.label)}`, action: 'Do it',
      apply: () => { acceptHabits([next.id]); runTool(nextTool) },
      notNow: () => { sayPaused(rejectHabits([next]).map((n) => `${t(n.after)} → ${t(n.label)}`)); setNext(null) },
    }
      : usual && !dismissed.has(usual.key) ? {
        key: usual.key, text: `${t('Your usual')}: ${usual.hs.map((h) => t(describeHabit(h))).join(' · ')}`, action: 'Apply',
        apply: applyUsual,
        notNow: () => { sayPaused(rejectHabits(usual.hs).map((h) => t(describeHabit(h)))); setDismissed((d) => new Set(d).add(usual.key)) },
      } : null
  const shownKey = habitBar?.key
  useEffect(() => { if (shownKey) noteShown() }, [shownKey])

  const closePanel = () => setPanel(null)
  /** The clip's source time at the playhead, or null when the playhead is on another clip. */
  const srcOfClip = (c: Clip) => {
    const it = ed.layout.items.find((x) => x.clip.id === c.id)
    return it && time >= it.start - 1e-3 && time < it.start + it.dur ? clipSrcAt(c, Math.max(0, time - it.start)) : null
  }
  let panelView: React.ReactNode = null
  const tclip = targetClip
  if (panel === 'trim' && selClip) panelView = <TrimPanel ed={ed} clip={selClip} onTrim={trimToPlayhead} onClose={closePanel}
    onPreview={(id, st) => { if (!player) return; if (id) { player.pause(); player.previewSource(id, st) } else player.endPreviewSource() }} />
  else if (panel === 'trim' && selLayer) panelView = <LayerTrimPanel onTrim={trimToPlayhead} onRippleDelete={rippleDelete} onClose={closePanel} />
  else if (panel === 'speed' && (selLayer?.type === 'media' || selLayer?.type === 'audio')) panelView = <LayerSpeedPanel ed={ed} layer={selLayer} onClose={closePanel} />
  else if (panel === 'speed' && tclip) panelView = <SpeedPanel ed={ed} clip={tclip} onClose={closePanel} />
  else if (panel === 'volume' && selLayer?.type === 'media') panelView = <VolumePanel ed={ed} target={{ kind: 'layer', id: selLayer.id, volume: selLayer.volume, volKeys: selLayer.volKeys }} onClose={closePanel}
    src={group ? undefined : time >= selLayer.start && time < selLayer.end ? layerSrcAt(selLayer, time - selLayer.start) : null} />
  else if (panel === 'volume' && selLayer?.type === 'audio') panelView = <VolumePanel ed={ed} target={{ kind: 'layer', id: selLayer.id, volume: selLayer.volume, fadeIn: selLayer.fadeIn, fadeOut: selLayer.fadeOut, volKeys: selLayer.volKeys }} onClose={closePanel}
    src={group ? undefined : time >= selLayer.start && time < selLayer.end ? layerSrcAt(selLayer, time - selLayer.start) : null} />
  else if (panel === 'volume' && tclip) panelView = <VolumePanel ed={ed} target={{ kind: 'clip', clip: tclip }} onClose={closePanel} src={group ? undefined : srcOfClip(tclip)} />
  else if (panel === 'mask' && selLayer?.type === 'media') panelView = <MaskPanel ed={ed} target={{ kind: 'layer', layer: selLayer }} onClose={closePanel} />
  else if (panel === 'mask' && selClip) panelView = <MaskPanel ed={ed} target={{ kind: 'clip', clip: selClip }} onClose={closePanel} />
  else if (panel === 'zoommove' && selClip) panelView = <ZoomMovePanel ed={ed} clip={selClip} src={srcOfClip(selClip)} start={ed.layout.items.find((x) => x.clip.id === selClip.id)?.start ?? 0} onSeek={seek} onClose={closePanel} />
  else if (panel === 'noise' && (selLayer?.type === 'media' || selLayer?.type === 'audio')) panelView = <NoisePanel ed={ed} target={{ kind: 'layer', layer: selLayer }} onClose={closePanel} />
  else if (panel === 'noise' && selClip) panelView = <NoisePanel ed={ed} target={{ kind: 'clip', clip: selClip }} onClose={closePanel} />
  else if (panel === 'audiofx' && (selLayer?.type === 'media' || selLayer?.type === 'audio')) panelView = <AudioFxPanel ed={ed} target={{ kind: 'layer', layer: selLayer }} onClose={closePanel} />
  else if (panel === 'audiofx' && selClip) panelView = <AudioFxPanel ed={ed} target={{ kind: 'clip', clip: selClip }} onClose={closePanel} />
  else if (panel === 'filters' && (selLayer?.type === 'media' || selLayer?.type === 'adjustment')) panelView = <FilterPanel ed={ed} target={{ kind: 'layer', layer: selLayer }} onClose={closePanel} />
  else if (panel === 'filters' && tclip) panelView = <FilterPanel ed={ed} target={{ kind: 'clip', clip: tclip }} onClose={closePanel} />
  else if (panel === 'color' && (selLayer?.type === 'media' || selLayer?.type === 'adjustment')) panelView = <ColorPanel ed={ed} target={{ kind: 'layer', layer: selLayer }} onClose={closePanel} onToast={setToast} />
  else if (panel === 'color' && tclip) panelView = <ColorPanel ed={ed} target={{ kind: 'clip', clip: tclip }} onClose={closePanel} onToast={setToast} />
  else if (panel === 'effects' && (selLayer?.type === 'media' || selLayer?.type === 'adjustment')) panelView = <EffectsPanel ed={ed} target={{ kind: 'layer', layer: selLayer }} onClose={closePanel} />
  else if (panel === 'effects' && tclip) panelView = <EffectsPanel ed={ed} target={{ kind: 'clip', clip: tclip }} onClose={closePanel} />
  else if (panel === 'adjust' && (selLayer?.type === 'media' || selLayer?.type === 'adjustment')) panelView = <AdjustPanel ed={ed} target={{ kind: 'layer', layer: selLayer }} onClose={closePanel} />
  else if (panel === 'adjust' && tclip) panelView = <AdjustPanel ed={ed} target={{ kind: 'clip', clip: tclip }} onClose={closePanel} />
  else if (panel === 'transition') {
    const c = ed.project.clips.find((x) => x.id === transitionFor)
    if (c) panelView = <TransitionPanel ed={ed} clip={c} onClose={closePanel} />
  } else if (panel === 'format') panelView = <FormatPanel ed={ed} onClose={closePanel} />
  else if ((panel === 'text' || panel === 'text-titles' || panel === 'text-style' || panel === 'text-anim' || panel === 'text-words') && selLayer?.type === 'text')
    panelView = <TextPanel key={panel} ed={ed} layer={selLayer} onClose={closePanel} startTab={panel === 'text' ? 'edit' : panel === 'text-titles' ? 'titles' : panel === 'text-style' ? 'style' : panel === 'text-words' ? 'words' : 'anim'} />
  else if (panel === 'stickers') panelView = <StickerPanel ed={ed} layer={selLayer?.type === 'sticker' ? (selLayer as StickerLayer) : null} t={time} onClose={closePanel} />
  else if (panel === 'split') panelView = <SplitPanel onClose={closePanel} onPick={addSplit} />
  else if (panel === 'showers') panelView = <StickerPanel key="showers" ed={ed} layer={null} t={time} onClose={closePanel} showers />
  else if (panel === 'join' && selClip) panelView = <JoinPanel ed={ed} clip={selClip} onClose={closePanel} onToast={setToast} />
    else if (panel === 'scenes' && selClip) panelView = <ScenePanel ed={ed} clip={selClip} onSeek={seek} onClose={closePanel} onToast={setToast} />
    else if (panel === 'adjlayer' && selLayer?.type === 'adjustment') panelView = <AdjustmentPanel ed={ed} layer={selLayer} onClose={closePanel} />
    else if (panel === 'overlay' && selLayer?.type === 'media') panelView = <OverlayPanel ed={ed} layer={selLayer as MediaLayer} onClose={closePanel} />
  else if (panel === 'chroma' && selStored?.type === 'media') panelView = <GreenScreenPanel key={selStored.id} ed={ed} target={{ kind: 'layer', layer: selStored }} time={time} onToast={setToast} onClose={closePanel} />
  else if (panel === 'smartcut') panelView = <SmartCutPanel ed={ed} onToast={setToast} onClose={closePanel} onShort={makeShort}
      onSeek={(tt) => { player?.seek(tt); player?.play() }} />
  else if (panel === 'beat') panelView = <BeatPanel ed={ed} onToast={setToast} onMusic={() => { setAudioTab('mine'); setPanel('audio') }} onClose={closePanel} />
  else if (panel === 'cutout' && selStored?.type === 'media') panelView = <CutoutPanel key={selStored.id} ed={ed} target={{ kind: 'layer', layer: selStored }} onToast={setToast} onClose={closePanel} />
  else if (panel === 'motion' && tclip) panelView = <MotionPanel key={tclip.id} ed={ed} clip={tclip} onToast={setToast} onClose={closePanel} />
  else if (panel === 'track' && selStored) panelView = <TrackPanel key={selStored.id} ed={ed} layer={selStored} time={time} onSeek={seek} onClose={closePanel} />
  else if (panel === 'cutout' && tclip) panelView = <CutoutPanel key={tclip.id} ed={ed} target={{ kind: 'clip', clip: tclip }} onToast={setToast} onClose={closePanel} />
  else if (panel === 'chroma' && tclip) panelView = <GreenScreenPanel key={tclip.id} ed={ed} target={{ kind: 'clip', clip: tclip }} time={time} onToast={setToast} onClose={closePanel} />
  else if (panel === 'order' && selClip) panelView = (
    <ClipOrderPanel key={orderMode} ed={ed} clip={selClip} start={orderMode} onPick={(id) => ed.setSel({ type: 'clip', id })}
      onSeek={seek} onInsert={pickInsert} onClose={closePanel} />
  )
  else if (panel === 'arrange' && selLayer) panelView = <ArrangePanel ed={ed} layer={selLayer} onToast={setToast} onClose={closePanel} />
  else if (panel === 'keys' && selLayer) panelView = <KeyframePanel ed={ed} layer={selLayer} time={time} onSeek={seek} onClose={closePanel} />
  else if (panel === 'media-anim' && selLayer?.type === 'media') panelView = <MediaAnimPanel ed={ed} layer={selLayer} onClose={closePanel} />
  else if (panel === 'blend' && selLayer?.type === 'media') panelView = <BlendPanel ed={ed} layer={selLayer} onClose={closePanel} />
  else if (panel === 'blur' && selLayer?.type === 'blur') panelView = <BlurPanel ed={ed} layer={selLayer} onClose={closePanel} />
  else if (panel === 'wave' && selLayer?.type === 'wave') panelView = <WavePanel ed={ed} layer={selLayer} onClose={closePanel} />
  else if (panel === 'watermark') panelView = <WatermarkPanel ed={ed} time={time} onClose={closePanel} />
  else if (panel === 'presenter') panelView = <PresenterPanel ed={ed} onSeek={seek} onClose={closePanel} />
  else if (panel === 'slideshow') panelView = <SlideshowPanel ed={ed} onClose={closePanel} onAddPhotos={pickPhotos} onMusic={() => setPanel('audio')} />
  else if (panel === 'photo' && selClip) panelView = <PhotoPanel ed={ed} clip={selClip} onClose={closePanel} />
  else if (panel === 'templates') panelView = <TemplatesPanel ed={ed} onClose={closePanel} onToast={setToast} />
  else if (panel === 'ai') panelView = <AIPanel ed={ed} name={name} onClose={closePanel} />
  else if (panel === 'subtitles') panelView = <SubtitlePanel ed={ed} name={name} t={time} onClose={closePanel} onSeek={seek}
    onSelectAll={() => { const first = ed.project.layers.filter(isSub).sort((a, b) => a.start - b.start)[0]; if (first) { ed.setSel({ type: 'layer', id: first.id, all: true }); setPanel('text-style') } }} />
  else if (panel === 'audio') panelView = (
    <AudioPanel key={audioTab} ed={ed} time={time} onClose={closePanel} startTab={audioTab}
      onRecordStart={() => { if (player) { player.muted = true; player.play() } }}
      onRecordStop={() => { if (player) { player.pause(); player.muted = false } }}
      onRecordPause={(paused) => { if (paused) player?.pause(); else player?.play() }} />
  )

  const toolbar = (
    <ToolBar tools={tools} dock={dock} run={runTool} still={fs}
      onBack={selClip || selStored ? () => { ed.setSel(null); setPanel(null) } : undefined}
      locked={(tl) => !!PREMIUM_TOOLS[tl.label] && !isAllowed(PREMIUM_TOOLS[tl.label])} />
  )

  return (
    <div className={`app editor dock-${dock}${fs ? ' fs' : ''}${fs && fsEdit ? ' fs-edit' : ''}${fs && fsIdle && playing && !fsEdit ? ' fs-idle' : ''}`}>
      <header className="top">
        <button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        <button className="title" onClick={rename}>{name}</button>
        <div className="top-actions">
          <button className={`icon-btn${ed.project.presenter?.enabled ? ' on' : ''}`} onClick={() => { player?.pause(); ed.setSel(null); setPanel(panel === 'presenter' ? null : 'presenter') }}
            aria-label={t('Presenter profile')} title={t('Presenter profile')}><Icon name="user" /></button>
          <button className="icon-btn" onClick={() => { player?.pause(); setNotesSheet(true) }} aria-label={t('Testing notes')} title={t('Testing notes')}><Icon name="note" /></button>
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

      {missing.length > 0 && (
        <button className="missing-bar" onClick={() => { player?.pause(); setRelinkSheet(true) }} data-testid="missing-bar">
          ⚠ {missing.length === 1 ? t('1 file is missing') : `${missing.length} ${t('files are missing')}`} · <b>{t('Find files')}</b>
        </button>
      )}
      <div className="stage-row">
      {dock === 'left' && toolbar}
      <div className="stage-wrap">
        <Preview ed={ed} player={player} canvasRef={canvasRef} t={time} onTogglePlay={togglePlay}
          onEditText={() => setPanel('text')} wmEdit={panel === 'watermark'} compare={compare} onCompare={setCompare} />
        {!empty && !fs && (
          <div className="stage-corner">
            <button className={compare !== null ? 'on' : ''} onClick={toggleCompare} aria-label="Before / after" aria-pressed={compare !== null} title={t('Before / after (B)')} data-testid="compare-btn"><Icon name="compare" size={18} /></button>
            <button onClick={enterFs} aria-label="Full screen" title={t('Full screen (F)')} data-testid="fs-btn"><Icon name="fullscreen" size={18} /></button>
          </div>
        )}
        {fs && (
          <FullScreenBar player={player} playing={playing} time={time} total={ed.layout.total} showTime={showTime} rate={rate} onRate={nextRate}
            onTogglePlay={togglePlay} onSkip={skip} editing={fsEdit} onEdit={() => setFsEdit((v) => !v)}
            comparing={compare !== null} onCompare={toggleCompare} onExit={exitFs} idle={fsIdle} />
        )}
        {scopes && !empty && <Scopes source={getCanvas} onClose={toggleScopes} />}
        {empty && (
          <div className="empty">
            <button className="import-big" onClick={() => mainInput.current?.click()}>
              <Icon name="plus" size={44} />
              <span>{t('Import video')}</span>
            </button>
            <div className="row empty-more">
              <button className="btn" onClick={() => pickPhotos(defaultSlideshow())}><Icon name="image" size={18} /> {t('Photo slideshow')}</button>
              <button className="btn" onClick={() => setScenes('files')}><Icon name="slides" size={18} /> {t('Slides / PDF to video')}</button>
              <button className="btn" onClick={() => setScenes('text')}><Icon name="script" size={18} /> {t('Script to video')}</button>
              <button className="btn" onClick={() => setScenes('mindmap')}><Icon name="mindmap" size={18} /> {t('Mind map to video')}</button>
              <button className="btn" onClick={() => setScenes('audio')}><Icon name="podcast" size={18} /> {t('Audio to video')}</button>
              <button className="btn" onClick={() => setScenes('quiz')}><Icon name="quiz" size={18} /> {t('Quiz to video')}</button>
              <button className="btn" onClick={() => setScenes('data')}><Icon name="chart" size={18} /> {t('Data to video')}</button>
              <button className="btn" onClick={() => setScenes('article')}><Icon name="article" size={18} /> {t('Article to video')}</button>
              <button className="btn" onClick={() => setScreenRec('screen')}><Icon name="screen" size={18} /> {t('Record screen')}</button>
              <button className="btn" onClick={() => setScreenRec('camera')}><Icon name="camera" size={18} /> {t('Record camera')}</button>
              <button className="btn" onClick={() => setPanel('templates')}><Icon name="template" size={18} /> {t('Intro/Outro')}</button>
            </div>
            <p className="muted">{t('Pick videos or photos from your phone. Everything stays on your device.')}</p>
          </div>
        )}
        {importing > 0 && <div className="toast">{t('Opening')}… ({importing})</div>}
        {toast && <div className="toast error" onClick={() => setToast(null)}>{toast}</div>}
      </div>
      {dock === 'right' && toolbar}
      </div>

      <div className="transport">
        <span className="time-wrap">
          <span className={`time${timecode ? ' tc' : ''}`} onClick={toggleTimecode} title={t('Tap to switch between minutes and timecode (T)')} data-testid="time">{showTime(time)} <span className="muted">/ {showTime(ed.layout.total)}</span></span>
          {meter ? <span onClick={toggleMeter}><AudioMeter player={player} playing={playing} /></span>
            : <button className="rate-btn meter-off" onClick={toggleMeter} title={t('Show the sound level meter')}>dB</button>}
        </span>
        <span className="play-group">
          <button className="icon-btn" disabled={empty} onClick={() => player?.seek(0)} aria-label="Go to start" title={t('Go to start')}><Icon name="toStart" /></button>
          <button className="icon-btn" disabled={empty} onClick={() => skip(-SKIP)} aria-label="Back 5 seconds" title={t('Back 5 s (← or J)')}><Icon name="rewind" /></button>
          <button className="icon-btn play" disabled={empty} onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
          <button className="icon-btn" disabled={empty} onClick={() => skip(SKIP)} aria-label="Forward 5 seconds" title={t('Forward 5 s (→ or L)')}><Icon name="forward" /></button>
          <button className="icon-btn" disabled={empty} onClick={() => seek(ed.layout.total)} aria-label="Go to end" title={t('Go to end')}><Icon name="toEnd" /></button>
        </span>
        <span className="zoom">
          <button className={`rate-btn${rate !== 1 ? ' on' : ''}`} disabled={empty} onClick={nextRate} aria-label="Playback speed" title={t('Playback speed')}>{rate}x</button>
          <button className="icon-btn keys-btn" onClick={() => setKeysSheet(true)} aria-label="Keyboard and mouse" title={t('Keyboard & mouse (?)')}><Icon name="keyboard" /></button>
          <button className={`icon-btn snap${snap ? ' on' : ''}`} onClick={toggleSnap} aria-label="Snap" aria-pressed={snap} title={t('Magnetic snap')}><Icon name="magnet" /></button>
          <button className="icon-btn" onClick={() => setPps((z) => Math.max(4, z / 1.5))} aria-label="Zoom out"><Icon name="minus" /></button>
          <button className="icon-btn" onClick={() => setPps((z) => Math.min(400, z * 1.5))} aria-label="Zoom in"><Icon name="plus" /></button>
        </span>
      </div>

      <div className="edit-dock" data-testid="edit-dock">
      {fs && (
        <div className="dock-head">
          <b>{t('Edit panel')}</b>
          <span className="muted">{t('Changes show on the video right away')}</span>
          <button className="icon-btn" onClick={() => setFsEdit(false)} aria-label={t('Close')} title={t('Hide the edit panel (E)')}><Icon name="close" /></button>
        </div>
      )}
      {!empty && (
        <Timeline
          ed={ed} t={time} pps={pps} setPps={setPps}
          onScrub={seek}
          onTrimPreview={(id, st) => { if (!player) return; if (id) { player.pause(); player.previewSource(id, st) } else player.endPreviewSource() }}
          onTransition={(id) => { ed.setSel({ type: 'clip', id }); setTransitionFor(id); setPanel('transition') }}
          onAdd={() => mainInput.current?.click()}
          onAudioTrack={() => { player?.pause(); setAudioTab('mine'); setPanel('audio') }}
          onSelectAll={selectAllClips} onSelectRow={selectRow}
          onCopyTrack={copyRow} onPasteTrack={() => setPasteSheet(true)} onDuplicateTrack={duplicateRow}
          onOpenItem={openItem} onDelete={removeSel}
          onMarker={(id) => { const m = markers.find((x) => x.id === id); if (m) seek(m.t); setMarkerSheet({ focus: id }) }}
          onAddMarker={() => addMarkerHere(true)}
          onCopyStyle={copyStyleOf} onPasteStyle={styleCopied ? () => setStyleSheet(true) : undefined}
          snap={snap}
          picking={swapFrom} onPicked={swapWith}
        />
      )}
      {group && !swapFrom && (
        <div className="swap-bar group-bar">
          <Icon name="selectAll" size={18} />
          <span>{groupText}</span>
          <button className="btn small" onClick={selectOne}>{t(sel?.type === 'clip' ? 'One clip' : 'One item')}</button>
        </div>
      )}
      {swapFrom && (
        <div className="swap-bar">
          <Icon name="swap" size={18} />
          <span>{t(swapFrom.type === 'clip' ? 'Tap the clip to swap with' : 'Tap the item to swap with')}</span>
          <button className="btn small" onClick={() => setSwapFrom(null)}>{t('Cancel')}</button>
        </div>
      )}

      {habitBar && <HabitBar key={habitBar.key} text={habitBar.text} action={habitBar.action} onApply={habitBar.apply} onNotNow={habitBar.notNow} onSettings={() => setHabitsSheet(true)} />}
      {dock === 'bottom' && toolbar}

      {panelView && <div className="panel-wrap">{panelView}</div>}
      {panel === 'crop' && targetClip && ed.sources[targetClip.sourceId] && (
        <CropEditor ed={ed} clip={targetClip} source={ed.sources[targetClip.sourceId]} time={targetClip.in + 0.1} onClose={closePanel} />
      )}
      {panel === 'layer-crop' && selLayer?.type === 'media' && ed.sources[selLayer.sourceId] && (
        <CropEditor key={selLayer.id} ed={ed} layer={selLayer} source={ed.sources[selLayer.sourceId]} time={selLayer.in + 0.1} onClose={closePanel} />
      )}
      </div>

      <input ref={mainInput} type="file" accept="video/*,image/*,audio/*" multiple hidden onChange={(e) => { if (e.target.files) importFiles(e.target.files, 'main'); e.target.value = '' }} />
      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) importFiles(e.target.files, 'slides'); e.target.value = '' }} />
      <input ref={replaceInput} type="file" accept="video/*,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) replaceWith(f); e.target.value = '' }} />
      <input ref={insertInput} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => { if (e.target.files) importFiles(e.target.files, 'insert'); e.target.value = '' }} />
      <input ref={overlayInput} type="file" accept="video/*,image/*" hidden onChange={(e) => { if (e.target.files) importFiles(e.target.files, 'overlay'); e.target.value = '' }} />

      {scenes && <SceneBuilder ed={ed} start={scenes} onClose={() => setScenes(null)} onDone={(msg) => { setScenes(null); ed.setSel(null); setPanel(null); setToast(msg) }} />}
      {keysSheet && <KeysSheet onClose={() => setKeysSheet(false)} />}
      {markerSheet && (
        <MarkerSheet markers={markers} focus={markerSheet.focus} time={time} onAdd={() => { const m = ed.addMarker(time); setMarkerSheet({ focus: m.id }) }}
          onUpdate={ed.updateMarker} onRemove={ed.removeMarker} onSeek={seek} onClose={() => setMarkerSheet(null)} onToast={setToast} />
      )}
      {proxySheet && (
        <ProxySheet videos={[...usedSources(ed.project).keys()].map((id) => ed.sources[id]).filter((x) => x?.kind === 'video')}
          use={useProxies} onUse={(v) => { setUseProxies(v); setProxiesWanted(v) }} onClose={() => setProxySheet(false)} onToast={setToast}
          onMade={async (id, blob) => { await saveProxy(id, blob); const x = ed.sources[id]; if (x) ed.addSource({ ...x, proxy: { file: blob, url: URL.createObjectURL(blob) } }) }}
          onDelete={async (id) => { await deleteProxy(id); const x = ed.sources[id]; if (x?.proxy) { URL.revokeObjectURL(x.proxy.url); ed.addSource({ ...x, proxy: null }) } }} />
      )}
      {relinkSheet && <RelinkSheet missing={missing} onClose={() => setRelinkSheet(false)} onToast={setToast}
        onLinked={async (src) => { ed.addSource(src); await saveMedia(src) }} />}
      {styleSheet && styleCopied && sel && <PasteStyleSheet style={styleCopied} parts={styleParts()} count={styleTargets().length} onPaste={pasteStyle} onClose={() => setStyleSheet(false)} />}
      {pasteSheet && copied && <PasteTrackSheet copy={copied} time={time} mainLocked={!!ed.project.main?.locked} onPaste={pasteRow} onClose={() => setPasteSheet(false)} />}
      {pending && <PlaceSheet what={pending.what} time={time} onPick={placePending} onClose={() => setPending(null)} />}
      {screenRec && <ScreenRecorder mode={screenRec} onClose={() => setScreenRec(null)} onDone={addRecording} />}
      {habitsSheet && <HabitsSheet onClose={() => setHabitsSheet(false)} />}
      {paywall && <PremiumSheet feature={paywall} onClose={() => setPaywall(null)} />}
      {notesSheet && <FeedbackSheet where={`Editor: ${name}${panel ? ` › ${panel}` : ''}`} onClose={() => setNotesSheet(false)} />}
      {exporting && <ExportSheet project={output} sources={ed.sources} name={name} snapshot={snapshot} onClose={() => setExporting(false)} />}
    </div>
  )
}

export type { TextLayer }
