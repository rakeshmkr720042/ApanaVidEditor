/**
 * API keys for online AI, kept ONLY on this device and never in projects, shared files, logs or our servers.
 * Windows app: the key is locked with Windows' own encryption in the main process (electron safeStorage); the
 * page only ever holds the locked copy, and the main process adds the key to requests for that one site.
 * Android: app-private storage (no other app can read it). Web: this browser's storage, or this tab only.
 */
import { desktop } from '../../lib/desktop'

const KEY = 'agent-keys'
const SESSION = 'agent-keys-tab'

interface Stored { v: string; sealed: boolean; last4: string; origin: string }
type Store = Record<string, Stored>

const read = (s: Storage | undefined, k: string): Store => { try { return JSON.parse(s?.getItem(k) ?? '{}') } catch { return {} } }
const write = (s: Storage | undefined, k: string, v: Store) => { try { s?.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } }
const ls = () => (typeof localStorage === 'undefined' ? undefined : localStorage)
const ss = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage)

/** Saves a key for a provider (origin = the only site it may be sent to). `tabOnly`: web, forget when the tab closes. */
export async function saveKey(provider: string, key: string, origin: string, tabOnly = false) {
  key = key.trim()
  const last4 = key.slice(-4)
  if (!key) return removeKey(provider)
  let entry: Stored = { v: key, sealed: false, last4, origin }
  if (desktop?.aiSeal) entry = { v: await desktop.aiSeal(key, origin), sealed: true, last4, origin }
  const [s, k] = tabOnly ? [ss(), SESSION] : [ls(), KEY]
  const other = tabOnly ? [ls(), KEY] as const : [ss(), SESSION] as const
  write(s, k, { ...read(s, k), [provider]: entry })
  const o = read(other[0], other[1]); delete o[provider]; write(other[0], other[1], o)
}

export function removeKey(provider: string) {
  for (const [s, k] of [[ls(), KEY], [ss(), SESSION]] as const) { const o = read(s, k); delete o[provider]; write(s, k, o) }
}

export function storedKey(provider: string): Stored | null {
  return read(ss(), SESSION)[provider] ?? read(ls(), KEY)[provider] ?? null
}

/** "••••a9f2" for showing which key is saved, or null. */
export const maskedKey = (provider: string) => { const k = storedKey(provider); return k ? `••••${k.last4}` : null }

/** Hides anything that looks like an API key in text that might be logged or shown (errors, notes, crash reports). */
export function redact(s: string) {
  return s.replace(/\b(sk-(?:ant-|proj-|or-v1-)?[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|xai-[A-Za-z0-9_-]{12,}|gsk_[A-Za-z0-9]{12,})\b/g, '[key hidden]')
}
