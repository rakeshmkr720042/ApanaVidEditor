// Firestore Security Rules: what the app may and may not do.
import { test, before, after, beforeEach } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore'

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
    await setDoc(doc(db, 'subscription_plans/monthly'), { planName: 'Monthly Pro', price: 9900 })
    await setDoc(doc(db, 'config/entitlements'), { proFeatures: ['dub'] })
    await setDoc(doc(db, 'security_events/e1'), { type: 'role_change' })
  })
})

const alice = () => env.authenticatedContext('alice').firestore()
const admin = () => env.authenticatedContext('root', { admin: true }).firestore()
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

test('users: suspended account cannot edit, nobody creates or deletes profiles', async () => {
  await assertFails(updateDoc(doc(env.authenticatedContext('sus').firestore(), 'users/sus'), { fullName: 'Back', updatedAt: serverTimestamp() }))
  await assertFails(setDoc(doc(env.authenticatedContext('carol').firestore(), 'users/carol'), userDoc()))
  await assertFails(deleteDoc(doc(alice(), 'users/alice')))
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

test('plans and feature split: signed-in read, no app writes', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'subscription_plans/monthly')))
  await assertSucceeds(getDoc(doc(alice(), 'config/entitlements')))
  await assertFails(getDoc(doc(guest(), 'subscription_plans/monthly')))
  await assertFails(updateDoc(doc(alice(), 'subscription_plans/monthly'), { price: 100 }))
  await assertFails(updateDoc(doc(alice(), 'config/entitlements'), { proFeatures: [] }))
  await assertFails(updateDoc(doc(admin(), 'subscription_plans/monthly'), { price: 100 }))
})

test('security events: admins read, nobody writes; admins read any user', async () => {
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
