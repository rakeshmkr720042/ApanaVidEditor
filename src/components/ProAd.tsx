import { useState } from 'react'
import { adsOn, nativeAds } from '../lib/ads'
import { DEFAULT_PLANS, rupees, serverPlans, usePremium } from '../lib/premium'
import { t } from '../lib/i18n'
import { Icon } from './Icon'
import { PremiumSheet } from './PremiumSheet'

/**
 * Our own ad for Pro, shown to Free users on the website and Windows (Android shows Google ads instead).
 * Opens the Pro screen; it never tracks anyone.
 */
export function ProAd({ where }: { where: 'home' | 'export' }) {
  usePremium()
  const [open, setOpen] = useState(false)
  if (nativeAds || !adsOn()) return null
  const monthly = (serverPlans() ?? DEFAULT_PLANS).find((p) => p.durationMonths === 1)
  return (
    <>
      <button className={`pro-ad pro-ad-${where}`} onClick={() => setOpen(true)} data-testid="pro-ad">
        <small className="pro-ad-tag">{t('Ad')}</small>
        <Icon name="crown" size={22} />
        <span>
          <b>{t('Remove ads and unlock every Pro feature')}</b>
          <small>{t(where === 'export' ? 'No Apna Editor mark on your videos, 2K/4K export and more.' : 'AI Dub, green screen, batch export, no mark on videos and more.')}</small>
        </span>
        <i>{monthly ? `${rupees(monthly.price)}/${t('month')}` : t('See plans')}</i>
      </button>
      {open && <PremiumSheet onClose={() => setOpen(false)} />}
    </>
  )
}
