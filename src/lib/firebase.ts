import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence, browserPopupRedirectResolver, browserSessionPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, type Auth,
} from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore/lite'
import { Capacitor } from '@capacitor/core'
import { isDesktop } from './desktop'

/**
 * Firebase for accounts only (sign-in, profile, plan). Projects and media never go here.
 * These values are public by design (they identify the project, they do not grant access);
 * the Firestore rules decide what a signed-in user may read or write.
 * A build can point at another project with VITE_FIREBASE_* variables.
 */
const env = import.meta.env
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'AIzaSyB6TZyzir6-cF4BjgY0sFyZLRv2PQXl9nk',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? 'apnaeditor-b7b18.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'apnaeditor-b7b18',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? 'apnaeditor-b7b18.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_SENDER_ID ?? '778583735587',
  appId: env.VITE_FIREBASE_APP_ID ?? '1:778583735587:web:729efe62a311a7dbefe096',
}

/** Where Google sign-in works in this build. Android and Windows need their own OAuth setup (next step). */
export const platform: 'web' | 'android' | 'windows' = Capacitor.isNativePlatform() ? 'android' : isDesktop ? 'windows' : 'web'
export const googleAvailable = platform === 'web'

/** Test builds talk to the local Firebase Emulator instead (VITE_FIREBASE_EMULATOR=1). */
const emulator = env.VITE_FIREBASE_EMULATOR === '1'

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

function boot() {
  if (app) return
  app = initializeApp(emulator ? { ...config, projectId: 'demo-apna-editor', apiKey: 'demo-key' } : config)
  // The sign-in stays on this device (IndexedDB) and comes back on the next launch, also offline.
  // The popup helper is loaded only on the web: it opens an iframe the desktop and Android shells do not need.
  auth = initializeAuth(app, {
    // (Session storage is listed too, for "Keep me signed in" turned off: it lasts until the window closes.)
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    ...(googleAvailable ? { popupRedirectResolver: browserPopupRedirectResolver } : {}),
  })
  db = getFirestore(app)
  if (emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
}

export function firebaseAuth() { boot(); return auth! }
export function firestore() { boot(); return db! }
