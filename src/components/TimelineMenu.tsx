import { useLayoutEffect, useRef, useState } from 'react'
import type { Editor } from '../model/useEditor'
import { t as tl } from '../lib/i18n'
import { Icon, type IconName } from './Icon'

type At = { x: number; y: number; kind: 'clip' | 'layer' | 'track' | 'empty'; id: string }
type Item = { icon: IconName; label: string; key?: string; on: () => void; disabled?: boolean; danger?: boolean } | 'hr'

/** The right-click menu of the timeline: what can be done with an item, a track or the empty timeline. */
export function CtxMenu({ at, ed, t, copied, close, onCopyTrack, onPasteTrack, onDuplicateTrack, onDelete, onOpenItem, onAddMarker, onCopyStyle, onPasteStyle, onSettings, onRename, onSelectRow, onSelectAll }: {
  at: At; ed: Editor; t: number; copied: boolean; close: () => void
  onCopyTrack?: (id: string) => void; onPasteTrack?: () => void; onDuplicateTrack?: (id: string) => void; onDelete?: () => void
  onOpenItem?: (s: { type: 'clip' | 'layer'; id: string }) => void; onSettings: (id: string) => void; onRename: (id: string) => void
  onSelectRow?: (firstId: string) => void; onSelectAll?: () => void
  onAddMarker?: () => void; onCopyStyle?: (id: string) => void; onPasteStyle?: () => void
}) {
  // kept on screen: moved up / left when it would run past the edge
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: at.x, top: at.y })
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    setPos({ left: Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4)), top: Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4)) })
  }, [at.x, at.y])
  const p = ed.project
  const mainLocked = !!p.main?.locked
  const layer = at.kind === 'layer' ? p.layers.find((l) => l.id === at.id) : undefined
  const row = at.kind === 'track' ? at.id : at.kind === 'clip' ? 'main' : layer?.track ?? null
  const tr = row && row !== 'main' ? p.tracks?.find((x) => x.id === row) : undefined
  const locked = row === 'main' ? mainLocked : !!tr?.locked
  const rowItems = row === 'main' ? p.clips.length : p.layers.filter((l) => l.track === row).length
  const paste: Item = { icon: 'paste', label: 'Paste track', key: 'Ctrl+V', on: () => onPasteTrack?.(), disabled: !copied || !onPasteTrack }
  const copy: Item = { icon: 'copy', label: 'Copy track', key: 'Ctrl+C', on: () => row && onCopyTrack?.(row), disabled: !row || !rowItems || !onCopyTrack }
  let items: Item[] = []
  if (at.kind === 'clip' || at.kind === 'layer') {
    items = [
      { icon: 'adjust', label: 'Open tool', key: tl('Double-click'), on: () => onOpenItem?.({ type: at.kind as 'clip' | 'layer', id: at.id }), disabled: locked },
      { icon: 'split', label: 'Split at the playhead', key: 'S', on: () => ed.split(t), disabled: locked },
      { icon: 'copy', label: 'Duplicate', key: 'Ctrl+D', on: () => ed.duplicate(), disabled: locked },
      ...(layer?.type !== 'blur' && layer?.type !== 'wave' ? [{ icon: 'brush', label: 'Copy style', key: 'Ctrl+Alt+C', on: () => onCopyStyle?.(at.id), disabled: !onCopyStyle } as Item] : []),
      { icon: 'paste', label: 'Paste style', key: 'Ctrl+Alt+V', on: () => onPasteStyle?.(), disabled: !onPasteStyle || locked },
      'hr',
      copy, paste,
      { icon: 'selectAll', label: 'Select everything on this track', key: 'Ctrl+A', disabled: locked,
        on: () => { if (at.kind === 'clip') onSelectAll?.(); else onSelectRow?.(at.id) } },
      'hr',
      { icon: 'trash', label: 'Delete', key: 'Del', on: () => onDelete?.(), disabled: locked, danger: true },
    ]
  } else if (at.kind === 'track' && row === 'main') {
    items = [
      copy, paste,
      { icon: 'overlay', label: 'Copy onto a new video track', key: 'Ctrl+Shift+D', on: () => onDuplicateTrack?.('main'), disabled: !p.clips.length || !onDuplicateTrack },
      { icon: 'selectAll', label: 'Select all clips', key: 'Ctrl+A', on: () => onSelectAll?.(), disabled: mainLocked || !p.clips.length },
      'hr',
      { icon: p.main?.muted ? 'volume' : 'mute', label: p.main?.muted ? 'Sound on' : 'Sound off', key: 'M', on: () => ed.setMain({ muted: !p.main?.muted }) },
      { icon: mainLocked ? 'unlock' : 'lock', label: mainLocked ? 'Unlock' : 'Lock', key: 'Shift+L', on: () => ed.setMain({ locked: !mainLocked }) },
    ]
  } else if (at.kind === 'track' && tr) {
    const same = (p.tracks ?? []).filter((x) => x.kind === tr.kind)
    const pos = same.indexOf(tr)
    const first = p.layers.filter((l) => l.track === tr.id).sort((a, b) => a.start - b.start)[0]
    items = [
      copy, paste,
      { icon: 'copy', label: 'Duplicate track', key: 'Ctrl+Shift+D', disabled: !rowItems || !onDuplicateTrack, on: () => onDuplicateTrack?.(tr.id) },
      { icon: 'selectAll', label: 'Select everything on this track', key: 'Ctrl+A', on: () => first && onSelectRow?.(first.id), disabled: !first || locked },
      'hr',
      ...(tr.kind === 'visual' ? [{ icon: tr.hidden ? 'eye' : 'eyeOff', label: tr.hidden ? 'Show on video' : 'Hide from video', key: 'H', on: () => ed.updateTrack(tr.id, { hidden: !tr.hidden }) } as Item] : []),
      { icon: tr.muted ? 'volume' : 'mute', label: tr.muted ? 'Sound on' : 'Sound off', key: 'M', on: () => ed.updateTrack(tr.id, { muted: !tr.muted }) },
      { icon: tr.locked ? 'unlock' : 'lock', label: tr.locked ? 'Unlock' : 'Lock', key: 'Shift+L', on: () => ed.updateTrack(tr.id, { locked: !tr.locked }) },
      { icon: 'up', label: 'Move up', key: 'Alt+↑', on: () => ed.moveTrack(tr.id, -1), disabled: pos <= 0 },
      { icon: 'down', label: 'Move down', key: 'Alt+↓', on: () => ed.moveTrack(tr.id, 1), disabled: pos >= same.length - 1 },
      { icon: 'text', label: 'Rename', key: tl('Double-click'), on: () => onRename(tr.id) },
      { icon: 'more', label: 'Track settings', on: () => onSettings(tr.id) },
      'hr',
      { icon: 'trash', label: 'Delete track', danger: true, on: () => {
        if (rowItems && !confirm(`${tl('Delete this track and everything on it?')} (${rowItems})`)) return
        ed.removeTrack(tr.id)
      } },
    ]
  } else {
    items = [
      paste,
      { icon: 'marker', label: 'Add marker', key: 'Shift+M', on: () => onAddMarker?.(), disabled: !onAddMarker },
      'hr',
      { icon: 'overlay', label: 'Add video track', on: () => ed.addTrack('visual') },
      { icon: 'music', label: 'Add audio track', on: () => ed.addTrack('audio') },
    ]
  }
  return (
    <div ref={box} className="ctx-menu" role="menu" style={pos} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}>
      {items.map((it, i) => it === 'hr' ? <hr key={i} /> : (
        <button key={i} role="menuitem" className={it.danger ? 'danger' : ''} disabled={it.disabled} onClick={() => { close(); it.on() }}>
          <Icon name={it.icon} size={16} /> {tl(it.label)} {it.key && <span className="ctx-key">{it.key}</span>}
        </button>
      ))}
    </div>
  )
}
