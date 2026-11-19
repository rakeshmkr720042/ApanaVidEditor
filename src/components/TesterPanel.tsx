import { useEffect, useState } from 'react'
import { openBlackbox } from '../lib/blackbox'
import { lockTester, onTesterOpen, unlockTester, useTesterUnlocked } from '../lib/tester'
import { t } from '../lib/i18n'
import { Icon } from './Icon'
import { FeedbackSheet } from './FeedbackSheet'
import { SheetClose } from '../ui/kit'

/** Where the user is, for a note opened from the hidden panel. */
const whereNow = () => {
  const h = location.hash
  return /[#&]p=/.test(h) ? 'Editor' : 'Home'
}

/** The hidden tester panel (Ctrl+H, or 5 taps on the logo): Testing notes, Blackbox log, show / hide their buttons. */
export function TesterHost() {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState(false)
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const unlocked = useTesterUnlocked()
  useEffect(() => onTesterOpen(() => { setMsg(null); setPw(''); setOpen(true) }), [])
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [open])

  const tryUnlock = () => {
    if (unlockTester(pw)) { setPw(''); setMsg({ ok: true, text: t('Password right. Notes and Blackbox buttons are now shown on this device.') }) }
    else setMsg({ ok: false, text: t('Wrong password. Use the same password as the Windows installer.') })
  }

  return (
    <>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet tester-panel" onClick={(e) => e.stopPropagation()} data-testid="tester-panel">
            <div className="sheet-grab" />
            <SheetClose onClose={() => setOpen(false)} />
            <h2><Icon name="note" size={20} /> {t('Tester tools')}</h2>
            <p className="muted small">{t('Hidden tools for testing. Ctrl+H opens this panel anywhere; on a phone tap the Apna Editor logo on Home 5 times.')}</p>
            <div className="tester-actions">
              <button className="btn wide" data-testid="tester-notes" onClick={() => { setOpen(false); setNotes(true) }}><Icon name="note" size={18} /> {t('Testing notes')}</button>
              <button className="btn wide" data-testid="tester-blackbox" onClick={() => { setOpen(false); openBlackbox() }}><Icon name="blackbox" size={18} /> {t('Blackbox log')}</button>
            </div>
            {unlocked ? (
              <div className="tester-lock">
                <p className="small">✓ {t('Notes and Blackbox buttons are shown on this device.')}</p>
                <button className="btn small" data-testid="tester-lock" onClick={() => { lockTester(); setMsg({ ok: true, text: t('Buttons hidden again. Ctrl+H still opens this panel.') }) }}>{t('Hide the buttons again')}</button>
              </div>
            ) : (
              <form className="tester-lock" onSubmit={(e) => { e.preventDefault(); tryUnlock() }}>
                <label className="small">{t('Install password (shows the Notes and Blackbox buttons)')}</label>
                <div className="row">
                  <input type="password" autoComplete="off" value={pw} onChange={(e) => { setPw(e.target.value); setMsg(null) }} data-testid="tester-pw" placeholder={t('Install password')} />
                  <button className="btn primary small" type="submit" disabled={!pw} data-testid="tester-unlock">{t('Show buttons')}</button>
                </div>
              </form>
            )}
            {msg && <p className={msg.ok ? 'ok-text small' : 'error-text small'} data-testid="tester-msg">{msg.text}</p>}
          </div>
        </div>
      )}
      {notes && <FeedbackSheet where={whereNow()} onClose={() => setNotes(false)} />}
    </>
  )
}
