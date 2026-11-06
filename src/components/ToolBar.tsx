import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icon, type IconName } from './Icon'
import { Chips, SheetClose, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'
import {
  ALWAYS, applyPreset, GROUPS, inGroup, isPinned, magnifyLevels, moveTool, ordered, pinnedFirst, PRESETS, presetOf, setToolbar, togglePin,
  useToolbar, type Dock, type GroupId,
} from '../lib/toolbar'

export type Tool = { key?: string; icon: IconName; label: string; on: () => void; disabled?: boolean; active?: boolean }
export const keyOf = (tl: Tool) => tl.key ?? tl.label

// ---- media queries as hooks
const media = (q: string) => {
  const subscribe = (f: () => void) => {
    if (typeof matchMedia !== 'function') return () => {}
    const m = matchMedia(q)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }
  const get = () => (typeof matchMedia === 'function' ? matchMedia(q).matches : false)
  return () => useSyncExternalStore(subscribe, get)
}
/** Room for the tools beside the video (a computer, a tablet, a phone turned sideways). */
export const useSideRoom = media('(min-width: 640px)')
/** A real mouse: hover effects and drag to reorder. Touch screens get long-press instead. */
const useMouse = media('(hover: hover) and (pointer: fine)')

/** Where the tools actually sit: a side dock falls back to the bottom when there is no room beside the video. */
export function useDock(): Dock {
  const s = useToolbar()
  const room = useSideRoom()
  return room ? s.dock : 'bottom'
}

// the settings sheet stays open when a layout moves the toolbar to the other side (the toolbar itself is re-mounted there)
let sheetOpen = false
const sheetSubs = new Set<() => void>()
const setSheetOpen = (v: boolean) => { sheetOpen = v; sheetSubs.forEach((f) => f()) }
const useSheetOpen = () => useSyncExternalStore((f) => { sheetSubs.add(f); return () => { sheetSubs.delete(f) } }, () => sheetOpen)

const GROW = 0.34 // the button under the cursor grows by a third

/**
 * The editor's tool row: group chips (Favourites, All, Edit, Add, Text, Look & color, Audio, AI & makers), the tools of the picked
 * group in the user's order, a hover magnify effect for the mouse, drag (mouse) or long-press (touch) to pin or move a tool.
 */
export function ToolBar(p: {
  tools: Tool[]; dock: Dock; onBack?: () => void; /** no hover magnify (full screen wraps the tools into rows) */ still?: boolean; run: (tl: Tool) => void; locked: (tl: Tool) => boolean
}) {
  const s = useToolbar()
  const mouse = useMouse()
  const [menu, setMenu] = useState<Tool | null>(null)
  const sheet = useSheetOpen()
  const setSheet = setSheetOpen
  const side = p.dock !== 'bottom'

  // the groups that have something for what is selected now
  const all = ordered(p.tools, keyOf, s.order)
  const real = (g: GroupId) => inGroup(all, keyOf, g, s.pins).some((x) => !ALWAYS.has(keyOf(x)))
  const groups = GROUPS.filter((g) => g.id === 'all' || real(g.id))
  const group: GroupId = s.grouped && groups.some((g) => g.id === s.group) ? s.group : 'all'
  let shown = inGroup(all, keyOf, group, s.pins)
  if (group === 'all') shown = pinnedFirst(shown, keyOf, s.pins)
  const keys = shown.map(keyOf)

  // ---- hover magnify (mouse only): transforms only, so nothing else on the page moves
  const nav = useRef<HTMLElement>(null)
  const btns = useRef(new Map<string, HTMLButtonElement>())
  const magOn = s.magnify && mouse && !p.still
  const clear = () => {
    for (const b of btns.current.values()) { b.style.transform = ''; b.style.removeProperty('--mag'); b.style.zIndex = '' }
  }
  const magnify = (clientX: number, clientY: number) => {
    const n = nav.current
    if (!n) return
    const r = n.getBoundingClientRect()
    const pos = side ? clientY - r.top - n.clientTop + n.scrollTop : clientX - r.left - n.clientLeft + n.scrollLeft
    const list = keys.map((k) => btns.current.get(k)).filter((b): b is HTMLButtonElement => !!b)
    if (!list.length) return
    if (side && list.length > 1 && list[1].offsetTop === list[0].offsetTop) {
      // two columns (wide screens): grow by distance in both directions, no sliding
      const px = clientX - r.left - n.clientLeft + n.scrollLeft
      const d = list.map((b) => Math.hypot(b.offsetLeft + b.offsetWidth / 2 - px, b.offsetTop + b.offsetHeight / 2 - pos))
      const lv = magnifyLevels(d, 0, list[0].offsetHeight, 2.2)
      list.forEach((b, i) => {
        b.style.transform = lv[i] > 0.001 ? `scale(${(1 + GROW * 0.8 * lv[i]).toFixed(3)})` : ''
        b.style.setProperty('--mag', lv[i].toFixed(3))
        b.style.zIndex = lv[i] > 0.001 ? String(1 + Math.round(lv[i] * 10)) : ''
      })
      return
    }
    const start = list.map((b) => (side ? b.offsetTop : b.offsetLeft))
    const size = list.map((b) => (side ? b.offsetHeight : b.offsetWidth))
    const centres = start.map((x, i) => x + size[i] / 2)
    const lv = magnifyLevels(centres, pos, size[0])
    const grow = lv.map((l, i) => size[i] * GROW * l)
    // how much of the growth lies before the pointer: keeps the button under it still while its neighbours make room
    let before = 0
    list.forEach((_, i) => {
      const f = Math.max(0, Math.min(1, (pos - start[i]) / size[i]))
      before += grow[i] * f
    })
    let acc = 0
    list.forEach((b, i) => {
      const shift = acc + grow[i] / 2 - before
      acc += grow[i]
      const sc = 1 + GROW * lv[i]
      b.style.transform = lv[i] > 0.001 || Math.abs(shift) > 0.5
        ? `${side ? `translateY(${shift.toFixed(1)}px)` : `translateX(${shift.toFixed(1)}px)`} scale(${sc.toFixed(3)})` : ''
      b.style.setProperty('--mag', lv[i].toFixed(3))
      b.style.zIndex = lv[i] > 0.001 ? String(1 + Math.round(lv[i] * 10)) : ''
    })
  }
  const last = useRef<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => { if (!magOn) clear(); else if (last.current) magnify(last.current.x, last.current.y) })

  // ---- drag to reorder (mouse)
  const [drag, setDrag] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ key: string; after: boolean } | null>(null)

  // ---- long-press (touch) opens the tool menu; the tap that ends it does not run the tool
  const press = useRef<{ timer: number; x: number; y: number } | null>(null)
  const swallow = useRef(false)
  const endPress = () => { if (press.current) { clearTimeout(press.current.timer); press.current = null } }
  // lifting the finger after a long-press sends a click to whatever is under it (the menu's backdrop): ignore that one
  const liftedAt = useRef(0)
  useEffect(() => endPress, [])

  const wheel = (e: React.WheelEvent<HTMLElement>) => {
    if (!side && Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY
  }
  const move = (k: string, by: number) => { const i = keys.indexOf(k); if (i >= 0) moveTool(keys, k, i + by) }

  const settingsBtn = (
    <button className="tg-chip tg-settings" onClick={() => setSheet(true)} title={t('Toolbar settings')} aria-label={t('Toolbar settings')} data-testid="toolbar-settings">
      <Icon name="tune" size={16} />
    </button>
  )

  return (
    <div className={`toolbar dock-${p.dock}${magOn ? ' mag' : ''}`} data-testid="toolbar">
      {s.grouped ? (
        <div className="tool-groups" role="tablist">
          {groups.map((g) => (
            <button key={g.id} role="tab" aria-selected={group === g.id} className={`tg-chip${group === g.id ? ' on' : ''}`}
              onClick={() => setToolbar({ group: g.id })} title={t(g.label)} data-group={g.id}>
              <Icon name={g.icon} size={15} /><span>{t(g.label)}</span>
            </button>
          ))}
          {settingsBtn}
        </div>
      ) : side && <div className="tool-groups">{settingsBtn}</div>}
      <nav ref={nav} className="tools" onWheel={wheel}
        onPointerMove={(e) => { if (magOn && e.pointerType === 'mouse' && !drag) { last.current = { x: e.clientX, y: e.clientY }; magnify(e.clientX, e.clientY) } }}
        onPointerLeave={() => { last.current = null; clear() }}
        onScroll={() => { if (last.current && magOn) magnify(last.current.x, last.current.y) }}>
        {p.onBack && <button className="tool back" onClick={p.onBack}><Icon name="back" /><span>{t('Back')}</span></button>}
        {shown.map((tl) => {
          const k = keyOf(tl)
          const pinned = s.pins.includes(k)
          return (
            <button key={k} ref={(b) => { if (b) btns.current.set(k, b); else btns.current.delete(k) }}
              className={`tool${tl.active ? ' on' : ''}${tl.icon === 'habit' ? ' habit' : ''}${drag === k ? ' dragging' : ''}${drop?.key === k ? (drop.after ? ' drop-after' : ' drop-before') : ''}`}
              disabled={tl.disabled} data-key={k} data-tool={tl.label}
              onClick={() => { if (swallow.current) { swallow.current = false; return } p.run(tl) }}
              onContextMenu={(e) => { e.preventDefault(); endPress(); if (!ALWAYS.has(k)) setMenu(tl) }}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' || ALWAYS.has(k)) return
                endPress()
                swallow.current = false
                press.current = { x: e.clientX, y: e.clientY, timer: window.setTimeout(() => { swallow.current = true; press.current = null; setMenu(tl) }, 550) }
              }}
              onPointerMove={(e) => { if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) endPress() }}
              onPointerUp={() => { endPress(); if (swallow.current) liftedAt.current = Date.now() }} onPointerCancel={endPress}
              draggable={mouse && !ALWAYS.has(k)}
              onDragStart={(e) => { clear(); setDrag(k); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k) }}
              onDragOver={(e) => {
                if (!drag || drag === k) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                const after = side ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2
                if (drop?.key !== k || drop.after !== after) setDrop({ key: k, after })
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (drag && drop) {
                  const rest = keys.filter((x) => x !== drag)
                  moveTool(keys, drag, rest.indexOf(drop.key) + (drop.after ? 1 : 0))
                }
                setDrag(null); setDrop(null)
              }}
              onDragEnd={() => { setDrag(null); setDrop(null) }}
              title={mouse ? `${t(tl.label)} · ${t('right-click or drag to arrange')}` : undefined}>
              <Icon name={tl.icon} />
              {p.locked(tl) && <i className="crown-badge" aria-label={t('Premium')}><Icon name="crown" size={11} /></i>}
              {pinned && group !== 'fav' && <i className="pin-badge" aria-label={t('Favourite')}><Icon name="star" size={10} /></i>}
              <span>{t(tl.label)}</span>
            </button>
          )
        })}
        {!s.grouped && !side && (
          <button className="tool" onClick={() => setSheet(true)} data-testid="toolbar-settings"><Icon name="tune" /><span>{t('Toolbar')}</span></button>
        )}
      </nav>

      {menu && (
        <div className="sheet-backdrop" onClick={() => setMenu(null)}
          onClickCapture={(e) => { if (Date.now() - liftedAt.current < 400) { e.stopPropagation(); e.preventDefault() } }}>
          <div className="sheet tool-menu" onClick={(e) => e.stopPropagation()} data-testid="tool-menu">
            <div className="sheet-grab" />
            <SheetClose onClose={() => setMenu(null)} />
            <h2><Icon name={menu.icon} /> {t(menu.label)}</h2>
            <div className="tool-menu-list">
              <button className="btn" onClick={() => { togglePin(keyOf(menu)); setMenu(null) }}>
                <Icon name="star" size={18} /> {t(isPinned(keyOf(menu)) ? 'Remove from Favourites' : 'Add to Favourites')}
              </button>
              <button className="btn" disabled={keys.indexOf(keyOf(menu)) <= 0} onClick={() => move(keyOf(menu), -1)}>
                <Icon name={side ? 'up' : 'back'} size={18} /> {t(side ? 'Move up' : 'Move left')}
              </button>
              <button className="btn" disabled={keys.indexOf(keyOf(menu)) >= keys.length - 1} onClick={() => move(keyOf(menu), 1)}>
                <span className="flip"><Icon name={side ? 'up' : 'back'} size={18} /></span> {t(side ? 'Move down' : 'Move right')}
              </button>
              <button className="btn" onClick={() => { setMenu(null); setSheet(true) }}><Icon name="tune" size={18} /> {t('Toolbar settings')}</button>
            </div>
          </div>
        </div>
      )}
      {sheet && <ToolbarSheet onClose={() => setSheet(false)} />}
    </div>
  )
}

/** Toolbar settings: where it sits, a ready-made layout, groups on/off, hover magnify on/off, favourites, reset. */
export function ToolbarSheet({ onClose }: { onClose: () => void }) {
  const s = useToolbar()
  const room = useSideRoom()
  const preset = presetOf(s)
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet toolbar-sheet" onClick={(e) => e.stopPropagation()} data-testid="toolbar-sheet">
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} />
        <h2>{t('Toolbar')}</h2>
        <span className="field-label">{t('Ready-made layouts')}</span>
        <div className="preset-grid">
          {PRESETS.map((x) => (
            <button key={x.id} className={`preset-card${preset === x.id ? ' on' : ''}`} onClick={() => applyPreset(x.id)} data-preset={x.id}>
              <DockPicture dock={x.set.dock} />
              <b>{t(x.label)}</b>
              <small>{t(x.hint)}</small>
            </button>
          ))}
        </div>
        <span className="field-label">{t('Where the tools sit')}</span>
        <Chips options={[{ value: 'left', label: 'Left of video' }, { value: 'bottom', label: 'Under the video' }, { value: 'right', label: 'Right of video' }]}
          value={s.dock} onChange={(dock) => setToolbar({ dock: dock as Dock })} />
        {!room && s.dock !== 'bottom' && <p className="muted small">{t('This screen is narrow, so the tools stay under the video. Turn the phone sideways or use a computer to see them beside the video.')}</p>}
        <Toggle label="Group similar tools (Edit, Add, Text, Look, Audio, AI)" value={s.grouped} onChange={(grouped) => setToolbar({ grouped })} />
        <Toggle label="Magnify tools under the mouse" value={s.magnify} onChange={(magnify) => setToolbar({ magnify })} />
        <p className="muted small">{t('Arrange: drag a tool with the mouse, or right-click it. On a phone, press and hold a tool to add it to Favourites or move it.')}</p>
        <h3>{t('Favourites')}</h3>
        {!s.pins.length && <p className="muted small">{t('No favourites yet. Press and hold (or right-click) a tool and pick Add to Favourites.')}</p>}
        <ul className="habit-list">
          {s.pins.map((k) => (
            <li key={k}>
              <span><b>{t(k === 'fit' ? 'Fit' : k === 'reverse' ? 'Reverse' : k === 'marker' ? 'Markers' : k === 'motion' ? 'Motion' : k === 'captions' ? 'All captions' : k)}</b></span>
              <button className="btn small" onClick={() => togglePin(k)}>{t('Remove')}</button>
            </li>
          ))}
        </ul>
        <div className="row">
          <button className="btn" onClick={() => setToolbar({ order: [] })} disabled={!s.order.length}>{t('Reset order')}</button>
          <button className="btn primary" onClick={onClose}>{t('Done')}</button>
        </div>
      </div>
    </div>
  )
}

/** A tiny picture of the screen: the video and where the tools go. */
function DockPicture({ dock }: { dock: Dock }) {
  return (
    <svg viewBox="0 0 40 26" width="54" height="35" aria-hidden="true" className="dock-pic">
      <rect x="0.5" y="0.5" width="39" height="25" rx="3" fill="none" stroke="currentColor" opacity=".5" />
      <rect x={dock === 'left' ? 9 : 3} y="3" width={dock === 'bottom' ? 34 : 28} height={dock === 'bottom' ? 14 : 20} rx="1.5" fill="currentColor" opacity=".35" />
      {dock === 'bottom' && <rect x="3" y="19.5" width="34" height="3.5" rx="1.5" fill="var(--accent)" />}
      {dock === 'left' && <rect x="3" y="3" width="4" height="20" rx="1.5" fill="var(--accent)" />}
      {dock === 'right' && <rect x="33" y="3" width="4" height="20" rx="1.5" fill="var(--accent)" />}
    </svg>
  )
}
