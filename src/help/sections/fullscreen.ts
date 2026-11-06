/**
 * Help manual: full screen preview, the edit panel in full screen, and before / after.
 * Each section has the same text in English and Hindi; the Help screen shows the one for the app language.
 */
export interface HelpSection {
  id: string
  title: { en: string; hi: string }
  /** Paragraphs and "• " list lines. */
  body: { en: string[]; hi: string[] }
}

export const fullscreen: HelpSection = {
  id: 'fullscreen',
  title: { en: 'Full screen preview, edit panel and before / after', hi: 'पूरी स्क्रीन प्रीव्यू, एडिट पैनल और पहले / बाद' },
  body: {
    en: [
      'Watch your edited video on the whole screen, exactly as it will be exported, and keep editing without leaving full screen.',
      'Open full screen',
      '• Tap the ⛶ button at the bottom right of the video, or press F on the keyboard.',
      '• On a phone the screen turns to the shape of your video (sideways for a wide video).',
      'Buttons in full screen',
      '• Play / pause, 5 seconds back and forward, and the seek bar to jump to any moment.',
      '• 1x: playback speed (slow motion or fast forward to check your edit quickly).',
      '• The buttons hide by themselves while the video plays. Move the mouse or touch the screen to bring them back.',
      '• Double-tap the video to play or pause.',
      'Edit panel in full screen',
      '• Tap "Edit panel" (or press E). The timeline and all tools slide in: on the right on a computer or a sideways phone, at the bottom on an upright phone.',
      '• The video gets smaller but stays in view, so every change shows at once. Select clips, use any tool, undo with Ctrl+Z.',
      '• Tap ✕ on the panel (or E again, or Back / Esc) to hide it and watch in full screen again.',
      'Before / after',
      '• Tap "Before / after" (or press B; it also works outside full screen with the button next to ⛶).',
      '• The left side shows the original video (no filters, colour, effects, crop, zoom, text or stickers), the right side shows your edit, at the same moment.',
      '• Drag the white line left or right to compare any part of the picture. Tap the button again to switch it off.',
      'Leave full screen',
      '• Tap "Exit", press F or Esc, or use the phone\'s Back button. Back first closes an open tool, then the edit panel, then full screen.',
    ],
    hi: [
      'एडिट किया हुआ वीडियो पूरी स्क्रीन पर देखें, बिल्कुल वैसा जैसा एक्सपोर्ट होगा, और पूरी स्क्रीन छोड़े बिना एडिटिंग करते रहें।',
      'पूरी स्क्रीन खोलें',
      '• वीडियो के नीचे दाएँ कोने में ⛶ बटन दबाएँ, या कीबोर्ड पर F दबाएँ।',
      '• फ़ोन पर स्क्रीन आपके वीडियो के आकार में घूम जाती है (चौड़े वीडियो के लिए आड़ी)।',
      'पूरी स्क्रीन के बटन',
      '• चलाएँ / रोकें, 5 सेकंड पीछे और आगे, और सीक बार से किसी भी पल पर जाएँ।',
      '• 1x: चलने की स्पीड (एडिट जल्दी जाँचने के लिए धीमा या तेज़)।',
      '• वीडियो चलते समय बटन अपने आप छिप जाते हैं। माउस हिलाएँ या स्क्रीन छुएँ, बटन वापस आ जाएँगे।',
      '• वीडियो पर दो बार टैप करें: चलाएँ या रोकें।',
      'पूरी स्क्रीन में एडिट पैनल',
      '• "एडिट पैनल" दबाएँ (या E)। टाइमलाइन और सारे टूल स्लाइड होकर आ जाते हैं: कंप्यूटर या आड़े फ़ोन पर दाईं तरफ़, सीधे फ़ोन पर नीचे।',
      '• वीडियो छोटा हो जाता है पर दिखता रहता है, इसलिए हर बदलाव तुरंत दिखता है। क्लिप चुनें, कोई भी टूल चलाएँ, Ctrl+Z से Undo करें।',
      '• पैनल पर ✕ दबाएँ (या फिर से E, या Back / Esc) ताकि पैनल छिप जाए और वीडियो फिर पूरी स्क्रीन पर दिखे।',
      'पहले / बाद (Before / after)',
      '• "पहले / बाद" दबाएँ (या B; यह पूरी स्क्रीन के बाहर भी ⛶ के पास वाले बटन से चलता है)।',
      '• बाईं तरफ़ ओरिजिनल वीडियो (बिना फ़िल्टर, रंग, इफ़ेक्ट, क्रॉप, ज़ूम, टेक्स्ट या स्टिकर), दाईं तरफ़ आपकी एडिटिंग, उसी पल पर।',
      '• सफ़ेद लाइन को बाएँ या दाएँ खींचें और तस्वीर का कोई भी हिस्सा मिलाकर देखें। बंद करने के लिए बटन फिर दबाएँ।',
      'पूरी स्क्रीन से बाहर',
      '• "बाहर" दबाएँ, F या Esc दबाएँ, या फ़ोन का Back बटन। Back पहले खुला टूल बंद करता है, फिर एडिट पैनल, फिर पूरी स्क्रीन।',
    ],
  },
}
