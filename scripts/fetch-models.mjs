// Downloads the AI models that are built into the Windows and Android apps into public/models/
// (the website does not run this, so its users download models in the app instead). The app
// reads public/models/index.json to know which models it can load without internet.
//   node scripts/fetch-models.mjs            -> the default set below
//   MODELS=none node scripts/fetch-models.mjs -> no built-in models
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'public/models')

// Whisper tiny (q8, ~42 MB): AI captions in about 30 languages without any download
const SETS = {
  'onnx-community/whisper-tiny': [
    'config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json',
    'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
  ],
}
const wanted = process.env.MODELS === 'none' ? [] : process.env.MODELS ? process.env.MODELS.split(',') : Object.keys(SETS)

async function get(url, file) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      await writeFile(file, Buffer.from(await res.arrayBuffer()))
      return
    } catch (e) {
      if (i === 3) throw e
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i))
    }
  }
}

rmSync(dest, { recursive: true, force: true })
let total = 0
for (const id of wanted) {
  if (!SETS[id]) throw new Error(`Unknown model ${id}`)
  for (const f of SETS[id]) {
    const file = join(dest, id, f)
    mkdirSync(dirname(file), { recursive: true })
    await get(`https://huggingface.co/${id}/resolve/main/${f}`, file)
    total += statSync(file).size
  }
}
mkdirSync(dest, { recursive: true })
writeFileSync(join(dest, 'index.json'), JSON.stringify(wanted))
console.log(`built-in models: ${wanted.join(', ') || 'none'} (${(total / 1048576).toFixed(1)} MB)`)
