# Apna Editor payment server (Cloudflare Worker)

Turns Pro on after a Razorpay payment, on the website and the Windows app. Android will use Google
Play Billing instead. Free plan: Cloudflare Workers free tier (100,000 requests a day), no card.

## How a purchase works

1. The app (signed in) calls `POST /razorpay/order {planId}` with its Firebase ID token.
   The Worker checks the token (Google's RS256 keys, this project's audience, verified email),
   reads the plan **price from Firestore** (`subscription_plans`), makes a Razorpay order and writes
   `payments/rzp_<orderId>` with status `created`.
2. Razorpay Checkout takes the money. Website: over the page. Windows: on the website in the default
   browser (`#pay?order=…`), because the app window is locked down; the app polls the order status.
3. `POST /razorpay/verify {orderId, paymentId, signature}`: the Worker checks the checkout signature
   (HMAC with the Key Secret), **fetches the payment from Razorpay** with the secret key, checks order,
   amount and currency, captures it if only authorised, and then in one Firestore transaction:
   `users/{uid}.proUntil` += plan months (from today or from the current end date), `planId`,
   `payments/rzp_<orderId>` → `success`, and `subscriptions/rzp_<orderId>`.
   Calling it again (app retry, webhook) changes nothing.
4. `POST /razorpay/webhook` (optional, `RAZORPAY_WEBHOOK_SECRET`): Razorpay's `payment.captured` /
   `order.paid` do the same, in case the buyer closed the app before step 3.

The app never writes Pro: the Firestore rules forbid it (`proUntil`, `payments`, paid
`subscriptions` are server-only). A paid order whose account was deleted is marked
`paid_no_account` for the admin to refund.

## Safety switches

- Test key (`rzp_test_…`): only the emails in `TEST_BUYERS` can buy, so test cards cannot give Pro to
  the public.
- Live key (`rzp_live_…`): refused until `LIVE_PAYMENTS = "on"` (only with Rakesh's go-ahead).
- CORS only for the website, the Windows app (`app://bundle`), the Android app and local development.

## Settings

`wrangler.toml` (not secret): `account_id`, `RAZORPAY_KEY_ID`, `FIREBASE_PROJECT_ID`,
`ALLOWED_ORIGINS`, `TEST_BUYERS`, `LIVE_PAYMENTS`.

GitHub Secrets (the deploy workflow copies them into the Worker): `CLOUDFLARE_API_TOKEN`,
`RAZORPAY_KEY_SECRET`, `FIREBASE_SERVICE_ACCOUNT` (already there for Firebase), optional
`RAZORPAY_WEBHOOK_SECRET`.

The app needs the Worker's address at build time: `VITE_PAYMENTS_URL`
(e.g. `https://apna-editor-payments.<name>.workers.dev`). Without it, buying stays off.

## Tests

`npm test` here starts the Firestore emulator (firebase-tools from `../firebase/test`, run
`npm ci` there first) and runs `test/payments.test.js`: real token checks with a test RSA key, real
Firestore transactions, a fake Razorpay API. `.github/workflows/payments.yml` runs them on every
change and deploys from `main` once the secrets are there.
