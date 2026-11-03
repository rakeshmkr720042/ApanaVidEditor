// Apna Editor payment server (Cloudflare Worker).
// Pro is switched on only here, after Razorpay confirms the payment with our secret key. The app
// never decides it: Firestore rules stop it from writing proUntil, payments or paid subscriptions.
//
//   POST /razorpay/order    {planId}                          signed in: makes a Razorpay order at the server price
//   POST /razorpay/verify   {orderId, paymentId, signature}   checkout finished: checks it and adds the Pro time
//   GET  /razorpay/order/:id                                   order status (the browser payment page and the app poll it)
//   POST /razorpay/webhook                                     Razorpay tells us a payment was captured (backup path)
//   GET  /health
import { firestore } from './firestore.js'
import { serviceToken, verifyIdToken } from './google.js'
import { checkoutSignatureOk, razorpay, webhookSignatureOk } from './razorpay.js'
import { addMonths, HttpError } from './util.js'

const ORDER_ID = /^order_[A-Za-z0-9]{6,40}$/
const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/
const PLAN_ID = /^[a-z0-9_-]{1,40}$/

export default {
  fetch: (request, env) => handle(request, env),
}

/** deps: overrides for tests (fetch for Google and Razorpay, Firestore root and token). */
export async function handle(request, env, deps = {}) {
  const origin = request.headers.get('origin')
  const cors = corsHeaders(origin, env)
  if (request.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors ?? {} })
  try {
    const ctx = context(env, deps)
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '')
    let out
    if (request.method === 'GET' && path === '/health') out = { ok: true, mode: ctx.mode, live: ctx.liveAllowed }
    else if (request.method === 'POST' && path === '/razorpay/order') out = await createOrder(ctx, request)
    else if (request.method === 'POST' && path === '/razorpay/verify') out = await verify(ctx, await body(request))
    else if (request.method === 'GET' && path.startsWith('/razorpay/order/')) out = await orderStatus(ctx, decodeURIComponent(path.slice('/razorpay/order/'.length)))
    else if (request.method === 'POST' && path === '/razorpay/webhook') out = await webhook(ctx, request)
    else throw new HttpError(404, 'not-found', 'Not found')
    return json(200, out, cors)
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    if (status >= 500) console.error('payments', e?.code, e?.message, e?.detail ?? '')
    return json(status, { error: e instanceof HttpError ? e.code : 'internal', message: e instanceof HttpError ? e.message : 'Something went wrong' }, cors)
  }
}

function context(env, deps) {
  const fetchFn = deps.fetch ?? fetch
  const keyId = String(env.RAZORPAY_KEY_ID ?? '')
  const mode = keyId.startsWith('rzp_live_') ? 'live' : 'test'
  const projectId = String(env.FIREBASE_PROJECT_ID ?? '')
  return {
    env, mode, keyId, projectId, fetchFn,
    // Live payments need Rakesh's go-ahead: the LIVE_PAYMENTS variable must say "on".
    liveAllowed: mode === 'live' && env.LIVE_PAYMENTS === 'on',
    now: deps.now ?? (() => Date.now()),
    verifyUser: deps.verifyUser ?? ((token) => verifyIdToken(token, projectId, fetchFn)),
    db: firestore({ projectId, base: deps.firestoreBase, fetchFn, token: deps.firestoreToken ?? (() => serviceToken(env.FIREBASE_SERVICE_ACCOUNT, fetchFn)) }),
    rzp: razorpay({ keyId, keySecret: String(env.RAZORPAY_KEY_SECRET ?? ''), base: deps.razorpayBase, fetchFn }),
  }
}

function corsHeaders(origin, env) {
  if (!origin) return null
  const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!allowed.includes(origin)) return null
  return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '86400', vary: 'origin' }
}

const json = (status, data, cors) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(cors ?? {}) } })

async function body(request) {
  const text = await request.text()
  if (text.length > 10_000) throw new HttpError(413, 'too-big', 'Request too big')
  try { return JSON.parse(text || '{}') } catch { throw new HttpError(400, 'bad-request', 'Bad request') }
}

async function signedIn(ctx, request) {
  const m = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')
  if (!m) throw new HttpError(401, 'auth', 'Please sign in')
  return ctx.verifyUser(m[1])
}

function checkSetup(ctx) {
  if (!ctx.keyId || !ctx.env.RAZORPAY_KEY_SECRET || !ctx.projectId) throw new HttpError(503, 'not-set-up', 'Payments are not set up yet')
  if (ctx.mode === 'live' && !ctx.liveAllowed) throw new HttpError(503, 'live-off', 'Payments are not open yet')
}

async function createOrder(ctx, request) {
  checkSetup(ctx)
  const user = await signedIn(ctx, request)
  // While testing (rzp_test_ key) only the listed testers can buy, so test cards cannot give Pro to anyone else.
  if (ctx.mode === 'test') {
    const testers = String(ctx.env.TEST_BUYERS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    if (!testers.includes(user.email.toLowerCase())) throw new HttpError(403, 'test-only', 'Payments are being tested and are not open yet')
  }
  const { planId } = await body(request)
  if (typeof planId !== 'string' || !PLAN_ID.test(planId) || planId === 'free') throw new HttpError(400, 'plan', 'Pick a plan')
  const [plan, profile] = await Promise.all([ctx.db.get(`subscription_plans/${planId}`), ctx.db.get(`users/${user.uid}`)])
  if (!plan || plan.isActive === false || !(plan.price > 0) || !(plan.durationMonths > 0) || !Number.isInteger(plan.price)) throw new HttpError(400, 'plan', 'This plan is not available')
  if (!profile || profile.accountStatus === 'deleted') throw new HttpError(403, 'no-profile', 'Your account is not ready yet. Please sign in again.')
  if (profile.accountStatus === 'suspended') throw new HttpError(403, 'suspended', 'This account is suspended')
  const currency = plan.currency || 'INR'
  const order = await ctx.rzp.createOrder({
    amount: plan.price, currency, receipt: `ae_${ctx.now().toString(36)}`,
    notes: { uid: user.uid, planId, app: 'Apna Editor' },
  })
  if (!ORDER_ID.test(order.id) || order.amount !== plan.price) throw new HttpError(502, 'razorpay', 'Razorpay error')
  await ctx.db.create(`payments/rzp_${order.id}`, {
    userId: user.uid, planId, planName: plan.planName ?? planId, amount: plan.price, currency, durationMonths: plan.durationMonths,
    provider: 'razorpay', mode: ctx.mode, status: 'created', orderId: order.id, paymentId: null, paidAt: null, proUntil: null,
  }, ['createdAt'])
  return {
    orderId: order.id, keyId: ctx.keyId, amount: plan.price, currency, planName: plan.planName ?? planId, mode: ctx.mode,
    prefill: { name: profile.fullName || user.name, email: user.email, contact: profile.phoneNumber || '' },
  }
}

/** For the payment page in the browser (Windows app) and for the app to watch the order. */
async function orderStatus(ctx, orderId) {
  if (!ORDER_ID.test(orderId)) throw new HttpError(400, 'order', 'Bad order')
  const p = await ctx.db.get(`payments/rzp_${orderId}`)
  if (!p) throw new HttpError(404, 'order', 'Order not found')
  return { orderId, keyId: ctx.keyId, amount: p.amount, currency: p.currency, planName: p.planName, status: p.status, proUntil: p.proUntil?.getTime?.() ?? null, mode: p.mode }
}

async function verify(ctx, b) {
  checkSetup(ctx)
  const { orderId, paymentId, signature } = b
  if (!ORDER_ID.test(orderId ?? '') || !PAYMENT_ID.test(paymentId ?? '')) throw new HttpError(400, 'bad-request', 'Bad request')
  if (!await checkoutSignatureOk(ctx.env.RAZORPAY_KEY_SECRET, orderId, paymentId, signature)) throw new HttpError(400, 'signature', 'Payment could not be checked')
  return complete(ctx, orderId, paymentId)
}

async function webhook(ctx, request) {
  const secret = ctx.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) throw new HttpError(404, 'not-found', 'Not found')
  const raw = await request.text()
  if (raw.length > 200_000) throw new HttpError(413, 'too-big', 'Request too big')
  if (!await webhookSignatureOk(secret, raw, request.headers.get('x-razorpay-signature'))) throw new HttpError(400, 'signature', 'Bad signature')
  let ev
  try { ev = JSON.parse(raw) } catch { throw new HttpError(400, 'bad-request', 'Bad request') }
  const pay = ev?.payload?.payment?.entity
  if (!['payment.captured', 'order.paid'].includes(ev?.event) || !pay || !ORDER_ID.test(pay.order_id ?? '') || !PAYMENT_ID.test(pay.id ?? '')) return { ok: true, ignored: true }
  const known = await ctx.db.get(`payments/rzp_${pay.order_id}`)
  if (!known) return { ok: true, ignored: true } // not an Apna Editor order
  return complete(ctx, pay.order_id, pay.id)
}

/**
 * Confirms the payment with Razorpay (with our secret key) and adds the plan's months to Pro, once.
 * Safe to call again for the same order (checkout and webhook both do): the second call changes nothing.
 */
async function complete(ctx, orderId, paymentId) {
  const ref = `payments/rzp_${orderId}`
  const rec = await ctx.db.get(ref)
  if (!rec) throw new HttpError(404, 'order', 'Order not found')
  if (rec.status === 'success') return { ok: true, status: 'success', proUntil: rec.proUntil?.getTime() ?? null }
  let pay = await ctx.rzp.fetchPayment(paymentId)
  if (pay.order_id !== orderId || pay.amount !== rec.amount || pay.currency !== rec.currency) throw new HttpError(400, 'mismatch', 'Payment does not match the order')
  if (pay.status === 'authorized') pay = await ctx.rzp.capture(paymentId, rec.amount, rec.currency)
  if (pay.status !== 'captured') throw new HttpError(402, 'not-paid', 'The payment is not complete')

  return ctx.db.transaction(async (tx) => {
    const [p, user] = await tx.getAll(ref, `users/${rec.userId}`)
    if (!p) throw new HttpError(404, 'order', 'Order not found')
    if (p.status === 'success') return { ok: true, status: 'success', proUntil: p.proUntil?.getTime() ?? null }
    if (!user || user.accountStatus === 'deleted') {
      // Paid, but the account is gone: kept for the admin to refund.
      tx.update(ref, { status: 'paid_no_account', paymentId, paidAt: new Date(ctx.now()) })
      return { ok: false, status: 'paid_no_account', proUntil: null }
    }
    const now = ctx.now()
    const from = Math.max(now, user.proUntil?.getTime?.() ?? 0)
    const until = new Date(addMonths(from, p.durationMonths))
    tx.update(`users/${p.userId}`, { proUntil: until, planId: p.planId }, ['updatedAt'])
    tx.update(ref, { status: 'success', paymentId, paidAt: new Date(now), proUntil: until })
    tx.create(`subscriptions/rzp_${orderId}`, {
      userId: p.userId, planId: p.planId, planName: p.planName, provider: 'razorpay', status: 'active',
      startDate: new Date(from), expiryDate: until, autoRenewal: false, providerRef: paymentId,
    })
    return { ok: true, status: 'success', proUntil: until.getTime() }
  })
}
