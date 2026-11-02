import { useState } from 'react'
import { firebaseAuth } from '../lib/firebase'
import { signOut } from '../lib/account'
import { usePremium } from '../lib/premium'
import { SheetClose } from '../ui/kit'
import { t } from '../lib/i18n'
import { Icon } from './Icon'

/** Signed-in account: who, which plan, sign out. The full dashboard (payments, settings) comes later. */
export function AccountSheet({ onClose, onPlans }: { onClose: () => void; onPlans: () => void }) {
  const user = firebaseAuth().currentUser
  const { premium } = usePremium()
  const [busy, setBusy] = useState(false)
  const name = user?.displayName || user?.email?.split('@')[0] || ''
  const out = async () => {
    if (!confirm(t('Sign out of Apna Editor on this device? Your projects stay on this device.'))) return
    setBusy(true)
    try { await signOut() } finally { setBusy(false) }
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet account" onClick={(e) => e.stopPropagation()} data-testid="account-sheet">
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} />
        <div className="account-head">
          {user?.photoURL ? <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>}
          <div>
            <b data-testid="account-name">{t('Hi')}, {name}</b>
            <small className="muted">{user?.email}</small>
          </div>
        </div>
        <div className="account-plan">
          <Icon name="crown" size={18} />
          <div>
            <b>{premium ? t('Pro') : t('Free Forever')}</b>
            <small className="muted">{premium ? t('All Pro features are on.') : t('Basic editing, unlimited projects, exports up to 1080p.')}</small>
          </div>
          {!premium && <button className="btn small primary" onClick={onPlans}>{t('See plans')}</button>}
        </div>
        <p className="muted small">{t('Projects and videos are saved only on this device. Uninstalling the app or clearing its data deletes them, so save important projects as .avp files.')}</p>
        <button className="btn wide" disabled={busy} onClick={out} data-testid="account-signout">{t('Sign out')}</button>
      </div>
    </div>
  )
}
