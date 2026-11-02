/**
 * One-time setup, run by the deploy workflow with the service account:
 * - writes the default plans and the Free/Pro split if they do not exist yet (never overwrites
 *   what the admin has changed),
 * - gives the admin claim to ADMIN_EMAIL once that account has signed up.
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { DEFAULT_ENTITLEMENTS, DEFAULT_PLANS } from './defaults'

async function main() {
  initializeApp()
  const db = getFirestore()
  for (const [id, plan] of Object.entries(DEFAULT_PLANS)) {
    const ref = db.collection('subscription_plans').doc(id)
    if ((await ref.get()).exists) { console.log(`plan ${id}: kept`); continue }
    await ref.create({ ...plan, updatedAt: FieldValue.serverTimestamp() })
    console.log(`plan ${id}: created`)
  }
  const ent = db.collection('config').doc('entitlements')
  if ((await ent.get()).exists) console.log('entitlements: kept')
  else { await ent.create({ ...DEFAULT_ENTITLEMENTS, updatedAt: FieldValue.serverTimestamp() }); console.log('entitlements: created') }

  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
  if (!email) { console.log('ADMIN_EMAIL not set: no admin change'); return }
  try {
    const user = await getAuth().getUserByEmail(email)
    if (user.customClaims?.admin === true) { console.log('admin: already set'); return }
    await getAuth().setCustomUserClaims(user.uid, { ...user.customClaims, admin: true })
    await db.collection('users').doc(user.uid).set({ role: 'admin', updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    await db.collection('security_events').add({
      type: 'role_change', actorUid: 'deploy', targetUid: user.uid, details: { role: 'admin' }, createdAt: FieldValue.serverTimestamp(),
    })
    console.log('admin: granted')
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/user-not-found') console.log('admin: that account has not signed up yet, run again after sign-up')
    else throw e
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
