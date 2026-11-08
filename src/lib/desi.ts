import type { CaptionFrame, LoopAnim, TextAnim, TextStyle } from '../types'

/**
 * Desi creator pack: festival greetings, shayari / quote cards. Everything here is plain data, built into the
 * app (no internet, nothing to download), so it can't slow down or break the editor.
 */

export interface TitlePreset {
  name: string
  text: string
  style: Partial<TextStyle>
  animIn: TextAnim
  animOut: TextAnim
  loop: LoopAnim
  at?: { x: number; y: number; scale?: number }
}

const glowTitle = (font: string, fill: TextStyle['fill'], glow: string | null, color: string, stroke: string | null = null): Partial<TextStyle> =>
  ({ font, size: 0.1, fill, glow, color, shadow: !glow, stroke, strokeWidth: stroke ? 0.4 : 0, background: null })

/** One-tap festival greetings (Titles → Festivals). Hindi ones use fonts that have Hindi letters. */
export const FESTIVAL_TITLES: TitlePreset[] = [
  { name: 'Shubh Deepavali', text: 'शुभ दीपावली', style: glowTitle('Yatra One', 'gold', '#ffb000', '#f7d24a', '#5a2a00'), animIn: 'zoom', animOut: 'fade', loop: 'shimmer' },
  { name: 'Happy Diwali', text: 'Happy Diwali ✨', style: glowTitle('Lobster', 'gold', '#ff9a2e', '#f7d24a'), animIn: 'letters', animOut: 'fade', loop: 'shimmer' },
  { name: 'Happy Holi', text: 'Happy Holi', style: glowTitle('Bangers', 'rainbow', null, '#ffe600', '#111111'), animIn: 'pop', animOut: 'zoom', loop: 'swing' },
  { name: 'Holi Mubarak', text: 'होली मुबारक', style: glowTitle('Modak', 'rainbow', null, '#ff3d7f', '#2b0a3d'), animIn: 'bounce', animOut: 'fade', loop: 'pulse' },
  { name: 'Eid Mubarak', text: 'Eid Mubarak 🌙', style: glowTitle('Playfair Display', 'gold', '#ffe9a8', '#f7d24a'), animIn: 'blur', animOut: 'fade', loop: 'shimmer' },
  { name: 'Raksha Bandhan', text: 'रक्षाबंधन की शुभकामनाएँ', style: { ...glowTitle('Amita', 'love', '#ffb3cf', '#ff5c93'), size: 0.08 }, animIn: 'letters', animOut: 'fade', loop: 'float' },
  { name: 'Shubh Navratri', text: 'शुभ नवरात्रि', style: glowTitle('Rozha One', 'sunset', '#ff8a5c', '#ff8a5c', '#4a0d1e'), animIn: 'zoom', animOut: 'fade', loop: 'pulse' },
  { name: 'Ganpati Bappa', text: 'गणपति बप्पा मोरया', style: { ...glowTitle('Yatra One', 'royal', '#ffcc66', '#e0a526', '#4a0d1e'), size: 0.085 }, animIn: 'drop', animOut: 'fade', loop: 'heartbeat' },
  { name: 'Independence Day', text: 'स्वतंत्रता दिवस की शुभकामनाएँ', style: { ...glowTitle('Rozha One', 'tiranga', null, '#ff9933', '#0b2a6b'), size: 0.075 }, animIn: 'wipe', animOut: 'fade', loop: 'float' },
  { name: 'Republic Day', text: 'Happy Republic Day 🇮🇳', style: { ...glowTitle('Montserrat', 'tiranga', null, '#ff9933', '#0b2a6b'), size: 0.08, bold: true }, animIn: 'slide-up', animOut: 'fade', loop: 'none' },
  { name: 'Chhath Puja', text: 'छठ पूजा की शुभकामनाएँ', style: { ...glowTitle('Eczar', 'sunset', '#ffd27a', '#ffb000', '#5a2a00'), size: 0.08 }, animIn: 'blur', animOut: 'fade', loop: 'shimmer' },
  { name: 'Happy Lohri', text: 'Happy Lohri 🔥', style: glowTitle('Righteous', 'sunset', '#ff6a00', '#ff8a5c'), animIn: 'pop', animOut: 'fade', loop: 'pulse' },
  { name: 'Happy Pongal', text: 'Happy Pongal', style: glowTitle('Lobster', 'sunset', null, '#ffb000', '#5a2a00'), animIn: 'bounce', animOut: 'fade', loop: 'swing' },
  { name: 'Karwa Chauth', text: 'करवा चौथ की शुभकामनाएँ', style: { ...glowTitle('Amita', 'rose-gold', '#ffe4dc', '#f4b3a2'), size: 0.08 }, animIn: 'letters', animOut: 'fade', loop: 'float' },
  { name: 'Merry Christmas', text: 'Merry Christmas 🎄', style: glowTitle('Dancing Script', null, '#ff4d4d', '#ffffff'), animIn: 'drop', animOut: 'fade', loop: 'swing' },
  { name: 'Happy New Year', text: 'Happy New Year 🎉', style: glowTitle('Bebas Neue', 'gold', '#ffe28a', '#f7d24a'), animIn: 'zoom', animOut: 'zoom', loop: 'pulse' },
  { name: 'Suprabhat', text: 'सुप्रभात', style: glowTitle('Kalam', 'sunset', '#ffd27a', '#ffb000'), animIn: 'fade', animOut: 'fade', loop: 'float' },
  { name: 'Shubh Ratri', text: 'शुभ रात्रि 🌙', style: glowTitle('Kalam', 'silver', '#9ec5ff', '#ffffff'), animIn: 'fade', animOut: 'fade', loop: 'float' },
]

export type ShayariKind = 'motivation' | 'love' | 'dosti' | 'life' | 'wishes' | 'dohe'

export const SHAYARI_KINDS: { value: ShayariKind; label: string }[] = [
  { value: 'motivation', label: 'Motivation' },
  { value: 'love', label: 'Love' },
  { value: 'dosti', label: 'Dosti' },
  { value: 'life', label: 'Life' },
  { value: 'wishes', label: 'Wishes' },
  { value: 'dohe', label: 'Dohe' },
]

/**
 * Short lines for quote cards. Written for this app, except the dohe of Kabir and Rahim (centuries old, free for
 * everyone). A line break (\n) splits the two halves of a sher.
 */
export const SHAYARI: Record<ShayariKind, string[]> = {
  motivation: [
    'छोटे कदम भी\nबड़ी दूरी तय करते हैं।',
    'हार तब होती है\nजब मान लिया जाए।',
    'आज की मेहनत,\nकल की पहचान।',
    'गिरकर उठना ही\nअसली जीत है।',
    'रास्ता मुश्किल है तो क्या,\nहौसला भी तो अपना है।',
    'जो रुका नहीं,\nवही पहुँचा है।',
  ],
  love: [
    'तेरी हँसी में\nमेरी सारी दुनिया है।',
    'तुम पास हो तो\nहर मौसम सुहाना है।',
    'दिल ने तेरा नाम लिया,\nऔर हर दुआ पूरी हो गई।',
    'बातें तो बहुत हैं,\nपर तुम सुनो तो कहूँ।',
    'तेरे बिना भी तू ही है,\nहर पल मेरे साथ।',
  ],
  dosti: [
    'दोस्ती वो धागा है\nजो दूर रहकर भी नहीं टूटता।',
    'यार साथ हों तो\nहर सफ़र आसान है।',
    'कुछ रिश्ते ख़ून के नहीं,\nदिल के होते हैं।',
    'हँसी हो या आँसू,\nदोस्त हर बार साथ खड़ा है।',
    'पुराने दोस्त,\nसबसे क़ीमती ख़ज़ाना।',
  ],
  life: [
    'वक़्त सबका आता है,\nबस सब्र रखना पड़ता है।',
    'मुस्कुराते रहो,\nज़िंदगी ख़ुद खूबसूरत हो जाएगी।',
    'जो बीत गया उसे जाने दो,\nजो आने वाला है उसे अपनाओ।',
    'सादगी में ही\nसबसे बड़ी शान है।',
    'माँ की दुआ\nहर मुश्किल आसान कर देती है।',
  ],
  wishes: [
    'सुप्रभात!\nनई सुबह, नई उम्मीद।',
    'सूरज की पहली किरण\nआपका दिन रोशन करे।',
    'शुभ रात्रि!\nमीठे सपने।',
    'जन्मदिन मुबारक हो!\nखुश रहो, आबाद रहो।',
    'आपका हर दिन\nखुशियों से भरा हो।',
  ],
  dohe: [
    'बुरा जो देखन मैं चला, बुरा न मिलिया कोय।\nजो दिल खोजा आपना, मुझसे बुरा न कोय॥\n— कबीर',
    'धीरे-धीरे रे मना, धीरे सब कुछ होय।\nमाली सींचे सौ घड़ा, ऋतु आए फल होय॥\n— कबीर',
    'ऐसी वाणी बोलिए, मन का आपा खोय।\nऔरन को शीतल करे, आपहु शीतल होय॥\n— कबीर',
    'रहिमन धागा प्रेम का, मत तोरो चटकाय।\nटूटे से फिर ना जुरे, जुरे गाँठ परि जाय॥\n— रहीम',
    'काल करे सो आज कर, आज करे सो अब।\nपल में परलय होएगी, बहुरि करेगा कब॥\n— कबीर',
  ],
}

/** Looks for a quote card: the text sits in a rounded box in the middle of the frame. */
export interface CardLook {
  name: string
  style: Partial<TextStyle>
  frame: Omit<CaptionFrame, 'rect' | 'preset'>
}

export const CARD_LOOKS: CardLook[] = [
  { name: 'Classic', style: { font: 'Tiro Devanagari Hindi', color: '#ffffff', fill: null, glow: null, shadow: false, stroke: null, background: null, size: 0.055, align: 'center' },
    frame: { fill: '#1d1a16', fillOpacity: 0.8, border: '#e0a526', borderWidth: 1.5, radius: 0.12, valign: 'middle' } },
  { name: 'Golden', style: { font: 'Rozha One', color: '#f7d24a', fill: 'gold', glow: null, shadow: false, stroke: null, background: null, size: 0.055, align: 'center' },
    frame: { fill: '#2a0a12', fillOpacity: 0.85, border: '#f7d24a', borderWidth: 2, radius: 0.2, valign: 'middle' } },
  { name: 'Diary', style: { font: 'Kalam', color: '#2b2b2b', fill: null, glow: null, shadow: false, stroke: null, background: null, size: 0.055, align: 'center' },
    frame: { fill: '#fff7e0', fillOpacity: 0.95, border: '#c8901a', borderWidth: 1, radius: 0.08, valign: 'middle' } },
  { name: 'Night', style: { font: 'Amita', color: '#ffffff', fill: null, glow: '#7df9ff', shadow: false, stroke: null, background: null, size: 0.055, align: 'center' },
    frame: { fill: '#0b0b2b', fillOpacity: 0.75, border: null, borderWidth: 0, radius: 0.3, valign: 'middle' } },
  { name: 'Minimal', style: { font: 'Mukta', color: '#ffffff', fill: null, glow: null, shadow: true, stroke: null, background: null, size: 0.05, align: 'center', bold: true },
    frame: { fill: '#000000', fillOpacity: 0.45, border: null, borderWidth: 0, radius: 0.1, valign: 'middle' } },
]

/** A centred card box sized for the frame shape (taller frames get a narrower, taller box). */
export function cardFrame(look: CardLook, aspect: number): CaptionFrame {
  const w = aspect < 1 ? 0.86 : aspect > 1.5 ? 0.62 : 0.78
  const h = aspect < 1 ? 0.36 : 0.5
  return { ...look.frame, preset: 'custom', rect: { x: (1 - w) / 2, y: (1 - h) / 2, w, h } }
}

/** A random line of this kind that isn't `not` (so "Another" always changes the text). */
export function pickShayari(kind: ShayariKind, not?: string, rnd = Math.random) {
  const list = SHAYARI[kind].filter((s) => s !== not)
  return list[Math.floor(rnd() * list.length)] ?? SHAYARI[kind][0]
}
