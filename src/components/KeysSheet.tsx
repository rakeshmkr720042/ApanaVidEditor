import { SheetClose } from '../ui/kit'
import { t } from '../lib/i18n'
import { Icon } from './Icon'

const KEYS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
  ['Ctrl+C', 'Copy track (the picked track, or the track of the selected item)'],
  ['Ctrl+V', 'Paste the copied track at the playhead'],
  ['Ctrl+Shift+V', 'Paste track: choose where'],
  ['Ctrl+X', 'Cut track (copy, then delete it)'],
  ['Ctrl+D', 'Duplicate the selected item'],
  ['Ctrl+Shift+D', 'Duplicate the whole track'],
  ['Ctrl+A', 'Select everything on the track'],
  ['↑ / ↓', 'Pick the track above / below'],
  ['Alt+↑ / Alt+↓', 'Move the picked track up / down'],
  ['M', 'Track sound on / off'],
  ['H', 'Show / hide the track'],
  ['Shift+L', 'Lock / unlock the track'],
  ['Ctrl+Alt+C', 'Copy style of the selected item (look, sound, speed…)'],
  ['Ctrl+Alt+V', 'Paste style on the selected item(s)'],
  ['Shift+M', 'Add a marker at the playhead'],
  ['Ctrl+Shift+M', 'All markers (rename, colour, YouTube chapters)'],
  ['Ctrl+← / Ctrl+→', 'Jump to the previous / next marker'],
  ['K', 'Pause'],
  ['T', 'Time as minutes or timecode (HH:MM:SS:FF)'],
  ['Q / W', 'Cut the start / end of the clip to the playhead (the video closes up)'],
  ['Shift+Delete', 'Delete and close the gap'],
  ['S', 'Split at the playhead'],
  ['Delete', 'Delete the selected item'],
  ['Enter', 'Open the tool of the selected item'],
  ['← / →', 'One frame back / forward (Shift: 1 s)'],
  ['J / L', '5 s back / forward'],
  ['Home / End', 'Go to start / end'],
  ['+ / −', 'Zoom the timeline in / out'],
  ['F', 'Full screen (in full screen: E = edit panel)'],
  ['B', 'Before / after: the original next to your edit'],
  ['Esc', 'Close / go back'],
  ['?', 'This list'],
]

const MOUSE: [string, string][] = [
  ['Wheel', 'Scroll the timeline left / right'],
  ['Shift+wheel', 'Scroll the tracks up / down'],
  ['Ctrl+wheel', 'Zoom the timeline in / out'],
  ['Drag (empty space)', 'Move along the timeline'],
  ['Middle button drag', 'Move the timeline in any direction'],
  ['Click on the ruler', 'Jump to that time'],
  ['Double-click an item', 'Open its tool'],
  ['Double-click a track name', 'Rename the track'],
  ['Right-click', 'Menu: copy, paste, split, duplicate, lock, delete…'],
  ['Alt+drag a clip', 'Slip: show another part of its video'],
  ['Alt+Shift+drag a clip', 'Slide: move it between its neighbours'],
  ['Alt+drag a clip edge', 'Roll: move the cut between two clips'],
  ['Drag a track name up / down', 'Change which track is in front'],
  ['Wheel on the preview', 'Make the selected item bigger / smaller'],
]

/** Every keyboard shortcut and mouse control of the editor. */
export function KeysSheet({ onClose }: { onClose: () => void }) {
  const list = (rows: [string, string][]) => (
    <dl className="keys-list">
      {rows.map(([k, v]) => [<dt key={`k${k}`}><kbd>{t(k)}</kbd></dt>, <dd key={`v${k}`}>{t(v)}</dd>])}
    </dl>
  )
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet keys-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} />
        <h2><Icon name="keyboard" size={20} /> {t('Keyboard & mouse')}</h2>
        <h3>{t('Keyboard')}</h3>
        {list(KEYS)}
        <h3>{t('Mouse')}</h3>
        {list(MOUSE)}
        <p className="muted small">{t('On a phone: tap ⋯ on a track for copy / paste, or use Copy track in the toolbar. Paste track is in the toolbar and under + Add track.')}</p>
        <button className="btn wide" onClick={onClose}>{t('Done')}</button>
      </div>
    </div>
  )
}
