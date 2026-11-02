// Razorpay Orders and Payments API (https://razorpay.com/docs/api/).
import { hmacHex, HttpError, safeEqual } from './util.js'

export function razorpay({ keyId, keySecret, base = 'https://api.razorpay.com/v1', fetchFn = fetch }) {
  const auth = `Basic ${btoa(`${keyId}:${keySecret}`)}`
  async function call(method, path, body) {
    const res = await fetchFn(`${base}${path}`, {
      method,
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      const e = new HttpError(res.status === 400 ? 400 : 502, 'razorpay', j.error?.description ?? 'Razorpay error')
      throw e
    }
    return j
  }
  return {
    createOrder: (o) => call('POST', '/orders', o),
    fetchPayment: (id) => call('GET', `/payments/${encodeURIComponent(id)}`),
    capture: (id, amount, currency) => call('POST', `/payments/${encodeURIComponent(id)}/capture`, { amount, currency }),
  }
}

/** The checkout's proof of payment: HMAC-SHA256("order_id|payment_id") with the key secret. */
export async function checkoutSignatureOk(keySecret, orderId, paymentId, signature) {
  return safeEqual(await hmacHex(keySecret, `${orderId}|${paymentId}`), String(signature ?? ''))
}

/** Webhook proof: HMAC-SHA256 of the raw body with the webhook secret. */
export async function webhookSignatureOk(secret, rawBody, signature) {
  return safeEqual(await hmacHex(secret, rawBody), String(signature ?? ''))
}
