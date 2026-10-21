// Copies runtime assets from node_modules into public/ so they are served from our own
// origin: the ffmpeg.wasm core, the ONNX runtime for the AI features, and the text fonts.
// They are cached by the service worker on first use and bundled into the Windows and
// Android apps, so they work offline.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules')

const ffDest = join(root, 'public/ffmpeg')
mkdirSync(ffDest, { recursive: true })
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) cpSync(join(nm, '@ffmpeg/core/dist/esm', f), join(ffDest, f))

// the plain (CPU) ONNX runtime build: the AI worker runs models on 'wasm', not WebGPU
const ortDest = join(root, 'public/ort')
mkdirSync(ortDest, { recursive: true })
for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) cpSync(join(nm, 'onnxruntime-web/dist', f), join(ortDest, f))

// package id -> CSS family name
const fonts = {
  'noto-sans-devanagari': 'Noto Sans Devanagari', poppins: 'Poppins', montserrat: 'Montserrat', hind: 'Hind',
  'bebas-neue': 'Bebas Neue', anton: 'Anton', oswald: 'Oswald', teko: 'Teko', bangers: 'Bangers',
  righteous: 'Righteous', 'playfair-display': 'Playfair Display', pacifico: 'Pacifico', lobster: 'Lobster',
  'dancing-script': 'Dancing Script', caveat: 'Caveat', 'permanent-marker': 'Permanent Marker',
  kalam: 'Kalam', 'yatra-one': 'Yatra One',
}
const fontDest = join(root, 'public/fonts')
mkdirSync(fontDest, { recursive: true })
const manifest = []
for (const [id, family] of Object.entries(fonts)) {
  const files = []
  for (const subset of ['latin', 'devanagari']) {
    for (const w of [700, 400]) {
      const src = join(nm, '@fontsource', id, 'files', `${id}-${subset}-${w}-normal.woff2`)
      if (!existsSync(src)) continue
      const name = `${id}-${subset}.woff2`
      cpSync(src, join(fontDest, name))
      files.push({ subset, file: name, weight: w })
      break
    }
  }
  manifest.push({ family, files })
}
writeFileSync(join(fontDest, 'fonts.json'), JSON.stringify(manifest))
console.log(`assets copied: ffmpeg core, onnx runtime, ${manifest.length} fonts`)
