import type { Marker } from '../types'
import { fmtTime } from './format'

/** "0:00 Intro" lines for a YouTube description (YouTube needs the first chapter at 0:00 and 3+ chapters). */
export function chaptersText(markers: Marker[]) {
  const list = [...markers].sort((a, b) => a.t - b.t)
  const lines = list.map((m) => `${fmtTime(m.t, false)} ${m.name.trim() || fmtTime(m.t, false)}`)
  if (!list.length || list[0].t >= 1) lines.unshift('0:00 Intro')
  return lines.join('\n')
}
