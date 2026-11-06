import type { HelpSection } from '../types'

const section: HelpSection = {
  id: 'shortcuts',
  order: 130,
  icon: 'keyboard',
  title: { en: 'Shortcuts and help', hi: 'शॉर्टकट और मदद' },
  intro: { en: 'Every keyboard and mouse shortcut, and answers to common problems.', hi: 'हर कीबोर्ड और माउस शॉर्टकट, और आम परेशानियों के हल।' },
  topics: [
    {
      id: 'shortcuts',
      extra: 'shortcuts',
      find: { selector: '[data-help="keys"]', needs: 'project' },
      keywords: ['shortcut', 'keyboard', 'hotkey', 'keys', 'mouse', 'cheat sheet'],
      en: {
        title: 'Keyboard and mouse shortcuts',
        what: 'Edit much faster on a computer. The full list is below.',
        where: 'Editor → keyboard button next to the zoom buttons (or press ?)',
        steps: [
          'Press ? in the editor (or tap the keyboard button) for this list at any time.',
          'Press F1 anywhere to open this guide.',
          'The most used: Space play, S split, Q / W trim to the playhead, Delete, Ctrl+Z undo, Ctrl+D duplicate.',
        ],
      },
      hi: {
        title: 'कीबोर्ड और माउस शॉर्टकट',
        what: 'कंप्यूटर पर कहीं तेज़ी से एडिट करें। पूरी सूची नीचे है।',
        where: 'एडिटर → ज़ूम बटन के पास कीबोर्ड वाला बटन (या ? दबाएँ)',
        steps: [
          'एडिटर में ? दबाएँ (या कीबोर्ड बटन) तो यह सूची कभी भी दिखेगी।',
          'यह गाइड खोलने के लिए कहीं भी F1 दबाएँ।',
          'सबसे ज़्यादा काम के: Space चलाएँ, S काटें, Q / W प्लेहेड तक ट्रिम, Delete, Ctrl+Z वापस, Ctrl+D कॉपी।',
        ],
      },
    },
    {
      id: 'fix-captions',
      keywords: ['captions not working', 'caption error', 'no captions', 'caption nahi', 'problem', 'trouble'],
      related: ['caption-models', 'offline'],
      en: {
        title: 'Problem: captions are not made',
        what: 'What to check when Generate captions does nothing, stops, or gives wrong words.',
        steps: [
          'Make sure the model finished downloading (Home → Offline & online → AI captions shows it as saved). The first download needs internet.',
          'Pick the language spoken instead of Detect automatically, especially for Hindi.',
          'On a phone, close other apps and try Balanced; Best needs a computer.',
          'Check the video has sound (play it with the volume up; the clip is not muted).',
          'Still not working? Write a Testing note right away; it records where you were.',
        ],
      },
      hi: {
        title: 'परेशानी: कैप्शन नहीं बन रहे',
        what: '"कैप्शन बनाएं" कुछ न करे, बीच में रुक जाए, या गलत शब्द लिखे, तो क्या जाँचें।',
        steps: [
          'पक्का करें कि मॉडल पूरा डाउनलोड हुआ (होम → ऑफ़लाइन और ऑनलाइन → AI कैप्शन में "सेव" दिखे)। पहली बार डाउनलोड में इंटरनेट चाहिए।',
          '"अपने आप पहचानें" की जगह बोली गई भाषा चुनें, ख़ासकर हिंदी के लिए।',
          'फ़ोन पर दूसरे ऐप बंद करें और Balanced आज़माएँ; Best के लिए कंप्यूटर चाहिए।',
          'जाँचें कि वीडियो में आवाज़ है (आवाज़ बढ़ाकर चलाएँ; क्लिप म्यूट न हो)।',
          'फिर भी न चले? तुरंत एक टेस्टिंग नोट लिखें; उसमें अपने आप लिखा जाता है कि आप कहाँ थे।',
        ],
      },
    },
    {
      id: 'fix-export',
      keywords: ['export failed', 'crash', 'app closed', 'band ho gaya', 'stuck', 'slow export', 'problem'],
      related: ['background-export', 'export-video'],
      en: {
        title: 'Problem: export fails or the app closes',
        what: 'Long or high-quality exports need a lot of memory, especially on phones.',
        steps: [
          'Close other apps before exporting.',
          'Choose 720p and the Small file size; avoid 2K / 4K on a phone.',
          'Split a very long project into parts and export each.',
          'If the app closed, open it again: your project is saved, and the Home screen tells you what happened.',
          'Report it with a Testing note so it can be fixed.',
        ],
      },
      hi: {
        title: 'परेशानी: एक्सपोर्ट नहीं होता या ऐप बंद हो जाता है',
        what: 'लंबे या ऊँची क्वालिटी वाले एक्सपोर्ट में बहुत मेमोरी लगती है, ख़ासकर फ़ोन पर।',
        steps: [
          'एक्सपोर्ट से पहले दूसरे ऐप बंद करें।',
          '720p और Small file चुनें; फ़ोन पर 2K / 4K से बचें।',
          'बहुत लंबे प्रोजेक्ट को हिस्सों में बाँटकर अलग-अलग एक्सपोर्ट करें।',
          'ऐप बंद हो गया हो तो फिर खोलें: प्रोजेक्ट सेव है, और होम स्क्रीन बताएगी कि क्या हुआ।',
          'टेस्टिंग नोट में बताएँ ताकि इसे ठीक किया जा सके।',
        ],
      },
    },
    {
      id: 'fix-playback',
      keywords: ['slow', 'lag', 'stutter', 'preview slow', 'atakna', 'problem'],
      en: {
        title: 'Problem: the preview is slow or stutters',
        what: 'Heavy effects, 4K files and many layers can make playback slow on smaller devices. The exported video is not affected.',
        steps: [
          'To check details, pause and drag the playhead instead of playing.',
          'Turn off heavy effects (stabilize, remove background, smooth slow motion) while editing, then turn them back on before export.',
          'Hide tracks you are not working on (H).',
          'Close other apps and browser tabs.',
          'For 4K or long videos, make Preview copies: light copies that play smoothly while you edit.',
        ],
      },
      hi: {
        title: 'परेशानी: प्रीव्यू धीमा है या अटकता है',
        what: 'भारी इफ़ेक्ट, 4K फ़ाइलें और कई लेयर छोटे डिवाइस पर प्लेबैक धीमा कर सकते हैं। एक्सपोर्ट वाली वीडियो पर असर नहीं पड़ता।',
        steps: [
          'बारीकी जाँचनी हो तो रोककर प्लेहेड खिसकाएँ।',
          'एडिटिंग के समय भारी इफ़ेक्ट (स्थिर करें, बैकग्राउंड हटाएं, स्मूद स्लो मोशन) बंद रखें, एक्सपोर्ट से पहले चालू करें।',
          'जिन ट्रैक पर काम नहीं कर रहे उन्हें छिपाएँ (H)।',
          'दूसरे ऐप और ब्राउज़र टैब बंद करें।',
          '4K या लंबी वीडियो के लिए "प्रीव्यू कॉपी" बनाएँ: हल्की कॉपी जो एडिटिंग में आराम से चलती हैं।',
        ],
      },
    },
  ],
}

export default section
