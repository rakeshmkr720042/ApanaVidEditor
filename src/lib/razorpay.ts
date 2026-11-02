import { firebaseAuth, platform } from './firebase'
import { setPaymentProvider, type PaymentProvider, type PlanId } from './premium'
import { t } from './i18n'

/**
 * Pro on the website and the Windows app, paid with Razorpay. The payment server (payments/, a
 * Cloudflare Worker) makes the order at the price stored on the server, checks the payment with
 * Razorpay using the secret key and only then adds the Pro time to the account. The app never marks
 * itself Pro: after paying it just reads the account again.
 * - Website: Razorpay's checkout opens over the page.
 * - Windows: the checkout opens on the website in the default browser (#pay?…), because the app's
 *   own window is locked down; the app waits until the server says the order is paid.
 * Android uses Google Play Billing instead (Play requires it), so this is not used there.
 */

/** The deployed payment server (not secret). Empty until it is deployed; buying stays off till then. */
const DEPLOYED = ''
/** Test builds point it elsewhere with VITE_PAYMENTS_URL. */
export const PAYMENTS_URL = ((import.meta.env.VITE_PAYMENTS_URL as string | undefined) ?? DEPLOYED).replace(/\/+$/, '')
/** The website, where the Windows app sends the browser to pay. */
const SITE = 'https://rakeshmkr720042.github.io/ApanaVidEditor/'

export interface Order { orderId: string; keyId: string; amount: number; currency: string; planName: string; mode: string; prefill?: { name?: string; email?: string; contact?: string } }
interface OrderStatus { orderId: string; keyId: string; amount: number; currency: string; planName: string; status: string; proUntil: number | null; mode: string }

export class PayError extends Error {}

async function api<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.auth) {
    const u = firebaseAuth().currentUser
    if (!u) throw new PayError(t('Please sign in first.'))
    headers.authorization = `Bearer ${await u.getIdToken()}`
  }
  let res: Response
  try { res = await fetch(`${PAYMENTS_URL}${path}`, { ...init, headers }) } catch { throw new PayError(t('No internet. Please check your connection and try again.')) }
  const j = await res.json().catch(() => ({})) as T & { error?: string; message?: string }
  if (!res.ok) throw new PayError(payMessage(j.error, j.message))
  return j
}

export function payMessage(code?: string, message?: string) {
  switch (code) {
    case 'test-only': return t('Payments are being tested and are not open yet.')
    case 'live-off': case 'not-set-up': return t('Payments are not switched on yet. You will be able to subscribe here soon.')
    case 'suspended': return t('This account is suspended.')
    case 'unverified': return t('Please confirm your email first.')
    case 'auth': return t('Please sign in again.')
    case 'not-paid': return t('The payment is not complete yet.')
    case 'plan': return t('This plan is not available. Please pick another.')
    default: return message ? `${t('Payment problem:')} ${message}` : t('Something went wrong. Please try again.')
  }
}

export const createOrder = (planId: PlanId) => api<Order>('/razorpay/order', { method: 'POST', auth: true, body: JSON.stringify({ planId }) })
export const orderStatus = (orderId: string) => api<OrderStatus>(`/razorpay/order/${encodeURIComponent(orderId)}`)
export const verifyPayment = (r: { orderId: string; paymentId: string; signature: string }) =>
  api<{ ok: boolean; status: string; proUntil: number | null }>('/razorpay/verify', { method: 'POST', body: JSON.stringify(r) })

interface RzpResponse { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
type RzpCtor = new (o: Record<string, unknown>) => { open(): void; on(ev: string, f: (r: { error?: { description?: string } }) => void): void }

let script: Promise<RzpCtor> | null = null
function loadCheckout(): Promise<RzpCtor> {
  const w = window as unknown as { Razorpay?: RzpCtor }
  if (w.Razorpay) return Promise.resolve(w.Razorpay)
  script ??= new Promise<RzpCtor>((ok, fail) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.async = true
    s.onload = () => (w.Razorpay ? ok(w.Razorpay) : fail(new PayError(t('Could not open the payment window. Please try again.'))))
    s.onerror = () => { script = null; fail(new PayError(t('No internet. Please check your connection and try again.'))) }
    document.head.appendChild(s)
  })
  return script
}

/**
 * Opens Razorpay's checkout for an order and, once paid, has the server check it.
 * Resolves true when the server added the Pro time, false when the window was closed.
 */
export async function checkout(o: Order): Promise<boolean> {
  const Razorpay = await loadCheckout()
  return new Promise<boolean>((resolve, reject) => {
    const rzp = new Razorpay({
      key: o.keyId, order_id: o.orderId, amount: o.amount, currency: o.currency,
      name: 'Apna Editor', description: o.planName,
      prefill: o.prefill ?? {},
      theme: { color: '#6c5ce7' },
      modal: { ondismiss: () => resolve(false), confirm_close: true },
      handler: (r: RzpResponse) => {
        verifyPayment({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature })
          .then((v) => (v.status === 'success' ? resolve(true) : reject(new PayError(t('Payment received, but this account was deleted. Write to us for a refund.')))))
          .catch(reject)
      },
    })
    rzp.on('payment.failed', () => { /* Razorpay shows the reason and lets the user try again */ })
    rzp.open()
  })
}

/** Windows: pay on the website in the default browser and wait until the server has the payment. */
async function payInBrowser(o: Order, { signal, waiting }: { signal: AbortSignal; waiting: (m: string | null) => void }) {
  const q = new URLSearchParams({ order: o.orderId })
  if (o.prefill?.email) q.set('email', o.prefill.email)
  if (o.prefill?.contact) q.set('contact', o.prefill.contact)
  window.open(`${SITE}#pay?${q}`, '_blank') // the Windows app opens https links in the default browser
  waiting(t('Finish the payment in your browser. This window updates by itself.'))
  const until = Date.now() + 20 * 60_000
  try {
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 3000))
      if (signal.aborted) return false
      const s = await orderStatus(o.orderId).catch(() => null)
      if (s?.status === 'success') return true
      if (s?.status === 'paid_no_account') throw new PayError(t('Payment received, but this account was deleted. Write to us for a refund.'))
    }
    return false
  } finally { waiting(null) }
}

export const razorpayProvider: PaymentProvider = {
  id: 'razorpay',
  name: 'Razorpay',
  async buy(plan, o) {
    const order = await createOrder(plan)
    return platform === 'windows' ? payInBrowser(order, o) : checkout(order)
  },
}

if (PAYMENTS_URL && platform !== 'android') setPaymentProvider(razorpayProvider)
