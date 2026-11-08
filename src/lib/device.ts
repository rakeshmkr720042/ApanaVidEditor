// How much this device can hold. Phones report their RAM (rounded, at most 8 GB) through
// navigator.deviceMemory; the page itself may use far less than that. Heavy jobs that need a whole
// sound or photo in memory at once are kept within these limits, so they stop with a clear message
// instead of closing the app.
import { Capacitor } from '@capacitor/core'

/** The Android app, or a phone / tablet browser. */
export const isPhone = Capacitor.isNativePlatform() || /Android|iPhone|iPad|Mobile/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')

/** RAM the browser reports (GB), or undefined when it does not say. */
export const deviceGB = (): number | undefined => (typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined)

/** A phone with 4 GB or less (or one that does not say: Android WebViews always do, so unknown is treated as small). */
export const lowMemory = (phone: boolean, gb: number | undefined) => phone && (gb ?? 4) <= 4

/**
 * Longest sound (seconds) that Remove noise and sound effects clean in one go. The cleaning keeps about
 * five copies of the sound (48 kHz stereo floats, 23 MB a minute each), so ten minutes is ~1.2 GB.
 */
export function cleanLimitSecs(phone: boolean, gb: number | undefined) {
  if (!phone) return 60 * 60
  return lowMemory(phone, gb) ? 5 * 60 : 10 * 60
}

/** Longest side a photo keeps when imported. 4096 leaves room for a 4K export; small phones keep 3072 (half the memory per photo). */
export function maxPhotoSide(phone: boolean, gb: number | undefined) {
  return lowMemory(phone, gb) ? 3072 : 4096
}

/** Shown when a sound is longer than cleanLimitSecs. `{m}` is replaced by the limit in minutes. */
export const TOO_LONG_TO_CLEAN = 'This sound is too long to clean on this phone at once (at most {m} minutes). Split the clip into shorter parts first, then turn this on for each part.'

/**
 * Chrome / WebView version from a user agent, or null when it is not Chrome based.
 * The app is built for Chrome 111 and newer; older Android System WebViews can't run it.
 */
export function chromeMajor(ua: string): number | null {
  const m = /Chrome\/(\d+)/.exec(ua)
  return m ? Number(m[1]) : null
}
export const MIN_CHROME = 111
