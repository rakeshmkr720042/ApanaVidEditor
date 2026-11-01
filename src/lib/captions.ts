import type { TextLayer, TextStyle, WordFx } from '../types'
import { wordTimes } from '../engine/text'
import { uid } from './format'

/** Ready-made trending caption looks: font, colours and the word-by-word style in one tap. */
export const CAPTION_LOOKS: { name: string; style: Partial<TextStyle>; words: WordFx | null; size?: number }[] = [
  {
    name: 'Bold yellow', words: { style: 'color', color: '#ffe600', caps: true },
    style: { font: 'Anton', color: '#ffffff', stroke: '#000000', strokeWidth: 0.9, shadow: true, background: null, bold: false, glow: null, fill: null },
  },
  {
    name: 'Pop', words: { style: 'pop', color: '#39ff14', caps: true },
    style: { font: 'Bangers', color: '#ffffff', stroke: '#000000', strokeWidth: 1, shadow: true, background: null, bold: false, letterSpacing: 0.03, glow: null, fill: null },
  },
  {
    name: 'Box', words: { style: 'box', color: '#8b5cf6' },
    style: { font: 'Montserrat', color: '#ffffff', stroke: null, shadow: true, background: null, bold: true, glow: null, fill: null },
  },
  {
    name: 'Karaoke', words: { style: 'karaoke', color: '#00e5ff' },
    style: { font: 'Poppins', color: '#ffffff', stroke: '#000000', strokeWidth: 0.6, shadow: false, background: null, bold: true, glow: null, fill: null },
  },
  {
    name: 'One word', words: { style: 'one', color: '#ffffff', caps: true }, size: 0.09,
    style: { font: 'Anton', color: '#ffffff', stroke: '#000000', strokeWidth: 0.9, shadow: true, background: null, bold: false, glow: null, fill: null },
  },
  {
    name: 'Word by word', words: { style: 'reveal', color: '#ffd166' },
    style: { font: 'Poppins', color: '#ffffff', stroke: null, shadow: true, background: null, bold: true, glow: null, fill: null },
  },
  {
    name: 'Neon', words: { style: 'color', color: '#ff3df5' },
    style: { font: 'Righteous', color: '#ffffff', stroke: null, shadow: false, background: null, bold: false, glow: '#7df9ff', fill: null },
  },
  {
    name: 'Podcast', words: { style: 'box', color: '#ef4444' },
    style: { font: 'Montserrat', color: '#ffffff', stroke: null, shadow: false, background: '#000000aa', bold: true, glow: null, fill: null },
  },
  {
    name: 'Hindi', words: { style: 'color', color: '#ffd166' },
    style: { font: 'Noto Sans Devanagari', color: '#ffffff', stroke: '#000000', strokeWidth: 0.7, shadow: true, background: null, bold: true, glow: null, fill: null },
  },
  {
    name: 'Clean', words: null,
    style: { font: 'Poppins', color: '#ffffff', stroke: null, shadow: false, background: 'rgba(0,0,0,0.55)', bold: true, glow: null, fill: null },
  },
]

/**
 * Cuts captions into short ones of at most `max` words (2–4 words a screen is the Reels/Shorts look). Each piece
 * gets its share of the time, and a piece also ends at a comma or full stop.
 */
export function splitShort(subs: TextLayer[], max: number): { remove: Set<string>; add: TextLayer[] } {
  const remove = new Set<string>()
  const add: TextLayer[] = []
  for (const s of subs) {
    const words = s.text.match(/\S+/g) ?? []
    if (words.length <= max) continue
    const times = [...wordTimes(s.text, s.start, s.end), s.end]
    const groups: number[][] = [[]]
    words.forEach((w, i) => {
      const g = groups[groups.length - 1]
      g.push(i)
      const left = words.length - i - 1
      if (left && (g.length >= max || /[,.!?।;:]$/.test(w))) groups.push([])
    })
    // a single word left over at the end joins the piece before it when there is room
    const last = groups[groups.length - 1]
    if (groups.length > 1 && last.length === 1 && groups[groups.length - 2].length < max + 1 && !/[,.!?।;:]$/.test(words[last[0] - 1])) {
      groups[groups.length - 2].push(...groups.pop()!)
    }
    remove.add(s.id)
    for (const g of groups.filter((x) => x.length)) {
      add.push({
        ...s, id: uid(), text: g.map((i) => words[i]).join(' '), start: times[g[0]], end: times[g[g.length - 1] + 1],
        style: { ...s.style }, box: { ...s.box }, frame: s.frame ? { ...s.frame, rect: { ...s.frame.rect } } : s.frame,
        words: s.words ? { ...s.words } : s.words, keys: undefined,
      })
    }
  }
  return { remove, add }
}

// ---------- emojis

/** Words (English, Hinglish, Hindi) and the emoji that goes with them. First match in a caption wins. */
const EMOJI: [string[], string][] = [
  [['love', 'pyar', 'pyaar', 'प्यार', 'mohabbat', 'heart', 'dil', 'दिल'], '❤️'],
  [['money', 'paisa', 'paise', 'पैसा', 'पैसे', 'rupees', 'rupaye', 'रुपये', 'cash', 'dollar', 'dollars', 'income', 'salary', 'earn', 'kamai', 'कमाई'], '💰'],
  [['fire', 'aag', 'आग', 'hot', 'lit', 'amazing', 'awesome', 'zabardast', 'जबरदस्त', 'kamaal', 'कमाल'], '🔥'],
  [['laugh', 'funny', 'lol', 'haha', 'hasi', 'हंसी', 'joke', 'mazak', 'मजाक'], '😂'],
  [['sad', 'cry', 'dukh', 'दुख', 'rona', 'रोना', 'udaas', 'उदास'], '😢'],
  [['happy', 'khush', 'खुश', 'khushi', 'खुशी', 'smile', 'muskaan'], '😊'],
  [['wow', 'shocked', 'shock', 'surprise', 'unbelievable', 'omg'], '😮'],
  [['idea', 'tip', 'tips', 'trick', 'secret', 'raaz', 'राज़', 'राज', 'soch', 'सोच'], '💡'],
  [['time', 'samay', 'समय', 'waqt', 'वक्त', 'minute', 'minutes', 'hour', 'hours', 'ghanta', 'घंटा'], '⏰'],
  [['work', 'kaam', 'काम', 'job', 'office', 'business', 'dhandha', 'धंधा', 'vyapar', 'व्यापार'], '💼'],
  [['food', 'khana', 'खाना', 'eat', 'khao', 'pizza', 'burger', 'recipe', 'tasty', 'swad', 'स्वाद'], '🍔'],
  [['chai', 'चाय', 'tea', 'coffee'], '☕'],
  [['phone', 'mobile', 'call', 'फोन', 'मोबाइल'], '📱'],
  [['computer', 'laptop', 'code', 'coding', 'software'], '💻'],
  [['music', 'song', 'gaana', 'gana', 'गाना', 'sangeet', 'संगीत'], '🎵'],
  [['video', 'videos', 'camera', 'shoot', 'film', 'movie'], '🎬'],
  [['book', 'books', 'kitab', 'किताब', 'padhai', 'पढ़ाई', 'study', 'exam', 'school', 'college'], '📚'],
  [['winner', 'jeet', 'जीत', 'success', 'safalta', 'सफलता', 'trophy', 'champion'], '🏆'],
  [['goal', 'target', 'lakshya', 'लक्ष्य', 'focus'], '🎯'],
  [['grow', 'growth', 'badhna', 'बढ़ना', 'increase', 'profit', 'munafa', 'मुनाफा'], '📈'],
  [['loss', 'nuksaan', 'नुकसान', 'girna'], '📉'],
  [['strong', 'power', 'taakat', 'ताकत', 'gym', 'workout', 'fitness', 'exercise'], '💪'],
  [['health', 'sehat', 'सेहत', 'doctor', 'medicine', 'dawai', 'दवाई'], '🩺'],
  [['sleep', 'neend', 'नींद', 'sona', 'tired', 'thakaan'], '😴'],
  [['think', 'thinking', 'sochna', 'सोचना', 'question', 'sawal', 'सवाल', 'why', 'kyun', 'क्यों'], '🤔'],
  [['sahi', 'सही', 'correct', 'done'], '✅'],
  [['wrong', 'galat', 'गलत', 'mistake', 'galti', 'गलती'], '❌'],
  [['warning', 'danger', 'khatra', 'खतरा', 'careful', 'dhyan', 'ध्यान', 'alert'], '⚠️'],
  [['world', 'duniya', 'दुनिया', 'earth', 'global', 'country', 'desh', 'देश'], '🌍'],
  [['india', 'bharat', 'भारत', 'hindustan', 'हिंदुस्तान'], '🇮🇳'],
  [['home', 'ghar', 'घर', 'house'], '🏠'],
  [['car', 'gaadi', 'गाड़ी', 'drive', 'bike'], '🚗'],
  [['travel', 'trip', 'safar', 'सफर', 'flight', 'yatra', 'यात्रा'], '✈️'],
  [['family', 'parivar', 'परिवार', 'mummy', 'papa', 'maa', 'माँ', 'baby', 'bachche', 'बच्चे'], '👨‍👩‍👧'],
  [['friend', 'friends', 'dost', 'दोस्त', 'yaar', 'यार'], '🤝'],
  [['god', 'bhagwan', 'भगवान', 'pray', 'prayer', 'puja', 'पूजा', 'blessing', 'ashirwad'], '🙏'],
  [['thanks', 'thank', 'shukriya', 'शुक्रिया', 'dhanyavaad', 'धन्यवाद'], '🙏'],
  [['wedding', 'shaadi', 'shadi', 'शादी', 'marriage', 'vivah', 'विवाह'], '💍'],
  [['party', 'celebrate', 'celebration', 'birthday', 'janamdin', 'जन्मदिन', 'jashn'], '🎉'],
  [['gift', 'tohfa', 'तोहफा', 'free', 'muft', 'मुफ्त'], '🎁'],
  [['star', 'superstar'], '⭐'],
  [['fast', 'quick', 'jaldi', 'जल्दी', 'speed'], '⚡'],
  [['brain', 'dimag', 'दिमाग', 'smart', 'intelligent', 'mind'], '🧠'],
  [['rain', 'barish', 'baarish', 'बारिश'], '🌧️'],
  [['sun', 'suraj', 'सूरज', 'summer', 'garmi', 'गर्मी'], '☀️'],
  [['night', 'raat', 'रात', 'moon', 'chand', 'चाँद'], '🌙'],
  [['cricket', 'match'], '🏏'],
  [['game', 'games', 'gaming', 'khel', 'खेल'], '🎮'],
  [['subscribe', 'share', 'comment', 'follow'], '👍'],
  [['dekho', 'देखो', 'watch', 'dekhiye', 'देखिए'], '👀'],
  [['start', 'shuru', 'शुरू', 'launch', 'begin'], '🚀'],
  [['stop', 'ruko', 'रुको'], '✋'],
  [['angry', 'gussa', 'गुस्सा'], '😡'],
  [['cool', 'style', 'swag'], '😎'],
]

const LOOKUP = new Map<string, string>()
for (const [words, e] of EMOJI) for (const w of words) if (!LOOKUP.has(w)) LOOKUP.set(w, e)

const PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u
const EMOJI_RUN = /\s*(?:[\p{Extended_Pictographic}\p{Regional_Indicator}‍️\u{1F3FB}-\u{1F3FF}])+/gu

/** The emoji that fits a caption, or null. */
export function emojiFor(text: string): string | null {
  for (const raw of text.toLocaleLowerCase().split(/\s+/)) {
    const w = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}\p{M}]+$/gu, '')
    const e = LOOKUP.get(w)
    if (e) return e
  }
  return null
}

/** The caption with a matching emoji at the end (unchanged when it has one already or nothing matches). */
export function withEmoji(text: string) {
  if (PICTO.test(text)) return text
  const e = emojiFor(text)
  return e ? `${text.trimEnd()} ${e}` : text
}

/** The caption with every emoji taken out. */
export const withoutEmoji = (text: string) => text.replace(EMOJI_RUN, '').replace(/ {2,}/g, ' ').trim()
