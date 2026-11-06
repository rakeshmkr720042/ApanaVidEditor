import { useRef, useState } from 'react'
import type { MediaSource } from '../types'
import { SheetClose } from '../ui/kit'
import { fmtTime } from '../lib/format'
import { t } from '../lib/i18n'
import { kindOf, loadSource } from '../lib/media'
import { matchFiles, type Missing } from '../lib/relink'
import { Icon } from './Icon'

const KIND: Record<string, string> = { video: 'Video', image: 'Photo', audio: 'Audio' }
const WHERE: Record<Missing['where'][number], string> = { main: 'Main video', track: 'Track', background: 'Green screen background', watermark: 'Watermark' }

/**
 * Missing files of the project: find each one again (or many at once, matched by name). The new file takes the
 * old one's place everywhere it was used, with every edit kept.
 */
export function RelinkSheet({ missing, onLinked, onClose, onToast }: {
  missing: Missing[]
  /** Store a file read for missing file `id` (same id). */
  onLinked: (src: MediaSource) => Promise<void>
  onClose: () => void
  onToast: (s: string) => void
}) {
  const one = useRef<HTMLInputElement>(null)
  const many = useRef<HTMLInputElement>(null)
  const [forId, setForId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const link = async (m: Missing, file: File) => {
    const kind = kindOf(file)
    if (!kind || !m.kinds.includes(kind)) { onToast(t(m.kinds[0] === 'audio' ? 'This needs an audio or video file.' : 'This needs a video or photo file.')); return false }
    const src = await loadSource(file, file.name, m.id)
    await onLinked(src)
    if (src.kind !== 'image' && src.duration + 0.1 < m.need) onToast(`${t('Linked, but this file is shorter than the project needs:')} ${fmtTime(src.duration)} / ${fmtTime(m.need)}`)
    return true
  }

  const pickOne = async (files: FileList | null) => {
    const m = missing.find((x) => x.id === forId)
    setForId(null)
    if (!m || !files?.[0]) return
    setBusy(true)
    try { if (await link(m, files[0])) onToast(t('File linked')) } catch (e) { onToast(t(e instanceof Error ? e.message : String(e))) } finally { setBusy(false) }
  }

  const pickMany = async (files: FileList | null) => {
    if (!files?.length) return
    const list = [...files].map((f) => Object.assign(f, { kind: kindOf(f) }))
    const pairs = matchFiles(missing, list)
    if (!pairs.length) { onToast(t('None of these files has the name of a missing file. Use Find file on each one.')); return }
    setBusy(true)
    let ok = 0
    for (const p of pairs) {
      try { if (await link(missing.find((m) => m.id === p.id)!, p.file)) ok++ } catch { /* reported below */ }
    }
    setBusy(false)
    onToast(`${ok} ${t('of')} ${missing.length} ${t('files linked')}`)
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} data-testid="relink-sheet">
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} disabled={busy} />
        <h2><Icon name="replace" size={20} /> {t('Missing files')}</h2>
        {missing.length === 0 ? <p>{t('All files are here.')}</p> : (
          <>
            <p className="muted small">{t('These files are no longer in the app (the phone or browser may have cleared its storage). Pick the same file again: it goes back everywhere it was used, with all your edits.')}</p>
            <button className="btn wide primary" disabled={busy} onClick={() => many.current?.click()}><Icon name="plus" size={18} /> {t('Find many files at once')}</button>
            <div className="relink-list">
              {missing.map((m) => (
                <div className="relink-row" key={m.id}>
                  <span className="relink-icon"><Icon name={m.kinds[0] === 'audio' ? 'music' : m.kinds[0] === 'image' ? 'image' : 'film'} size={20} /></span>
                  <span className="relink-text">
                    <b>{m.info?.name ?? `${t(KIND[m.kinds[0]])} ${t('(name not known)')}`}</b>
                    <span className="muted small">
                      {m.where.map((w) => t(WHERE[w])).join(', ')} {m.need > 0 && m.kinds[0] !== 'image' ? `· ${t('needs')} ${fmtTime(m.need)}` : ''}
                    </span>
                  </span>
                  <button className="btn small" disabled={busy} onClick={() => { setForId(m.id); one.current?.click() }}>{t('Find file')}</button>
                </div>
              ))}
            </div>
          </>
        )}
        {busy && <p className="muted small">{t('Reading the file…')}</p>}
        <input ref={one} type="file" hidden accept="video/*,image/*,audio/*" onChange={(e) => { void pickOne(e.target.files); e.target.value = '' }} />
        <input ref={many} type="file" hidden multiple accept="video/*,image/*,audio/*" onChange={(e) => { void pickMany(e.target.files); e.target.value = '' }} />
      </div>
    </div>
  )
}
