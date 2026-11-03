# Apna Editor brand + Play Store assets

`python3 scripts/brand/make_brand.py` (after `npm ci`) rebuilds everything below from `source/`.

## source/ (the 10 brand pictures, as received)

| File | Used for |
| --- | --- |
| `02-app-icon.png` | Every app icon: Android launcher (all sizes, adaptive + round), Android splash, Windows app, website favicon + install icons, Play Store icon |
| `10-logo.png` | `public/brand/logo.webp`: privacy page and README |
| `07-hero-background.jpg` | Home "New project" card background (`public/brand/hero.webp`) and the Play Store feature graphic |
| `06-go-pro-banner.jpg` | Home "Go Pro" card for Free users on the website and Windows (`public/brand/go-pro.webp`) |
| `09-logo-festive.jpg` | Not used yet (festival / Diwali promotions) |
| `05-premium-features-banner.jpg`, `08-promo-wide.jpg`, `03-promo-square.jpg`, `04-features-infographic.jpg`, `01-poster-tall.jpg` | Not used in the app or store listing: see "Needs a new version" |

The picture generator's small sparkle mark (bottom right) is cropped off where a picture is used.

## play-store/ (upload these to Play Console > Main store listing)

- `icon-512.png`: App icon (512 x 512)
- `feature-graphic-1024x500.png`: Feature graphic
- `phone-1-editor.png` … `phone-4-home-hindi.png`: Phone screenshots (1080 x 1920), made from real app screens in `app-screens/`

## Needs a new version before using it in public

- `01-poster-tall`: placeholder text "Feature 1 / Feature 2 / Feature 3", typos "Subtttle", "shtile Layers".
- `03-promo-square`: Apple "App Store" badge (there is no iPhone app), garbled phone screen text.
- `04-features-infographic`: garbled labels ("AI aur …", "No d/ Outo", "Presets GIF)", "Expert formats"); counts (113+ features, 132 filters, 184 stickers …) must match the app.
- `05-premium-features-banner`: garbled screen text ("Auto-totey Text", "Desktop editor" mockup labels); check "132 Filters" matches the app.
- `08-promo-wide`: Apple "App Store" badge, screen text "Video Video", "Accees".
- `06-go-pro-banner` (used on Home): fine, but "1 month free" is the sign-in trial, and ads stay during the trial; only a paid plan removes them.

Play Store rule: screenshots and graphics must not show other stores' badges or features the app does not have.
