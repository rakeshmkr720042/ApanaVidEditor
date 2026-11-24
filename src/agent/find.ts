/**
 * Finds a catalogue item (filter, effect, transition, camera move…) from the words a person or the AI used:
 * its id, its name, a Hindi / Hinglish word for it, or the closest name. Lists come from the app's own
 * catalogues, so a new filter is found here without any change.
 */
export interface Named { id: string; name: string; group?: string }

const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim()

/** Everyday words (English, Hinglish, Hindi) for common looks and moves → a word in the catalogue's names or ids. */
export const SYNONYMS: Record<string, string> = {
  'black and white': 'mono', 'black white': 'mono', 'b and w': 'mono', 'bw': 'mono', 'kala safed': 'mono', 'blackandwhite': 'mono', 'blackwhite': 'mono', 'grey': 'mono', 'gray': 'mono',
  'काला सफ़ेद': 'mono', 'ब्लैक एंड व्हाइट': 'mono',
  'garam': 'warm', 'गरम': 'warm', 'thanda': 'cold', 'cool': 'cold', 'ठंडा': 'cold',
  'purana': 'retro', 'old': 'retro', 'पुराना': 'retro', 'movie': 'teal orange', 'cinematic': 'teal orange', 'film jaisa': 'teal orange', 'filmy': 'bollywood',
  'rangeen': 'vivid', 'colorful': 'vivid', 'colourful': 'vivid', 'रंगीन': 'vivid', 'sapna': 'dreamy', 'pyaar': 'romantic', 'love': 'romantic',
  'zoom': 'zoomin', 'slide': 'slideleft', 'wipe': 'wipeleft', 'whip': 'whipleft', 'cube': 'cubeleft', 'smooth': 'smoothleft',
  'dil': 'heart', 'दिल': 'heart', 'ghumna': 'spin', 'chamak': 'sparkle', 'barf': 'snow', 'बर्फ': 'snow',
  'khoobsurat': 'beauty glow', 'beauty': 'beauty glow', 'gora': 'smooth skin', 'skin': 'smooth skin', 'saaf': 'enhance', 'clear': 'enhance', 'sharp': 'enhance',
  'cartoon': 'cartoon', 'anime': 'anime', 'sketch': 'sketch',
}

/** Best match for `query` in `list`, or null. `score` 1 = exact. */
export function findNamed<T extends Named>(list: readonly T[], query: string): { item: T; score: number } | null {
  const q0 = norm(query)
  if (!q0) return null
  const q = norm(SYNONYMS[q0] ?? q0)
  const id = q.replace(/ /g, '-')
  let best: { item: T; score: number } | null = null
  const take = (item: T, score: number) => { if (!best || score > best.score) best = { item, score } }
  for (const it of list) {
    const n = norm(it.name), i = it.id.toLowerCase()
    if (i === id || i === q.replace(/ /g, '') || n === q) return { item: it, score: 1 }
    if (i.endsWith('-' + id)) take(it, 0.9)
    else if (n.startsWith(q) || i.startsWith(id)) take(it, 0.8)
    else if (n.includes(q) || i.includes(id)) take(it, 0.7)
    else {
      // shared words: "warm sunset look" → Warm sunset
      const qs = q.split(' ').filter((w) => w.length > 2), ns = new Set([...n.split(' '), ...i.split('-')])
      const hit = qs.filter((w) => ns.has(w)).length
      if (hit) take(it, 0.4 + 0.2 * (hit / Math.max(qs.length, 1)))
    }
  }
  return best
}

/** Catalogue items named anywhere inside a longer sentence (for the no-AI quick commands). Longest name wins. */
export function namedIn<T extends Named>(list: readonly T[], text: string): T | null {
  const s = ` ${norm(text)} `
  for (const [w, to] of Object.entries(SYNONYMS).sort((a, b) => b[0].length - a[0].length)) {
    if (s.includes(` ${norm(w)} `)) { const f = findNamed(list, to); if (f && f.score >= 0.7) return f.item }
  }
  let best: T | null = null
  for (const it of list) {
    const n = norm(it.name)
    if (n.length > 2 && s.includes(` ${n} `) && (!best || n.length > norm(best.name).length)) best = it
  }
  return best
}
