// Runs tests/*.test.ts in Node: each file is bundled with Rolldown (comes with Vite), then run with node --test.
import { build } from 'rolldown'
import { readdirSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const files = readdirSync('tests').filter((f) => f.endsWith('.test.ts'))
const out = resolve('node_modules', '.cache', 'unit-tests')
mkdirSync(out, { recursive: true })
const built = []
for (const f of files) {
  const file = join(out, f.replace(/\.ts$/, '.mjs'))
  await build({
    input: join('tests', f),
    platform: 'node',
    logLevel: 'warn',
    // browser-only modules are never reached by the code under test
    external: [/^@capacitor\//, /^firebase/, /^@ffmpeg\//, /^@huggingface\//, /^@mediapipe\//, /^node:/],
    transform: { define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.glob': '(() => ({}))' } },
    output: { file, format: 'esm' },
  })
  built.push(file)
}
const r = spawnSync(process.execPath, ['--test', ...built], { stdio: 'inherit' })
process.exit(r.status ?? 1)
