// Firestore Security Rules: what the app may and may not do.
import { test, before, after, beforeEach } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { createHash } from 'node:crypto'
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp, Timestamp, writeBatch, query, orderBy, limit, where } from 'firebase/firestore'

let env
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-test',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host, port: Number(port) },
  })
})
after(() => env.cleanup())

const userDoc = (status = 'active') => ({
  fullName: 'Asha', email: 'asha@example.com', emailLower: 'asha@example.com', phoneNumber: '', photoURL: '',
  role: 'user', accountStatus: status, planId: 'free', proUntil: null, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/alice'), userDoc())
    await setDoc(doc(db, 'users/bob'), userDoc())
    await setDoc(doc(db, 'users/sus'), userDoc('suspended'))
    await setDoc(doc(db, 'subscriptions/free_alice'), { userId: 'alice', planId: 'free', status: 'active' })
    await setDoc(doc(db, 'subscriptions/free_bob'), { userId: 'bob', planId: 'free', status: 'active' })
    await setDoc(doc(db, 'payments/pay_1'), { userId: 'alice', amount: 9900, status: 'success' })
    await setDoc(doc(db, 'subscription_plans/monthly'), { planName: 'Monthly Pro', price: 9900, currency: 'INR', durationMonths: 1, isActive: true, sortOrder: 1, playProductId: 'apna_pro', playBasePlanId: 'monthly' })
    await setDoc(doc(db, 'subscription_plans/free'), { planName: 'Free Forever', price: 0, currency: 'INR', durationMonths: 0, isActive: true, sortOrder: 0, playProductId: null, playBasePlanId: null })
    await setDoc(doc(db, 'config/entitlements'), { proFeatures: ['dub'], freeExportMaxHeight: 1080, freeWatermark: true, offlineGraceDays: 7 })
    await setDoc(doc(db, 'security_events/e1'), { type: 'role_change' })
  })
})

const alice = () => env.authenticatedContext('alice').firestore()
const admin = () => env.authenticatedContext('root', { admin: true, email: 'root@example.com' }).firestore()
const guest = () => env.unauthenticatedContext().firestore()

test('users: owner reads own profile, not someone else', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'users/alice')))
  await assertFails(getDoc(doc(alice(), 'users/bob')))
  await assertFails(getDoc(doc(guest(), 'users/alice')))
})

test('users: owner edits name and phone only', async () => {
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { fullName: 'Asha Rao', phoneNumber: '+919876543210', updatedAt: serverTimestamp() }))
  for (const patch of [{ role: 'admin' }, { planId: 'annual' }, { proUntil: Timestamp.now() }, { accountStatus: 'suspended' }, { email: 'x@y.z' }]) {
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { ...patch, updatedAt: serverTimestamp() }))
  }
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { fullName: 'No timestamp' }))
  await assertFails(updateDoc(doc(alice(), 'users/bob'), { fullName: 'Hacker', updatedAt: serverTimestamp() }))
})

test('users: name and phone are validated', async () => {
  const ref = doc(alice(), 'users/alice')
  await assertFails(updateDoc(ref, { fullName: '', updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(ref, { fullName: 'x'.repeat(81), updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(ref, { phoneNumber: '98765', updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(ref, { phoneNumber: 12345, updatedAt: serverTimestamp() }))
  await assertSucceeds(updateDoc(ref, { phoneNumber: '', updatedAt: serverTimestamp() }))
})

test('users: suspended account cannot edit, nobody deletes profiles', async () => {
  await assertFails(updateDoc(doc(env.authenticatedContext('sus').firestore(), 'users/sus'), { fullName: 'Back', updatedAt: serverTimestamp() }))
  await assertFails(deleteDoc(doc(alice(), 'users/alice')))
})

const wipe = (o = {}) => ({ fullName: '', email: '', emailLower: '', phoneNumber: '', photoURL: '', accountStatus: 'deleted', deletedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...o })

test('users: owner deletes own account by emptying the profile; no way back', async () => {
  await assertFails(updateDoc(doc(alice(), 'users/bob'), wipe()))
  await assertFails(updateDoc(doc(alice(), 'users/alice'), wipe({ fullName: 'Asha' })))
  await assertFails(updateDoc(doc(alice(), 'users/alice'), wipe({ email: 'asha@example.com' })))
  await assertFails(updateDoc(doc(alice(), 'users/alice'), wipe({ planId: 'annual' })))
  await assertFails(updateDoc(doc(alice(), 'users/alice'), wipe({ accountStatus: 'active' })))
  await assertFails(updateDoc(doc(env.authenticatedContext('sus').firestore(), 'users/sus'), wipe()))
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), wipe()))
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { fullName: 'Back', updatedAt: serverTimestamp() }))
  await assertFails(adminChange(admin(), 'users/alice', { accountStatus: 'active' }, 'user_activate'))
  await assertFails(adminChange(admin(), 'users/alice', { accountStatus: 'deleted', proUntil: Timestamp.now(), planId: 'monthly' }, 'pro_grant'))
})

// ---- free trial
const emailKey = (e) => createHash('sha256').update(e.toLowerCase()).digest('hex')
const asha = (claims = {}) => env.authenticatedContext('alice', { email: 'Asha@Example.com', email_verified: true, ...claims }).firestore()
function startTrial(db, { uid = 'alice', key = emailKey('asha@example.com'), days = 30, userPatch = {}, trialDoc = {}, skipTrialDoc = false } = {}) {
  const b = writeBatch(db)
  b.update(doc(db, `users/${uid}`), { trialStartedAt: serverTimestamp(), trialDays: days, updatedAt: serverTimestamp(), ...userPatch })
  if (!skipTrialDoc) b.set(doc(db, `trials/${key}`), { userId: 'alice', startedAt: serverTimestamp(), ...trialDoc })
  return b.commit()
}

test('trial: starts once, with the server time and the admin days, once per email', async () => {
  await assertFails(startTrial(asha({ email_verified: false })), 'email not verified')
  await assertFails(startTrial(asha(), { skipTrialDoc: true }), 'without the per-email record')
  await assertFails(startTrial(asha(), { days: 60 }), 'more days than the admin set')
  await assertFails(startTrial(asha(), { key: emailKey('other@example.com') }), 'someone else\'s email key')
  await assertFails(startTrial(asha(), { userPatch: { trialStartedAt: Timestamp.fromMillis(Date.now() + 9e9) } }), 'a start date from the phone')
  await assertFails(startTrial(asha(), { userPatch: { proUntil: Timestamp.fromMillis(Date.now() + 9e9) } }), 'Pro on the side')
  await assertFails(startTrial(asha(), { trialDoc: { userId: 'bob' } }), 'record for another user')
  await assertSucceeds(startTrial(asha()))
  const u = (await getDoc(doc(asha(), 'users/alice'))).data()
  assert.equal(u.trialDays, 30)
  assert.ok(u.trialStartedAt instanceof Timestamp)
  // never again: not on this account, and not by changing the start or the days
  await assertFails(startTrial(asha()))
  await assertFails(updateDoc(doc(asha(), 'users/alice'), { trialDays: 90, updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(doc(asha(), 'users/alice'), { trialStartedAt: serverTimestamp(), updatedAt: serverTimestamp() }))
  await assertFails(deleteDoc(doc(asha(), `trials/${emailKey('asha@example.com')}`)))
  await assertFails(getDoc(doc(asha(), `trials/${emailKey('asha@example.com')}`)))
  await assertSucceeds(getDoc(doc(admin(), `trials/${emailKey('asha@example.com')}`)))
  // a new account (bob) with the same email: the email already had its trial
  const bobSameEmail = env.authenticatedContext('bob', { email: 'asha@example.com', email_verified: true }).firestore()
  const b = writeBatch(bobSameEmail)
  b.update(doc(bobSameEmail, 'users/bob'), { trialStartedAt: serverTimestamp(), trialDays: 30, updatedAt: serverTimestamp() })
  b.set(doc(bobSameEmail, `trials/${emailKey('asha@example.com')}`), { userId: 'bob', startedAt: serverTimestamp() })
  await assertFails(b.commit())
})

test('trial: suspended accounts get none; the admin sets the days (0 = no trial)', async () => {
  const sus = env.authenticatedContext('sus', { email: 'sus@example.com', email_verified: true }).firestore()
  const b = writeBatch(sus)
  b.update(doc(sus, 'users/sus'), { trialStartedAt: serverTimestamp(), trialDays: 30, updatedAt: serverTimestamp() })
  b.set(doc(sus, `trials/${emailKey('sus@example.com')}`), { userId: 'sus', startedAt: serverTimestamp() })
  await assertFails(b.commit())
  await assertSucceeds(adminChange(admin(), 'config/entitlements', { proFeatures: ['dub'], freeExportMaxHeight: 1080, freeWatermark: true, offlineGraceDays: 7, trialDays: 0 }, 'entitlements_change'))
  await assertFails(startTrial(asha(), { days: 0 }))
  await assertFails(adminChange(admin(), 'config/entitlements', { proFeatures: ['dub'], freeExportMaxHeight: 1080, freeWatermark: true, offlineGraceDays: 7, trialDays: 365 }, 'entitlements_change'))
  await assertSucceeds(adminChange(admin(), 'config/entitlements', { proFeatures: ['dub'], freeExportMaxHeight: 1080, freeWatermark: true, offlineGraceDays: 7, trialDays: 7 }, 'entitlements_change'))
  await assertFails(startTrial(asha(), { days: 30 }))
  await assertSucceeds(startTrial(asha(), { days: 7 }))
})

test('email offers: only the user sets their own choice, with the server time; only admins list it', async () => {
  const set = (db, uid, on, extra = {}) => updateDoc(doc(db, `users/${uid}`), { marketingOptIn: on, marketingOptInAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra })
  await assertFails(set(alice(), 'bob', true), 'someone else')
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { marketingOptIn: true, marketingOptInAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp() }), 'a back-dated consent')
  await assertFails(set(alice(), 'alice', 'yes'), 'not a yes/no')
  await assertFails(set(alice(), 'alice', true, { planId: 'annual' }), 'with other fields')
  await assertFails(set(env.authenticatedContext('sus').firestore(), 'sus', true), 'suspended account')
  await assertSucceeds(set(alice(), 'alice', true))
  await assertSucceeds(set(alice(), 'alice', false))
  await assertSucceeds(set(alice(), 'alice', true))
  // the email list: admins only
  await assertFails(getDocs(query(collection(alice(), 'users'), where('marketingOptIn', '==', true), limit(50))))
  await assertSucceeds(getDocs(query(collection(admin(), 'users'), where('marketingOptIn', '==', true), limit(50))))
  await assertSucceeds(addDoc(collection(admin(), 'security_events'), { type: 'users_export', actorUid: 'root', actorEmail: 'root@example.com', targetUid: null, target: 'users', details: { list: 'consent', count: 1 }, createdAt: serverTimestamp() }))
  await assertFails(addDoc(collection(alice(), 'security_events'), { type: 'users_export', actorUid: 'alice', actorEmail: 'asha@example.com', targetUid: null, target: 'users', details: {}, createdAt: serverTimestamp() }))
  // deleting the account turns emails off; a deleted account cannot keep them on
  await assertFails(updateDoc(doc(alice(), 'users/alice'), wipe({ marketingOptIn: true })))
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), wipe({ marketingOptIn: false })))
  await assertFails(set(alice(), 'alice', true))
})

test('payments: a user lists only their own', async () => {
  await assertSucceeds(getDocs(query(collection(alice(), 'payments'), where('userId', '==', 'alice'), limit(50))))
  await assertFails(getDocs(query(collection(alice(), 'payments'), limit(50))))
})

const carol = () => env.authenticatedContext('carol', { email: 'Carol@Example.com' }).firestore()
const newProfile = (o = {}) => ({
  fullName: 'Carol', email: 'Carol@Example.com', emailLower: 'carol@example.com', phoneNumber: '', photoURL: '',
  role: 'user', accountStatus: 'active', planId: 'free', proUntil: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...o,
})

test('users: a new user creates only their own active Free profile', async () => {
  await assertSucceeds(setDoc(doc(carol(), 'users/carol'), newProfile()))
  await env.clearFirestore()
  for (const bad of [
    { role: 'admin' }, { accountStatus: 'suspended' }, { planId: 'annual' }, { proUntil: Timestamp.now() },
    { email: 'other@example.com' }, { emailLower: 'other@example.com' }, { createdAt: Timestamp.fromMillis(0) },
    { phoneNumber: '123' }, { fullName: 'x'.repeat(81) }, { extra: true },
  ]) {
    await assertFails(setDoc(doc(carol(), 'users/carol'), newProfile(bad)))
  }
  await assertFails(setDoc(doc(carol(), 'users/dave'), newProfile()))
  await assertFails(setDoc(doc(guest(), 'users/carol'), newProfile()))
  // Once it exists, a second create (overwrite) is an update and is refused for these fields.
  await assertSucceeds(setDoc(doc(carol(), 'users/carol'), newProfile()))
  await assertFails(setDoc(doc(carol(), 'users/carol'), newProfile({ planId: 'free', role: 'user', fullName: 'C' })))
})

const freeSub = (o = {}) => ({
  userId: 'carol', planId: 'free', planName: 'Free Forever', provider: 'free', status: 'active',
  startDate: serverTimestamp(), expiryDate: null, autoRenewal: false, providerRef: null, ...o,
})

test('subscriptions: a user creates only their own Free record, never a paid one', async () => {
  for (const bad of [
    { planId: 'annual' }, { planName: 'Annual Pro' }, { provider: 'razorpay' }, { status: 'pending' },
    { expiryDate: Timestamp.fromMillis(Date.now() + 1e10) }, { autoRenewal: true }, { providerRef: 'x' }, { userId: 'dave' },
  ]) {
    await assertFails(setDoc(doc(carol(), 'subscriptions/free_carol'), freeSub(bad)))
  }
  await assertFails(setDoc(doc(carol(), 'subscriptions/pro_carol'), freeSub()))
  await assertFails(setDoc(doc(carol(), 'subscriptions/free_dave'), freeSub({ userId: 'dave' })))
  await assertSucceeds(getDoc(doc(carol(), 'subscriptions/free_carol')))
  await assertFails(getDoc(doc(carol(), 'subscriptions/free_dave')))
  await assertSucceeds(setDoc(doc(carol(), 'subscriptions/free_carol'), freeSub()))
  await assertFails(updateDoc(doc(carol(), 'subscriptions/free_carol'), { planId: 'annual' }))
  await assertFails(deleteDoc(doc(carol(), 'subscriptions/free_carol')))
})

test('subscriptions and payments: read own only, never write', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'subscriptions/free_alice')))
  await assertFails(getDoc(doc(alice(), 'subscriptions/free_bob')))
  await assertFails(setDoc(doc(alice(), 'subscriptions/pro_alice'), { userId: 'alice', planId: 'annual', status: 'active' }))
  await assertFails(updateDoc(doc(alice(), 'subscriptions/free_alice'), { planId: 'annual' }))
  await assertSucceeds(getDoc(doc(alice(), 'payments/pay_1')))
  await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), 'payments/pay_1')))
  await assertFails(addDoc(collection(alice(), 'payments'), { userId: 'alice', amount: 9900, status: 'success' }))
})

test('plans and feature split: anyone reads (no account needed), no app writes', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'subscription_plans/monthly')))
  await assertSucceeds(getDoc(doc(alice(), 'config/entitlements')))
  await assertSucceeds(getDoc(doc(guest(), 'subscription_plans/monthly')))
  await assertSucceeds(getDoc(doc(guest(), 'config/entitlements')))
  await assertFails(getDoc(doc(guest(), 'config/other')))
  await assertFails(updateDoc(doc(guest(), 'config/entitlements'), { proFeatures: [] }))
  await assertFails(updateDoc(doc(alice(), 'subscription_plans/monthly'), { price: 100 }))
  await assertFails(updateDoc(doc(alice(), 'config/entitlements'), { proFeatures: [] }))
  await assertFails(updateDoc(doc(admin(), 'subscription_plans/monthly'), { price: 100 })) // admin needs an audit record, see below
})

test('security events: admins read, no free-form writes; admins read any user', async () => {
  await assertFails(getDoc(doc(alice(), 'security_events/e1')))
  await assertSucceeds(getDoc(doc(admin(), 'security_events/e1')))
  await assertFails(addDoc(collection(admin(), 'security_events'), { type: 'fake' }))
  await assertSucceeds(getDoc(doc(admin(), 'users/bob')))
  await assertSucceeds(getDoc(doc(admin(), 'subscriptions/free_bob')))
})

test('unknown collections are closed', async () => {
  await assertFails(setDoc(doc(alice(), 'projects/p1'), { name: 'x' }))
  await assertFails(getDoc(doc(admin(), 'anything/x')))
})

// ---------- admin screen: every change goes with an audit record in the same batch

/** Writes `patch` to `path` as the admin, with a security event in the same batch (as src/lib/admin.ts does). */
async function adminChange(db, path, patch, type, { actorUid = 'root', actorEmail = 'root@example.com', withEvent = true, merge = true } = {}) {
  const b = writeBatch(db)
  const ev = doc(collection(db, 'security_events'))
  if (withEvent) b.set(ev, { type, actorUid, actorEmail, targetUid: null, target: path, details: { patch: JSON.stringify(patch) }, createdAt: serverTimestamp() })
  b.set(doc(db, path), { ...patch, updatedAt: serverTimestamp(), lastChangeId: ev.id }, { merge })
  return b.commit()
}

test('admin: changes a price and the Pro feature list, with an audit record', async () => {
  await assertSucceeds(adminChange(admin(), 'subscription_plans/monthly', { price: 11900 }, 'plan_change'))
  await assertSucceeds(adminChange(admin(), 'config/entitlements', { proFeatures: ['dub', 'nomark'] }, 'entitlements_change'))
  let evs = 0
  await env.withSecurityRulesDisabled(async (ctx) => { evs = (await getDocs(collection(ctx.firestore(), 'security_events'))).size })
  assert.equal(evs, 3) // e1 + the two changes
})

test('admin: no change without an audit record, or with someone else as the actor', async () => {
  await assertFails(adminChange(admin(), 'subscription_plans/monthly', { price: 100 }, 'plan_change', { withEvent: false }))
  await assertFails(adminChange(admin(), 'subscription_plans/monthly', { price: 100 }, 'plan_change', { actorUid: 'alice' }))
  await assertFails(adminChange(admin(), 'subscription_plans/monthly', { price: 100 }, 'plan_change', { actorEmail: 'x@y.z' }))
  await assertFails(updateDoc(doc(admin(), 'subscription_plans/monthly'), { price: 100, lastChangeId: 'e1', updatedAt: serverTimestamp() }))
})

test('admin: plan and feature values are checked', async () => {
  await assertFails(adminChange(admin(), 'subscription_plans/monthly', { price: -5 }, 'plan_change'))
  await assertFails(adminChange(admin(), 'subscription_plans/monthly', { price: 99.5 }, 'plan_change'))
  await assertFails(adminChange(admin(), 'subscription_plans/monthly', { price: 0 }, 'plan_change'))
  await assertFails(adminChange(admin(), 'subscription_plans/monthly', { currency: 'USD' }, 'plan_change'))
  await assertFails(adminChange(admin(), 'subscription_plans/free', { price: 100 }, 'plan_change'))
  await assertFails(adminChange(admin(), 'subscription_plans/monthly', { secret: 'x' }, 'plan_change'))
  await assertFails(deleteDoc(doc(admin(), 'subscription_plans/monthly')))
  await assertFails(adminChange(admin(), 'config/entitlements', { proFeatures: ['dub', 'everything'] }, 'entitlements_change'))
  await assertFails(adminChange(admin(), 'config/entitlements', { offlineGraceDays: 90 }, 'entitlements_change'))
  await assertFails(adminChange(admin(), 'config/other', { proFeatures: [] }, 'entitlements_change', { merge: false }))
})

test('admin: suspends a user and gives Pro; never suspends themself; cannot change roles', async () => {
  await assertSucceeds(adminChange(admin(), 'users/bob', { accountStatus: 'suspended' }, 'user_suspend'))
  await assertSucceeds(adminChange(admin(), 'users/alice', { proUntil: Timestamp.fromMillis(Date.now() + 30 * 86400000), planId: 'monthly' }, 'pro_grant'))
  await assertSucceeds(adminChange(admin(), 'users/alice', { proUntil: null, planId: 'free' }, 'pro_remove'))
  await assertFails(adminChange(admin(), 'users/bob', { role: 'admin' }, 'user_activate'))
  await assertFails(adminChange(admin(), 'users/bob', { email: 'new@example.com' }, 'user_activate'))
  await assertFails(adminChange(admin(), 'users/bob', { accountStatus: 'deleted' }, 'user_suspend'))
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users/root'), userDoc()))
  await assertFails(adminChange(admin(), 'users/root', { accountStatus: 'suspended' }, 'user_suspend'))
  await assertSucceeds(adminChange(admin(), 'users/root', { proUntil: Timestamp.fromMillis(Date.now() + 86400000), planId: 'monthly' }, 'pro_grant'))
})

test('admin: lists users; a normal user cannot do any of it', async () => {
  await assertSucceeds(getDocs(query(collection(admin(), 'users'), orderBy('createdAt', 'desc'), limit(50))))
  await assertFails(getDocs(query(collection(alice(), 'users'), limit(50))))
  await assertFails(adminChange(alice(), 'subscription_plans/monthly', { price: 100 }, 'plan_change', { actorUid: 'alice' }))
  await assertFails(adminChange(alice(), 'users/alice', { proUntil: Timestamp.fromMillis(Date.now() + 86400000) }, 'pro_grant', { actorUid: 'alice' }))
  await assertFails(updateDoc(doc(admin(), 'security_events/e1'), { type: 'changed' }))
  await assertFails(deleteDoc(doc(admin(), 'security_events/e1')))
})
