import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore'

export interface NewAccount {
  uid: string
  email?: string | null
  displayName?: string | null
  phoneNumber?: string | null
  photoURL?: string | null
}

/** Id of a user's Free subscription record: one per user, so creating it twice is a no-op. */
export const freeSubId = (uid: string) => `free_${uid}`

const clean = (s: string | null | undefined, max: number) => (s ?? '').trim().slice(0, max)

/**
 * Creates users/{uid} and the Free subscription for a new account. Safe to run more than once
 * (the auth trigger and the app's ensureAccount call may both run): existing docs are left alone.
 * Returns true when anything was created.
 */
export async function createAccountRecords(a: NewAccount, db: Firestore = getFirestore()): Promise<boolean> {
  const userRef = db.collection('users').doc(a.uid)
  const subRef = db.collection('subscriptions').doc(freeSubId(a.uid))
  return db.runTransaction(async (tx) => {
    const [user, sub] = await Promise.all([tx.get(userRef), tx.get(subRef)])
    const now = FieldValue.serverTimestamp()
    if (!user.exists) {
      const email = clean(a.email, 254)
      tx.create(userRef, {
        fullName: clean(a.displayName, 80),
        email,
        emailLower: email.toLowerCase(),
        phoneNumber: clean(a.phoneNumber, 16),
        photoURL: clean(a.photoURL, 1000),
        role: 'user',
        accountStatus: 'active',
        planId: 'free',
        proUntil: null,
        createdAt: now,
        updatedAt: now,
      })
    }
    if (!sub.exists) {
      tx.create(subRef, {
        userId: a.uid,
        planId: 'free',
        planName: 'Free Forever',
        provider: 'free',
        status: 'active',
        startDate: now,
        expiryDate: null,
        autoRenewal: false,
        providerRef: null,
      })
    }
    return !user.exists || !sub.exists
  })
}
