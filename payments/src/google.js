// Google sign-in tokens: checking a Firebase ID token from the app, and getting an access token for
// Firestore with the service account. Plain WebCrypto, no libraries.
import { b64urlToBytes, bytesToB64url, HttpError, jsonB64url, parseJsonB64url } from './util.js'

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
let jwks = null // { keys, until }

async function signingKeys(fetchFn) {
  if (jwks && jwks.until > Date.now()) return jwks.keys
  const res = await fetchFn(JWKS_URL)
  if (!res.ok) throw new HttpError(503, 'auth-keys', 'Could not load the sign-in keys')
  const age = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600)
  const keys = (await res.json()).keys
  jwks = { keys, until: Date.now() + Math.min(age, 6 * 3600) * 1000 }
  return keys
}

/** For tests: forget cached keys and tokens. */
export function resetGoogleCaches() { jwks = null; access = null }

/**
 * Checks a Firebase Auth ID token (RS256, signed by Google) for this project and returns its claims.
 * Only a verified email may pay (Google accounts are always verified).
 */
export async function verifyIdToken(token, projectId, fetchFn = fetch, now = Date.now()) {
  const bad = (why) => new HttpError(401, 'auth', why)
  if (typeof token !== 'string') throw bad('Missing sign-in token')
  const parts = token.split('.')
  if (parts.length !== 3) throw bad('Bad sign-in token')
  let head, claims
  try { head = parseJsonB64url(parts[0]); claims = parseJsonB64url(parts[1]) } catch { throw bad('Bad sign-in token') }
  if (head.alg !== 'RS256' || typeof head.kid !== 'string') throw bad('Bad sign-in token')
  const jwk = (await signingKeys(fetchFn)).find((k) => k.kid === head.kid)
  if (!jwk) throw bad('Unknown sign-in key')
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
  if (!ok) throw bad('Bad sign-in signature')
  const t = Math.floor(now / 1000)
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw bad('Token is for another app')
  if (typeof claims.exp !== 'number' || claims.exp < t) throw bad('Sign-in expired')
  if (typeof claims.iat !== 'number' || claims.iat > t + 300) throw bad('Bad sign-in time')
  if (typeof claims.auth_time !== 'number' || claims.auth_time > t + 300) throw bad('Bad sign-in time')
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) throw bad('Bad user')
  if (claims.email_verified !== true) throw new HttpError(403, 'unverified', 'Please verify your email first')
  return { uid: claims.sub, email: String(claims.email ?? ''), name: String(claims.name ?? '') }
}

let access = null // { token, until }

/** OAuth access token for Firestore from the service account key (cached about an hour). */
export async function serviceToken(saJson, fetchFn = fetch) {
  if (access && access.until > Date.now() + 60_000) return access.token
  let sa
  try { sa = JSON.parse(saJson) } catch { throw new HttpError(500, 'config', 'Service account is not set') }
  const pem = String(sa.private_key ?? '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const iat = Math.floor(Date.now() / 1000)
  const body = `${jsonB64url({ alg: 'RS256', typ: 'JWT' })}.${jsonB64url({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 })}`
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body))
  const res = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${body}.${bytesToB64url(sig)}` }),
  })
  if (!res.ok) throw new HttpError(503, 'google-token', 'Could not reach the database')
  const j = await res.json()
  access = { token: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 }
  return access.token
}
