// Payment server tests: real Firestore emulator, real RS256 sign-in check (with our own test key),
// fake Razorpay API. Run: npm test (starts the emulator).
import test from 'node:test'
import assert from 'node:assert/strict'
import { handle } from '../src/index.js'
import { firestore } from '../src/firestore.js'
import { resetGoogleCaches } from '../src/google.js'
import { bytesToB64url, hmacHex, jsonB64url } from '../src/util.js'

const PROJECT = 'demo-apna-editor'
const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
const BASE = `http://${HOST}/v1`
const SECRET = 'test_secret_123'
const WEBHOOK = 'whsec_test'
const db = firestore({ projectId: PROJECT, base: BASE, token: async () => 'owner' })

const env = {
  FIREBASE_PROJECT_ID: PROJECT, RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: SECRET, RAZORPAY_WEBHOOK_SECRET: WEBHOOK,
  ALLOWED_ORIGINS: 'https://rakeshmkr720042.github.io,app://bundle', TEST_BUYERS: 'tester@example.com', LIVE_PAYMENTS: 'off',
}

// ---- Google sign-in keys (our own key pair stands in for Google's)
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
async function idToken(claims = {}, key = pair.privateKey) {
  const t = Math.floor(Date.now() / 1000)
  const body = `${jsonB64url({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${jsonB64url({
    aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: 'uid_a', email: 'tester@example.com', email_verified: true,
    iat: t - 10, auth_time: t - 10, exp: t + 3000, ...claims,
  })}`
  return `${body}.${bytesToB64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body)))}`
}

// ---- fake Razorpay
const rzp = { orders: new Map(), payments: new Map(), captured: [], n: 0 }
function fakeFetch(url, init = {}) {
  const u = String(url)
  if (u.startsWith('https://www.googleapis.com/service_accounts/')) return Promise.resolve(Response.json({ keys: [jwk] }, { headers: { 'cache-control': 'max-age=100' } }))
  if (u.startsWith('https://rzp.test/v1')) {
    assert.equal(init.headers.authorization, `Basic ${btoa(`rzp_test_abc:${SECRET}`)}`)
    const path = u.slice('https://rzp.test/v1'.length)
    if (init.method === 'POST' && path === '/orders') {
      const b = JSON.parse(init.body)
      const o = { id: `order_T${++rzp.n}xyzabc`, amount: b.amount, currency: b.currency, notes: b.notes, status: 'created' }
      rzp.orders.set(o.id, o)
      return Promise.resolve(Response.json(o))
    }
    let m = /^\/payments\/([^/]+)$/.exec(path)
    if (m) { const p = rzp.payments.get(m[1]); return Promise.resolve(p ? Response.json(p) : Response.json({ error: { description: 'not found' } }, { status: 400 })) }
    m = /^\/payments\/([^/]+)\/capture$/.exec(path)
    if (m) { const p = rzp.payments.get(m[1]); p.status = 'captured'; rzp.captured.push(p.id); return Promise.resolve(Response.json(p)) }
  }
  return fetch(url, init) // the Firestore emulator
}
const deps = { fetch: fakeFetch, firestoreBase: BASE, firestoreToken: async () => 'owner', razorpayBase: 'https://rzp.test/v1' }
const call = (method, path, { token, body, origin, headers = {}, e = env } = {}) => handle(new Request(`https://pay.test${path}`, {
  method,
  headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}), 'content-type': 'application/json', ...headers },
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
}), e, deps)

function pay(orderId, { amount = 9900, status = 'captured' } = {}) {
  const id = `pay_P${++rzp.n}abcdef`
  rzp.payments.set(id, { id, order_id: orderId, amount, currency: 'INR', status })
  return id
}
const sign = (orderId, paymentId) => hmacHex(SECRET, `${orderId}|${paymentId}`)

async function seed() {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' })
  resetGoogleCaches()
  await db.create('subscription_plans/monthly', { planName: 'Monthly Pro', price: 9900, currency: 'INR', durationMonths: 1, isActive: true, sortOrder: 1 })
  await db.create('subscription_plans/annual', { planName: 'Annual Pro', price: 79900, currency: 'INR', durationMonths: 12, isActive: true, sortOrder: 3 })
  await db.create('subscription_plans/old', { planName: 'Old', price: 5000, currency: 'INR', durationMonths: 1, isActive: false, sortOrder: 9 })
  await db.create('users/uid_a', { fullName: 'Test User', email: 'tester@example.com', accountStatus: 'active', planId: 'free', proUntil: null, phoneNumber: '+919876543210' })
}

async function order(planId = 'monthly', claims) {
  const r = await call('POST', '/razorpay/order', { token: await idToken(claims), body: { planId, amount: 1 } })
  return { status: r.status, body: await r.json() }
}

test('health shows test mode', async () => {
  const r = await call('GET', '/health')
  assert.deepEqual(await r.json(), { ok: true, mode: 'test', live: false })
})

test('CORS only for the app and website', async () => {
  const ok = await call('OPTIONS', '/razorpay/order', { origin: 'app://bundle' })
  assert.equal(ok.status, 204)
  assert.equal(ok.headers.get('access-control-allow-origin'), 'app://bundle')
  const bad = await call('OPTIONS', '/razorpay/order', { origin: 'https://evil.example' })
  assert.equal(bad.status, 403)
  assert.equal(bad.headers.get('access-control-allow-origin'), null)
})

test('making an order needs a real sign-in', async () => {
  await seed()
  assert.equal((await call('POST', '/razorpay/order', { body: { planId: 'monthly' } })).status, 401)
  assert.equal((await call('POST', '/razorpay/order', { token: await idToken({}, other.privateKey), body: { planId: 'monthly' } })).status, 401, 'signed by another key')
  assert.equal((await order('monthly', { aud: 'some-other-app' })).status, 401)
  assert.equal((await order('monthly', { exp: Math.floor(Date.now() / 1000) - 5 })).status, 401, 'expired')
  assert.equal((await order('monthly', { email_verified: false })).status, 403)
  const fake = `${jsonB64url({ alg: 'none', kid: 'k1' })}.${jsonB64url({ sub: 'uid_a' })}.`
  assert.equal((await call('POST', '/razorpay/order', { token: fake, body: { planId: 'monthly' } })).status, 401, 'unsigned token')
})

test('while testing only listed testers can buy', async () => {
  await seed()
  const r = await order('monthly', { email: 'someone@example.com' })
  assert.equal(r.status, 403)
  assert.equal(r.body.error, 'test-only')
})

test('a live key is refused until LIVE_PAYMENTS is on', async () => {
  await seed()
  const r = await call('POST', '/razorpay/order', { token: await idToken(), body: { planId: 'monthly' }, e: { ...env, RAZORPAY_KEY_ID: 'rzp_live_abc' } })
  assert.equal(r.status, 503)
  assert.equal((await r.json()).error, 'live-off')
})

test('order uses the server price, not the app', async () => {
  await seed()
  assert.equal((await order('old')).status, 400, 'switched-off plan')
  assert.equal((await order('free')).status, 400)
  assert.equal((await order('nope')).status, 400)
  const r = await order('annual')
  assert.equal(r.status, 200)
  assert.equal(r.body.amount, 79900)
  assert.equal(r.body.keyId, 'rzp_test_abc')
  assert.equal(r.body.prefill.email, 'tester@example.com')
  assert.equal(rzp.orders.get(r.body.orderId).amount, 79900)
  const p = await db.get(`payments/rzp_${r.body.orderId}`)
  assert.equal(p.status, 'created')
  assert.equal(p.userId, 'uid_a')
  assert.equal(p.amount, 79900)
  assert.ok(p.createdAt instanceof Date)
  const s = await (await call('GET', `/razorpay/order/${r.body.orderId}`)).json()
  assert.equal(s.status, 'created')
  assert.equal(s.planName, 'Annual Pro')
})

test('suspended or missing accounts cannot order', async () => {
  await seed()
  assert.equal((await order('monthly', { sub: 'uid_nobody' })).status, 403)
  await db.transaction(async (tx) => tx.update('users/uid_a', { accountStatus: 'suspended' }))
  assert.equal((await order()).body.error, 'suspended')
})

test('verify: signature, amount and capture are checked before Pro', async () => {
  await seed()
  const { body: o } = await order()
  const verify = async (paymentId, signature) => call('POST', '/razorpay/verify', { body: { orderId: o.orderId, paymentId, signature: signature ?? await sign(o.orderId, paymentId) } })

  const p1 = pay(o.orderId)
  assert.equal((await verify(p1, 'f'.repeat(64))).status, 400, 'bad signature')
  const cheap = pay(o.orderId, { amount: 100 })
  assert.equal((await verify(cheap)).status, 400, 'amount mismatch')
  const elsewhere = pay('order_Other123456')
  assert.equal((await call('POST', '/razorpay/verify', { body: { orderId: o.orderId, paymentId: elsewhere, signature: await sign(o.orderId, elsewhere) } })).status, 400, 'payment for another order')
  const failed = pay(o.orderId, { status: 'failed' })
  assert.equal((await verify(failed)).status, 402)
  assert.equal((await db.get('users/uid_a')).proUntil, null, 'still Free')

  const before = Date.now()
  const r = await verify(p1)
  assert.equal(r.status, 200)
  const out = await r.json()
  assert.equal(out.status, 'success')
  const u = await db.get('users/uid_a')
  assert.equal(u.planId, 'monthly')
  const days = (u.proUntil.getTime() - before) / 86400000
  assert.ok(days > 27 && days < 32, `about a month, got ${days}`)
  assert.equal(out.proUntil, u.proUntil.getTime())
  const pr = await db.get(`payments/rzp_${o.orderId}`)
  assert.equal(pr.status, 'success')
  assert.equal(pr.paymentId, p1)
  const sub = await db.get(`subscriptions/rzp_${o.orderId}`)
  assert.equal(sub.provider, 'razorpay')
  assert.equal(sub.userId, 'uid_a')
  assert.equal(sub.expiryDate.getTime(), u.proUntil.getTime())

  // the same payment again (app retry or webhook) changes nothing
  const again = await (await verify(p1)).json()
  assert.equal(again.proUntil, out.proUntil)
  assert.equal((await db.get('users/uid_a')).proUntil.getTime(), u.proUntil.getTime())
})

test('a second purchase adds to the time left', async () => {
  await seed()
  const a = (await order()).body
  const p1 = pay(a.orderId)
  const first = await (await call('POST', '/razorpay/verify', { body: { orderId: a.orderId, paymentId: p1, signature: await sign(a.orderId, p1) } })).json()
  const b = (await order('annual')).body
  const p2 = pay(b.orderId, { amount: 79900, status: 'authorized' })
  const second = await (await call('POST', '/razorpay/verify', { body: { orderId: b.orderId, paymentId: p2, signature: await sign(b.orderId, p2) } })).json()
  assert.deepEqual(rzp.captured.slice(-1), [p2], 'authorized payment was captured')
  const months = (second.proUntil - first.proUntil) / (30.44 * 86400000)
  assert.ok(months > 11.8 && months < 12.2, `12 more months, got ${months}`)
  assert.equal((await db.get('users/uid_a')).planId, 'annual')
})

test('bought during the free trial: paid months start after the trial', async () => {
  await seed()
  const started = new Date(Date.now() - 10 * 86400000)
  await db.transaction(async (tx) => tx.update('users/uid_a', { trialStartedAt: started, trialDays: 30 }))
  const o = (await order()).body
  const p = pay(o.orderId)
  const r = await (await call('POST', '/razorpay/verify', { body: { orderId: o.orderId, paymentId: p, signature: await sign(o.orderId, p) } })).json()
  const trialEnd = started.getTime() + 30 * 86400000
  const days = (r.proUntil - trialEnd) / 86400000
  assert.ok(days > 27 && days < 32, `one month after the trial ends, got ${days}`)
})

test('webhook: checked signature, grants once, ignores other orders', async () => {
  await seed()
  const o = (await order()).body
  const p = pay(o.orderId)
  const ev = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: p, order_id: o.orderId, amount: 9900 } } } })
  const hook = async (raw, sig) => call('POST', '/razorpay/webhook', { body: raw, headers: { 'x-razorpay-signature': sig ?? await hmacHex(WEBHOOK, raw) } })
  assert.equal((await hook(ev, 'bad')).status, 400)
  assert.equal((await db.get('users/uid_a')).proUntil, null)
  assert.equal((await hook(ev)).status, 200)
  const until = (await db.get('users/uid_a')).proUntil
  assert.ok(until > new Date())
  assert.equal((await hook(ev)).status, 200, 'Razorpay retries')
  const r = await (await call('POST', '/razorpay/verify', { body: { orderId: o.orderId, paymentId: p, signature: await sign(o.orderId, p) } })).json()
  assert.equal(r.proUntil, until.getTime(), 'checkout after webhook: same time')
  const stranger = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_Zz123456', order_id: 'order_Zz123456' } } } })
  assert.deepEqual(await (await hook(stranger)).json(), { ok: true, ignored: true })
  const s = await (await call('GET', `/razorpay/order/${o.orderId}`)).json()
  assert.equal(s.status, 'success')
})

test('paid after the account was deleted: kept for a refund, no Pro', async () => {
  await seed()
  const o = (await order()).body
  await db.transaction(async (tx) => tx.update('users/uid_a', { accountStatus: 'deleted' }))
  const p = pay(o.orderId)
  const r = await (await call('POST', '/razorpay/verify', { body: { orderId: o.orderId, paymentId: p, signature: await sign(o.orderId, p) } })).json()
  assert.equal(r.status, 'paid_no_account')
  assert.equal((await db.get('users/uid_a')).proUntil, null)
  assert.equal((await db.get(`payments/rzp_${o.orderId}`)).status, 'paid_no_account')
})

test('not set up yet: clear message', async () => {
  const r = await call('POST', '/razorpay/verify', { body: {}, e: { ...env, RAZORPAY_KEY_SECRET: '' } })
  assert.equal(r.status, 503)
  assert.equal((await r.json()).error, 'not-set-up')
})

test('service account: signs a Google token request with its key', async () => {
  const { serviceToken } = await import('../src/google.js')
  resetGoogleCaches()
  const sa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', sa.privateKey)).toString('base64')
  const json = JSON.stringify({ client_email: 'pay@demo.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n` })
  let calls = 0
  const f = async (url, init) => {
    calls++
    assert.equal(url, 'https://oauth2.googleapis.com/token')
    const jwt = new URLSearchParams(String(init.body)).get('assertion').split('.')
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', sa.publicKey, Buffer.from(jwt[2], 'base64url'), new TextEncoder().encode(`${jwt[0]}.${jwt[1]}`))
    assert.ok(ok)
    assert.equal(JSON.parse(Buffer.from(jwt[1], 'base64url')).scope, 'https://www.googleapis.com/auth/datastore')
    return Response.json({ access_token: 'ya29.x', expires_in: 3600 })
  }
  assert.equal(await serviceToken(json, f), 'ya29.x')
  assert.equal(await serviceToken(json, f), 'ya29.x')
  assert.equal(calls, 1, 'cached')
})
