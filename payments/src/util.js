// Small helpers shared by the payment server (plain Web APIs, so it runs on Cloudflare Workers and Node).

const enc = new TextEncoder()

export function b64urlToBytes(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}
export function bytesToB64url(bytes) {
  let s = ''
  for (const x of new Uint8Array(bytes)) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const jsonB64url = (o) => bytesToB64url(enc.encode(JSON.stringify(o)))
export const parseJsonB64url = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)))

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** Compares two strings in time that does not depend on where they differ. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const x = enc.encode(a), y = enc.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/** Adds whole months (UTC); the 31st becomes the last day of a shorter month. */
export function addMonths(ms, months) {
  const d = new Date(ms)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.getTime()
}

export class HttpError extends Error {
  constructor(status, code, message) { super(message ?? code); this.status = status; this.code = code }
}
