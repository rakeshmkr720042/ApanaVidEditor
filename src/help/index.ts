import type { HelpLang, HelpSection, HelpTopic } from './types'

/** Every file in ./sections/ (each default-exports one HelpSection), sorted for the contents. */
const files = import.meta.glob<{ default: HelpSection }>('./sections/*.ts', { eager: true })

export const SECTIONS: HelpSection[] = Object.values(files)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))

export interface TopicRef { section: HelpSection; topic: HelpTopic }

/** All topics in reading order. */
export const TOPICS: TopicRef[] = SECTIONS.flatMap((section) => section.topics.map((topic) => ({ section, topic })))

export const findTopic = (id: string) => TOPICS.find((r) => r.topic.id === id) ?? null

if (import.meta.env.DEV) {
  const seen = new Set<string>()
  for (const { section, topic } of TOPICS) {
    if (seen.has(topic.id)) console.warn(`[help] topic id "${topic.id}" is used twice (section ${section.id})`)
    seen.add(topic.id)
    for (const l of ['en', 'hi'] as const) if (!topic[l]?.title || !topic[l]?.steps?.length) console.warn(`[help] topic "${topic.id}" has no ${l} text`)
  }
}

/** Lower case, no accents/nuktas, so "Speed", "speed" and "स्पीड" variants match. */
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-़ͯ]/g, '')

const haystack = new Map<string, string>()
const textOf = (topic: HelpTopic) => {
  let h = haystack.get(topic.id)
  if (h == null) {
    const parts: string[] = [...(topic.keywords ?? [])]
    for (const l of ['en', 'hi'] as const) {
      const x = topic[l]
      parts.push(x.title, x.what, x.where ?? '', ...x.steps, ...(x.tips ?? []))
    }
    h = norm(parts.join(' \n '))
    haystack.set(topic.id, h)
  }
  return h
}

/**
 * Topics that contain every word of the query, in any language (a Hindi reader can type an English
 * word and the other way round). Title matches come first.
 */
export function searchHelp(query: string, lang: HelpLang): TopicRef[] {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const hits: { r: TopicRef; score: number }[] = []
  for (const r of TOPICS) {
    const h = textOf(r.topic)
    if (!words.every((w) => h.includes(w))) continue
    const title = norm(`${r.topic[lang].title} ${r.topic.en.title} ${(r.topic.keywords ?? []).join(' ')}`)
    const score = words.reduce((s, w) => s + (title.includes(w) ? 10 : 0) + (norm(r.topic[lang].what).includes(w) ? 3 : 0), 0)
    hits.push({ r, score })
  }
  return hits.sort((a, b) => b.score - a.score).map((x) => x.r)
}
