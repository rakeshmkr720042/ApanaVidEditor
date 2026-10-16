# ClipCut

Lightweight, offline-first video editor for the web (installable PWA) and Android (Capacitor).
Everything runs on the device: rendering in WebGL, encoding with WebCodecs, muxing with ffmpeg.wasm. Nothing is uploaded.

## Features
**Editing**: import video, photos and audio; drag-and-drop timeline with thumbnails, pinch zoom and long-press reorder;
trim, split, duplicate, delete; crop with ratio presets, rotate, flip; speed 0.1×–10× and 8 speed-ramp curves;
undo/redo; projects autosave to IndexedDB.

**Effects**: 65 GPU transitions (fades, wipes, slides, shapes, zooms, glitch…), 110 filters in 11 groups with
strength control, 14 colour-grading sliders (exposure, contrast, temperature, tint, HSL, vignette, grain, sharpen…),
blur or pixelate areas, picture-in-picture overlays with masks, borders and green-screen chroma key.

**Audio**: 18 royalty-free music tracks and 12 sound effects generated on the device (no downloads, no licences),
import your own audio, record voice-over, per-clip and per-track volume and fade in/out, transition crossfades.

**Text**: text overlays with 18 fonts (Latin and Hindi/Devanagari), styles, outline, background and in/out animations,
subtitles with SRT import and export, stickers.

**Export**: MP4 (H.264/AAC), WebM (VP9/Vorbis), MOV, GIF and MP3; 480p to 2K; 24/25/30/60 fps; aspect ratio change
(9:16, 1:1, 16:9, 4:5…) with blurred, black or white background; removable watermark; cover thumbnail selector;
batch export; lossless "fast" export for plain cuts.

**App**: mobile-first dark UI, English/Hindi toggle, works offline after first load (ffmpeg core and fonts are cached
on first use or with the "Offline pack" button on the home screen).

## Run
```bash
npm install        # also copies the ffmpeg core and fonts into public/
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve dist/ on http://localhost:4173
```

## Android
Needs Android Studio / the Android SDK.
```bash
npm run build
npx cap sync android
npx cap open android   # then Run, or Build > Build Bundle(s) / APK(s)
```
ffmpeg and fonts are bundled inside the APK, so it works offline from the first launch.
Exports are saved to Documents/ClipCut and can be shared from the export sheet.

## Live link (GitHub Pages)
`.github/workflows/pages.yml` builds and deploys on every push to `main`.
In the repository go to Settings > Pages and set Source to "GitHub Actions" once.

## Performance notes
- H.264 export uses the device's hardware encoder through WebCodecs when available (Chrome, Edge, Android WebView).
  Where only VP9 exists, MP4 export re-encodes with x264 in WebAssembly, which is slower.
- Preview renders at screen size; export renders frame-by-frame at the chosen resolution.

## Layout
- `src/model/` – project model, timeline maths (speed, ramps, transitions), editor operations with undo
- `src/engine/renderer.ts` – shared renderer for preview and export (frame → WebGL grading/transitions → layers)
- `src/engine/gl.ts`, `filters.ts`, `transitions.ts` – shaders, filter presets, transitions
- `src/engine/player.ts` – real-time preview clock driving video/audio elements
- `src/engine/exporter.ts`, `frames.ts`, `audiomix.ts` – export pipeline
- `src/engine/music.ts` – synthesised music and sound effects
- `src/components/`, `src/panels/` – UI
