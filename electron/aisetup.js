// Local AI setup for the Windows app: looks at this computer (memory, graphics card, processor,
// free disk), picks a Gemma 4 model that fits, and, only after the user agrees in the app,
// installs Ollama with PowerShell and downloads the model through Ollama, sending progress back.
import { net } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { statfs, unlink } from 'node:fs/promises'
import { cpus, homedir, tmpdir, totalmem } from 'node:os'
import { join } from 'node:path'

const OLLAMA = 'http://127.0.0.1:11434'
const SETUP_URL = 'https://ollama.com/download/OllamaSetup.exe'
const GB = 1024 ** 3

/** Runs a PowerShell script and returns what it printed. */
function powershell(script, timeout = 60_000) {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { p.kill(); reject(new Error('PowerShell took too long')) }, timeout)
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { err += d })
    p.on('error', (e) => { clearTimeout(timer); reject(e) })
    p.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(err.trim() || `PowerShell exited with ${code}`))
    })
  })
}

// Graphics cards: the size from the driver's registry entry (Win32_VideoController stops at 4 GB)
const GPU_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$out = @()
Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' | ForEach-Object {
  if ($_.DriverDesc) { $out += [pscustomobject]@{ name = [string]$_.DriverDesc; bytes = [double]$_.'HardwareInformation.qwMemorySize' } }
}
if (-not $out.Count) { Get-CimInstance Win32_VideoController | ForEach-Object { $out += [pscustomobject]@{ name = [string]$_.Name; bytes = [double]$_.AdapterRAM } } }
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
[pscustomobject]@{ gpus = @($out); cpu = [string]$cpu } | ConvertTo-Json -Depth 3 -Compress
`

/** Cards Ollama can run a model on (NVIDIA, and AMD Radeon RX / PRO); built-in graphics don't count. */
const usableGpu = (name) => /nvidia|geforce|rtx|quadro|radeon\s*(rx|pro)/i.test(name) && !/radeon\(tm\)\s*graphics$/i.test(name)

export const ollamaExe = () => {
  const p = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Programs', 'Ollama', 'ollama.exe')
  return existsSync(p) ? p : null
}

async function ollamaUp() {
  try {
    const r = await net.fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) })
    if (!r.ok) return null
    const j = await r.json()
    return (j.models ?? []).map((m) => m.name)
  } catch { return null }
}

/** What this computer has, and whether Ollama is already there. */
export async function checkComputer() {
  let gpus = []
  let cpu = cpus()[0]?.model?.trim() || ''
  if (process.platform === 'win32') {
    try {
      const j = JSON.parse((await powershell(GPU_SCRIPT, 30_000)).trim() || '{}')
      gpus = [].concat(j.gpus ?? []).map((g) => ({ name: String(g.name || '').trim(), vram: Math.round((Number(g.bytes) || 0) / GB * 10) / 10 })).filter((g) => g.name)
      if (j.cpu) cpu = String(j.cpu).trim()
    } catch { /* the plan still works from memory alone */ }
  }
  const vram = Math.max(0, ...gpus.filter((g) => usableGpu(g.name)).map((g) => g.vram))
  let freeDisk = null
  try { const s = await statfs(homedir()); freeDisk = Math.round((s.bavail * s.bsize) / GB * 10) / 10 } catch { /* unknown */ }
  const models = await ollamaUp()
  return {
    windows: process.platform === 'win32',
    ram: Math.round(totalmem() / GB * 10) / 10,
    cores: cpus().length,
    cpu,
    gpus,
    vram,
    freeDisk,
    ollamaInstalled: !!models || !!ollamaExe(),
    ollamaRunning: !!models,
    models: models ?? [],
  }
}

let job = null // the running install: { cancel() }

/** Starts Ollama in the background if it isn't answering, then waits for it. */
async function startOllama(send) {
  if (await ollamaUp()) return
  const exe = ollamaExe()
  if (!exe) throw new Error('Ollama was not found after installing. Please install it from ollama.com and try again.')
  send({ step: 'start', text: 'Starting Ollama…' })
  const p = spawn(exe, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true })
  p.unref()
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 750))
    if (await ollamaUp()) return
  }
  throw new Error('Ollama did not start. Open the Ollama app from the Start menu and try again.')
}

/** Downloads the Ollama installer with progress and runs it silently through PowerShell. */
async function installOllama(send, signal) {
  const file = join(tmpdir(), 'OllamaSetup.exe')
  send({ step: 'download-ollama', text: 'Downloading Ollama…', p: 0 })
  const res = await net.fetch(SETUP_URL, { redirect: 'follow', signal })
  if (!res.ok || !res.body) throw new Error(`Could not download Ollama (error ${res.status}). Check the internet.`)
  const total = Number(res.headers.get('content-length') || 0)
  let got = 0
  const out = createWriteStream(file)
  const reader = res.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      got += value.byteLength
      if (!out.write(value)) await new Promise((r) => out.once('drain', r))
      send({ step: 'download-ollama', text: 'Downloading Ollama…', p: total ? got / total : -1, done: got, total })
    }
  } finally { await new Promise((r) => out.end(r)) }
  if (signal.aborted) throw new Error('Stopped')
  send({ step: 'install-ollama', text: 'Installing Ollama (a Windows prompt may ask to allow it)…', p: -1 })
  // the installer puts Ollama in the user's own folder, so it needs no administrator rights
  const ps = `Start-Process -FilePath '${file.replace(/'/g, "''")}' -ArgumentList '/VERYSILENT','/NORESTART','/SUPPRESSMSGBOXES' -Wait`
  await powershell(ps, 15 * 60_000)
  unlink(file).catch(() => {})
  for (let i = 0; i < 20 && !ollamaExe(); i++) await new Promise((r) => setTimeout(r, 500))
  if (!ollamaExe()) throw new Error('Ollama did not install. Windows may have blocked it.')
}

/** Downloads the model through Ollama's own API, which reports progress as it goes. */
async function pullModel(model, send, signal) {
  send({ step: 'pull', text: `Downloading ${model}…`, p: 0 })
  const res = await net.fetch(`${OLLAMA}/api/pull`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, stream: true }), signal,
  })
  if (!res.ok || !res.body) throw new Error(`Ollama could not download ${model} (error ${res.status})`)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let last = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      let j
      try { j = JSON.parse(line) } catch { continue }
      if (j.error) throw new Error(`Ollama: ${j.error}`)
      last = j.status || last
      const big = j.total && j.total > 50 * 1024 * 1024 // the model's main file; small ones flash by
      send({ step: 'pull', text: `Downloading ${model}…`, status: j.status, p: big ? (j.completed || 0) / j.total : -1, done: j.completed, total: j.total })
    }
  }
  if (signal.aborted) throw new Error('Stopped')
  if (last !== 'success') throw new Error('The download stopped before it finished. Try again; it continues where it stopped.')
}

/** The whole setup: Ollama if missing, start it, then the model. */
export async function runSetup(model, send) {
  if (process.platform !== 'win32') throw new Error('Automatic setup is for the Windows app')
  if (typeof model !== 'string' || !/^gemma4:[\w.-]+$/.test(model)) throw new Error('Unknown model')
  if (job) throw new Error('Setup is already running')
  const ctl = new AbortController()
  job = { cancel: () => ctl.abort() }
  try {
    if (!(await ollamaUp()) && !ollamaExe()) await installOllama(send, ctl.signal)
    await startOllama(send)
    const have = (await ollamaUp()) ?? []
    if (!have.includes(model)) await pullModel(model, send, ctl.signal)
    send({ step: 'done', text: 'Ready', p: 1 })
    return { ok: true, model }
  } catch (e) {
    throw new Error(ctl.signal.aborted ? 'Stopped' : e.message)
  } finally { job = null }
}

export const cancelSetup = () => job?.cancel()
