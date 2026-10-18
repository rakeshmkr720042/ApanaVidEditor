import { Capacitor } from '@capacitor/core'
import { desktop } from './desktop'

/**
 * Direct upload of an exported video to the user's own YouTube channel (YouTube Data API v3).
 * Personal setting with no default: nothing contacts Google until the user enters the OAuth
 * client ID from their own Google Cloud project and signs in. Tokens stay on this device.
 *
 * Sign-in: the Windows app uses a "Desktop app" client with the loopback + PKCE flow, run by
 * the Electron main process (the app:// page can't use Google's web popup). The website uses a
 * "Web application" client in a popup (token only, about an hour). Android isn't supported:
 * Google blocks sign-in inside app web views.
 */

const SCOPE = 'https://www.googleapis.com/auth/youtube.upload'
const KEY = 'youtube-upload'
const TOKEN_KEY = 'youtube-token'

export interface YouTubeSettings { clientId: string; clientSecret: string }
export function getYouTube(): YouTubeSettings {
  const d: YouTubeSettings = { clientId: '', clientSecret: '' }
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return d }
}
export function setYouTube(patch: Partial<YouTubeSettings>) {
  const next = { ...getYouTube(), ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ }
  return next
}

/** What this build can do: 'desktop' (Windows app), 'web' (website) or null (Android). */
export const youTubeMode = (): 'desktop' | 'web' | null =>
  desktop?.googleSignIn ? 'desktop' : Capacitor.isNativePlatform() ? null : 'web'

/** The address Google sends the website's sign-in back to; it goes in the Web client's settings. */
export const webRedirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '')

interface Token { access: string; expires: number; refresh?: string; clientId: string }
function readToken(): Token | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as Token | null
    return t && t.clientId === getYouTube().clientId ? t : null
  } catch { return null }
}
function writeToken(t: Token | null) {
  try { if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t)); else localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ }
}

/** True when there is a sign-in that can still be used (or refreshed) without asking again. */
export function isSignedIn() {
  const t = readToken()
  return !!t && (!!t.refresh || t.expires > Date.now() + 60_000)
}

export function signOut() { writeToken(null) }

const cleanId = (id: string) => id.trim()

/** Opens Google sign-in and keeps the result. */
export async function signIn() {
  const { clientId, clientSecret } = getYouTube()
  if (!cleanId(clientId)) throw new Error('Add your OAuth client ID first.')
  const mode = youTubeMode()
  if (mode === 'desktop') {
    const r = await desktop!.googleSignIn!({ clientId: cleanId(clientId), clientSecret: clientSecret.trim(), scope: SCOPE })
    writeToken({ access: r.access, expires: Date.now() + r.expiresIn * 1000, refresh: r.refresh, clientId })
    return
  }
  if (mode === 'web') {
    const r = await webPopup(cleanId(clientId))
    writeToken({ access: r.access, expires: Date.now() + r.expiresIn * 1000, clientId })
    return
  }
  throw new Error('YouTube upload works in the Windows app and on the website.')
}

async function accessToken() {
  const t = readToken()
  if (!t) throw new Error('Sign in with Google first.')
  if (t.expires > Date.now() + 60_000) return t.access
  if (t.refresh && desktop?.googleRefresh) {
    const { clientId, clientSecret } = getYouTube()
    try {
      const r = await desktop.googleRefresh({ clientId: cleanId(clientId), clientSecret: clientSecret.trim(), refresh: t.refresh })
      writeToken({ ...t, access: r.access, expires: Date.now() + r.expiresIn * 1000 })
      return r.access
    } catch (e) {
      if (/invalid_grant/.test((e as Error).message)) { signOut(); throw new Error('Google sign-in has expired. Sign in again.') }
      throw e
    }
  }
  signOut()
  throw new Error('Google sign-in has expired. Sign in again.')
}

// --- website sign-in: a popup to Google that comes back to this page with the token in the address

const CHANNEL = 'apana-youtube-auth'

/** Runs in the popup when Google sends it back here. Returns true when this page was that popup. */
export function finishWebSignIn() {
  const hash = new URLSearchParams(location.hash.slice(1))
  const state = hash.get('state')
  if (!state?.startsWith('yt-') || !(hash.has('access_token') || hash.has('error'))) return false
  const bc = new BroadcastChannel(CHANNEL)
  bc.postMessage({ state, access: hash.get('access_token'), expiresIn: Number(hash.get('expires_in') || 3600), error: hash.get('error') })
  bc.close()
  history.replaceState(null, '', location.pathname + location.search)
  document.body.textContent = 'Signed in. You can close this window.'
  setTimeout(() => window.close(), 300)
  return true
}

function webPopup(clientId: string) {
  const state = `yt-${crypto.randomUUID()}`
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId, redirect_uri: webRedirectUri(), response_type: 'token', scope: SCOPE,
    state, include_granted_scopes: 'true', prompt: 'select_account',
  })
  const popup = window.open(url, 'yt-signin', 'width=500,height=650')
  if (!popup) return Promise.reject(new Error('The sign-in window was blocked. Allow pop-ups for this site and try again.'))
  return new Promise<{ access: string; expiresIn: number }>((resolve, reject) => {
    const bc = new BroadcastChannel(CHANNEL)
    const done = () => { bc.close(); clearTimeout(timer) }
    bc.onmessage = (e) => {
      const m = e.data as { state: string; access: string | null; expiresIn: number; error: string | null }
      if (m.state !== state) return
      done()
      if (m.access) resolve({ access: m.access, expiresIn: m.expiresIn })
      else reject(new Error(m.error === 'access_denied' ? 'Sign-in was cancelled.' : `Google sign-in failed (${m.error}).`))
    }
    // popup.closed can't be trusted once Google's page has opened in it, so only time out
    const timer = setTimeout(() => { done(); reject(new Error('Sign-in took too long. Try again.')) }, 5 * 60_000)
  })
}

// --- upload

/** Google API request; the Windows app sends it from the main process (no web CORS rules there). */
async function gfetch(url: string, init: { method: string; headers: Record<string, string>; body?: Uint8Array | string }) {
  if (desktop?.googleFetch) return desktop.googleFetch({ url, ...init })
  const res = await fetch(url, { method: init.method, headers: init.headers, body: init.body as BodyInit | undefined })
  return { status: res.status, location: res.headers.get('location'), range: res.headers.get('range'), text: await res.text() }
}

function apiError(status: number, text: string) {
  let msg = text
  try {
    const j = JSON.parse(text) as { error?: { message?: string; errors?: { reason?: string }[] } }
    const reason = j.error?.errors?.[0]?.reason
    if (reason === 'quotaExceeded' || reason === 'uploadLimitExceeded') return new Error('YouTube daily limit reached. Try again tomorrow.')
    if (reason === 'youtubeSignupRequired') return new Error('This Google account has no YouTube channel yet. Create one on youtube.com first.')
    msg = j.error?.message ?? text
  } catch { /* not JSON */ }
  if (status === 401) { signOut(); return new Error('Google sign-in has expired. Sign in again.') }
  return new Error(`YouTube said: ${msg || status}`)
}

export type Privacy = 'private' | 'unlisted' | 'public'
export interface VideoDetails { title: string; description: string; tags: string[]; privacy: Privacy; kids: boolean }
export class UploadCancelled extends Error { constructor() { super('Upload cancelled') } }

/** 8 MB pieces (YouTube wants multiples of 256 KB), so progress shows and a dropped piece can be resent. */
const CHUNK = 32 * 256 * 1024

/**
 * Uploads the exported video straight from memory with a resumable upload. Returns the video id.
 * The cover, if any, is set as the thumbnail afterwards; that part can fail on its own
 * (custom thumbnails need a verified channel), so it is reported separately.
 */
export async function uploadVideo(
  blob: Blob, details: VideoDetails, cover: Blob | null, onProgress: (p: number) => void, signal: AbortSignal,
): Promise<{ id: string; thumbnail: string | null }> {
  const type = blob.type || 'video/mp4'
  const meta = JSON.stringify({
    snippet: { title: details.title.slice(0, 100) || 'Untitled', description: details.description.slice(0, 5000), tags: details.tags, categoryId: '22' },
    status: { privacyStatus: details.privacy, selfDeclaredMadeForKids: details.kids },
  })
  const start = await gfetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(blob.size),
    },
    body: meta,
  })
  if (start.status !== 200 || !start.location) throw apiError(start.status, start.text)
  const session = start.location

  let sent = 0
  let tries = 0
  let video: { id?: string } | null = null
  onProgress(0)
  while (!video) {
    if (signal.aborted) throw new UploadCancelled()
    const end = Math.min(sent + CHUNK, blob.size)
    let r
    try {
      r = await gfetch(session, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': type, 'Content-Range': `bytes ${sent}-${end - 1}/${blob.size}` },
        body: new Uint8Array(await blob.slice(sent, end).arrayBuffer()),
      })
    } catch (e) {
      // the connection dropped: ask how much arrived and carry on from there
      if (++tries > 5) throw new Error(`Upload stopped: ${(e as Error).message}. Check your internet and try again.`)
      await new Promise((ok) => setTimeout(ok, 2000 * tries))
      r = await gfetch(session, { method: 'PUT', headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Range': `bytes */${blob.size}` } }).catch(() => null)
      if (!r) continue
    }
    if (r.status === 200 || r.status === 201) { video = JSON.parse(r.text); break }
    if (r.status === 308) {
      sent = r.range ? Number(r.range.split('-')[1]) + 1 : 0
      tries = 0
      onProgress(sent / blob.size)
      continue
    }
    if (r.status >= 500 && ++tries <= 5) { await new Promise((ok) => setTimeout(ok, 2000 * tries)); continue }
    throw apiError(r.status, r.text)
  }
  onProgress(1)
  const id = (video as { id?: string }).id
  if (!id) throw new Error('YouTube did not return the video')

  let thumbnail: string | null = null
  if (cover) {
    const t = await gfetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${id}`, {
      method: 'POST', headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': cover.type || 'image/jpeg' },
      body: new Uint8Array(await cover.arrayBuffer()),
    }).catch((e: Error) => ({ status: 0, text: e.message }))
    if (t.status !== 200) thumbnail = /verif|forbidden|permission/i.test(t.text)
      ? 'The cover was not set: custom thumbnails need a verified channel (youtube.com/verify).'
      : `The cover was not set (${apiError(t.status, t.text).message}).`
  }
  return { id, thumbnail }
}
