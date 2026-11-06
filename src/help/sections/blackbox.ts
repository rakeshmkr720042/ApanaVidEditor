// Help manual sections for the blackbox log, safe export and project recovery, in English and Hindi.
// Plain data so the full User Guide (Help menu) can list them as they are; the blackbox sheet shows
// them already under "How it works".

export interface HelpSection {
  id: string
  title: { en: string; hi: string }
  /** paragraphs; a line starting with "• " is a bullet */
  body: { en: string[]; hi: string[] }
}

export const blackboxHelp: HelpSection[] = [
  {
    id: 'blackbox',
    title: { en: 'Blackbox log (problem recorder)', hi: 'ब्लैकबॉक्स लॉग (समस्या रिकॉर्डर)' },
    body: {
      en: [
        'Like the black box of an aeroplane, Apna Editor quietly records the last few hundred things that happened: which buttons you tapped, which screen was open, each export step and every error with its technical details. It stays on your device and is never sent anywhere by itself.',
        'If the app shows an error, closes suddenly or an export fails, the reason is already saved, even when the app had to restart.',
        '• Open it: the blackbox button (✈ icon) on the Home screen, Save menu › Blackbox log in the editor, or press Ctrl+Shift+L on a computer.',
        '• A small red "Problem recorded" note appears for a few seconds when something goes wrong. Tap it to open the log.',
        '• Errors only: shows just the problems, without the taps.',
        '• Copy: copies the whole log, paste it in WhatsApp or a chat for the developer.',
        '• Share: opens the share sheet with a .txt file (on Android). Save file: keeps a .txt copy (Android: Documents/Apna Editor).',
        '• Clear: empties the log. Do this after the problem is fixed, so the next report is short.',
        'The log keeps about 600 lines; older ones drop off by themselves. It never contains your videos, only names of buttons and short messages.',
      ],
      hi: [
        'हवाई जहाज़ के ब्लैक बॉक्स की तरह, Apna Editor चुपचाप पिछली कुछ सौ बातें रिकॉर्ड करता है: आपने कौन से बटन दबाए, कौन सी स्क्रीन खुली थी, एक्सपोर्ट का हर चरण और हर गड़बड़ी तकनीकी जानकारी के साथ। यह आपके डिवाइस पर ही रहता है और अपने आप कहीं नहीं भेजा जाता।',
        'अगर ऐप कोई एरर दिखाए, अचानक बंद हो जाए या एक्सपोर्ट फेल हो जाए, तो उसका कारण पहले से सेव रहता है, चाहे ऐप को दोबारा शुरू होना पड़ा हो।',
        '• खोलने के लिए: होम स्क्रीन पर ब्लैकबॉक्स बटन (✈ आइकन), एडिटर में Save मेन्यू › Blackbox log, या कंप्यूटर पर Ctrl+Shift+L दबाएं।',
        '• कुछ गड़बड़ होने पर कुछ सेकंड के लिए एक छोटा लाल "समस्या रिकॉर्ड हुई" नोट दिखता है। लॉग खोलने के लिए उस पर टैप करें।',
        '• सिर्फ़ एरर: टैप हटाकर केवल समस्याएं दिखाता है।',
        '• कॉपी: पूरा लॉग कॉपी करता है, इसे WhatsApp या चैट में डेवलपर को भेजें।',
        '• शेयर: (Android पर) .txt फ़ाइल के साथ शेयर शीट खोलता है। फ़ाइल सेव करें: .txt कॉपी रखता है (Android: Documents/Apna Editor)।',
        '• साफ़ करें: लॉग खाली करता है। समस्या ठीक होने के बाद ऐसा करें, ताकि अगली रिपोर्ट छोटी रहे।',
        'लॉग में लगभग 600 लाइनें रहती हैं; पुरानी लाइनें अपने आप हट जाती हैं। इसमें आपकी वीडियो कभी नहीं होती, सिर्फ़ बटनों के नाम और छोटे संदेश होते हैं।',
      ],
    },
  },
  {
    id: 'safe-export',
    title: { en: 'Safe export on phones', hi: 'फ़ोन पर सुरक्षित एक्सपोर्ट' },
    body: {
      en: [
        'Before an export starts, Apna Editor checks the phone\'s memory and free storage against the size of the video.',
        '• If the settings look too heavy (for example 4K or a long 1080p video on a phone with little memory), an orange note appears in the Export sheet with a "Use safer settings" button. You can still export as you chose.',
        '• If an export fails, the app tries once more by itself with lighter settings (a lower resolution and the Small file size) and tells you it did.',
        '• If the app closed in the middle of an export, the next time you open Export the safer settings are already picked, with a note about what happened.',
        '• Saving and sharing a big video on Android now writes it in small pieces, which stops the app from closing on large files.',
        'Tips: close other apps before a long export, keep the phone charging, and prefer 720p or 1080p with "Small file" for long videos.',
      ],
      hi: [
        'एक्सपोर्ट शुरू होने से पहले Apna Editor फ़ोन की मेमोरी और खाली स्टोरेज को वीडियो के साइज़ से मिलाकर देखता है।',
        '• अगर सेटिंग बहुत भारी लगे (जैसे कम मेमोरी वाले फ़ोन पर 4K या लंबी 1080p वीडियो), तो एक्सपोर्ट शीट में एक नारंगी नोट और "सुरक्षित सेटिंग लें" बटन दिखता है। आप चाहें तो अपनी चुनी सेटिंग से भी एक्सपोर्ट कर सकते हैं।',
        '• अगर एक्सपोर्ट फेल हो जाए, तो ऐप अपने आप एक बार हल्की सेटिंग (कम रेज़ोल्यूशन और Small file) से फिर कोशिश करता है और आपको बताता है।',
        '• अगर एक्सपोर्ट के बीच ऐप बंद हो गया था, तो अगली बार एक्सपोर्ट खोलने पर सुरक्षित सेटिंग पहले से चुनी होती है, और बताया जाता है कि क्या हुआ था।',
        '• Android पर बड़ी वीडियो सेव और शेयर करते समय अब उसे छोटे-छोटे हिस्सों में लिखा जाता है, जिससे बड़ी फ़ाइल पर ऐप बंद नहीं होता।',
        'सलाह: लंबे एक्सपोर्ट से पहले दूसरे ऐप बंद करें, फ़ोन चार्जिंग पर रखें, और लंबी वीडियो के लिए 720p या 1080p के साथ "Small file" चुनें।',
      ],
    },
  },
  {
    id: 'recover',
    title: { en: 'Autosave and recovering a project', hi: 'ऑटोसेव और प्रोजेक्ट वापस पाना' },
    body: {
      en: [
        'Every change is saved on the device within a second, and again the moment you switch to another app or start an export. You do not need to press Save to keep your work.',
        'If the app closes while a project is open (a crash, the phone running out of memory, or closing it from recent apps), the Home screen shows "Continue where you left off" with the project name next time. Tap Open to go straight back to it, or Dismiss to hide the note.',
      ],
      hi: [
        'हर बदलाव एक सेकंड के अंदर डिवाइस पर सेव हो जाता है, और दूसरे ऐप पर जाते ही या एक्सपोर्ट शुरू करते ही फिर से सेव होता है। काम बचाने के लिए Save दबाना ज़रूरी नहीं।',
        'अगर कोई प्रोजेक्ट खुला हो और ऐप बंद हो जाए (क्रैश, फ़ोन की मेमोरी खत्म होना, या रीसेंट ऐप्स से बंद करना), तो अगली बार होम स्क्रीन पर प्रोजेक्ट के नाम के साथ "जहाँ छोड़ा था वहीं से शुरू करें" दिखता है। सीधे उसी पर जाने के लिए Open दबाएं, या नोट छुपाने के लिए Dismiss।',
      ],
    },
  },
]
