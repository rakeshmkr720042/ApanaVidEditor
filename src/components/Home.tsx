import { useEffect, useRef, useState } from 'react'
import { importProjectFile } from '../lib/projectFile'
import { deleteProject, listProjects, storageEstimate, type ProjectRecord } from '../lib/db'
import { createProject } from '../lib/newProject'
import { fmtTime } from '../lib/format'
import { isCoreCached } from '../lib/ffmpeg'
import { isEngineCached } from '../engine/offline'
import { getLang, setLang, t } from '../lib/i18n'
import { Icon } from './Icon'
import { LocalAISheet } from './LocalAISheet'
import { HabitsSheet } from './HabitsSheet'
import { OfflineSheet } from './OfflineSheet'
import { CompressSheet } from './CompressSheet'
import { FeedbackSheet } from './FeedbackSheet'
import { listNotes } from '../lib/feedback'
import { localAI } from '../lib/localai'
import { PremiumSheet } from './PremiumSheet'
import { AccountSheet } from './AccountSheet'
import { ProAd } from './ProAd'
import { hideHomeBanner, showHomeBanner } from '../lib/ads'
import { SignInOverlay } from './AuthScreen'
import { useAccountState } from '../lib/account'
import { usePremium } from '../lib/premium'

export function Home({ onOpen, onLang }: { onOpen: (id: string) => void; onLang: () => void }) {
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null)
  const [offline, setOffline] = useState<'unknown' | 'ready' | 'no'>('unknown')
  const [netSheet, setNetSheet] = useState(false)
  const [usage, setUsage] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [aiSheet, setAiSheet] = useState(false)
  const [habitsSheet, setHabitsSheet] = useState(false)
  const [compress, setCompress] = useState(false)
  const [aiOn, setAiOn] = useState(() => !!localAI())
  const [notesSheet, setNotesSheet] = useState(false)
  const [openNotes, setOpenNotes] = useState(0)
  const [premiumSheet, setPremiumSheet] = useState(false)
  const [accountSheet, setAccountSheet] = useState(false)
  const { premium, paid, trialDays } = usePremium()
  const account = useAccountState()
  // Android, Free plan: a Google banner under Home only (never in the editor).
  useEffect(() => {
    if (paid) { hideHomeBanner(); return }
    showHomeBanner()
    return () => { hideHomeBanner() }
  }, [paid])

  const openFile = async (f: File) => {
    setError(null); setOpening(true)
    try { onOpen(await importProjectFile(f)) } catch (e) { setError((e as Error).message) } finally { setOpening(false) }
  }

  const checkOffline = () => Promise.all([isCoreCached(), isEngineCached()]).then(([a, b]) => setOffline(a && b ? 'ready' : 'no'))
  const refresh = () => listProjects().then(setProjects).catch(() => setProjects([]))
  useEffect(() => {
    refresh()
    checkOffline()
    listNotes().then((l) => setOpenNotes(l.filter((n) => !n.done).length)).catch(() => {})
    storageEstimate().then((e) => e?.usage != null && setUsage(`${(e.usage / 1048576).toFixed(0)} MB`))
  }, [])

  const create = async () => onOpen(await createProject())

  const remove = async (p: ProjectRecord) => {
    if (!confirm(`${t('Delete')} "${p.name}"?`)) return
    await deleteProject(p.id)
    refresh()
  }

  return (
    <div className="app home">
      <header className="top">
        <div className="brand"><span className="logo"><Icon name="play" size={16} /></span> Apna Editor</div>
        <div className="top-actions">
          <button className="btn ghost small notes-btn" onClick={() => setNotesSheet(true)} aria-label={t('Testing notes')}>
            <Icon name="note" size={16} /><span className="wide-only"> {t('Notes')}</span>{openNotes > 0 && <span className="count">{openNotes}</span>}
          </button>
          <button className="btn ghost small" onClick={() => setHabitsSheet(true)} aria-label={t('Smart shortcuts')} title={t('Smart shortcuts')}>
            <Icon name="habit" size={16} /><span className="wide-only"> {t('Shortcuts')}</span>
          </button>
          <button className={`btn ghost small premium-btn${premium ? ' on' : ''}`} onClick={() => setPremiumSheet(true)} aria-label={t('Premium')} title={t('Premium')} data-testid="home-premium">
            <Icon name="crown" size={16} /><span className="wide-only"> {t('Premium')}</span>
          </button>
          <button className="btn ghost small" onClick={() => setAiSheet(true)}>{aiOn ? '✓ ' : ''}{t('Local AI')}</button>
          <button className="btn ghost small" onClick={() => { setLang(getLang() === 'hi' ? 'en' : 'hi'); onLang() }}>{getLang() === 'hi' ? 'English' : 'हिंदी'}</button>
          <button className="btn ghost small" onClick={() => setAccountSheet(true)} aria-label={t('My account')} title={t('My account')} data-testid="home-account">
            <Icon name="user" size={16} /><span className="wide-only"> {t(account.status === 'in' ? 'Account' : 'Sign in')}</span>
          </button>
        </div>
      </header>
      <main className="home-main">
        <button className="new-project" onClick={create}>
          <Icon name="plus" size={30} />
          <span>{t('New project')}</span>
        </button>
        <button className="btn wide" disabled={opening} onClick={() => fileInput.current?.click()}>
          <Icon name="folder" size={18} /> {opening ? t('Opening project…') : t('Open project file (.avp)')}
        </button>
        <button className="btn wide" onClick={() => setCompress(true)} data-testid="home-compress">
          <Icon name="compress" size={18} /> {t('Compress video')}
        </button>
        <input ref={fileInput} type="file" accept=".avp,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = '' }} />
        {error && <p className="error-text">{error}</p>}
        <div className="offline-row">
          <button className="btn small" onClick={() => setNetSheet(true)}>
            {offline === 'ready' ? '✓ ' : <Icon name="download" size={16} />} {t('Offline & online')}
          </button>
          {offline === 'ready' && <span className="badge">✓ {t('Offline ready')}</span>}
          {usage && <span className="muted small">{t('Storage used')}: {usage}</span>}
        </div>
        {trialDays > 0 && (
          <button className={`trial-strip${trialDays <= 5 ? ' ending' : ''}`} onClick={() => setPremiumSheet(true)} data-testid="home-trial">
            <Icon name="crown" size={18} />
            <span><b>{t('Free trial:')} {trialDays} {t(trialDays === 1 ? 'day left' : 'days left')}</b>
              <small>{t(trialDays <= 5 ? 'Your trial ends soon. Subscribe now so nothing gets locked.' : 'Every Pro feature is on for you.')}</small></span>
          </button>
        )}
        <ProAd where="home" />
        <h3>{t('Projects')}</h3>
        {projects && !projects.length && <p className="muted">{t('No projects yet. Tap New project to start editing.')}</p>}
        <div className="project-grid">
          {projects?.map((p) => (
            <div key={p.id} className="project-card" onClick={() => onOpen(p.id)}>
              <div className="project-thumb">{p.thumb ? <img src={p.thumb} alt="" /> : <Icon name="film" size={28} />}<span>{fmtTime(p.duration, false)}</span></div>
              <div className="project-meta">
                <b>{p.name}</b>
                <small className="muted">{new Date(p.updatedAt).toLocaleDateString()}</small>
              </div>
              <button className="icon-btn" onClick={(e) => { e.stopPropagation(); remove(p) }} aria-label="Delete"><Icon name="trash" size={18} /></button>
            </div>
          ))}
        </div>
        <p className="home-foot muted small"><a href="privacy.html" target="_blank" rel="noopener">{t('Privacy policy')}</a></p>
      </main>
      {netSheet && <OfflineSheet onClose={() => { setNetSheet(false); checkOffline() }} />}
      {compress && <CompressSheet onClose={() => setCompress(false)} />}
      {notesSheet && <FeedbackSheet where="Home" onClose={(n) => { setNotesSheet(false); setOpenNotes(n) }} />}
      {premiumSheet && <PremiumSheet onClose={() => setPremiumSheet(false)} />}
      {accountSheet && (account.status === 'in'
        ? <AccountSheet onClose={() => setAccountSheet(false)} onPlans={() => { setAccountSheet(false); setPremiumSheet(true) }} />
        : <SignInOverlay onClose={() => setAccountSheet(false)} />)}
      {habitsSheet && <HabitsSheet onClose={() => setHabitsSheet(false)} />}
      {aiSheet && <LocalAISheet onClose={() => { setAiSheet(false); setAiOn(!!localAI()) }} />}
    </div>
  )
}
