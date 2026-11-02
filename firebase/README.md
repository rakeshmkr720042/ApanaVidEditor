# Apna Editor backend (Firebase)

Accounts, plans and subscriptions for Apna Editor. Projects, media and exports never come here:
they stay on the user's device. This folder holds only the Firestore rules, indexes and the
Cloud Functions, and is deployed by `.github/workflows/firebase.yml`.

```
firebase/
  firebase.json            emulator ports, deploy targets
  firestore.rules          default deny; app reads its own records, edits name/phone only
  firestore.indexes.json
  functions/               Cloud Functions (TypeScript, Node 22, region asia-south1)
    src/index.ts           onUserCreated (auth trigger), ensureAccount (callable)
    src/accounts.ts        creates users/{uid} + Free subscription, idempotent
    src/defaults.ts        starting plans and Free/Pro feature split
    src/seed.ts            writes the defaults once, grants admin to ADMIN_EMAIL
  test/                    rules + functions tests on the Firebase Emulator
```

## Collections

Money is integer paise (₹99 = 9900). Times are Firestore timestamps. Everything except the two
profile fields and the user's own Free records is written by Cloud Functions only. The app creates
the Free records itself after sign-up (src/lib/account.ts), so accounts work on the free Spark plan
too; the `onUserCreated` function does the same once the project is on Blaze.

| Collection | Fields | App can write | App can read |
|---|---|---|---|
| `users/{uid}` | fullName, email, emailLower, phoneNumber, photoURL, role, accountStatus, planId, proUntil, createdAt, updatedAt | create once as an active Free user with its own token email; then fullName, phoneNumber (+ updatedAt = server time) while active | own; admins all |
| `subscription_plans/{planId}` | planName, price, currency, durationMonths, isActive, sortOrder, playProductId, playBasePlanId | no | any signed-in user |
| `config/entitlements` | proFeatures (feature keys that need Pro), freeExportMaxHeight, freeWatermark, offlineGraceDays | no | any signed-in user |
| `subscriptions/{id}` | userId, planId, planName, provider (free/razorpay/play), status, startDate, expiryDate, autoRenewal, providerRef | only its own `free_<uid>` record with fixed Free values | own; admins all |
| `payments/{paymentId}` | userId, subscriptionId, amount, currency, method, provider, status, createdAt | no | own; admins all |
| `security_events/{id}` | type, actorUid, targetUid, details, createdAt | no | admins only |

The Free subscription id is `free_<uid>`, so it can only exist once per user. Admin is the custom
claim `admin: true` on the Firebase Auth token (the `role` field is a display copy).

## Plans (defaults, editable later from the admin screen)

| Plan id | Name | Price | Duration |
|---|---|---|---|
| free | Free Forever | ₹0 | forever |
| monthly | Monthly Pro | ₹99 | 1 month |
| quarterly | Quarterly Pro | ₹249 | 3 months |
| annual | Annual Pro | ₹799 | 12 months |

All paid plans unlock the same features. Which features need Pro is the `proFeatures` list in
`config/entitlements`; the seed never overwrites a plan or that list once it exists.

## Run the tests

Needs Node 22 and Java 21.

```
cd firebase/functions && npm ci && npm run build
cd ../test && npm ci && npm test
```

`npm test` starts the Auth, Firestore and Functions emulators for a `demo-` project (no real
Firebase project or internet needed) and runs `rules.test.js` and `functions.test.js`.

## Deploy

On every push to `main` that changes `firebase/`, or by hand (Actions > Firebase backend > Run
workflow), the workflow tests, deploys rules, indexes and functions, then runs the seed.

Repository settings it needs (Settings > Secrets and variables > Actions):

| Name | Kind | Value |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | secret | JSON key of the Firebase Admin SDK service account |
| `FIREBASE_PROJECT_ID` | variable | the Firebase project id |
| `ADMIN_EMAIL` | variable | email of the first admin; run the workflow again after that account signs up |

The service account needs these roles in Google Cloud IAM: Firebase Admin, Cloud Functions Admin,
Cloud Run Admin, Service Account User, Service Usage Admin, Artifact Registry Administrator.
Without the secret and variable the deploy job skips itself with a notice. Cloud Functions need
the Blaze plan, so they deploy only when the variable `FIREBASE_FUNCTIONS` is `on`; otherwise only
the rules and indexes are deployed.
