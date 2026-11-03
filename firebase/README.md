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
| `users/{uid}` | fullName, email, emailLower, phoneNumber, photoURL, role, accountStatus, planId, proUntil, createdAt, updatedAt | create once as an active Free user with its own token email; then fullName, phoneNumber (+ updatedAt = server time) while active; admin: accountStatus, proUntil, planId (audited) | own; admins all |
| `subscription_plans/{planId}` | planName, price, currency, durationMonths, isActive, sortOrder, playProductId, playBasePlanId | admin (audited) | any signed-in user |
| `config/entitlements` | proFeatures (feature keys that need Pro), freeExportMaxHeight, freeWatermark, offlineGraceDays | admin (audited) | any signed-in user |
| `subscriptions/{id}` | userId, planId, planName, provider (free/razorpay/play), status, startDate, expiryDate, autoRenewal, providerRef | only its own `free_<uid>` record with fixed Free values | own; admins all |
| `payments/{paymentId}` | userId, subscriptionId, amount, currency, method, provider, status, createdAt | no | own; admins all |
| `security_events/{id}` | type, actorUid, actorEmail, targetUid, target, details, createdAt | admin: own audit records only | admins only |

The Free subscription id is `free_<uid>`, so it can only exist once per user. Admin is the custom
claim `admin: true` on the Firebase Auth token (the `role` field is a display copy).

## Admin screen

The app's admin screen (`#admin`, button in the Account sheet for the admin) lets the admin:
see and search users, suspend / activate an account (never their own), give Pro for 1, 3 or 12
months or take it away, change plan names, prices and whether a plan is shown, and choose which
features need Pro. The rules allow these writes only with the `admin` claim, check the values, and
require a `security_events` record by the same admin, with the server time, in the same batch
(`audited()` in firestore.rules, field `lastChangeId` on the changed document). Records can never
be edited or deleted; the History tab shows the latest 30.

## No account needed for free use

The app opens without signing in (Free, with ads). An account is asked for only to buy or restore Pro
(Pro screen: "Sign in to get Pro", or the Sign in button on Home). So `subscription_plans` and
`config/entitlements` can be read by anyone; everything else still needs a signed-in user.

## Free trial (new accounts)

The first sign-in with a confirmed email starts a free trial: every Pro feature for
`config/entitlements.trialDays` days (default 30, admin screen > Pro features; 0 = off). Ads stay
during the trial; only paid Pro removes them. The app writes `users/{uid}.trialStartedAt` (server
time) and `trialDays` together with `trials/{sha256(lowercase email)}`; the rules accept only exactly
that, only once per account and once per email, so a deleted account signed up again gets no second
trial. Trial end = start + days. A purchase during the trial starts after the trial ends (payments/).

## Offer emails and the email list

Signing up shows "Email me offers and updates", unticked. The Account sheet can turn it on or off at
any time. The rules allow the user to change only `marketingOptIn` (true/false) with
`marketingOptInAt` = the server's time, which is the record of consent. Deleting the account sets it
to false. Admin > Users > "Export email list (CSV)" downloads only active accounts that agreed;
"All users (CSV)" is every account that is not deleted, for records. Both are admin-only (rules), and
each export adds a `users_export` record to History.

## Account sheet (every user)

- **Edit name and mobile number**: the only profile fields a user may change (the rules check them).
- **My payments**: the user's own `payments` records (`where userId == uid`), newest first. Only the server writes them.
- **Delete my account**: asks for the password (or Google) again, then empties `users/{uid}` (name, email, mobile, photo),
  sets `accountStatus: 'deleted'` and `deletedAt`, and deletes the Firebase sign-in. Payment records stay, linked only by uid.
  A deleted profile can never be changed again, by the user or the admin. Projects on the device are not touched.

## Google sign-in on Windows

Google does not allow its sign-in page inside an app window. So the Windows app opens the website
(`https://rakeshmkr720042.github.io/ApanaVidEditor/#desktop-signin?port=…&state=…`) in the default browser.
That page signs in with Google in a throw-away session, so the browser's own sign-in is left alone.
It then sends only the Google ID token to the app's one-time server on `127.0.0.1:<port>`, and the app signs in to
Firebase with that token. No client secret and no extra setup are needed: the website's domain is already
an authorized domain, and the token's audience is the project's own web client.

Android comes later: Google sign-in there needs a fixed app signing key (the same one Play Store uses).

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
