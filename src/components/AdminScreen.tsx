import { useCallback, useEffect, useState } from 'react'
import type { QueryDocumentSnapshot } from 'firebase/firestore/lite'
import {
  listAllPlans, listEvents, listUsers, loadEntitlements, saveEntitlements, savePlan, setUserPro, setUserStatus, useIsAdmin,
  type AdminEvent, type AdminPlan, type AdminUser, type Entitlements,
} from '../lib/admin'
import { FEATURES, rupees, type Feature } from '../lib/premium'
import { Chips, Toggle } from '../ui/kit'
import { Icon } from './Icon'
import { firebaseAuth } from '../lib/firebase'
import { t } from '../lib/i18n'

/**
 * Admin screen (#admin): users, plans and prices, which features are Pro, and the change history.
 * Shown only to the admin account; the Firestore rules refuse these changes for anyone else and
 * record every change with who made it.
 */

type Tab = 'users' | 'plans' | 'features' | 'history'

const msg = (e: unknown) => {
  const code = (e as { code?: string }).code ?? ''
  if (code.includes('permission-denied')) return t('Not allowed. Only the admin account can change this.')
  if (code.includes('unavailable')) return t('No internet. Please try again.')
  return t('Something went wrong. Please try again.')
}
const day = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString() : '—')

export function AdminScreen({ onBack }: { onBack: () => void }) {
  const admin = useIsAdmin()
  const [tab, setTab] = useState<Tab>('users')
  return (
    <div className="app home admin" data-testid="admin">
      <header className="top">
        <button className="btn ghost small" onClick={onBack} aria-label={t('Back')}><Icon name="back" size={16} /></button>
        <div className="brand">{t('Admin')}</div>
      </header>
      <main className="home-main admin-main">
        {!admin ? (
          <p className="muted" data-testid="admin-denied">{t('This page is only for the Apna Editor admin.')}</p>
        ) : (
          <>
            <Chips
              value={tab}
              onChange={setTab}
              options={[
                { value: 'users', label: t('Users') },
                { value: 'plans', label: t('Plans & prices') },
                { value: 'features', label: t('Pro features') },
                { value: 'history', label: t('History') },
              ]}
            />
            {tab === 'users' && <UsersTab />}
            {tab === 'plans' && <PlansTab />}
            {tab === 'features' && <FeaturesTab />}
            {tab === 'history' && <HistoryTab />}
          </>
        )}
      </main>
    </div>
  )
}

// ---------- users

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [next, setNext] = useState<QueryDocumentSnapshot | null>(null)
  const [search, setSearch] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pro, setPro] = useState<AdminUser | null>(null)
  const me = useMe()

  const load = useCallback(async (email?: string) => {
    setBusy(true); setNote(null)
    try { const r = await listUsers({ email }); setUsers(r.users); setNext(r.next) } catch (e) { setNote(msg(e)) } finally { setBusy(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const more = async () => {
    setBusy(true)
    try { const r = await listUsers({ after: next }); setUsers([...(users ?? []), ...r.users]); setNext(r.next) } catch (e) { setNote(msg(e)) } finally { setBusy(false) }
  }
  const replace = (u: AdminUser) => setUsers((list) => list?.map((x) => (x.uid === u.uid ? u : x)) ?? null)
  const status = async (u: AdminUser) => {
    const to = u.accountStatus === 'suspended' ? 'active' : 'suspended'
    if (to === 'suspended' && !confirm(`${t('Suspend this account? They will not be able to use the app until you activate it again.')}\n\n${u.email}`)) return
    setBusy(true); setNote(null)
    try { await setUserStatus(u, to); replace({ ...u, accountStatus: to }); setNote(t(to === 'suspended' ? 'Account suspended.' : 'Account active again.')) } catch (e) { setNote(msg(e)) } finally { setBusy(false) }
  }

  return (
    <section className="admin-section">
      <form className="admin-search" onSubmit={(e) => { e.preventDefault(); load(search.trim() || undefined) }}>
        <input type="search" placeholder={t('Find by email')} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="admin-search" />
        <button className="btn small" disabled={busy}>{t('Find')}</button>
        {search && <button type="button" className="btn small ghost" onClick={() => { setSearch(''); load() }}>{t('All')}</button>}
      </form>
      {note && <p className="muted small" role="status" data-testid="admin-note">{note}</p>}
      {users && !users.length && <p className="muted">{t('No users found.')}</p>}
      <div className="admin-list">
        {users?.map((u) => {
          const isPro = !!u.proUntil && u.proUntil > Date.now()
          return (
            <div key={u.uid} className={`admin-user${u.accountStatus !== 'active' ? ' off' : ''}`} data-testid="admin-user">
              <div className="admin-user-info">
                <b>{u.accountStatus === 'deleted' ? t('Deleted account') : u.fullName || '—'}</b>
                <small>{u.email}{u.phoneNumber && ` · ${u.phoneNumber}`}</small>
                <small className="muted">
                  {isPro ? `${t('Pro until')} ${day(u.proUntil)}` : t('Free')}
                  {' · '}{u.accountStatus === 'suspended' ? <span className="admin-bad">{t('Suspended')}</span> : u.accountStatus === 'deleted' ? <span className="admin-bad">{t('Deleted')}</span> : t('Active')}
                  {' · '}{t('Joined')} {day(u.createdAt)}
                </small>
              </div>
              {u.accountStatus !== 'deleted' && <div className="admin-user-actions">
                <button className="btn small" disabled={busy} onClick={() => setPro(u)} data-testid="admin-pro">{t('Pro…')}</button>
                {u.uid !== me && (
                  <button className={`btn small${u.accountStatus === 'suspended' ? '' : ' danger'}`} disabled={busy} onClick={() => status(u)} data-testid="admin-status">
                    {t(u.accountStatus === 'suspended' ? 'Activate' : 'Suspend')}
                  </button>
                )}
              </div>}
            </div>
          )
        })}
      </div>
      {next && <button className="btn wide ghost" disabled={busy} onClick={more}>{t('Show more')}</button>}
      {pro && <ProDialog user={pro} onClose={() => setPro(null)} onDone={(u, n) => { replace(u); setNote(n); setPro(null) }} />}
    </section>
  )
}

const useMe = () => firebaseAuth().currentUser?.uid ?? null

const GRANTS: { months: number; plan: string; label: string }[] = [
  { months: 1, plan: 'monthly', label: '1 month' },
  { months: 3, plan: 'quarterly', label: '3 months' },
  { months: 12, plan: 'annual', label: '12 months' },
]

/** Give Pro by hand (a tester, a refund, a friend) or take it away. Counts from today or from the current end date. */
function ProDialog({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: (u: AdminUser, note: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const from = user.proUntil && user.proUntil > Date.now() ? user.proUntil : Date.now()
  const give = async (months: number, plan: string) => {
    const d = new Date(from); d.setMonth(d.getMonth() + months)
    setBusy(true); setErr(null)
    try { await setUserPro(user, d.getTime(), plan); onDone({ ...user, proUntil: d.getTime(), planId: plan }, `${t('Pro given until')} ${day(d.getTime())}`) } catch (e) { setErr(msg(e)) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!confirm(t('Take Pro away from this account now?'))) return
    setBusy(true); setErr(null)
    try { await setUserPro(user, null, 'free'); onDone({ ...user, proUntil: null, planId: 'free' }, t('Pro removed.')) } catch (e) { setErr(msg(e)) } finally { setBusy(false) }
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} data-testid="admin-pro-sheet">
        <div className="sheet-grab" />
        <h2>{t('Pro for')} {user.fullName || user.email}</h2>
        <p className="muted small">{user.proUntil && user.proUntil > Date.now() ? `${t('Pro until')} ${day(user.proUntil)}. ${t('Adding time counts from that date.')}` : t('On the Free plan. Adding time counts from today.')}</p>
        <div className="row">
          {GRANTS.map((g) => <button key={g.plan} className="btn" disabled={busy} onClick={() => give(g.months, g.plan)} data-testid={`admin-give-${g.months}`}>+ {t(g.label)}</button>)}
        </div>
        {user.proUntil && <button className="btn danger wide" disabled={busy} onClick={remove} data-testid="admin-remove-pro">{t('Remove Pro')}</button>}
        {err && <p className="auth-alert" role="alert">{err}</p>}
        <p className="muted small">{t('No payment is made. The change is saved in History with your name.')}</p>
        <button className="btn wide ghost" onClick={onClose}>{t('Close')}</button>
      </div>
    </div>
  )
}

// ---------- plans

function PlansTab() {
  const [plans, setPlans] = useState<AdminPlan[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => { listAllPlans().then(setPlans).catch((e) => setNote(msg(e))) }, [])
  return (
    <section className="admin-section">
      <p className="muted small">{t('Prices are in rupees. A change shows in the app the next time someone opens the plans. On Android, Google Play shows the price set in Play Console.')}</p>
      {note && <p className="muted small" role="status">{note}</p>}
      {plans?.map((p) => <PlanCard key={p.id} plan={p} onSaved={(np) => setPlans((l) => l?.map((x) => (x.id === np.id ? np : x)) ?? null)} />)}
    </section>
  )
}

function PlanCard({ plan, onSaved }: { plan: AdminPlan; onSaved: (p: AdminPlan) => void }) {
  const [name, setName] = useState(plan.planName)
  const [price, setPrice] = useState(String(plan.price / 100))
  const [active, setActive] = useState(plan.isActive)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const free = plan.id === 'free'
  const paise = Math.round(Number(price) * 100)
  const bad = !name.trim() || name.trim().length > 40 || !Number.isFinite(paise) || (free ? paise !== 0 : paise < 100 || paise > 10000000)
  const changed = name.trim() !== plan.planName || paise !== plan.price || active !== plan.isActive
  const save = async () => {
    setBusy(true); setNote(null)
    const after = { planName: name.trim(), price: paise, isActive: active }
    try { await savePlan(plan, after); onSaved({ ...plan, ...after }); setNote(t('Saved.')) } catch (e) { setNote(msg(e)) } finally { setBusy(false) }
  }
  return (
    <div className="admin-plan" data-testid={`admin-plan-${plan.id}`}>
      <div className="admin-plan-head">
        <b>{plan.planName}</b>
        <small className="muted">{free ? t('forever') : plan.durationMonths === 1 ? t('1 month') : `${plan.durationMonths} ${t('months')}`} · {rupees(plan.price)}</small>
      </div>
      <label className="auth-field"><span>{t('Name')}</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
      {!free && (
        <label className="auth-field"><span>{t('Price (₹)')}</span>
          <input type="number" inputMode="decimal" min={1} step={1} value={price} onChange={(e) => setPrice(e.target.value)} data-testid="admin-price" aria-invalid={bad} />
        </label>
      )}
      {!free && <Toggle label={t('Show this plan to users')} value={active} onChange={setActive} />}
      <div className="row">
        <button className="btn small primary" disabled={busy || bad || !changed} onClick={save} data-testid="admin-plan-save">{t('Save')}</button>
        {note && <small className="muted" role="status">{note}</small>}
      </div>
    </div>
  )
}

// ---------- features

function FeaturesTab() {
  const [ent, setEnt] = useState<Entitlements | null>(null)
  const [saved, setSaved] = useState<Entitlements | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => { loadEntitlements().then((e) => { setEnt(e); setSaved(e) }).catch((e) => setNote(msg(e))) }, [])
  if (!ent || !saved) return <section className="admin-section">{note && <p className="muted">{note}</p>}</section>
  const flip = (f: Feature) => setEnt({ ...ent, proFeatures: ent.proFeatures.includes(f) ? ent.proFeatures.filter((x) => x !== f) : [...ent.proFeatures, f] })
  const changed = JSON.stringify([...ent.proFeatures].sort()) !== JSON.stringify([...saved.proFeatures].sort()) || ent.trialDays !== saved.trialDays
  const save = async () => {
    setBusy(true); setNote(null)
    // keep the list in the app's order
    const next = { ...ent, proFeatures: (Object.keys(FEATURES) as Feature[]).filter((f) => ent.proFeatures.includes(f)) }
    try { await saveEntitlements(saved, next); setSaved(next); setEnt(next); setNote(t('Saved. Users get the new list the next time they open the app.')) } catch (e) { setNote(msg(e)) } finally { setBusy(false) }
  }
  return (
    <section className="admin-section">
      <p className="muted small">{t('Ticked features need Pro. Unticked features are free for everyone.')}</p>
      <div className="admin-features">
        {(Object.keys(FEATURES) as Feature[]).map((f) => (
          <label key={f} className="admin-feature" data-testid={`admin-feature-${f}`}>
            <input type="checkbox" checked={ent.proFeatures.includes(f)} onChange={() => flip(f)} />
            <span><b>{t(FEATURES[f].label)}</b><small className="muted">{t(FEATURES[f].info)}</small></span>
          </label>
        ))}
      </div>
      <label className="admin-trial">
        <span><b>{t('Free trial for new accounts')}</b><small className="muted">{t('All Pro features (ads stay) for this many days after the first sign-in. Once per email. Changes apply to trials that start later.')}</small></span>
        <select value={ent.trialDays} onChange={(e) => setEnt({ ...ent, trialDays: Number(e.target.value) })} data-testid="admin-trial-days">
          {[0, 7, 15, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d === 0 ? t('No trial') : `${d} ${t('days')}`}</option>)}
        </select>
      </label>
      <button className="btn primary wide" disabled={busy || !changed} onClick={save} data-testid="admin-features-save">{t('Save')}</button>
      {note && <p className="muted small" role="status">{note}</p>}
    </section>
  )
}

// ---------- history

const EVENT_LABEL: Record<string, string> = {
  plan_change: 'Plan changed', entitlements_change: 'Pro features changed', user_suspend: 'Account suspended',
  user_activate: 'Account activated', pro_grant: 'Pro given', pro_remove: 'Pro removed', role_change: 'Admin role given',
}

function HistoryTab() {
  const [events, setEvents] = useState<AdminEvent[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => { listEvents().then(setEvents).catch((e) => setNote(msg(e))) }, [])
  const describe = (e: AdminEvent) => {
    const d = e.details as Record<string, unknown>
    if (typeof d.email === 'string') return d.email + (typeof d.until === 'string' ? ` → ${day(Date.parse(d.until))}` : '')
    if (e.type === 'plan_change' && d.after) return `${String(d.plan)}: ${Object.entries(d.after as Record<string, unknown>).map(([k, v]) => `${k} ${k === 'price' ? rupees(Number(v)) : String(v)}`).join(', ')}`
    if (e.type === 'entitlements_change' && d.after) {
      const a = d.after as { proFeatures?: string[]; trialDays?: number }
      const list = (a.proFeatures ?? []).map((f) => t(FEATURES[f as Feature]?.label ?? f)).join(', ') || t('none')
      return typeof a.trialDays === 'number' ? `${list} · ${t('Free trial')}: ${a.trialDays} ${t('days')}` : list
    }
    return e.target
  }
  return (
    <section className="admin-section">
      {note && <p className="muted">{note}</p>}
      {events && !events.length && <p className="muted">{t('No changes yet.')}</p>}
      <div className="admin-list">
        {events?.map((e) => (
          <div key={e.id} className="admin-event" data-testid="admin-event">
            <b>{t(EVENT_LABEL[e.type] ?? e.type)}</b>
            <small>{describe(e)}</small>
            <small className="muted">{e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}{e.actorEmail && ` · ${e.actorEmail}`}</small>
          </div>
        ))}
      </div>
    </section>
  )
}
