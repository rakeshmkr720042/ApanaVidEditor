import { useEffect, useState } from 'react'
import { AuthShell } from './AuthScreen'
import { checkout, orderStatus, PAYMENTS_URL, type Order } from '../lib/razorpay'
import { rupees } from '../lib/premium'
import { t } from '../lib/i18n'

/** #pay?order=order_…: the Windows app opened the website to pay for Pro; read once at load. */
export function payPageRequest(hash = location.hash) {
  const m = hash.match(/^#pay\?(.*)$/)
  if (!m) return null
  const q = new URLSearchParams(m[1])
  const order = q.get('order') ?? ''
  if (!/^order_[A-Za-z0-9]{6,40}$/.test(order)) return null
  return { order, email: q.get('email') ?? '', contact: q.get('contact') ?? '' }
}

/**
 * The website page where the Windows app's buyer pays (Razorpay checkout runs here, in the normal
 * browser). The order was made by the app for the signed-in account; this page only pays it. The
 * server checks the payment and the app sees Pro by itself.
 */
export function PayPage({ order, email, contact, onLang }: { order: string; email: string; contact: string; onLang: () => void }) {
  const [info, setInfo] = useState<Order | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'paying' | 'done'>('loading')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!PAYMENTS_URL) { setError(t('Payments are not switched on yet. You will be able to subscribe here soon.')); return }
    orderStatus(order).then((s) => {
      setInfo({ ...s, prefill: { email, contact } })
      setState(s.status === 'success' ? 'done' : 'ready')
    }).catch((e) => setError((e as Error).message))
  }, [order, email, contact])
  const pay = async () => {
    if (!info) return
    setState('paying'); setError(null)
    try { setState(await checkout(info) ? 'done' : 'ready') } catch (e) { setError((e as Error).message); setState('ready') }
  }
  return (
    <AuthShell onLang={onLang}>
      <h1 className="auth-title">{t('Pay for Apna Editor Pro')}</h1>
      {info && <p className="pay-sum" data-testid="pay-sum"><b>{t(info.planName)}</b> <span>{rupees(info.amount)}</span>{info.mode === 'test' && <small className="muted pay-test">{t('Test payment, no real money')}</small>}</p>}
      {state === 'loading' && !error && <p className="muted small">{t('Loading…')}</p>}
      {(state === 'ready' || state === 'paying') && info && (
        <>
          <p className="muted small">{t('UPI, cards, net banking and wallets work. Your card or UPI details go only to Razorpay.')}</p>
          <button className="btn primary wide" disabled={state === 'paying'} onClick={pay} data-testid="pay-go">{t('Pay')} {rupees(info.amount)}</button>
        </>
      )}
      {state === 'done' && <p className="auth-ok" role="status" data-testid="pay-done">{t('Payment done. Pro is on. Go back to the Apna Editor app.')}</p>}
      {error && <p className="auth-alert" role="alert" data-testid="pay-error">{error}</p>}
    </AuthShell>
  )
}
