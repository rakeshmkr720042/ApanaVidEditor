/**
 * Emojis that go with words (English, Hinglish, Hindi): for "Add matching emojis" on captions, and for the
 * emoji that pops up over a word while it is said (word captions with emoji on).
 */

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

export const PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u
export const EMOJI_RUN = /\s*(?:[\p{Extended_Pictographic}\p{Regional_Indicator}‍️\u{1F3FB}-\u{1F3FF}])+/gu

/** The emoji for one word (any case, punctuation ignored), or null. */
export function emojiForWord(raw: string): string | null {
  const w = raw.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}\p{M}]+$/gu, '')
  return LOOKUP.get(w) ?? null
}

/** The emoji that fits a caption (its first word that has one), or null. */
export function emojiFor(text: string): string | null {
  for (const raw of text.split(/\s+/)) {
    const e = emojiForWord(raw)
    if (e) return e
  }
  return null
}
