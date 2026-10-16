import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip, MediaSource } from './types'
import { MIN_CLIP } from './types'
import { useHistory } from './lib/history'
import { usePlayer } from './lib/usePlayer'
import { loadSource } from './lib/media'
import { fmtTime, uid } from './lib/format'
import { isCoreCached, prefetchCore } from './lib/ffmpeg'
import { Timeline } from './components/Timeline'
import { ExportSheet } from './components/ExportSheet'
import { Icon } from './components/Icon'

export default function App() {
  const [sources, setSources] = useState<Record<string, MediaSource>>({})
  const clips = useHistory<Clip[]>([])
  const player = usePlayer(clips.value, sources)
  const [selected, setSelected] = useState<string | null>(null)
  const [pps, setPps] = useState(40)
  const [importing, setImporting] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [offline, setOffline] = useState<'unknown' | 'ready' | 'downloading' | 'no'>('unknown')
  const fileInput = useRef<HTMLInputElement>(null)
  const clipsRef = useRef(clips.value)
  clipsRef.current = clips.value

  useEffect(() => { isCoreCached().then((ok) => setOffline(ok ? 'ready' : 'no')) }, [])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v|3gp)$/i.test(f.name))
    if (!list.length) return
    setImporting((n) => n + list.length)
    setError(null)
    let acc = clipsRef.current
    for (const f of list) {
      try {
        const src = await loadSource(f)
        setSources((s) => ({ ...s, [src.id]: src }))
        acc = [...acc, { id: uid(), sourceId: src.id, in: 0, out: src.duration }]
        clips.set(acc)
      } catch (e) {
        setError(e instanceof Error ? e.message : `Could not open ${f.name}`)
      } finally {
        setImporting((n) => n - 1)
      }
    }
  }, [clips.set]) // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop drag & drop
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault()
    const drop = (e: DragEvent) => { e.preventDefault(); if (e.dataTransfer?.files) addFiles(e.dataTransfer.files) }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop) }
  }, [addFiles])

  const split = () => {
    const t = player.playhead
    const i = player.offsets.findIndex((o, k) => t >= o && t < o + (clips.value[k].out - clips.value[k].in))
    if (i < 0) return
    const c = clips.value[i]
    const at = c.in + (t - player.offsets[i])
    if (at - c.in < MIN_CLIP || c.out - at < MIN_CLIP) return
    const right = { ...c, id: uid(), in: at }
    clips.set([...clips.value.slice(0, i), { ...c, out: at }, right, ...clips.value.slice(i + 1)])
    setSelected(right.id)
  }

  const remove = () => {
    if (!selected) return
    clips.set(clips.value.filter((c) => c.id !== selected))
    setSelected(null)
  }

  const duplicate = () => {
    const i = clips.value.findIndex((c) => c.id === selected)
    if (i < 0) return
    const copy = { ...clips.value[i], id: uid() }
    clips.set([...clips.value.slice(0, i + 1), copy, ...clips.value.slice(i + 1)])
    setSelected(copy.id)
  }

  const onTrim = (c: Clip, side: 'in' | 'out') => {
    clips.live(clips.value.map((x) => (x.id === c.id ? c : x)))
    player.showSourceTime(c, side === 'in' ? c.in : c.out - 0.04)
  }

  // Keyboard shortcuts on desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || exporting) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) clips.redo(); else clips.undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); clips.redo() }
      else if (e.key === ' ') { e.preventDefault(); if (player.playing) player.pause(); else player.play() }
      else if (e.key === 's') split()
      else if (e.key === 'Delete' || e.key === 'Backspace') remove()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const getOffline = async () => {
    setOffline('downloading')
    try { await prefetchCore(); setOffline((await isCoreCached()) ? 'ready' : 'no') } catch { setOffline('no') }
  }

  const empty = clips.value.length === 0

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="logo">▶</span> ClipCut</div>
        <div className="top-actions">
          {offline === 'no' && <button className="btn ghost small" onClick={getOffline} title="Download the editing engine (~32 MB) so export works without internet">Offline mode</button>}
          {offline === 'downloading' && <span className="muted small">Downloading…</span>}
          {offline === 'ready' && <span className="badge" title="Export works without internet">Offline ready</span>}
          <button className="btn primary small" disabled={empty || importing > 0} onClick={() => { player.pause(); setExporting(true) }}>Export</button>
        </div>
      </header>

      <main className="stage">
        <video ref={player.videoRef} playsInline className={empty ? 'hidden' : ''} onClick={() => (player.playing ? player.pause() : player.play())} />
        {empty && (
          <div className="empty">
            <button className="import-big" onClick={() => fileInput.current?.click()}>
              <Icon name="plus" />
              <span>Import video</span>
            </button>
            <p className="muted">Pick a video from your phone or drop it here. Everything stays on your device.</p>
          </div>
        )}
        {importing > 0 && <div className="toast">Opening video…</div>}
        {error && <div className="toast error" onClick={() => setError(null)}>{error}</div>}
      </main>

      <div className="transport">
        <span className="time">{fmtTime(player.playhead)} <span className="muted">/ {fmtTime(player.total)}</span></span>
        <button className="icon-btn play" disabled={empty} onClick={() => (player.playing ? player.pause() : player.play())} aria-label={player.playing ? 'Pause' : 'Play'}>
          <Icon name={player.playing ? 'pause' : 'play'} />
        </button>
        <span className="zoom">
          <button className="icon-btn" onClick={() => setPps((z) => Math.max(5, z / 1.5))} aria-label="Zoom out"><Icon name="minus" /></button>
          <button className="icon-btn" onClick={() => setPps((z) => Math.min(300, z * 1.5))} aria-label="Zoom in"><Icon name="plus" /></button>
        </span>
      </div>

      {!empty && (
        <Timeline
          clips={clips.value}
          sources={sources}
          playhead={player.playhead}
          total={player.total}
          pps={pps}
          selectedId={selected}
          onSelect={setSelected}
          onScrub={(t) => { if (player.playing) player.pause(); player.seek(t) }}
          onTrimStart={() => { player.pause(); clips.begin() }}
          onTrim={onTrim}
          onTrimEnd={() => { clips.end(); player.seek(player.playhead) }}
          onAdd={() => fileInput.current?.click()}
        />
      )}

      <nav className="tools">
        <Tool icon="undo" label="Undo" disabled={!clips.canUndo} onClick={clips.undo} />
        <Tool icon="redo" label="Redo" disabled={!clips.canRedo} onClick={clips.redo} />
        <Tool icon="split" label="Split" disabled={empty} onClick={split} />
        <Tool icon="copy" label="Duplicate" disabled={!selected} onClick={duplicate} />
        <Tool icon="trash" label="Delete" disabled={!selected} onClick={remove} />
        <Tool icon="add" label="Add" onClick={() => fileInput.current?.click()} />
      </nav>

      <input
        ref={fileInput}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
      />

      {exporting && <ExportSheet clips={clips.value} sources={sources} onClose={() => { setExporting(false); isCoreCached().then((ok) => ok && setOffline('ready')) }} />}
    </div>
  )
}

function Tool(p: { icon: Parameters<typeof Icon>[0]['name']; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="tool" disabled={p.disabled} onClick={p.onClick}>
      <Icon name={p.icon} />
      <span>{p.label}</span>
    </button>
  )
}
