import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  authMessage, checkVerified, emailError, nameError, normalisePhone, passwordError, register, resendVerification, resetPassword,
  cancelGoogle, googleProvider, signIn, signInGoogle, signOut,
} from '../lib/account'
import { GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from 'firebase/auth'
import { bridgeAuth, googleAvailable, platform } from '../lib/firebase'
import { getLang, setLang, t } from '../lib/i18n'
import { Icon } from './Icon'

type Mode = 'login' | 'register' | 'forgot'

/** Shell shared by the sign-in screens: brand on top, one card, language switch. */
function AuthShell({ children, onLang }: { children: ReactNode; onLang: () => void }) {
  return (
    <div className="auth" data-testid="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="logo"><Icon name="play" size={20} /></span>
          <div>
            <b>Apna Editor</b>
            <small className="muted">{t('Edit videos on your device')}</small>
          </div>
          <button className="btn ghost small auth-lang" type="button" onClick={() => { setLang(getLang() === 'hi' ? 'en' : 'hi'); onLang() }}>
            {getLang() === 'hi' ? 'English' : 'हिंदी'}
          </button>
        </div>
        {children}
      </div>
      <p className="auth-foot muted small">{t('Your projects and videos stay on this device. Your account only keeps your name, email and plan.')}</p>
    </div>
  )
}

export function Field(p: { label: string; type?: string; value: string; onChange: (v: string) => void; error?: string | null; auto?: string; placeholder?: string; testid?: string }) {
  return (
    <label className="auth-field">
      <span>{t(p.label)}</span>
      <input
        type={p.type ?? 'text'} value={p.value} autoComplete={p.auto} placeholder={p.placeholder}
        onChange={(e) => p.onChange(e.target.value)} aria-invalid={!!p.error} data-testid={p.testid}
      />
      {p.error && <small className="auth-err">{p.error}</small>}
    </label>
  )
}

function GoogleButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  if (!googleAvailable) return null
  return (
    <>
      <button type="button" className="btn wide auth-google" disabled={busy} onClick={onClick} data-testid="auth-google">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        {t('Continue with Google')}
      </button>
      <div className="auth-or"><span>{t('or')}</span></div>
    </>
  )
}

/** Sign in, create account, forgot password. Shown instead of the app until someone is signed in. */
export function AuthScreen({ onLang }: { onLang: () => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [rememberMe, setRemember] = useState(true)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [waitGoogle, setWaitGoogle] = useState(false)

  const go = (m: Mode) => { setMode(m); setError(null); setNote(null); setTouched(false) }
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null); setNote(null)
    try { await fn() } catch (e) { setError(e instanceof Error && !(e as { code?: string }).code ? e.message : authMessage(e)) } finally { setBusy(false) }
  }

  const phoneNorm = normalisePhone(phone)
  const errs = {
    name: mode === 'register' ? nameError(name) : null,
    email: emailError(email),
    phone: mode === 'register' && phoneNorm === null ? t('Enter a 10-digit mobile number, or leave it empty') : null,
    password: mode === 'register' ? passwordError(password) : (password ? null : t('Please enter your password')),
    confirm: mode === 'register' && confirm !== password ? t('Passwords do not match') : null,
  }
  const shown = (k: keyof typeof errs) => (touched ? errs[k] : null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (mode === 'forgot') {
      if (errs.email) return
      return run(async () => { await resetPassword(email); setNote(t('If an account exists for this email, a reset link is on its way. Check your inbox and spam.')) })
    }
    if (Object.values(errs).some(Boolean)) return
    if (mode === 'login') return run(() => signIn(email, password, rememberMe))
    return run(() => register({ name, email, password, phone: phoneNorm ?? '', remember: rememberMe }))
  }

  const title = mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create your account' : 'Reset password'
  return (
    <AuthShell onLang={onLang}>
      <h1 className="auth-title">{t(title)}</h1>
      {mode === 'login' && <p className="muted small">{t('Sign in to open your projects and the editor.')}</p>}
      {mode === 'register' && <p className="muted small">{t('Free forever. No card needed.')}</p>}
      {mode === 'forgot' && <p className="muted small">{t('Enter your email and we will send you a link to set a new password.')}</p>}

      {mode !== 'forgot' && <GoogleButton busy={busy} onClick={() => { setWaitGoogle(platform === 'windows'); run(() => signInGoogle(rememberMe)).finally(() => setWaitGoogle(false)) }} />}
      {waitGoogle && (
        <p className="auth-ok" data-testid="auth-google-wait">
          {t('Google sign-in opened in your web browser. Choose your account there, then come back here.')}{' '}
          <button type="button" className="link" onClick={cancelGoogle}>{t('Cancel')}</button>
        </p>
      )}

      <form className="auth-form" onSubmit={submit} noValidate>
        {mode === 'register' && <Field label="Full name" value={name} onChange={setName} error={shown('name')} auto="name" testid="auth-name" />}
        <Field label="Email" type="email" value={email} onChange={setEmail} error={shown('email')} auto="email" testid="auth-email" />
        {mode === 'register' && (
          <Field label="Mobile number (optional)" type="tel" value={phone} onChange={setPhone} error={shown('phone')} auto="tel" placeholder="98765 43210" testid="auth-phone" />
        )}
        {mode !== 'forgot' && (
          <label className="auth-field">
            <span>{t('Password')}</span>
            <div className="auth-pass">
              <input
                type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'} aria-invalid={!!shown('password')} data-testid="auth-password"
              />
              <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={t(show ? 'Hide password' : 'Show password')}>
                <Icon name="eye" size={18} />
              </button>
            </div>
            {shown('password') && <small className="auth-err">{shown('password')}</small>}
            {mode === 'register' && !shown('password') && <small className="muted">{t('At least 8 characters, with letters and numbers.')}</small>}
          </label>
        )}
        {mode === 'register' && (
          <Field label="Confirm password" type={show ? 'text' : 'password'} value={confirm} onChange={setConfirm} error={shown('confirm')} auto="new-password" testid="auth-confirm" />
        )}
        {mode !== 'forgot' && (
          <div className="auth-row">
            <label className="auth-check">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRemember(e.target.checked)} data-testid="auth-remember" />
              {t('Keep me signed in')}
            </label>
            {mode === 'login' && <button type="button" className="link" onClick={() => go('forgot')}>{t('Forgot password?')}</button>}
          </div>
        )}
        {error && <p className="auth-alert" role="alert" data-testid="auth-error">{error}</p>}
        {note && <p className="auth-ok" role="status" data-testid="auth-note">{note}</p>}
        <button className="btn primary wide auth-submit" disabled={busy} data-testid="auth-submit">
          {busy ? <span className="spinner" /> : null}
          {t(mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link')}
        </button>
      </form>

      <div className="auth-switch">
        {mode === 'login' && <>{t('New to Apna Editor?')} <button className="link" onClick={() => go('register')} data-testid="auth-to-register">{t('Create an account')}</button></>}
        {mode === 'register' && <>{t('Already have an account?')} <button className="link" onClick={() => go('login')}>{t('Sign in')}</button></>}
        {mode === 'forgot' && <button className="link" onClick={() => go('login')}>{t('Back to sign in')}</button>}
      </div>
    </AuthShell>
  )
}

/** After sign-up with email: the editor opens once the link in the email is opened. */
export function VerifyScreen({ email, onLang }: { email: string; onLang: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null)
    try { await fn() } catch (e) { setMsg({ ok: false, text: authMessage(e) }) } finally { setBusy(false) }
  }
  return (
    <AuthShell onLang={onLang}>
      <h1 className="auth-title">{t('Check your email')}</h1>
      <p>{t('We sent a link to')} <b>{email}</b>. {t('Open it to confirm your email, then come back here.')}</p>
      <p className="muted small">{t('Not there? Look in Spam or Promotions.')}</p>
      {msg && <p className={msg.ok ? 'auth-ok' : 'auth-alert'} role="status" data-testid="verify-msg">{msg.text}</p>}
      <button className="btn primary wide" disabled={busy} data-testid="verify-done"
        onClick={() => act(async () => { if (!await checkVerified()) setMsg({ ok: false, text: t('Not confirmed yet. Open the link in the email first.') }) })}>
        {t('I have confirmed my email')}
      </button>
      <button className="btn wide" disabled={busy} onClick={() => act(async () => { await resendVerification(); setMsg({ ok: true, text: t('Sent again. It can take a minute.') }) })}>
        {t('Send the email again')}
      </button>
      <div className="auth-switch"><button className="link" onClick={() => signOut()}>{t('Use another account')}</button></div>
    </AuthShell>
  )
}

export function BlockedScreen({ onLang }: { onLang: () => void }) {
  return (
    <AuthShell onLang={onLang}>
      <h1 className="auth-title">{t('Account suspended')}</h1>
      <p>{t('This account cannot be used right now. Please contact support.')}</p>
      <p className="muted small">{t('Your projects are still on this device.')}</p>
      <button className="btn wide" onClick={() => signOut()}>{t('Sign out')}</button>
    </AuthShell>
  )
}

export function LoadingScreen() {
  return <div className="auth auth-loading" data-testid="auth-loading"><span className="spinner big" /></div>
}

/** #desktop-signin?port=…&state=…: the Windows app opened this page; read once at load. */
export function desktopSignInRequest(hash = location.hash) {
  const m = hash.match(/^#desktop-signin\?(.*)$/)
  if (!m) return null
  const q = new URLSearchParams(m[1])
  const port = Number(q.get('port'))
  const state = q.get('state') ?? ''
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[\w-]{16,64}$/.test(state)) return null
  return { port, state }
}

/**
 * The website page the Windows app opens in the default browser. It signs in with Google in a
 * throw-away session (this browser's own sign-in is left alone) and sends only the Google ID token
 * to the app, which waits on 127.0.0.1.
 */
export function DesktopSignIn({ port, state, onLang }: { port: number; state: string; onLang: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // Made ready before the tap, so the Google window opens straight from the tap (else browsers block it).
  const [auth] = useState(bridgeAuth)
  const [ready, setReady] = useState(false)
  useEffect(() => { auth.authStateReady().then(() => setReady(true)) }, [auth])
  const go = async () => {
    setBusy(true); setError(null)
    try {
      const res = await signInWithPopup(auth, googleProvider())
      const idToken = GoogleAuthProvider.credentialFromResult(res)?.idToken
      await fbSignOut(auth).catch(() => {})
      if (!idToken) throw new Error(t('Something went wrong. Please try again.'))
      setDone(true)
      location.replace(`http://127.0.0.1:${port}/?${new URLSearchParams({ state, id_token: idToken })}`)
    } catch (e) {
      console.warn('desktop sign-in', e)
      setError(e instanceof Error && !(e as { code?: string }).code ? e.message : authMessage(e))
      setBusy(false)
    }
  }
  return (
    <AuthShell onLang={onLang}>
      <h1 className="auth-title">{t('Sign in to the Windows app')}</h1>
      <p className="muted small">{t('Apna Editor on your computer asked to sign in with Google. Tap the button and choose your account.')}</p>
      {!done && <GoogleButton busy={busy || !ready} onClick={go} />}
      {done && <p className="auth-ok" role="status">{t('Signed in. Go back to the Apna Editor app.')}</p>}
      {error && <p className="auth-alert" role="alert" data-testid="auth-error">{error}</p>}
    </AuthShell>
  )
}
