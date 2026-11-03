/**
 * Starting plans and the Free/Pro feature split. Written to Firestore once (seed script) and then
 * owned by the admin screen: changing prices or features there needs no app or function update.
 * Money is in paise (integer), so ₹99 = 9900.
 */

export interface Plan {
  planName: string
  price: number
  currency: 'INR'
  /** 0 = Free forever. */
  durationMonths: 0 | 1 | 3 | 12
  isActive: boolean
  sortOrder: number
  /** Google Play subscription product and base plan; prices on Play are set in Play Console. */
  playProductId: string | null
  playBasePlanId: string | null
}

export const DEFAULT_PLANS: Record<string, Plan> = {
  free: { planName: 'Free Forever', price: 0, currency: 'INR', durationMonths: 0, isActive: true, sortOrder: 0, playProductId: null, playBasePlanId: null },
  monthly: { planName: 'Monthly Pro', price: 9900, currency: 'INR', durationMonths: 1, isActive: true, sortOrder: 1, playProductId: 'apna_pro', playBasePlanId: 'monthly' },
  quarterly: { planName: 'Quarterly Pro', price: 24900, currency: 'INR', durationMonths: 3, isActive: true, sortOrder: 2, playProductId: 'apna_pro', playBasePlanId: 'quarterly' },
  annual: { planName: 'Annual Pro', price: 79900, currency: 'INR', durationMonths: 12, isActive: true, sortOrder: 3, playProductId: 'apna_pro', playBasePlanId: 'annual' },
}

/**
 * Feature keys the app knows (src/lib/premium.ts). The admin picks which of them are Pro-only;
 * every paid plan unlocks all of them. A key not listed in proFeatures is free for everyone.
 */
export const KNOWN_FEATURES = [
  'export2k', 'batch', 'nomark', 'dub', 'audio', 'greenscreen', 'presenter', 'scenes',
] as const

export const DEFAULT_ENTITLEMENTS = {
  proFeatures: [...KNOWN_FEATURES] as string[],
  /** Free exports: highest height and the Apna Editor logo mark (Pro can turn the mark off). */
  freeExportMaxHeight: 1080,
  freeWatermark: true,
  /** Days Pro keeps working offline before the app must check online again. */
  offlineGraceDays: 7,
  /** Free trial for new accounts (all Pro features, ads stay), once per email. 0 = no trial. */
  trialDays: 30,
}
