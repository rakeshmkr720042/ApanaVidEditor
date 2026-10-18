import { useRef, useState } from 'react'
import { desktop } from '../lib/desktop'
import {
  getYouTube, isSignedIn, setYouTube, signIn, signOut, uploadVideo, UploadCancelled, webRedirectUri, youTubeMode, type Privacy,
} from '../lib/youtube'
import { Chips, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

interface Props { blob: Blob; cover: Blob | null; title: string; onClose: () => void }

const PRIVACY: { value: Privacy; label: string }[] = [
  { value: 'private', label: 'Private' }, { value: 'unlisted', label: 'Unlisted' }, { value: 'public', label: 'Public' },
]

/** Sends an exported video straight to the user's YouTube channel, without saving it to disk first. */
export function YouTubeSheet({ blob, cover, title: initial, onClose }: Props) {
  const mode = youTubeMode()
  const [cfg, setCfg] = useState(getYouTube)
  const [signedIn, setSignedIn] = useState(isSignedIn)
  const [signing, setSigning] = useState(false)
  const [title, setTitle] = useState(initial)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [privacy, setPrivacy] = useState<Privacy>('private')
  const [kids, setKids] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [done, setDone] = useState<{ id: string; note: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const attempt = useRef(0)
  const save = (patch: Parameters<typeof setYouTube>[0]) => { setCfg(setYouTube(patch)); setSignedIn(isSignedIn()) }

  const login = async () => {
    const n = ++attempt.current
    setSigning(true); setError(null)
    try {
      await signIn()
      if (n === attempt.current) setSignedIn(true)
    } catch (e) {
      if (n === attempt.current) setError((e as Error).message)
    } finally {
      if (n === attempt.current) setSigning(false)
    }
  }
  const cancelLogin = () => { attempt.current++; desktop?.googleCancel?.(); setSigning(false) }

  const upload = async () => {
    setError(null); setDone(null); setProgress(0)
    abort.current = new AbortController()
    try {
      const r = await uploadVideo(blob, {
        title: title.trim(), description, privacy, kids,
        tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
      }, cover, setProgress, abort.current.signal)
      setDone({ id: r.id, note: r.thumbnail })
    } catch (e) {
      if (!(e instanceof UploadCancelled)) setError((e as Error).message)
      setSignedIn(isSignedIn())
    } finally {
      setProgress(null)
    }
  }

  const link = done ? `https://youtu.be/${done.id}` : ''
  const busy = signing || progress !== null

  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet youtube" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h2>{t('Upload to YouTube')} <span className="muted small">{(blob.size / 1048576).toFixed(1)} MB</span></h2>
        {!mode ? (
          <p className="muted small">{t('YouTube upload works in the Windows app and on the website. On the phone, use Share and pick the YouTube app.')}</p>
        ) : progress !== null ? (
          <>
            <div className="progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <p className="muted">{Math.round(progress * 100)}% · {t('keep this screen open')}</p>
            <button className="btn wide" onClick={() => abort.current?.abort()}>{t('Cancel')}</button>
          </>
        ) : done ? (
          <>
            <p className="ok-text">{t('Uploaded to your channel.')}</p>
            <a className="btn primary wide" href={link} target="_blank" rel="noreferrer">{link}</a>
            {done.note && <p className="muted small">{t(done.note)}</p>}
            <p className="muted small">{t('YouTube may take a few minutes to process the video before it can be played.')}</p>
          </>
        ) : !signedIn ? (
          <>
            <p className="muted small">{t('Personal setting: uses the OAuth client ID from your own Google Cloud project. Sign-in stays on this device.')}</p>
            <label className="field-label" htmlFor="yt-id">{t('OAuth client ID')}</label>
            <input id="yt-id" className="text-input" value={cfg.clientId} placeholder="1234-abcd.apps.googleusercontent.com" spellCheck={false}
              onChange={(e) => save({ clientId: e.target.value.trim() })} />
            {mode === 'desktop' && (
              <>
                <label className="field-label" htmlFor="yt-secret">{t('Client secret (Desktop app client)')}</label>
                <input id="yt-secret" className="text-input" type="password" value={cfg.clientSecret} placeholder="GOCSPX-…" spellCheck={false}
                  onChange={(e) => save({ clientSecret: e.target.value.trim() })} />
              </>
            )}
            {mode === 'web' && (
              <p className="muted small">{t('Web application client. Add this under Authorized JavaScript origins and Authorized redirect URIs:')}<br />
                <code>{location.origin}</code><br /><code>{webRedirectUri()}</code></p>
            )}
            <div className="row">
              <button className="btn primary grow" disabled={signing || !cfg.clientId} onClick={login}>{t(signing ? 'Waiting for Google…' : 'Sign in with Google')}</button>
              {signing && <button className="btn" onClick={cancelLogin}>{t('Cancel')}</button>}
            </div>
            {signing && mode === 'desktop' && <p className="muted small">{t('Google sign-in opened in your browser. Allow access there, then come back.')}</p>}
          </>
        ) : (
          <>
            <label className="field-label" htmlFor="yt-title">{t('Title')}</label>
            <input id="yt-title" className="text-input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
            <label className="field-label" htmlFor="yt-desc">{t('Description')}</label>
            <textarea id="yt-desc" className="text-input" rows={3} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
            <label className="field-label" htmlFor="yt-tags">{t('Tags (comma separated)')}</label>
            <input id="yt-tags" className="text-input" value={tags} onChange={(e) => setTags(e.target.value)} />
            <span className="field-label">{t('Visibility')}</span>
            <Chips options={PRIVACY} value={privacy} onChange={setPrivacy} />
            {privacy !== 'private' && (
              <p className="muted small">{t('Until your Google Cloud project passes YouTube\'s API audit, YouTube keeps videos uploaded this way private.')}</p>
            )}
            <Toggle label="Made for kids" value={kids} onChange={setKids} />
            {cover && <p className="muted small">{t('The chosen cover will be set as the thumbnail.')}</p>}
            <button className="btn primary wide" disabled={!title.trim()} onClick={upload}>{t('Upload')}</button>
            <button className="btn wide ghost" onClick={() => { signOut(); setSignedIn(false) }}>{t('Sign out of Google')}</button>
          </>
        )}
        {error && <p className="error-text">{t(error)}</p>}
        {!busy && <button className="btn wide ghost" onClick={onClose}>{t('Close')}</button>}
      </div>
    </div>
  )
}
