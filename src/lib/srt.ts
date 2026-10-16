export interface Cue { start: number; end: number; text: string }

const ts = (s: string) => {
  const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/)
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0').slice(0, 3) / 1000 : 0
}

export function parseSrt(src: string): Cue[] {
  return src.replace(/\r/g, '').split(/\n\s*\n/).flatMap((block) => {
    const lines = block.trim().split('\n')
    const i = lines.findIndex((l) => l.includes('-->'))
    if (i < 0) return []
    const [a, b] = lines[i].split('-->')
    const text = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim()
    return text ? [{ start: ts(a), end: ts(b), text }] : []
  })
}

const fmt = (s: number) => {
  const ms = Math.round(s * 1000)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}

export const toSrt = (cues: Cue[]) => cues.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join('\n')
