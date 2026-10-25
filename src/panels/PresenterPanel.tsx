import { useEffect, useRef, useState } from 'react'
import type { Presenter, PresenterProfile } from '../types'
import type { Editor } from '../model/useEditor'
import { defaultPresenter, hasProfile, photoToDataUrl, PRESENTER_THEMES, presenterTimes, saveProfile } from '../engine/presenter'
import { fmtTime } from '../lib/format'
import { Chips, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

/**
 * Presenter profile: the user's name, qualification and experience, kept on the device for every project,
 * shown as a news-style name banner at the start, every few minutes and at the end of this video.
 */
export function PresenterPanel({ ed, onSeek, onClose }: { ed: Editor; onSeek: (t: number) => void; onClose: () => void }) {
  const pr: Presenter = ed.project.presenter ?? defaultPresenter()
  const set = ed.setPresenter
  const total = ed.layout.total
  const [tab, setTab] = useState(hasProfile(pr.profile) ? 'look' : 'profile')
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const times = presenterTimes(pr, total)

  // opening the panel turns the banner on (with the profile saved on this device), and shows where it is
  useEffect(() => {
    if (!ed.project.presenter) set({ enabled: true })
    const first = presenterTimes(ed.project.presenter ?? defaultPresenter(), total)[0]
    if (first !== undefined) onSeek(first + 1.5)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setProfile = (patch: Partial<PresenterProfile>) => {
    const profile = { ...pr.profile, ...patch }
    saveProfile(profile)
    set({ profile })
  }

  const pickPhoto = async (f: File) => {
    setError(null)
    try {
      setProfile({ photo: await photoToDataUrl(f) })
    } catch {
      setError(t('Could not open this photo. Try a JPG or PNG.'))
    }
  }

  const live = { onStart: ed.begin, onEnd: ed.end }
  const field = (key: 'name' | 'qualification' | 'experience' | 'extra', label: string, hint: string) => (
    <label className="pr-field">
      <span className="field-label">{t(label)}</span>
      <input className="text-input" value={pr.profile[key]} placeholder={t(hint)} onChange={(e) => setProfile({ [key]: e.target.value })} />
    </label>
  )

  return (
    <Panel title="Presenter profile" onClose={onClose} tall>
      <Toggle label="Show my profile in this video" value={pr.enabled} onChange={(enabled) => set({ enabled })} />
      <Chips options={[{ value: 'profile', label: 'Profile' }, { value: 'look', label: 'Look' }, { value: 'when', label: 'When' }]} value={tab} onChange={setTab} />

      {tab === 'profile' && (
        <>
          <div className="wm-logo">
            {pr.profile.photo ? <img className="pr-photo" src={pr.profile.photo} alt="" /> : <div className="wm-logo-empty pr-photo">{t('No photo')}</div>}
            <button className="btn small" onClick={() => fileInput.current?.click()}>{pr.profile.photo ? t('Change photo') : t('Add photo / logo')}</button>
            {pr.profile.photo && <button className="btn small" onClick={() => setProfile({ photo: null })}>{t('Remove')}</button>}
          </div>
          {error && <p className="error-text">{error}</p>}
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPhoto(f); e.target.value = '' }} />
          {field('name', 'Name', 'e.g. Dr. Rakesh Kumar')}
          {field('qualification', 'Qualification', 'e.g. MBBS, MD')}
          {field('experience', 'Experience', 'e.g. 10 years experience')}
          {field('extra', 'Tag (optional)', 'e.g. Expert, Guest, channel name')}
          <p className="muted small">{t('Saved on this device and used in every project. Hindi works too.')}</p>
        </>
      )}

      {tab === 'look' && (
        <>
          <span className="field-label">{t('Design')}</span>
          <Chips options={[{ value: 'lower', label: 'News strip' }, { value: 'card', label: 'Corner card' }, { value: 'full', label: 'Full screen' }]}
            value={pr.style} onChange={(style) => set({ style })} />
          <span className="field-label">{t('Colours')}</span>
          <div className="pr-themes">
            {PRESENTER_THEMES.map((th) => (
              <button key={th.id} className={pr.theme === th.id ? 'on' : ''} onClick={() => set({ theme: th.id })} aria-label={th.label}>
                <i style={{ background: th.accent }} /><b style={{ background: th.main }} /><b style={{ background: th.sub }} />
                <small>{t(th.label)}</small>
              </button>
            ))}
          </div>
          <Slider label="Duration" min={2} max={15} step={0.5} value={pr.duration} format={(v) => `${v} s`} {...live} onChange={(duration) => set({ duration })} />
        </>
      )}

      {tab === 'when' && (
        <>
          <div className="row-toggles">
            <Toggle label="At the start" value={pr.atStart} onChange={(atStart) => set({ atStart })} />
            <Toggle label="At the end" value={pr.atEnd} onChange={(atEnd) => set({ atEnd })} />
          </div>
          <Slider label="Repeat every" min={0} max={30} step={1} value={pr.every} format={(v) => (v ? `${v} min` : t('Off'))} {...live} onChange={(every) => set({ every })} />
          <p className="muted small">{t('Repeats in the middle are skipped when the video is too short for them.')}</p>
        </>
      )}

      <span className="field-label">{t('Shows at')}</span>
      {!hasProfile(pr.profile) ? (
        <p className="muted small">{t('Fill in your name in Profile first.')}</p>
      ) : times.length && pr.enabled ? (
        <div className="chips wrap">
          {times.map((s) => <button key={s} onClick={() => onSeek(s + Math.min(1.5, pr.duration / 2))}>{fmtTime(s)}</button>)}
        </div>
      ) : (
        <p className="muted small">{t('Not shown. Turn on start, end or repeat.')}</p>
      )}
    </Panel>
  )
}
