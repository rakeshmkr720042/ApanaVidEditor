import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import * as v1 from 'firebase-functions/v1'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2'
import { createAccountRecords } from './accounts'

initializeApp()

const REGION = 'asia-south1'
setGlobalOptions({ region: REGION, maxInstances: 10 })

/** Every new sign-up (email or Google) gets a profile and the Free plan, created on the server. */
export const onUserCreated = v1.region(REGION).auth.user().onCreate(async (user) => {
  await createAccountRecords(user)
})

/**
 * The app calls this right after sign-in, in case the trigger has not finished yet (or failed).
 * It only ever creates the caller's own Free records, from the verified sign-in token.
 */
export const ensureAccount = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const user = await getAuth().getUser(req.auth.uid)
  if (user.disabled) throw new HttpsError('permission-denied', 'This account is suspended.')
  const created = await createAccountRecords(user)
  return { created }
})
