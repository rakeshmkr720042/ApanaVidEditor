import { useEffect, useRef, useState } from 'react'
import {
  activeLicence, DEFAULT_PLANS, devSettings, FEATURES, LOCK_ON, needsCheck, paymentProvider, proFeatureList, rupees, serverPlans, serverProUntil,
  setDev, setLicence, storedLicence, usePremium, type Feature, type Plan, type PlanId,
} from '../lib/premium'
import { loadPlans, refreshAccount, useAccountState } from '../lib/account'
import { SignInOverlay } from './AuthScreen'
import { SheetClose, Toggle } from '../ui/kit'
import { Icon } from './Icon'
import { t } from '../lib/i18n'

/**
 * The upgrade screen: Free vs Pro, the plans (prices from the server), your plan, Restore. Opened
 * from Home and as the paywall when a locked tool is tapped (`feature` names it). Which features are
 * Pro is the admin's choice. Buying stays off until a payment provider is connected.
 * Seven taps on the version line show the developer switches.
 */

const perLabel = (m: number) => (m === 1 ? 'per month' : m === 3 ? 'for 3 months' : m === 12 ? 'per year' : `for ${m} months`)

/** Price per month, and how much cheaper than paying monthly. */
function value(p: Plan, monthly: Plan | undefined) {
  const per = Math.round(p.price / p.durationMonths)
  const save = monthly && p.durationMonths > 1 ? Math.round((1 - per / monthly.price) * 100) : 0
  return { per, save }
}
export function PremiumSheet({ feature, onClose }: { feature?: Feature; onClose: () => void }) {
  const { premium, locked } = usePremium()
  const plans = serverPlans() ?? DEFAULT_PLANS
  const [picked, setPlan] = useState<PlanId | null>(null)
  const plan = picked && plans.some((p) => p.id === picked) ? picked : plans[plans.length - 1]?.id
  const chosen = plans.find((p) => p.id === plan)
  const monthly = plans.find((p) => p.durationMonths === 1)
  const pro = proFeatureList()
  const proUntil = serverProUntil()
  useEffect(() => { loadPlans().catch(() => { /* offline: default prices */ }) }, [])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const taps = useRef(0)
  const dev = devSettings()
  const lic = activeLicence() ?? storedLicence()
  const provider = paymentProvider()
  const signedIn = useAccountState().status === 'in'
  const [signIn, setSignIn] = useState(false)

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setNote(null)
    try { await fn() } catch (e) { setNote((e as Error).message) } finally { setBusy(false) }
  }
  const buy = () => act(async () => { const l = await provider!.buy(plan!); if (l) { setLicence(l); await refreshAccount().catch(() => {}); setNote(t('Thank you! Pro is on.')) } })
  const check = () => act(async () => { await refreshAccount(); setNote(t(serverProUntil() ? 'Pro is on.' : 'Your account is on the Free plan.')) })
  const restore = () => act(async () => {
    const l = await provider!.restore()
    if (l) { setLicence(l); setNote(t('Premium restored.')) } else setNote(t('No earlier purchase found for this account.'))
  })
  const tapVersion = () => { if (++taps.current >= 7 && !dev.dev) { setDev({ dev: true }); setNote(t('Developer switches are on.')) } }

  return (
    <>
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet premium" onClick={(e) => e.stopPropagation()} data-testid="premium-sheet">
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} />
        <h2><Icon name="crown" size={20} /> {t(premium ? 'You have Pro' : 'Apna Editor Pro')}</h2>
        {feature && !premium && <p className="premium-why"><b>{t(FEATURES[feature].label)}</b> {t('is a Pro feature.')}</p>}
        {!locked && !premium && <p className="muted small">{t('Right now every feature is free for everyone.')}</p>}
        {premium && proUntil && <p className="muted small" data-testid="pro-until">{t('Pro until')} {new Date(proUntil).toLocaleDateString()}</p>}
        {premium && !proUntil && lic && (
          <p className="muted small">
            {t(plans.find((p) => p.id === lic.plan)?.planName ?? 'Pro')} · {t('renews or ends on')} {new Date(lic.until).toLocaleDateString()}
            {needsCheck() && <> · {t('connect to the internet soon so we can check your plan')}</>}
          </p>
        )}
        <div className="tier-compare">
          <div className="tier">
            <b>{t('Free Forever')} · ₹0</b>
            <small className="muted">{t('Basic editing, tracks, text, music, filters, captions, recording, compress, unlimited projects on this device.')}</small>
            {pro.includes('nomark') && <small className="muted">{t('Exports carry the Apna Editor mark.')}</small>}
            <small className="muted">{t('No account needed. Shows ads.')}</small>
          </div>
          <div className="tier pro">
            <b>{t('Pro')}</b>
            <small className="muted" data-testid="pro-noads">{t('No ads, on every device you sign in on.')}</small>
            {pro.length ? (
              <ul className="premium-list" data-testid="pro-features">
                {pro.map((f) => (
                  <li key={f} className={f === feature ? 'on' : ''}><Icon name="crown" size={14} /><span><b>{t(FEATURES[f].label)}</b><small>{t(FEATURES[f].info)}</small></span></li>
                ))}
              </ul>
            ) : <small className="muted">{t('Every feature is in the Free plan right now.')}</small>}
          </div>
        </div>
        {!premium && plans.length > 0 && (
          <>
            <div className="plans" data-testid="plans">
              {plans.map((p) => {
                const v = value(p, monthly)
                return (
                  <button key={p.id} className={`plan${plan === p.id ? ' on' : ''}`} onClick={() => setPlan(p.id)} data-testid={`plan-${p.id}`}>
                    <b>{t(p.planName)}</b><span className="price">{rupees(p.price)}</span><small>{t(perLabel(p.durationMonths))}</small>
                    {p.durationMonths > 1 && <small>{rupees(v.per)}/{t('month')}</small>}
                    {v.save > 0 && <i>{v.save}% {t('cheaper')}</i>}
                  </button>
                )
              })}
            </div>
            <p className="muted small">{t('Every Pro plan unlocks the same features.')}</p>
            {signedIn ? (
              <button className="btn primary wide" disabled={!provider || busy || !chosen} onClick={buy}>
                {t('Subscribe')}{chosen && <> · {rupees(chosen.price)}</>}
              </button>
            ) : (
              <button className="btn primary wide" onClick={() => setSignIn(true)} data-testid="pro-signin">
                {t('Sign in to get Pro')}
              </button>
            )}
            {!provider && <p className="muted small" data-testid="no-payments">{t('Payments are not switched on yet. You will be able to subscribe here soon.')}</p>}
          </>
        )}
        {signedIn
          ? <button className="btn small ghost" disabled={busy} onClick={check} data-testid="pro-check">{t('Check my plan again')}</button>
          : <button className="btn small ghost" onClick={() => setSignIn(true)} data-testid="pro-restore-signin">{t('Already have Pro? Sign in')}</button>}
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
    {signIn && <SignInOverlay onClose={() => setSignIn(false)} />}
    </>
  )
}
