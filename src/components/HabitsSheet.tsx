import { useState } from 'react'
import { allHabits, describe, forgetAll, habitSettings, isNew, KIND_LABEL, MIN_SAMPLES, pauseHabit, setHabitSettings, useHabitsVersion } from '../lib/habits'
import { Chips, SheetClose, Toggle } from '../ui/kit'
import { Icon } from './Icon'
import { t } from '../lib/i18n'

/** Settings for Smart shortcuts: on/off, how often counts as a habit, what was learned (pause each), forget all. */
export function HabitsSheet({ onClose }: { onClose: () => void }) {
  useHabitsVersion()
  const s = habitSettings()
  const { looks, steps } = allHabits()
  const forget = () => { if (confirm(t('Forget everything Smart shortcuts has learned?'))) forgetAll() }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet habits" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} />
        <h2>{t('Smart shortcuts')}</h2>
        <p className="muted small">{t('The editor notices what you do again and again (the same filter, noise removal, volume, text style, place on screen, the same next tool) and offers it as one tap. It learns only on this device; nothing is sent anywhere.')}</p>
        <Toggle label="Learn my habits and suggest shortcuts" value={s.on} onChange={(on) => setHabitSettings({ on })} />
        <span className="field-label">{t('Suggest when I repeat something')}</span>
        <Chips options={[{ value: 0.7, label: '70%' }, { value: 0.8, label: '80%' }, { value: 0.9, label: '90%' }]} value={s.threshold}
          onChange={(threshold) => setHabitSettings({ threshold })} />
        <p className="muted small">{`${t('of the time, and at least')} ${MIN_SAMPLES} ${t('times')}. ${t('"Not now" three times in a row pauses that suggestion.')}`}</p>
        <h3>{t('What it has learned')}</h3>
        {!looks.length && !steps.length && <p className="muted small">{t('Nothing yet. Keep editing; habits show up here once you repeat something.')}</p>}
        <ul className="habit-list">
          {looks.map((h) => (
            <li key={h.id} className={h.paused ? 'paused' : ''}>
              <span><b>{t(describe(h))}</b><small>{t(KIND_LABEL[h.kind])} · {Math.round(h.share * 100)}% ({h.count}/{h.of})</small></span>
              <button className="btn small" onClick={() => pauseHabit(h.id, !h.paused)}>{t(h.paused ? 'Allow again' : "Don't suggest")}</button>
            </li>
          ))}
          {steps.map((n) => (
            <li key={n.id} className={n.paused ? 'paused' : ''}>
              <span><b>{t(n.after)} → {t(n.label)}</b><small>{t('Next step')} · {Math.round(n.share * 100)}% ({n.count}/{n.of})</small></span>
              <button className="btn small" onClick={() => pauseHabit(n.id, !n.paused)}>{t(n.paused ? 'Allow again' : "Don't suggest")}</button>
            </li>
          ))}
        </ul>
        <div className="row">
          <button className="btn" onClick={forget}><Icon name="trash" size={16} /> {t('Forget everything')}</button>
          <button className="btn primary" onClick={onClose}>{t('Done')}</button>
        </div>
      </div>
    </div>
  )
}

/** The one-tap suggestion above the toolbar: what it would do, Apply, Not now, and the settings. */
export function HabitBar(p: { text: string; action: string; onApply: () => void; onNotNow: () => void; onSettings: () => void }) {
  const [first] = useState(isNew)
  return (
    <div className="habit-bar" role="status">
      <Icon name="habit" size={18} />
      <span>
        {p.text}
        {first && <small>{t('Learned from what you repeat, on this device only')}</small>}
      </span>
      <button className="btn small primary" onClick={p.onApply}>{t(p.action)}</button>
      <button className="btn small" onClick={p.onNotNow}>{t('Not now')}</button>
      <button className="icon-btn" onClick={p.onSettings} aria-label={t('Smart shortcuts')} title={t('Smart shortcuts')}><Icon name="adjust" size={18} /></button>
    </div>
  )
}
