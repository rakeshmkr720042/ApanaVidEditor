# ClipCut

Lightweight, offline-first video editor for web (PWA) and Android (Capacitor).
All processing happens on the device with ffmpeg.wasm; nothing is uploaded.

## Milestone 1 (done)
- Import one or more videos (file picker or drag & drop)
- CapCut-style timeline: centre playhead, scroll to scrub, thumbnails, zoom
- Trim with handles, split at playhead, duplicate, delete, undo/redo
- Seamless preview across clips
- Export: **Fast** (stream copy, original quality, keyframe cuts) or
  **Accurate** (x264 re-encode, frame-exact, 480p/720p/1080p/original)
- Works offline: app shell precached; ffmpeg core (~32 MB) cached on first
  export or via the "Offline mode" button
- Shortcuts: Space play/pause, S split, Delete, Ctrl+Z / Ctrl+Shift+Z

## Run
```bash
npm install        # also copies the ffmpeg core into public/ffmpeg
npm run dev        # http://localhost:5173
npm run build      # production build in dist/ (~80 KB gzipped JS)
```

## Android
Needs Android Studio / Android SDK on your machine.
```bash
npm run build
npx cap sync android
npx cap open android   # then Run, or Build > Build APK
```
On Android, ffmpeg is bundled inside the APK, so it works offline from the first launch.
Exports are saved to Documents/ClipCut and can be shared.

## Layout
- `src/lib/usePlayer.ts` – plays trimmed clips back-to-back on one `<video>`
- `src/lib/export.ts` – ffmpeg commands for fast/accurate export
- `src/lib/history.ts` – undo/redo (drag = one undo step)
- `src/components/Timeline.tsx` – timeline, scrubbing, trim handles
