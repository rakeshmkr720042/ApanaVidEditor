import { useEffect, useRef, useState } from 'react'
import {
  copyText, deleteNote, importNotes, listNotes, newNote, openIssue, putNote, setTesterName, shareFile, shareText, shrinkShot,
  testerName, type Note, type NoteKind,
} from '../lib/feedback'
import { t } from '../lib/i18n'
import { Icon } from './Icon'
import { SheetClose } from '../ui/kit'

type Show = 'open' | 'done' | 'all'

/** Testing notes: write down a bug or an idea the moment you see it, then send the list to the developer. */
export function FeedbackSheet({ where, onClose }: { where?: string; onClose: (open: number) => void }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [kind, setKind] = useState<NoteKind>('bug')
  const [text, setText] = useState('')
  const [shot, setShot] = useState<string | null>(null)
  const [name, setName] = useState(testerName)
  const [show, setShow] = useState<Show>('open')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [big, setBig] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const shotInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = () => listNotes().then(setNotes).catch(() => setNotes([]))
  useEffect(() => { refresh() }, [])

  const open = notes.filter((n) => !n.done)
  const done = notes.length - open.length
  const shown = show === 'all' ? notes : notes.filter((n) => n.done === (show === 'done'))
  const close = () => onClose(open.length)

  const add = async () => {
    if (!text.trim() || reading) return
    await putNote(newNote(kind, text, { ...(where && { where }), ...(shot && { shot }) }))
    setText(''); setShot(null); setShow('open')
    setMsg({ ok: true, text: t('Saved on this device.') })
    refresh()
  }

  const pickShot = async (f: File) => {
    setReading(true)
    try { setShot(await shrinkShot(f)) } catch { setMsg({ ok: false, text: t('Could not read this picture.') }) } finally { setReading(false) }
  }

  const toggle = async (n: Note) => { await putNote({ ...n, done: !n.done }); refresh() }
  const remove = async (n: Note) => {
    if (!confirm(`${t('Delete')}?\n\n${n.text.slice(0, 120)}`)) return
    await deleteNote(n.id); refresh()
  }

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg(null)
    try { const r = await fn(); if (ok && r !== 'cancelled') setMsg({ ok: true, text: r === 'downloaded' ? t('Notes file saved in Downloads. Send it to the developer.') : t(ok) }) }
    catch (e) { setMsg({ ok: false, text: t((e as Error).message) }) }
  }

  const doImport = (f: File) => act(async () => {
    const added = await importNotes(f)
    setMsg({ ok: true, text: `${added} ${t(added === 1 ? 'note added' : 'notes added')}` })
    setShow('open'); refresh()
  })

  return (
    <div className="sheet-backdrop" onClick={close}>
      <div className="sheet feedback" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <SheetClose onClose={close} />
        <h2>{t('Testing notes')}</h2>
        <p className="muted small">{t('Found a problem or want something new? Write it here while you test, so it is not forgotten. Notes stay on this device until you send them.')}</p>

        <div className="chips">
          <button className={kind === 'bug' ? 'on' : ''} onClick={() => setKind('bug')}>🐞 {t('Problem')}</button>
          <button className={kind === 'idea' ? 'on' : ''} onClick={() => setKind('idea')}>💡 {t('New idea')}</button>
        </div>
        <textarea className="text-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('Note')}
          placeholder={t(kind === 'bug' ? 'What went wrong? What did you tap just before?' : 'What should the app do?')} />
        {where && <span className="muted small">{t('Where')}: {where}</span>}
        <div className="row feedback-add">
          {shot ? (
            <span className="feedback-shot">
              <img src={shot} alt="" onClick={() => setBig(shot)} />
              <button className="icon-btn" onClick={() => setShot(null)} aria-label={t('Remove screenshot')}><Icon name="close" size={16} /></button>
            </span>
          ) : (
            <button className="btn" onClick={() => shotInput.current?.click()}><Icon name="image" size={18} /> {t('Add screenshot')}</button>
          )}
          <button className="btn primary" disabled={!text.trim() || reading} onClick={add}>{t('Save note')}</button>
        </div>
        <input ref={shotInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pickShot(f); e.target.value = '' }} />
        {msg && <p className={`small ${msg.ok ? 'ok-text' : 'error-text'}`}>{msg.text}</p>}

        <div className="chips feedback-tabs">
          <button className={show === 'open' ? 'on' : ''} onClick={() => setShow('open')}>{t('To do')} ({open.length})</button>
          <button className={show === 'done' ? 'on' : ''} onClick={() => setShow('done')}>{t('Done')} ({done})</button>
          <button className={show === 'all' ? 'on' : ''} onClick={() => setShow('all')}>{t('All')} ({notes.length})</button>
        </div>
        {!shown.length && <p className="muted small">{t(show === 'done' ? 'Nothing marked done yet.' : 'No notes yet.')}</p>}
        <ul className="feedback-list">
          {shown.map((n) => (
            <li key={n.id} className={n.done ? 'done' : ''}>
              <button className={`feedback-check${n.done ? ' on' : ''}`} onClick={() => toggle(n)} aria-label={t(n.done ? 'Mark not done' : 'Mark done')}>{n.done ? '✓' : ''}</button>
              <div className="feedback-body">
                <p><span className={`feedback-kind ${n.kind}`}>{n.kind === 'bug' ? '🐞' : '💡'}</span> {n.text}</p>
                <small className="muted">
                  {new Date(n.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {n.where && ` · ${n.where}`}{n.by && ` · ${n.by}`} · {n.device}
                </small>
                {n.shot && <img src={n.shot} alt="" onClick={() => setBig(n.shot!)} />}
              </div>
              <button className="icon-btn" onClick={() => remove(n)} aria-label={t('Delete')}><Icon name="trash" size={18} /></button>
            </li>
          ))}
        </ul>

        <h3>{t('Send to the developer')}</h3>
        <label className="field-label" htmlFor="fb-name">{t('Your name (so the developer knows who sent it)')}</label>
        <input id="fb-name" className="text-input" value={name} placeholder={t('Name')} onChange={(e) => { setName(e.target.value); setTesterName(e.target.value) }} />
        <div className="row">
          <button className="btn primary" disabled={!notes.length} onClick={() => act(() => shareFile(notes), 'Notes file ready to send.')}>
            <Icon name="download" size={18} /> {t('Share notes file')}
          </button>
          <button className="btn" disabled={!open.length} onClick={() => act(() => shareText(notes))}>{t('Send as text (WhatsApp)')}</button>
          <button className="btn" disabled={!open.length} onClick={() => act(() => copyText(notes), 'Copied. Paste it in any chat.')}><Icon name="copy" size={18} /> {t('Copy all')}</button>
          <button className="btn" disabled={!open.length} onClick={() => openIssue(notes)}>{t('Make GitHub issue')}</button>
        </div>
        <p className="muted small">{t('The notes file keeps screenshots. Text sends only the notes still to do.')}</p>
        <div className="row">
          <button className="btn" onClick={() => fileInput.current?.click()}><Icon name="folder" size={18} /> {t('Open a notes file from a tester')}</button>
        </div>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
        <button className="btn" onClick={close}>{t('Close')}</button>
      </div>
      {big && <div className="feedback-big" onClick={(e) => { e.stopPropagation(); setBig(null) }}><img src={big} alt="" /></div>}
    </div>
  )
}
