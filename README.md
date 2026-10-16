# ApanaVidEditor

Lightweight, offline-first video editor for the web (installable PWA) and Android (Capacitor).
Everything runs on the device: rendering in WebGL, encoding with WebCodecs, muxing with ffmpeg.wasm. Nothing is uploaded.

## Features
**Editing**: import video, photos and audio; drag-and-drop timeline with thumbnails, pinch zoom and long-press reorder;
trim, split, duplicate, delete; crop with ratio presets, rotate, flip; speed 0.1×–10× and 8 speed-ramp curves;
undo/redo; magnetic snap (text, audio and overlay layers snap to clip edges, other layers and the playhead; toggle with
the magnet button); sound waveforms on video clips; projects autosave to IndexedDB, with a Save button and a portable
`.avp` project file (project plus its media) that opens from the home screen on any device.

**Effects**: 65 GPU transitions (fades, wipes, slides, shapes, zooms, glitch…), 116 filters in 12 groups (including creator Looks: Warm Sunset, Cold Blue, Film Noir, Vintage, Vivid Pop, Matte) with
strength control, 14 colour-grading sliders (exposure, contrast, temperature, tint, HSL, vignette, grain, sharpen…),
blur or pixelate areas, picture-in-picture overlays with masks, borders and green-screen chroma key.

**Audio**: 18 royalty-free music tracks and 12 sound effects generated on the device (no downloads, no licences),
import your own audio, record voice-over, per-clip and per-track volume and fade in/out, transition crossfades.

**Text**: text overlays with 18 fonts (Latin and Hindi/Devanagari), styles, outline, background and in/out animations,
subtitles with SRT import and export, stickers. One-tap motion titles: Typewriter, Bounce In, Slide In Left/Right, Fade In,
Zoom In.

**Watermark**: your own text (name or channel, any of the 18 fonts, size, colour, bold, shadow) or logo image, with
10–100% opacity; place it on a 9-point grid or drag it on the preview, or let it float slowly around the frame
(anti-piracy style); show it for the full video or a time range only. It is baked into the export.

**AI captions & dubbing** (the "AI Dub" tool):
- *Auto captions*: Whisper (tiny/base/small) runs in the browser through transformers.js and turns the timeline's speech
  into timed subtitles, in the spoken language or translated to English. Export them as .srt.
- *Translate*: subtitles are translated into 60 languages with the free MyMemory API, keeping their timing; the
  translated .srt is downloaded and can replace the on-screen subtitles. Needs internet; an optional email raises the
  free limit to 50,000 characters a day.
- *Voice-over*: each subtitle is spoken with an offline Meta MMS voice (English, Hindi, Spanish, French, German,
  Portuguese, Russian, Arabic, Vietnamese, Romanian, Yoruba) at its time, sped up to fit its slot when needed; the
  original sound is lowered and the voice track lands on the timeline, so it is in the export.
The library and models download on first use (45–250 MB for captions, ~30 MB per voice) and stay in the browser cache.

**Export**: platform presets (YouTube 1080p 16:9, Instagram Reel 1080×1920, WhatsApp Status 720×1280, Twitter/X 720p,
Square 1080×1080) that set frame shape, size and frame rate in one tap; MP4 (H.264/AAC), WebM (VP9/Vorbis), MOV, GIF and MP3; 480p to 2K; 24/25/30/60 fps; aspect ratio change
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
Exports are saved to Documents/ApanaVidEditor and can be shared from the export sheet.

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
- `src/engine/ai.ts`, `ai.worker.ts` – speech to text, translation and text to speech
- `src/engine/music.ts` – synthesised music and sound effects
- `src/engine/watermark.ts` – user watermark layout (grid, drag, floating path) and drawing
- `src/components/`, `src/panels/` – UI
