import { useEffect, useState } from 'react'

/**
 * Free and Premium. One list says which features are Premium; isAllowed() is the only check the
 * rest of the app makes. Premium comes from a signed licence (an Ed25519 token issued by the
 * licence server after a payment), which keeps working offline for GRACE_DAYS after the last check.
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
  nomark: { label: 'No ApanaVidEditor mark', info: 'Clean exports without the app name' },
  dub: { label: 'AI Dub', info: 'Translate, voice-over, voice cloning, YouTube subtitles' },
  audio: { label: 'Remove noise & audio effects', info: 'Clean voice, equalizer, voice changer, loudness' },
  greenscreen: { label: 'Smart green screen', info: 'Remove the background in one tap' },
  presenter: { label: 'Presenter profile', info: 'Your name and photo banner on every video' },
  scenes: { label: 'Content to video', info: 'Slides, script, article, audio, mind map, quiz and data to video' },
}

export type PlanId = 'monthly' | 'yearly'
/** Prices are placeholders until the store products exist; the store's own price wins once connected. */
export const PLANS: { id: PlanId; label: string; price: string; per: string; note?: string }[] = [
  { id: 'monthly', label: 'Monthly', price: '₹99', per: 'per month' },
  { id: 'yearly', label: 'Yearly', price: '₹799', per: 'per year', note: 'Save 33%' },
]

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

/** The licence, if it is still paid for and was checked online within the grace period. */
export function activeLicence(now = Date.now()): Licence | null {
  const l = load().licence
  if (!l || l.until < now) return null
  if (now - l.checked > GRACE_DAYS * 86400000) return null
  return l
}
/** The licence needs an online check soon (shown in the sheet). */
export const needsCheck = (now = Date.now()) => { const l = load().licence; return !!l && now - l.checked > (GRACE_DAYS - 2) * 86400000 }

export function isPremium() {
  const s = load()
  return (s.dev && s.devPremium) || !!activeLicence()
}

export const isAllowed = (_f: Feature) => !lockActive() || isPremium()

export const devSettings = () => { const s = load(); return { dev: s.dev, devLock: s.devLock, devPremium: s.devPremium } }
export function setDev(p: Partial<{ dev: boolean; devLock: boolean; devPremium: boolean }>) { Object.assign(load(), p); save() }
export const storedLicence = () => load().licence
export function forgetLicence() { load().licence = null; save() }

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
    if (p.plan !== 'monthly' && p.plan !== 'yearly') return null
    return { plan: p.plan, until: p.until, token, checked: Date.now(), store }
  } catch { return null }
}

export function setLicence(l: Licence | null) { load().licence = l; save() }

/** For tests: forget the cached settings so the next read comes from storage. */
export function reloadPremium() { store = null; emit() }
