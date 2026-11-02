import { useEffect, useState } from 'react'
import { firebaseAuth } from '../lib/firebase'
import {
  authMessage, cleanName, currentProfile, deleteAccount, listMyPayments, nameError, normalisePhone, saveProfile, signInKind, signOut,
  type Payment,
} from '../lib/account'
import { rupees, serverProUntil, usePremium } from '../lib/premium'
import { useIsAdmin } from '../lib/admin'
import { SheetClose } from '../ui/kit'
import { t } from '../lib/i18n'
import { Icon } from './Icon'
import { Field } from './AuthScreen'

type View = 'main' | 'profile' | 'payments' | 'delete'

/** Signed-in account: who, which plan, profile, payments, sign out, delete account. */
export function AccountSheet({ onClose, onPlans }: { onClose: () => void; onPlans: () => void }) {
  const user = firebaseAuth().currentUser
  const { premium } = usePremium()
  const admin = useIsAdmin()
  const [view, setView] = useState<View>('main')
  const [busy, setBusy] = useState(false)
  const profile = currentProfile()
  const name = profile?.fullName || user?.displayName || user?.email?.split('@')[0] || ''
  const out = async () => {
    if (!confirm(t('Sign out of Apna Editor on this device? Your projects stay on this device.'))) return
    setBusy(true)
    try { await signOut() } finally { setBusy(false) }
  }
  const back = () => setView('main')
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet account" onClick={(e) => e.stopPropagation()} data-testid="account-sheet">
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} />
        {view === 'profile' && <ProfileForm onDone={back} />}
        {view === 'payments' && <Payments onBack={back} />}
        {view === 'delete' && <DeleteAccount onBack={back} />}
        {view === 'main' && <>
          <div className="account-head">
            {user?.photoURL ? <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>}
            <div>
              <b data-testid="account-name">{t('Hi')}, {name}</b>
              <small className="muted">{user?.email}</small>
              {profile?.phoneNumber && <small className="muted" data-testid="account-phone">{profile.phoneNumber}</small>}
            </div>
          </div>
          <div className="account-plan">
            <Icon name="crown" size={18} />
            <div>
              <b>{premium ? t('Pro') : t('Free Forever')}</b>
              <small className="muted" data-testid="account-plan">{premium && serverProUntil() ? `${t('Pro until')} ${new Date(serverProUntil()!).toLocaleDateString()}` : premium ? t('All Pro features are on.') : t('Basic editing, unlimited projects, exports up to 1080p.')}</small>
            </div>
            {!premium && <button className="btn small primary" onClick={onPlans}>{t('See plans')}</button>}
          </div>
          <div className="account-links">
            <button className="btn wide" onClick={() => setView('profile')} data-testid="account-edit"><Icon name="user" size={16} /> {t('Edit name and mobile number')}</button>
            <button className="btn wide" onClick={() => setView('payments')} data-testid="account-payments"><Icon name="note" size={16} /> {t('My payments')}</button>
            {admin && <button className="btn wide" onClick={() => { onClose(); location.hash = 'admin' }} data-testid="account-admin"><Icon name="lock" size={16} /> {t('Admin: users, plans, Pro features')}</button>}
          </div>
          <p className="muted small">{t('Projects and videos are saved only on this device. Uninstalling the app or clearing its data deletes them, so save important projects as .avp files.')}</p>
          <p className="muted small">{t('To keep a backup: open a project, tap the save button at the top and choose "Save as .avp file". To bring it back, use "Open project file (.avp)" on the Home screen.')}</p>
          <button className="btn wide" disabled={busy} onClick={out} data-testid="account-signout">{t('Sign out')}</button>
          <button className="link danger" onClick={() => setView('delete')} data-testid="account-delete">{t('Delete my account')}</button>
        </>}
      </div>
    </div>
  )
}

function Back({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="account-title">
      <button className="icon-btn" onClick={onBack} aria-label={t('Back')}><Icon name="back" size={18} /></button>
      <b>{t(title)}</b>
    </div>
  )
}

function ProfileForm({ onDone }: { onDone: () => void }) {
  const p = currentProfile()
  const user = firebaseAuth().currentUser
  const [name, setName] = useState(p?.fullName || user?.displayName || '')
  const [phone, setPhone] = useState(p?.phoneNumber ?? '')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const phoneNorm = normalisePhone(phone)
  const errs = { name: nameError(name), phone: phoneNorm === null ? t('Enter a 10-digit mobile number, or leave it empty') : null }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (errs.name || errs.phone) return
    setBusy(true); setErr(null)
    try { await saveProfile(cleanName(name), phoneNorm ?? ''); onDone() } catch (x) { setErr(authMessage(x)) } finally { setBusy(false) }
  }
  return (
    <form className="account-form" onSubmit={save} data-testid="profile-form">
      <Back onBack={onDone} title="Edit name and mobile number" />
      <Field label="Full name" value={name} onChange={setName} error={tried ? errs.name : null} auto="name" testid="profile-name" />
      <Field label="Mobile number (optional)" type="tel" value={phone} onChange={setPhone} error={tried ? errs.phone : null} auto="tel" placeholder="98765 43210" testid="profile-phone" />
      <p className="muted small">{t('Email cannot be changed here.')} {user?.email}</p>
      {err && <p className="auth-alert">{err}</p>}
      <button className="btn wide primary" disabled={busy} data-testid="profile-save">{busy ? t('Saving…') : t('Save')}</button>
    </form>
  )
}

function Payments({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<Payment[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { listMyPayments().then(setList).catch((e) => setErr(authMessage(e))) }, [])
  return (
    <div className="account-form" data-testid="payments">
      <Back onBack={onBack} title="My payments" />
      {err && <p className="auth-alert">{err}</p>}
      {!list && !err && <p className="muted small">{t('Loading…')}</p>}
      {list?.length === 0 && <p className="muted small" data-testid="payments-empty">{t('No payments yet.')}</p>}
      {list?.map((p) => (
        <div key={p.id} className="account-pay" data-testid="payment-row">
          <div>
            <b>{p.planName || t('Pro')}</b>
            <small className="muted">{p.createdAt ? new Date(p.createdAt).toLocaleString() : ''}{p.provider ? ` · ${p.provider === 'play' ? 'Google Play' : p.provider === 'razorpay' ? 'Razorpay' : p.provider}` : ''}</small>
          </div>
          <div className="account-pay-amt">
            <b>{p.currency === 'INR' ? rupees(p.amount) : `${(p.amount / 100).toFixed(2)} ${p.currency}`}</b>
            <small className={p.status === 'success' || p.status === 'paid' ? 'ok' : 'muted'}>{t(statusWord(p.status))}</small>
          </div>
        </div>
      ))}
    </div>
  )
}

const statusWord = (s: string) => (s === 'success' || s === 'paid' ? 'Paid' : s === 'refunded' ? 'Refunded' : s === 'failed' ? 'Failed' : 'Pending')

function DeleteAccount({ onBack }: { onBack: () => void }) {
  const kind = signInKind()
  const [password, setPassword] = useState('')
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ready = word.trim().toUpperCase() === 'DELETE' && (kind === 'google' || password.length > 0)
  const go = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true); setErr(null)
    try { await deleteAccount(password) } catch (x) { setErr(authMessage(x)); setBusy(false) }
  }
  return (
    <form className="account-form" onSubmit={go} data-testid="delete-form">
      <Back onBack={onBack} title="Delete my account" />
      <p className="auth-alert">{t('This deletes your Apna Editor account: your name, email and mobile number, and any Pro time left. It cannot be undone.')}</p>
      <p className="muted small">{t('Projects and videos on this device are not deleted. Payment records are kept without your name or email, as the law requires.')}</p>
      {kind === 'password'
        ? <Field label="Password" type="password" value={password} onChange={setPassword} auto="current-password" testid="delete-password" />
        : <p className="muted small">{t('Google will ask you to choose your account once more.')}</p>}
      <Field label='Type DELETE to confirm' value={word} onChange={setWord} testid="delete-word" />
      {err && <p className="auth-alert">{err}</p>}
      <button className="btn wide danger" disabled={busy || !ready} data-testid="delete-go">{busy ? t('Deleting…') : t('Delete my account forever')}</button>
    </form>
  )
}
