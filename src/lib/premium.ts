import { useEffect, useState } from 'react'

/**
 * Free and Pro. isAllowed() is the only check the rest of the app makes. Which features need Pro is
 * chosen by the admin (config/entitlements on the server). Pro comes from the account on the server
 * (users/{uid}.proUntil, written only by the server after a verified payment) or from a signed
 * licence (an Ed25519 token from the licence server), which also works offline for GRACE_DAYS.
 *
 * Until LOCK_ON is true (a payment provider is connected and Rakesh has approved real payments),
 * nothing is locked for anyone. The hidden developer switches (7 taps on the version in the
 * Premium sheet) preview the lock and pretend to be Premium, on this device only.
 */

/** Ship the lock to everyone. Stays false until real payments are approved. */
export const LOCK_ON = false
/** Public key of the licence server (raw Ed25519, base64). Empty: no licence can verify yet. */
export const LICENCE_PUBLIC_KEY = ''
/** Days a licence keeps working without internet after the last successful check. */
export const GRACE_DAYS = 7

export type Feature = 'export2k' | 'batch' | 'nomark' | 'dub' | 'audio' | 'greenscreen' | 'presenter' | 'scenes'

export const FEATURES: Record<Feature, { label: string; info: string }> = {
  export2k: { label: '2K export', info: 'Sharper 1440p videos' },
  batch: { label: 'Batch export', info: 'Several sizes in one go' },
  nomark: { label: 'No Apna Editor mark', info: 'Clean exports without the app name' },
  dub: { label: 'AI Dub', info: 'Translate, voice-over, voice cloning, YouTube subtitles' },
  audio: { label: 'Remove noise & audio effects', info: 'Clean voice, equalizer, voice changer, loudness' },
  greenscreen: { label: 'Smart green screen', info: 'Remove the background in one tap' },
  presenter: { label: 'Presenter profile', info: 'Your name and photo banner on every video' },
  scenes: { label: 'Content to video', info: 'Slides, script, article, audio, mind map, quiz and data to video' },
}

export type PlanId = string

/** A plan as the upgrade screen shows it. Prices are in paise (₹99 = 9900), like in Firestore. */
export interface Plan { id: PlanId; planName: string; price: number; currency: string; durationMonths: number; sortOrder: number }
/**
 * Used until the plans are read from the server (subscription_plans), e.g. offline. The server list
 * wins: the admin changes prices there without an app update. Play shows its own price on Android.
 */
export const DEFAULT_PLANS: Plan[] = [
  { id: 'monthly', planName: 'Monthly Pro', price: 9900, currency: 'INR', durationMonths: 1, sortOrder: 1 },
  { id: 'quarterly', planName: 'Quarterly Pro', price: 24900, currency: 'INR', durationMonths: 3, sortOrder: 2 },
  { id: 'annual', planName: 'Annual Pro', price: 79900, currency: 'INR', durationMonths: 12, sortOrder: 3 },
]
export const rupees = (paise: number) => `₹${Number.isInteger(paise / 100) ? paise / 100 : (paise / 100).toFixed(2)}`

export interface Licence { plan: PlanId; until: number; token: string; checked: number; store: string }

/** Where payments happen: Google Play Billing on Android, Razorpay on Windows and the web. */
export interface PaymentProvider {
  id: string
  name: string
  /** Opens the store's checkout; resolves with the licence the server issued, or null if cancelled. */
  buy(plan: PlanId): Promise<Licence | null>
  /** Looks up an earlier purchase (new phone, reinstall). */
  restore(): Promise<Licence | null>
  /** Opens the store page where the user can cancel or change the plan. */
  manage(): void
}

/** No provider yet: buying is switched off until an account is connected. */
let provider: PaymentProvider | null = null
export const paymentProvider = () => provider
export function setPaymentProvider(p: PaymentProvider | null) { provider = p; emit() }

interface Stored { licence: Licence | null; dev: boolean; devLock: boolean; devPremium: boolean }
const KEY = 'premium'
let store: Stored | null = null
const fresh = (): Stored => ({ licence: null, dev: false, devLock: false, devPremium: false })
function load(): Stored {
  if (store) return store
  try { store = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { store = fresh() }
  return store!
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(load())) } catch { /* private mode */ } emit() }

const listeners = new Set<() => void>()
function emit() { listeners.forEach((f) => f()) }

/** Re-renders when the plan or the switches change. */
export function usePremium() {
  const [, setV] = useState(0)
  useEffect(() => { const f = () => setV((n) => n + 1); listeners.add(f); return () => { listeners.delete(f) } }, [])
  return { premium: isPremium(), locked: lockActive() }
}

/** Is anything locked on this device? */
export const lockActive = () => LOCK_ON || (load().dev && load().devLock)

/**
 * A licence counts only once its signature was checked in this session (verifyStoredLicence, or
 * setLicence with a licence from verifyLicence). A licence typed into localStorage is ignored.
 */
let trusted: Licence | null = null

/** Checks the saved licence's signature; called once at start. */
export async function verifyStoredLicence() {
  const l = load().licence
  if (!l) return
  const v = await verifyLicence(l.token, l.store)
  if (v && v.plan === l.plan) { trusted = { ...l, until: v.until }; emit() }
}

/** The licence, if it is still paid for and was checked online within the grace period. */
export function activeLicence(now = Date.now()): Licence | null {
  const l = trusted
  if (!l || l.until < now) return null
  if (now - l.checked > GRACE_DAYS * 86400000) return null
  return l
}
/** The licence needs an online check soon (shown in the sheet). */
export const needsCheck = (now = Date.now()) => { const l = load().licence; return !!l && now - l.checked > (GRACE_DAYS - 2) * 86400000 }

/** "Pretend I have Premium" works only in development builds, so it can never unlock a release. */
const DEV_BUILD = import.meta.env.DEV

/**
 * What the server says about this account: Pro until when, and which features the admin made Pro.
 * Read from Firestore after sign-in (users/{uid}.proUntil, config/entitlements), which only the
 * server can write. Kept in memory only, never in localStorage, so editing storage cannot unlock
 * anything. Offline (nothing read yet) the built-in defaults apply: every feature in FEATURES is Pro.
 */
export interface ServerEntitlement {
  uid: string
  /** Pro paid until (ms), or null for Free. */
  proUntil: number | null
  /** Feature keys that need Pro; null = not read (defaults). */
  proFeatures: string[] | null
  freeExportMaxHeight: number
  freeWatermark: boolean
}
let server: ServerEntitlement | null = null
export const serverEntitlement = () => server
export function setServerEntitlement(e: ServerEntitlement | null) { server = e; emit() }

let plans: Plan[] | null = null
/** Plans from the server (null until read); see DEFAULT_PLANS. */
export const serverPlans = () => plans
export function setServerPlans(p: Plan[] | null) { plans = p; emit() }

/** Paid until (ms) according to the server, if that is in the future. */
export function serverProUntil(now = Date.now()) { return server?.proUntil && server.proUntil > now ? server.proUntil : null }

export function isPremium() {
  const s = load()
  return (DEV_BUILD && s.dev && s.devPremium) || !!activeLicence() || !!serverProUntil()
}

/** Does this feature need Pro? The admin decides (config/entitlements); defaults to yes. */
export function isProFeature(f: Feature) {
  if (!server?.proFeatures) return true
  if (f === 'nomark' && !server.freeWatermark) return false
  if (f === 'export2k' && server.freeExportMaxHeight >= 1440) return false
  return server.proFeatures.includes(f)
}
/** The Pro features, in the order of FEATURES. */
export const proFeatureList = () => (Object.keys(FEATURES) as Feature[]).filter(isProFeature)

export const isAllowed = (f: Feature) => !lockActive() || isPremium() || !isProFeature(f)

export const devSettings = () => { const s = load(); return { dev: s.dev, devLock: s.devLock, devPremium: s.devPremium } }
export function setDev(p: Partial<{ dev: boolean; devLock: boolean; devPremium: boolean }>) { Object.assign(load(), p); save() }
export const storedLicence = () => load().licence
export function forgetLicence() { load().licence = null; trusted = null; save() }

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

/**
 * Checks a licence token from the server: `<payload>.<signature>`, both base64url, payload JSON
 * `{ plan, until }`. Only a token signed with the server's private key passes, so the plan cannot
 * be made up on the device (a modified app can still skip the check; nothing on-device prevents that).
 */
export async function verifyLicence(token: string, store: string): Promise<Licence | null> {
  if (!LICENCE_PUBLIC_KEY) return null
  try {
    const [payload, sig] = token.split('.')
    const key = await crypto.subtle.importKey('raw', b64(LICENCE_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify'])
    if (!await crypto.subtle.verify('Ed25519', key, b64(sig), new TextEncoder().encode(payload))) return null
    const p = JSON.parse(new TextDecoder().decode(b64(payload))) as { plan: PlanId; until: number }
    if (typeof p.plan !== 'string' || !p.plan || p.plan === 'free' || typeof p.until !== 'number') return null
    return { plan: p.plan, until: p.until, token, checked: Date.now(), store }
  } catch { return null }
}

/** Saves a licence that verifyLicence returned (never one built from other data). */
export function setLicence(l: Licence | null) { load().licence = l; trusted = l; save() }

void verifyStoredLicence()

/** For tests: forget the cached settings so the next read comes from storage. */
export function reloadPremium() { store = null; trusted = null; server = null; plans = null; emit() }
