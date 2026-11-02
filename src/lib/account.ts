import { createContext, useContext, useEffect, useState } from 'react'
import {
  browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, GoogleAuthProvider,
  onAuthStateChanged, reauthenticateWithCredential, reauthenticateWithPopup, sendEmailVerification, sendPasswordResetEmail, setPersistence,
  signInWithCredential, signInWithEmailAndPassword, signInWithPopup, signOut as fbSignOut, updateProfile, type AuthCredential, type User,
} from 'firebase/auth'
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, updateDoc, where, writeBatch, type Timestamp } from 'firebase/firestore/lite'
import { firebaseAuth, firestore, googleAvailable, platform } from './firebase'
import { desktop } from './desktop'
import { t } from './i18n'
import { setServerEntitlement, setServerPlans, type Plan } from './premium'

/**
 * Accounts. Everyone signs in before the editor opens (AuthGate). The session is kept on the device
 * and restored on the next launch, also offline. A new account gets its profile and the Free plan;
 * the server (Cloud Function) does the same, and the Firestore rules allow only exactly that from the app.
 */

export interface Profile {
  fullName: string
  email: string
  phoneNumber: string
  role: 'user' | 'admin'
  accountStatus: 'active' | 'suspended' | 'deleted'
  planId: string
  /** Pro paid until; written only by the server. */
  proUntil?: Timestamp | null
}

export type AccountState =
  | { status: 'loading' }
  | { status: 'out' }
  | { status: 'unverified'; user: User }
  | { status: 'blocked'; user: User }
  | { status: 'in'; user: User; profile: Profile | null }

// ---------- validation (the rules check the same on the server)

export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim()
export function nameError(s: string) {
  const n = cleanName(s)
  if (!n) return t('Please enter your name')
  if (n.length > 80) return t('Name is too long')
  return null
}
export const emailError = (s: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) ? null : t('Please enter a valid email'))
export function passwordError(s: string) {
  if (s.length < 8) return t('Password needs at least 8 characters')
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return t('Use letters and numbers in the password')
  if (s.length > 128) return t('Password is too long')
  return null
}
/** Optional mobile number, saved as +<country><number>. A 10-digit number is taken as Indian (+91). */
export function normalisePhone(s: string): string | null {
  const d = s.replace(/[\s()-]/g, '')
  if (!d) return ''
  if (/^[6-9]\d{9}$/.test(d)) return `+91${d}`
  if (/^0[6-9]\d{9}$/.test(d)) return `+91${d.slice(1)}`
  if (/^\+[1-9]\d{7,14}$/.test(d)) return d
  return null
}

/** Firebase error codes in plain words. */
export function authMessage(e: unknown): string {
  const code = (e as { code?: string }).code ?? ''
  const map: Record<string, string> = {
    'auth/email-already-in-use': 'An account with this email already exists. Sign in instead, or reset the password.',
    'auth/invalid-credential': 'Email or password is wrong.',
    'auth/wrong-password': 'Email or password is wrong.',
    'auth/user-not-found': 'Email or password is wrong.',
    'auth/invalid-email': 'Please enter a valid email',
    'auth/weak-password': 'Password needs at least 8 characters',
    'auth/user-disabled': 'This account is suspended. Please contact support.',
    'auth/too-many-requests': 'Too many tries. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'No internet. Signing in needs internet the first time.',
    'auth/popup-closed-by-user': 'Google sign-in was closed.',
    'auth/cancelled-popup-request': 'Google sign-in was closed.',
    'auth/popup-blocked': 'The sign-in window was blocked. Allow pop-ups for this site and try again.',
    'auth/account-exists-with-different-credential': 'This email already has an account. Sign in with email and password first.',
    'auth/operation-not-allowed': 'This sign-in method is not switched on yet.',
    'auth/requires-recent-login': 'Please sign out, sign in again, and try once more.',
    'auth/user-mismatch': 'Please choose the same Google account you signed in with.',
  }
  return t(map[code] ?? 'Something went wrong. Please try again.')
}

// ---------- session

async function remember(on: boolean) {
  await setPersistence(firebaseAuth(), on ? browserLocalPersistence : browserSessionPersistence)
}

/**
 * A sign-in or sign-up in progress. The auth listener waits for it, so the profile is written once,
 * with the name and mobile number from the form (not an empty one from the listener).
 */
let busy: Promise<unknown> | null = null
function track<T>(p: Promise<T>): Promise<T> {
  const done = p.finally(() => { if (busy === done) busy = null })
  busy = done
  return done
}

export function register(o: { name: string; email: string; password: string; phone: string; remember: boolean }) {
  return track((async () => {
    await remember(o.remember)
    const cred = await createUserWithEmailAndPassword(firebaseAuth(), o.email.trim(), o.password)
    await updateProfile(cred.user, { displayName: cleanName(o.name) })
    // The account exists now: a profile write that fails (offline, server busy) is retried on the next sign-in.
    await ensureAccount(cred.user, { fullName: cleanName(o.name), phoneNumber: o.phone }).catch(() => {})
    await sendEmailVerification(cred.user).catch(() => {})
    return cred.user
  })())
}

export function signIn(email: string, password: string, rememberMe: boolean) {
  return track((async () => {
    await remember(rememberMe)
    const cred = await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password)
    await ensureAccount(cred.user).catch(() => {})
    return cred.user
  })())
}

export function signInGoogle(rememberMe: boolean) {
  if (!googleAvailable) return Promise.reject(new Error(t('Google sign-in comes to this app soon. Please use email for now.')))
  return track((async () => {
    await remember(rememberMe)
    const cred = platform === 'windows'
      ? await signInWithCredential(firebaseAuth(), await desktopGoogleCredential())
      : await signInWithPopup(firebaseAuth(), googleProvider())
    await ensureAccount(cred.user).catch(() => {})
    return cred.user
  })())
}

export function googleProvider() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return provider
}

/** Windows: Google sign-in happens on the website in the default browser; its Google ID token signs in here. */
async function desktopGoogleCredential(): Promise<AuthCredential> {
  if (!desktop?.googleLogin) throw new Error(t('Google sign-in comes to this app soon. Please use email for now.'))
  const r = await desktop.googleLogin().catch((e: Error) => {
    // ("Error invoking remote method '…': Error: <message>" from the shell)
    throw new Error(t(String(e?.message ?? '').replace(/^.*Error: /, '') || 'Something went wrong. Please try again.'))
  })
  return GoogleAuthProvider.credential(r.idToken)
}

/** Stops a Windows Google sign-in that is waiting for the browser. */
export const cancelGoogle = () => desktop?.googleCancel?.()

export const resetPassword = (email: string) => sendPasswordResetEmail(firebaseAuth(), email.trim())
export const resendVerification = () => { const u = firebaseAuth().currentUser; return u ? sendEmailVerification(u) : Promise.resolve() }
/** After the user opened the link in the email: fetch the fresh state from the server. */
export async function checkVerified() {
  const u = firebaseAuth().currentUser
  if (!u) return false
  await u.reload()
  await u.getIdToken(true)
  emit()
  return u.emailVerified
}

export async function signOut() {
  profileCache = null
  setServerEntitlement(null)
  await fbSignOut(firebaseAuth())
}

// ---------- profile + Free plan

let profileCache: { uid: string; profile: Profile } | null = null

/**
 * Makes sure users/{uid} and the Free subscription exist (the rules allow the app to create only
 * these, with a Free plan and no role), and returns the profile. Offline it returns null.
 */
export async function ensureAccount(user: User, extra?: { fullName?: string; phoneNumber?: string }): Promise<Profile | null> {
  const db = firestore()
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    const email = user.email ?? ''
    const b = writeBatch(db)
    b.set(ref, {
      fullName: (extra?.fullName ?? cleanName(user.displayName ?? '')).slice(0, 80),
      email,
      emailLower: email.toLowerCase(),
      phoneNumber: extra?.phoneNumber ?? '',
      photoURL: (user.photoURL ?? '').slice(0, 1000),
      role: 'user',
      accountStatus: 'active',
      planId: 'free',
      proUntil: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    const subRef = doc(db, 'subscriptions', `free_${user.uid}`)
    const sub = await getDoc(subRef)
    if (!sub.exists()) {
      b.set(subRef, {
        userId: user.uid, planId: 'free', planName: 'Free Forever', provider: 'free', status: 'active',
        startDate: serverTimestamp(), expiryDate: null, autoRenewal: false, providerRef: null,
      })
    }
    try { await b.commit() } catch (e) {
      // The server may have created them a moment earlier: read again before giving up.
      if (!(await getDoc(ref)).exists()) throw e
    }
    return readProfile(user)
  }
  const p = snap.data() as Profile
  profileCache = { uid: user.uid, profile: p }
  return p
}

async function readProfile(user: User): Promise<Profile | null> {
  const s = await getDoc(doc(firestore(), 'users', user.uid))
  if (!s.exists()) return null
  profileCache = { uid: user.uid, profile: s.data() as Profile }
  return profileCache.profile
}

/** The profile as last read (null before it loads, or offline on a fresh launch). */
export const currentProfile = () => {
  const u = firebaseAuth().currentUser
  return u && profileCache?.uid === u.uid ? profileCache.profile : null
}

/** Changes the name and mobile number (the only profile fields a user may change). */
export async function saveProfile(name: string, phone: string) {
  const u = firebaseAuth().currentUser
  if (!u) throw new Error(t('Please sign in again.'))
  const fullName = cleanName(name)
  await updateDoc(doc(firestore(), 'users', u.uid), { fullName, phoneNumber: phone, updatedAt: serverTimestamp() })
  await updateProfile(u, { displayName: fullName }).catch(() => { /* the profile is what counts */ })
  if (profileCache?.uid === u.uid) profileCache = { uid: u.uid, profile: { ...profileCache.profile, fullName, phoneNumber: phone } }
  emit()
}

// ---------- payments history (written only by the server)

export interface Payment {
  id: string
  /** paise */
  amount: number
  currency: string
  planId: string
  planName: string
  status: string
  provider: string
  createdAt: number | null
}

/** The signed-in user's payments, newest first. */
export async function listMyPayments(): Promise<Payment[]> {
  const u = firebaseAuth().currentUser
  if (!u) return []
  const snap = await getDocs(query(collection(firestore(), 'payments'), where('userId', '==', u.uid), limit(100)))
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id, amount: Number(x.amount) || 0, currency: x.currency ?? 'INR', planId: x.planId ?? '', planName: x.planName ?? x.planId ?? '',
      status: x.status ?? '', provider: x.provider ?? '', createdAt: ms(x.createdAt),
    }
  }).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

// ---------- deleting the account

/** How the account signs in, so deleting it asks for the right proof. */
export function signInKind(): 'password' | 'google' {
  const u = firebaseAuth().currentUser
  return u?.providerData.some((p) => p.providerId === 'password') ? 'password' : 'google'
}

/**
 * Deletes the signed-in account: asks for the password (or Google) again, empties the profile and
 * marks it deleted, then deletes the sign-in. Projects on this device are not touched.
 */
export async function deleteAccount(password: string) {
  const u = firebaseAuth().currentUser
  if (!u) throw new Error(t('Please sign in again.'))
  if (signInKind() === 'password') await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email ?? '', password))
  else if (platform === 'windows') await reauthenticateWithCredential(u, await desktopGoogleCredential())
  else await reauthenticateWithPopup(u, googleProvider())
  await updateDoc(doc(firestore(), 'users', u.uid), {
    fullName: '', email: '', emailLower: '', phoneNumber: '', photoURL: '',
    accountStatus: 'deleted', deletedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  profileCache = null
  setServerEntitlement(null)
  await deleteUser(u)
}

// ---------- Pro status and plans (read only; the server writes them)

const ms = (v: unknown) => (v && typeof (v as Timestamp).toMillis === 'function' ? (v as Timestamp).toMillis() : null)

/** Reads which features are Pro (admin's choice) and hands it, with the account's Pro date, to premium.ts. No user = Free, no account. */
export async function loadEntitlement(user: User | null, profile: Profile | null) {
  const snap = await getDoc(doc(firestore(), 'config', 'entitlements'))
  const c = (snap.exists() ? snap.data() : {}) as { proFeatures?: unknown; freeExportMaxHeight?: unknown; freeWatermark?: unknown }
  setServerEntitlement({
    uid: user?.uid ?? '',
    proUntil: user ? ms(profile?.proUntil) : null,
    proFeatures: Array.isArray(c.proFeatures) ? c.proFeatures.filter((x): x is string => typeof x === 'string') : null,
    freeExportMaxHeight: typeof c.freeExportMaxHeight === 'number' ? c.freeExportMaxHeight : 1080,
    freeWatermark: c.freeWatermark !== false,
  })
}

/** The paid plans the admin has switched on, cheapest first. Read when the upgrade screen opens. */
export async function loadPlans(): Promise<Plan[]> {
  const snap = await getDocs(collection(firestore(), 'subscription_plans'))
  const list = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Plan, 'id'> & { isActive?: boolean }) }))
    .filter((p) => p.isActive !== false && p.price > 0 && p.durationMonths > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ id, planName, price, currency, durationMonths, sortOrder }) => ({ id, planName, price, currency, durationMonths, sortOrder }))
  setServerPlans(list)
  return list
}

/** Reads the profile and Pro status again (after a purchase, or "Check again"). */
export async function refreshAccount() {
  const u = firebaseAuth().currentUser
  if (!u) return
  const p = await readProfile(u)
  await loadEntitlement(u, p)
  emit()
}

// ---------- state for React

/** The account state, shared from the top of the app (App.tsx provides it). */
export const AccountContext = createContext<AccountState>({ status: 'loading' })
export const useAccountState = () => useContext(AccountContext)

const listeners = new Set<() => void>()
function emit() { listeners.forEach((f) => f()) }

function stateFor(user: User | null, loaded: boolean, blocked: boolean): AccountState {
  if (!loaded) return { status: 'loading' }
  if (!user) return { status: 'out' }
  if (blocked) return { status: 'blocked', user }
  if (!user.emailVerified) return { status: 'unverified', user }
  return { status: 'in', user, profile: profileCache?.uid === user.uid ? profileCache.profile : null }
}

/** The signed-in account. Restores the saved session on launch; works offline once signed in. */
export function useAccount(): AccountState {
  const [user, setUser] = useState<User | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [, setTick] = useState(0)
  useEffect(() => {
    const f = () => setTick((n) => n + 1)
    listeners.add(f)
    const off = onAuthStateChanged(firebaseAuth(), (u) => {
      setUser(u); setLoaded(true); setBlocked(false)
      // No account (free use): still read which features the admin made Pro.
      if (!u) { loadEntitlement(null, null).then(f, () => { /* offline: defaults */ }); return }
      // Online: refresh the profile (and learn about a suspension). Offline: keep going with the saved session.
      Promise.resolve(busy).catch(() => {}).then(() => ensureAccount(u)).then(async (p) => {
        if (p?.accountStatus === 'deleted') {
          // Deleted earlier but the sign-in was left over (the last step failed): finish the job.
          await deleteUser(u).catch(() => fbSignOut(firebaseAuth()))
          return
        }
        setBlocked(p?.accountStatus === 'suspended')
        await loadEntitlement(u, p).catch(() => { /* offline: defaults */ })
        f()
      }).catch((e) => {
        if ((e as { code?: string }).code === 'auth/user-disabled') setBlocked(true)
      })
    })
    return () => { off(); listeners.delete(f) }
  }, [])
  return stateFor(user, loaded, blocked)
}
