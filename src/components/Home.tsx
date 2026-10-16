import { useEffect, useState } from 'react'
import { deleteProject, listProjects, storageEstimate, type ProjectRecord } from '../lib/db'
import { createProject } from '../lib/newProject'
import { fmtTime } from '../lib/format'
import { isCoreCached, prefetchCore } from '../lib/ffmpeg'
import { prefetchFonts } from '../engine/text'
import { getLang, setLang, t } from '../lib/i18n'
import { Icon } from './Icon'

export function Home({ onOpen, onLang }: { onOpen: (id: string) => void; onLang: () => void }) {
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null)
  const [offline, setOffline] = useState<'unknown' | 'ready' | 'downloading' | 'no'>('unknown')
  const [usage, setUsage] = useState<string | null>(null)

  const refresh = () => listProjects().then(setProjects).catch(() => setProjects([]))
  useEffect(() => {
    refresh()
    isCoreCached().then((ok) => setOffline(ok ? 'ready' : 'no'))
    storageEstimate().then((e) => e?.usage != null && setUsage(`${(e.usage / 1048576).toFixed(0)} MB`))
  }, [])

  const create = async () => onOpen(await createProject())

  const remove = async (p: ProjectRecord) => {
    if (!confirm(`${t('Delete')} "${p.name}"?`)) return
    await deleteProject(p.id)
    refresh()
  }

  const getOffline = async () => {
    setOffline('downloading')
    try { await Promise.all([prefetchCore(), prefetchFonts()]); setOffline((await isCoreCached()) ? 'ready' : 'no') } catch { setOffline('no') }
  }

  return (
    <div className="app home">
      <header className="top">
        <div className="brand"><span className="logo"><Icon name="play" size={16} /></span> ApanaVidEditor</div>
        <div className="top-actions">
          <button className="btn ghost small" onClick={() => { setLang(getLang() === 'hi' ? 'en' : 'hi'); onLang() }}>{getLang() === 'hi' ? 'English' : 'हिंदी'}</button>
        </div>
      </header>
      <main className="home-main">
        <button className="new-project" onClick={create}>
          <Icon name="plus" size={30} />
          <span>{t('New project')}</span>
        </button>
        <div className="offline-row">
          {offline === 'no' && <button className="btn small" onClick={getOffline}><Icon name="download" size={16} /> {t('Get offline pack')} <span className="muted">~33 MB</span></button>}
          {offline === 'downloading' && <span className="muted small">{t('Downloading…')}</span>}
          {offline === 'ready' && <span className="badge">✓ {t('Offline ready')}</span>}
          {usage && <span className="muted small">{t('Storage used')}: {usage}</span>}
        </div>
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
      </main>
    </div>
  )
}
