// New accounts get a profile and the Free plan from the server (auth trigger + ensureAccount).
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-apna-editor'
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`
const FN = `http://127.0.0.1:5001/${PROJECT}/asia-south1`
let db

before(() => { initializeApp({ projectId: PROJECT }); db = getFirestore() })

async function signUp(email, password = 'secret123') {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const j = await r.json()
  assert.ok(j.localId, JSON.stringify(j))
  return j
}

async function waitFor(fn, ms = 15000) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 250))
  }
}

const call = (name, idToken) => fetch(`${FN}/${name}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(idToken ? { authorization: `Bearer ${idToken}` } : {}) },
  body: JSON.stringify({ data: {} }),
}).then(async (r) => ({ status: r.status, body: await r.json() }))

test('sign-up creates users doc and Free subscription', async () => {
  const { localId, idToken } = await signUp(`new${Date.now()}@example.com`)
  const user = await waitFor(async () => { const s = await db.doc(`users/${localId}`).get(); return s.exists && s.data() })
  assert.equal(user.planId, 'free')
  assert.equal(user.role, 'user')
  assert.equal(user.accountStatus, 'active')
  assert.match(user.emailLower, /^new\d+@example\.com$/)
  const sub = (await db.doc(`subscriptions/free_${localId}`).get()).data()
  assert.equal(sub.userId, localId)
  assert.equal(sub.planId, 'free')
  assert.equal(sub.status, 'active')
  assert.equal(sub.expiryDate, null)

  // The app's follow-up call finds everything in place and creates nothing twice.
  const r = await call('ensureAccount', idToken)
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.result.created, false)
  const subs = await db.collection('subscriptions').where('userId', '==', localId).get()
  assert.equal(subs.size, 1)
})

test('ensureAccount repairs a missing profile', async () => {
  const { localId, idToken } = await signUp(`fix${Date.now()}@example.com`)
  await waitFor(async () => (await db.doc(`users/${localId}`).get()).exists)
  await db.doc(`users/${localId}`).delete()
  const r = await call('ensureAccount', idToken)
  assert.equal(r.body.result.created, true)
  assert.ok((await db.doc(`users/${localId}`).get()).exists)
})

test('ensureAccount refuses calls without sign-in', async () => {
  const r = await call('ensureAccount')
  assert.equal(r.status, 401)
  assert.equal(r.body.error.status, 'UNAUTHENTICATED')
})
