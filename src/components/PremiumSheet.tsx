import { useRef, useState } from 'react'
import {
  activeLicence, devSettings, FEATURES, LOCK_ON, needsCheck, paymentProvider, PLANS, setDev, setLicence, storedLicence, usePremium,
  type Feature, type PlanId,
} from '../lib/premium'
import { SheetClose, Toggle } from '../ui/kit'
import { Icon } from './Icon'
import { t } from '../lib/i18n'

/**
 * Plans, what Premium unlocks, your subscription, Restore. Opened from Home ("Premium") and as the
 * paywall when a locked tool is tapped (`feature` names it). Buying stays off until a payment
 * provider is connected. Seven taps on the version line show the developer switches.
 */
export function PremiumSheet({ feature, onClose }: { feature?: Feature; onClose: () => void }) {
  const { premium, locked } = usePremium()
  const [plan, setPlan] = useState<PlanId>('yearly')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const taps = useRef(0)
  const dev = devSettings()
  const lic = activeLicence() ?? storedLicence()
  const provider = paymentProvider()

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setNote(null)
    try { await fn() } catch (e) { setNote((e as Error).message) } finally { setBusy(false) }
  }
  const buy = () => act(async () => { const l = await provider!.buy(plan); if (l) { setLicence(l); setNote(t('Thank you! Premium is on.')) } })
  const restore = () => act(async () => {
    const l = await provider!.restore()
    if (l) { setLicence(l); setNote(t('Premium restored.')) } else setNote(t('No earlier purchase found for this account.'))
  })
  const tapVersion = () => { if (++taps.current >= 7 && !dev.dev) { setDev({ dev: true }); setNote(t('Developer switches are on.')) } }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet premium" onClick={(e) => e.stopPropagation()} data-testid="premium-sheet">
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} />
        <h2><Icon name="crown" size={20} /> {t(premium ? 'You have Premium' : 'Apna Editor Premium')}</h2>
        {feature && !premium && <p className="premium-why"><b>{t(FEATURES[feature].label)}</b> {t('is a Premium feature.')}</p>}
        {!locked && !premium && <p className="muted small">{t('Right now every feature is free for everyone.')}</p>}
        {premium && lic && (
          <p className="muted small">
            {t(lic.plan === 'yearly' ? 'Yearly' : 'Monthly')} · {t('renews or ends on')} {new Date(lic.until).toLocaleDateString()}
            {needsCheck() && <> · {t('connect to the internet soon so we can check your plan')}</>}
          </p>
        )}
        <ul className="premium-list">
          {(Object.keys(FEATURES) as Feature[]).map((f) => (
            <li key={f} className={f === feature ? 'on' : ''}><Icon name="crown" size={14} /><span><b>{t(FEATURES[f].label)}</b><small>{t(FEATURES[f].info)}</small></span></li>
          ))}
        </ul>
        <p className="muted small">{t('Free forever: editing, tracks, text, music, filters, captions, recording, compress, and export up to 1080p.')}</p>
        {!premium && (
          <>
            <div className="plans">
              {PLANS.map((p) => (
                <button key={p.id} className={`plan${plan === p.id ? ' on' : ''}`} onClick={() => setPlan(p.id)}>
                  <b>{t(p.label)}</b><span className="price">{p.price}</span><small>{t(p.per)}</small>{p.note && <i>{t(p.note)}</i>}
                </button>
              ))}
            </div>
            <button className="btn primary wide" disabled={!provider || busy} onClick={buy}>
              {t('Subscribe')} · {PLANS.find((p) => p.id === plan)!.price}
            </button>
            {!provider && <p className="muted small" data-testid="no-payments">{t('Payments are not switched on yet. You will be able to subscribe here soon.')}</p>}
          </>
        )}
        {provider && (
          <div className="row">
            <button className="btn" disabled={busy} onClick={restore}>{t('Restore purchase')}</button>
            {premium && lic && <button className="btn" onClick={() => provider.manage()}>{t('Manage or cancel')}</button>}
          </div>
        )}
        {note && <p className="muted small" role="status">{note}</p>}
        {dev.dev && (
          <div className="dev-box">
            <span className="field-label">{t('Developer switches (this device only)')}</span>
            {!LOCK_ON && <Toggle label="Preview the Premium lock" value={dev.devLock} onChange={(devLock) => setDev({ devLock })} />}
            {import.meta.env.DEV && <Toggle label="Pretend I have Premium" value={dev.devPremium} onChange={(devPremium) => setDev({ devPremium })} />}
            <button className="btn small" onClick={() => setDev({ dev: false, devLock: false, devPremium: false })}>{t('Hide developer switches')}</button>
          </div>
        )}
        <p className="muted small version" onClick={tapVersion}>Apna Editor {__APP_VERSION__}</p>
        <button className="btn wide ghost" onClick={onClose}>{t('Close')}</button>
      </div>
    </div>
  )
}
