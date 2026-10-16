// Copies the ffmpeg.wasm core into public/ so it is served from our own origin
// (works offline via the service worker, and gets bundled into the Android APK).
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules/@ffmpeg/core/dist/esm')
const dest = join(root, 'public/ffmpeg')
mkdirSync(dest, { recursive: true })
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) cpSync(join(src, f), join(dest, f))
console.log('ffmpeg core copied to public/ffmpeg')
