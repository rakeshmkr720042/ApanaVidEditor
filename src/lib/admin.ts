import { useEffect, useState } from 'react'
import {
  collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, startAfter, Timestamp, where, writeBatch,
  type DocumentData, type QueryDocumentSnapshot,
} from 'firebase/firestore/lite'
import { onIdTokenChanged } from 'firebase/auth'
import { firebaseAuth, firestore } from './firebase'
import { FEATURES, type Feature } from './premium'

/**
 * The admin screen's data. Admin is the `admin` claim on the sign-in token, which only the server
 * sets (the seed script, for ADMIN_EMAIL). The Firestore rules check the same claim, the values,
 * and that every change comes with a security_events record written in the same batch.
 */

/** Is the signed-in account an admin? Read from the token, so nothing on the device can fake it for the server. */
export function useIsAdmin() {
  const [admin, setAdmin] = useState(false)
  useEffect(() => onIdTokenChanged(firebaseAuth(), (u) => {
    if (!u) { setAdmin(false); return }
    u.getIdTokenResult().then((r) => setAdmin(r.claims.admin === true)).catch(() => setAdmin(false))
  }), [])
  return admin
}

export type EventType = 'plan_change' | 'entitlements_change' | 'user_suspend' | 'user_activate' | 'pro_grant' | 'pro_remove'

/** Writes `patch` into `path` together with its audit record (one batch: both or neither). */
async function change(path: string, patch: DocumentData, type: EventType, details: Record<string, unknown>, targetUid: string | null = null) {
  const user = firebaseAuth().currentUser
  if (!user) throw new Error('Not signed in')
  const db = firestore()
  const b = writeBatch(db)
  const ev = doc(collection(db, 'security_events'))
  b.set(ev, { type, actorUid: user.uid, actorEmail: user.email ?? '', targetUid, target: path, details, createdAt: serverTimestamp() })
  b.set(doc(db, path), { ...patch, updatedAt: serverTimestamp(), lastChangeId: ev.id }, { merge: true })
  await b.commit()
}

// ---------- plans

export interface AdminPlan {
  id: string
  planName: string
  /** paise */
  price: number
  currency: string
  durationMonths: number
  isActive: boolean
  sortOrder: number
}

export async function listAllPlans(): Promise<AdminPlan[]> {
  const snap = await getDocs(collection(firestore(), 'subscription_plans'))
  return snap.docs.map((d) => {
    const x = d.data()
    return { id: d.id, planName: x.planName, price: x.price, currency: x.currency, durationMonths: x.durationMonths, isActive: x.isActive !== false, sortOrder: x.sortOrder ?? 0 }
  }).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function savePlan(before: AdminPlan, after: Pick<AdminPlan, 'planName' | 'price' | 'isActive'>) {
  const patch: Record<string, unknown> = {}
  if (after.planName !== before.planName) patch.planName = after.planName
  if (after.price !== before.price) patch.price = after.price
  if (after.isActive !== before.isActive) patch.isActive = after.isActive
  if (!Object.keys(patch).length) return Promise.resolve()
  const was = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof AdminPlan]]))
  return change(`subscription_plans/${before.id}`, patch, 'plan_change', { plan: before.id, before: was, after: patch })
}

// ---------- Free / Pro split

export interface Entitlements { proFeatures: Feature[]; freeExportMaxHeight: number; freeWatermark: boolean; offlineGraceDays: number }

export async function loadEntitlements(): Promise<Entitlements> {
  const s = await getDoc(doc(firestore(), 'config', 'entitlements'))
  const x = (s.exists() ? s.data() : {}) as Partial<Entitlements>
  const known = Object.keys(FEATURES) as Feature[]
  return {
    proFeatures: Array.isArray(x.proFeatures) ? x.proFeatures.filter((f): f is Feature => known.includes(f)) : known,
    freeExportMaxHeight: x.freeExportMaxHeight ?? 1080,
    freeWatermark: x.freeWatermark !== false,
    offlineGraceDays: x.offlineGraceDays ?? 7,
  }
}

export function saveEntitlements(before: Entitlements, after: Entitlements) {
  return change('config/entitlements', { ...after }, 'entitlements_change', {
    before: { proFeatures: before.proFeatures },
    after: { proFeatures: after.proFeatures },
  })
}

// ---------- users

export interface AdminUser {
  uid: string
  fullName: string
  email: string
  phoneNumber: string
  accountStatus: 'active' | 'suspended' | 'deleted'
  planId: string
  proUntil: number | null
  createdAt: number | null
}

const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : null)
const toUser = (d: QueryDocumentSnapshot) => {
  const x = d.data()
  return {
    uid: d.id, fullName: x.fullName ?? '', email: x.email ?? '', phoneNumber: x.phoneNumber ?? '',
    accountStatus: x.accountStatus ?? 'active', planId: x.planId ?? 'free', proUntil: ms(x.proUntil), createdAt: ms(x.createdAt),
  } as AdminUser
}

const PAGE = 25

/** Newest users first, a page at a time (each page is PAGE reads). With an email, just that user. */
export async function listUsers(o: { email?: string; after?: QueryDocumentSnapshot | null } = {}) {
  const col = collection(firestore(), 'users')
  const q = o.email
    ? query(col, where('emailLower', '==', o.email.trim().toLowerCase()), limit(5))
    : query(col, orderBy('createdAt', 'desc'), ...(o.after ? [startAfter(o.after)] : []), limit(PAGE))
  const snap = await getDocs(q)
  return { users: snap.docs.map(toUser), next: !o.email && snap.docs.length === PAGE ? snap.docs[snap.docs.length - 1] : null }
}

export function setUserStatus(u: AdminUser, status: 'active' | 'suspended') {
  return change(`users/${u.uid}`, { accountStatus: status }, status === 'suspended' ? 'user_suspend' : 'user_activate', { email: u.email, from: u.accountStatus }, u.uid)
}

/** Gives Pro until `until` (ms) as plan `planId`, or takes it away (until = null). */
export function setUserPro(u: AdminUser, until: number | null, planId: string) {
  return change(
    `users/${u.uid}`,
    { proUntil: until === null ? null : Timestamp.fromMillis(until), planId: until === null ? 'free' : planId },
    until === null ? 'pro_remove' : 'pro_grant',
    { email: u.email, plan: until === null ? 'free' : planId, until: until === null ? null : new Date(until).toISOString(), was: u.proUntil ? new Date(u.proUntil).toISOString() : null },
    u.uid,
  )
}

// ---------- history

export interface AdminEvent { id: string; type: string; actorEmail: string; target: string; details: Record<string, unknown>; createdAt: number | null }

export async function listEvents(n = 30): Promise<AdminEvent[]> {
  const snap = await getDocs(query(collection(firestore(), 'security_events'), orderBy('createdAt', 'desc'), limit(n)))
  return snap.docs.map((d) => {
    const x = d.data()
    return { id: d.id, type: x.type ?? '', actorEmail: x.actorEmail ?? '', target: x.target ?? '', details: x.details ?? {}, createdAt: ms(x.createdAt) }
  })
}
