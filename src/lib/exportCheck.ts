// Safe export: a check before an export starts (memory and free space against the size of the
// video), lighter settings to fall back to when an export fails, and a note of the settings that
// were running when the app died, so the next try starts safer.
import { Capacitor } from '@capacitor/core'
import type { ExportJob, Resolution } from '../engine/exporter'
import { memoryNow } from './blackbox'

export const isPhone = Capacitor.isNativePlatform() || /Android|iPhone|iPad|Mobile/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')

export interface ExportCheck {
  level: 'ok' | 'warn' | 'danger'
  /** English sentences, run through t() when shown */
  reasons: string[]
  /** lighter settings, or null when nothing lighter makes sense */
  safer: ExportJob | null
}

const STEPS: Resolution[] = ['480', '720', '1080', '1440', '2160']

/** The next lighter job: one resolution step down (not below 720p), the Small file size, at most 30 fps. Null if already light. */
export function saferJob(j: ExportJob): ExportJob | null {
  if (j.format === 'gif' || j.format === 'mp3') return null
  const i = STEPS.indexOf(j.resolution)
  const resolution = i > 1 ? STEPS[i - 1] : j.resolution
  const next: ExportJob = { ...j, resolution, size: 'small', fps: Math.min(30, j.fps), cover: null }
  if (next.resolution === j.resolution && next.size === j.size && next.fps === j.fps) return null
  return next
}

/** A job that should fit a phone's memory: 720p on phones with up to 4 GB, 1080p otherwise; Small; 30 fps. */
function phoneJob(j: ExportJob, deviceGB: number | undefined): ExportJob {
  const top: Resolution = deviceGB != null && deviceGB <= 4 ? '720' : '1080'
  const resolution = STEPS.indexOf(j.resolution) > STEPS.indexOf(top) ? top : j.resolution
  return { ...j, resolution, size: 'small', fps: Math.min(30, j.fps) }
}

/**
 * Looks at the job before it runs. `estimate` is the expected file size in bytes (estimateSize),
 * `seconds` the length of the video. Memory figures come from the browser and are rough: phones
 * report at most 8 GB, and the browser's own limit is far lower than the phone's RAM.
 */
export async function checkExport(j: ExportJob, estimate: number | null, seconds: number): Promise<ExportCheck> {
  const reasons: string[] = []
  let level: ExportCheck['level'] = 'ok'
  const raise = (l: 'warn' | 'danger') => { if (l === 'danger' || level === 'ok') level = l }
  const mem = memoryNow()
  const bytes = estimate ?? 0
  const mb = bytes / 1048576

  // free space: the finished file is held by the browser, then copied to Documents
  try {
    const e = await navigator.storage?.estimate?.()
    if (e?.quota != null && bytes > 0) {
      const free = e.quota - (e.usage ?? 0)
      if (free < bytes * 1.5) { reasons.push('There may not be enough free storage for this video. Free some space or pick a smaller size.'); raise('danger') }
    }
  } catch { /* not supported */ }

  if (isPhone && j.format !== 'mp3') {
    // the file is put together in memory at the end: roughly two copies of it at once
    const budgetMB = (mem.deviceGB ?? 4) * 1024 * 0.18
    if (j.resolution === '2160') { reasons.push('4K on a phone uses a lot of memory and often makes the app close.'); raise('danger') }
    else if (j.resolution === '1440') { reasons.push('2K on a phone uses a lot of memory.'); raise('warn') }
    if (mb * 2 > budgetMB) {
      reasons.push("The finished video is big for this phone's memory.")
      raise(mb * 2 > budgetMB * 2 ? 'danger' : 'warn')
    }
    if (seconds > 20 * 60 && j.resolution !== '480' && j.resolution !== '720') { reasons.push('Long videos are safer at 720p on a phone.'); raise('warn') }
    if (j.fps > 30) { reasons.push('60 fps doubles the work; 30 fps is safer on a phone.'); raise('warn') }
  }
  if (mem.limitMB && mem.heapMB && mem.heapMB / mem.limitMB > 0.7) { reasons.push('The app is already using a lot of memory. Closing and opening the app again first helps.'); raise('warn') }

  const lighter = phoneJob(j, mem.deviceGB)
  const changed = lighter.resolution !== j.resolution || lighter.size !== j.size || lighter.fps !== j.fps
  return { level, reasons, safer: level === 'ok' ? null : changed ? lighter : saferJob(j) }
}

// ---- the export that was running when the app died
const RUNNING_KEY = 'export-running'

export function markExportRunning(j: ExportJob | null) {
  try { if (j) localStorage.setItem(RUNNING_KEY, JSON.stringify({ job: j, at: Date.now() })); else localStorage.removeItem(RUNNING_KEY) } catch { /* storage off */ }
}

/** The settings of an export that never finished (the app closed during it), read once. */
let crashedCache: { v: ExportJob | null } | null = null
export function crashedExport(): ExportJob | null {
  crashedCache ??= { v: readCrashed() }
  const v = crashedCache.v
  // hand it out for this page load only (a second Export sheet open must not repeat the note)
  setTimeout(() => { if (crashedCache) crashedCache.v = null }, 1000)
  return v
}

function readCrashed(): ExportJob | null {
  try {
    const raw = localStorage.getItem(RUNNING_KEY)
    if (!raw) return null
    localStorage.removeItem(RUNNING_KEY)
    const v = JSON.parse(raw) as { job: ExportJob; at: number }
    return v?.job && Date.now() - v.at < 3 * 864e5 ? v.job : null
  } catch { return null }
}
