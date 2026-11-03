import { Capacitor } from '@capacitor/core'
import { isPaid } from './premium'

/**
 * Ads for the Free plan and the free trial. Only paid Pro removes them.
 * - Android: Google AdMob. A banner under the Home screen and, now and then, a full-screen ad after an
 *   export finishes. Never while editing. Without internet nothing loads and the app works as usual.
 * - Website and Windows: our own "Pro" card (Google does not allow AdSense in desktop apps, and the
 *   website needs its own domain for AdSense).
 * Until Rakesh's AdMob account is connected, Google's public test ad IDs are used (they show "Test Ad"
 * and earn nothing). The real IDs come in at build time (VITE_ADMOB_*); they are not secret.
 */

const env = import.meta.env
const TEST_BANNER = 'ca-app-pub-3940256099942544/6300978111'
const TEST_INTERSTITIAL = 'ca-app-pub-3940256099942544/1033173712'
const ids = {
  banner: (env.VITE_ADMOB_BANNER_ID as string | undefined) || TEST_BANNER,
  interstitial: (env.VITE_ADMOB_INTERSTITIAL_ID as string | undefined) || TEST_INTERSTITIAL,
}
const testing = ids.banner === TEST_BANNER

export const nativeAds = Capacitor.getPlatform() === 'android'
/** Everyone who has not paid sees ads (or our Pro card on the web and Windows), also during the free trial. */
export const adsOn = () => !isPaid()

type AdMobModule = typeof import('@capacitor-community/admob')
let mod: Promise<AdMobModule> | null = null
/** Loads and starts AdMob once (Android only), asking for consent where the law needs it (EU/UK). */
function admob() {
  if (!mod) {
    mod = import('@capacitor-community/admob').then(async (m) => {
      await m.AdMob.initialize({ initializeForTesting: testing })
      try {
        const info = await m.AdMob.requestConsentInfo()
        if (info.isConsentFormAvailable && info.status === m.AdmobConsentStatus.REQUIRED) await m.AdMob.showConsentForm()
      } catch { /* offline or not needed */ }
      return m
    })
    mod.catch(() => { mod = null })
  }
  return mod
}

let bannerShown = false
/** Home screen banner (Android, Free only). */
export async function showHomeBanner() {
  if (!nativeAds || !adsOn() || bannerShown) return
  bannerShown = true
  document.body.classList.add('has-ad-banner')
  try {
    const m = await admob()
    if (!bannerShown) return
    await m.AdMob.showBanner({ adId: ids.banner, adSize: m.BannerAdSize.ADAPTIVE_BANNER, position: m.BannerAdPosition.BOTTOM_CENTER, margin: 0, isTesting: testing })
  } catch { hideHomeBanner() }
}

export async function hideHomeBanner() {
  document.body.classList.remove('has-ad-banner')
  if (!bannerShown) return
  bannerShown = false
  try { (await admob()).AdMob.removeBanner() } catch { /* nothing shown */ }
}

/** Exports since the last full-screen ad; one is shown at most every second export and every 3 minutes. */
let exportsSince = 0
let lastFull = 0
/** After an export finishes (Android, Free only). Never blocks or fails the export. */
export async function afterExportAd() {
  if (!nativeAds || !adsOn()) return
  exportsSince++
  if (exportsSince < 2 || Date.now() - lastFull < 3 * 60_000) return
  try {
    const m = await admob()
    await m.AdMob.prepareInterstitial({ adId: ids.interstitial, isTesting: testing })
    await m.AdMob.showInterstitial()
    exportsSince = 0
    lastFull = Date.now()
  } catch { /* no ad (offline): fine */ }
}
