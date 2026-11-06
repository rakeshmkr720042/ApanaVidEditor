import type { HelpSection } from '../types'

// Text from the full screen feature (PR #89), in the guide's format.
const section: HelpSection = {
  id: 'fullscreen',
  order: 85,
  icon: 'fullscreen',
  title: { en: 'Full screen and before / after', hi: 'पूरी स्क्रीन और पहले / बाद' },
  intro: { en: 'Watch your edit on the whole screen, keep editing there, and compare with the original.', hi: 'एडिटिंग पूरी स्क्रीन पर देखें, वहीं एडिट करते रहें, और ओरिजिनल से मिलाएँ।' },
  topics: [
    {
      id: 'fullscreen',
      isNew: true,
      find: { selector: '[data-testid="fs-btn"]', needs: 'project' },
      keywords: ['full screen', 'fullscreen', 'poori screen', 'watch', 'f key'],
      related: ['fullscreen-edit', 'before-after'],
      en: {
        title: 'Watch in full screen',
        what: 'Watch your edited video on the whole screen, exactly as it will be exported.',
        where: 'The ⛶ button at the bottom right of the video (key F)',
        steps: [
          'Tap the ⛶ button at the bottom right of the video, or press F on the keyboard.',
          'On a phone the screen turns to the shape of your video (sideways for a wide video).',
          'Play / pause, 5 seconds back and forward, and the seek bar to jump to any moment. 1x changes the playback speed.',
          'Double-tap the video to play or pause. The buttons hide while the video plays; move the mouse or touch the screen to bring them back.',
          'To leave: tap Exit, press F or Esc, or use the phone\'s Back button.',
        ],
      },
      hi: {
        title: 'पूरी स्क्रीन पर देखें',
        what: 'एडिट किया हुआ वीडियो पूरी स्क्रीन पर देखें, बिल्कुल वैसा जैसा एक्सपोर्ट होगा।',
        where: 'वीडियो के नीचे दाएँ कोने में ⛶ बटन (कीबोर्ड पर F)',
        steps: [
          'वीडियो के नीचे दाएँ कोने में ⛶ बटन दबाएँ, या कीबोर्ड पर F दबाएँ।',
          'फ़ोन पर स्क्रीन आपके वीडियो के आकार में घूम जाती है (चौड़े वीडियो के लिए आड़ी)।',
          'चलाएँ / रोकें, 5 सेकंड पीछे और आगे, और सीक बार से किसी भी पल पर जाएँ। 1x से चलने की स्पीड बदलें।',
          'वीडियो पर दो बार टैप करें: चलाएँ या रोकें। वीडियो चलते समय बटन छिप जाते हैं; माउस हिलाएँ या स्क्रीन छुएँ, वापस आ जाएँगे।',
          'बाहर आने के लिए: "बाहर" दबाएँ, F या Esc दबाएँ, या फ़ोन का Back बटन।',
        ],
      },
    },
    {
      id: 'fullscreen-edit',
      isNew: true,
      find: { selector: '[data-testid="fs-btn"]', needs: 'project' },
      keywords: ['edit panel', 'full screen edit', 'e key'],
      en: {
        title: 'Edit panel in full screen',
        what: 'Keep editing without leaving full screen: the timeline and all tools slide in next to the video.',
        where: 'Full screen → Edit panel (key E)',
        steps: [
          'In full screen tap Edit panel (or press E). The timeline and all tools slide in: on the right on a computer or a sideways phone, at the bottom on an upright phone.',
          'The video gets smaller but stays in view, so every change shows at once. Select clips, use any tool, undo with Ctrl+Z.',
          'Tap ✕ on the panel (or E again, or Back / Esc) to hide it and watch in full screen again.',
        ],
        tips: ['Back first closes an open tool, then the edit panel, then full screen.'],
      },
      hi: {
        title: 'पूरी स्क्रीन में एडिट पैनल',
        what: 'पूरी स्क्रीन छोड़े बिना एडिटिंग करते रहें: टाइमलाइन और सारे टूल वीडियो के पास स्लाइड होकर आ जाते हैं।',
        where: 'पूरी स्क्रीन → एडिट पैनल (कीबोर्ड पर E)',
        steps: [
          'पूरी स्क्रीन में "एडिट पैनल" दबाएँ (या E)। टाइमलाइन और सारे टूल स्लाइड होकर आ जाते हैं: कंप्यूटर या आड़े फ़ोन पर दाईं तरफ़, सीधे फ़ोन पर नीचे।',
          'वीडियो छोटा हो जाता है पर दिखता रहता है, इसलिए हर बदलाव तुरंत दिखता है। क्लिप चुनें, कोई भी टूल चलाएँ, Ctrl+Z से Undo करें।',
          'पैनल पर ✕ दबाएँ (या फिर से E, या Back / Esc) ताकि पैनल छिप जाए और वीडियो फिर पूरी स्क्रीन पर दिखे।',
        ],
        tips: ['Back पहले खुला टूल बंद करता है, फिर एडिट पैनल, फिर पूरी स्क्रीन।'],
      },
    },
    {
      id: 'before-after',
      isNew: true,
      find: { selector: '[data-testid="compare-btn"]', needs: 'project' },
      keywords: ['before after', 'compare', 'original', 'pehle baad', 'b key'],
      en: {
        title: 'Before / after: compare with the original',
        what: 'See the original video and your edit side by side at the same moment.',
        where: 'The before / after button next to ⛶ (key B), also in full screen',
        steps: [
          'Tap Before / after (or press B).',
          'The left side shows the original video (no filters, colour, effects, crop, zoom, text or stickers), the right side shows your edit, at the same moment.',
          'Drag the white line left or right to compare any part of the picture.',
          'Tap the button again to switch it off.',
        ],
      },
      hi: {
        title: 'पहले / बाद: ओरिजिनल से मिलाएँ',
        what: 'ओरिजिनल वीडियो और आपकी एडिटिंग, उसी पल पर साथ-साथ देखें।',
        where: '⛶ के पास वाला पहले / बाद बटन (कीबोर्ड पर B), पूरी स्क्रीन में भी',
        steps: [
          '"पहले / बाद" दबाएँ (या B)।',
          'बाईं तरफ़ ओरिजिनल वीडियो (बिना फ़िल्टर, रंग, इफ़ेक्ट, क्रॉप, ज़ूम, टेक्स्ट या स्टिकर), दाईं तरफ़ आपकी एडिटिंग, उसी पल पर।',
          'सफ़ेद लाइन को बाएँ या दाएँ खींचें और तस्वीर का कोई भी हिस्सा मिलाकर देखें।',
          'बंद करने के लिए बटन फिर दबाएँ।',
        ],
      },
    },
  ],
}

export default section
