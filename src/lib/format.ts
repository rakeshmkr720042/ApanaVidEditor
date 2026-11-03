export function fmtTime(sec: number, tenths = true) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const base = `${m}:${String(s).padStart(2, '0')}`
  return tenths ? `${base}.${Math.floor((sec % 1) * 10)}` : base
}

/** Timecode as editors show it: HH:MM:SS:FF (FF = frame number within the second at `fps`). */
export function fmtTimecode(sec: number, fps = 30) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const f = Math.round(fps) || 30
  const total = Math.floor(sec * f + 1e-6)
  const ff = total % f
  const s = Math.floor(total / f)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(ff)}`
}

export const uid = () => Math.random().toString(36).slice(2, 10)
