export function fmtTime(sec: number, tenths = true) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const base = `${m}:${String(s).padStart(2, '0')}`
  return tenths ? `${base}.${Math.floor((sec % 1) * 10)}` : base
}

export const uid = () => Math.random().toString(36).slice(2, 10)
