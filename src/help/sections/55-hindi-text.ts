/**
 * User guide: Hindi text and Hindi fonts. Shape follows HelpSection in ../types (the User guide change);
 * kept free of imports so it builds before and after that change lands.
 */
const section = {
  id: 'hindi-text',
  order: 55,
  icon: 'text' as const,
  title: { en: 'Hindi text and fonts', hi: 'हिंदी टेक्स्ट और फ़ॉन्ट' },
  intro: {
    en: 'Write titles and captions in Hindi, type Hindi with English letters, and pick from 22 Hindi fonts. Works offline.',
    hi: 'टाइटल और कैप्शन हिंदी में लिखें, अंग्रेज़ी अक्षरों से हिंदी टाइप करें, और 22 हिंदी फ़ॉन्ट में से चुनें। बिना इंटरनेट चलता है।',
  },
  topics: [
    {
      id: 'hindi-typing',
      isNew: true,
      find: { selector: '.hindi-bar', needs: 'text' as const },
      keywords: ['hindi', 'hinglish', 'devanagari', 'type', 'matra', 'हिंदी', 'मात्रा', 'likhna', 'keyboard'],
      related: ['hindi-fonts', 'hindi-captions'],
      en: {
        title: 'Type Hindi (Hinglish → हिंदी)',
        what: 'Write any text in Hindi. Matras, half letters and joined letters (क्ष, त्र, ज्ञ, श्र) come out right in the preview and in the exported video.',
        where: 'Select a text → Edit (or toolbar → Text to add one)',
        steps: [
          'Use your phone\'s Hindi keyboard (for example Gboard Hindi) or a Hindi keyboard on the computer: the text box takes it as it is.',
          'Or turn on "Hinglish → हिंदी" under the text box, type a word in English letters and press space: "namaste " becomes "नमस्ते ".',
          'While you type, the Hindi word shows next to the switch. Tap it to put it in straight away.',
          'Tap "ा ि ्" for a row of matras, or "क्ष ड़" for letters that are hard to type. A key goes in where the cursor is.',
          'Pasted English-letter text? Tap "Convert all to Hindi" to change every word at once. Undo takes it back.',
        ],
        tips: [
          'Spelling: aa = ा, i = ि, ee = ी, u = ु, oo = ू, e = े, ai = ै, o = ो, au = ौ. A letter with no vowel after it joins the next one: "pyaar" = प्यार.',
          'Capitals inside a word give the hard letters: T = ट, D = ड, N = ण, Sh = ष, R = ड़ (kaaTa = काटा). A capital at the start of a word is just a capital.',
          'Common words are known as they are usually typed: main = मैं, hai = है, nahi = नहीं, dosto = दोस्तों.',
          'A full stop after a Hindi word becomes the Hindi full stop (।). The switch stays on for next time.',
        ],
      },
      hi: {
        title: 'हिंदी टाइप करें (Hinglish → हिंदी)',
        what: 'कोई भी टेक्स्ट हिंदी में लिखें। मात्राएं, आधे अक्षर और जुड़े अक्षर (क्ष, त्र, ज्ञ, श्र) प्रीव्यू और एक्सपोर्ट की गई वीडियो में सही दिखते हैं।',
        where: 'टेक्स्ट चुनें → Edit (या नया जोड़ने के लिए टूलबार → Text)',
        steps: [
          'फ़ोन का हिंदी कीबोर्ड (जैसे Gboard हिंदी) या कंप्यूटर पर हिंदी कीबोर्ड इस्तेमाल करें: टेक्स्ट बॉक्स उसे वैसे ही ले लेता है।',
          'या टेक्स्ट बॉक्स के नीचे "Hinglish → हिंदी" चालू करें, अंग्रेज़ी अक्षरों में शब्द लिखें और स्पेस दबाएं: "namaste " बन जाता है "नमस्ते "।',
          'लिखते समय हिंदी शब्द स्विच के पास दिखता है। उसे तुरंत लगाने के लिए उस पर टैप करें।',
          'मात्राओं के लिए "ा ि ्" दबाएं, और मुश्किल अक्षरों के लिए "क्ष ड़"। बटन कर्सर की जगह जुड़ता है।',
          'अंग्रेज़ी अक्षरों वाला टेक्स्ट पेस्ट किया? "सब हिंदी में बदलें" से सारे शब्द एक साथ बदलें। Undo से वापस होता है।',
        ],
        tips: [
          'स्पेलिंग: aa = ा, i = ि, ee = ी, u = ु, oo = ू, e = े, ai = ै, o = ो, au = ौ। जिस अक्षर के बाद स्वर न हो वह अगले से जुड़ता है: "pyaar" = प्यार।',
          'शब्द के बीच बड़े अक्षर से कठोर अक्षर बनते हैं: T = ट, D = ड, N = ण, Sh = ष, R = ड़ (kaaTa = काटा)। शब्द की शुरुआत का बड़ा अक्षर सामान्य माना जाता है।',
          'आम शब्द वैसे ही पहचाने जाते हैं जैसे लोग लिखते हैं: main = मैं, hai = है, nahi = नहीं, dosto = दोस्तों।',
          'हिंदी शब्द के बाद फ़ुल स्टॉप हिंदी पूर्ण विराम (।) बन जाता है। स्विच अगली बार के लिए चालू रहता है।',
        ],
      },
    },
    {
      id: 'hindi-fonts',
      isNew: true,
      find: { tool: 'Text', needs: 'text' as const },
      keywords: ['font', 'hindi font', 'devanagari', 'फ़ॉन्ट', 'style', 'akshar'],
      related: ['hindi-typing', 'hindi-captions'],
      en: {
        title: 'Hindi fonts',
        what: '22 fonts with their own Hindi letters, grouped by look. Each one shows your own words, so you see the look before you pick.',
        where: 'Select a text → Font',
        steps: [
          'Select the text and open Font. With Hindi text, the "हिंदी fonts" list opens first.',
          'Fonts are grouped: Simple, Bold, Stylish, Classic and Handwritten. Tap one to use it.',
          'Fonts marked अ have their own Hindi letters. "All" shows every font, "English only" the ones without Hindi.',
        ],
        tips: [
          'An English-only font with Hindi words shows the Hindi part in Noto Sans Devanagari. A "Use a Hindi font" button then appears under the text box.',
          'The Hindi font you pick is remembered and used for new Hindi captions.',
          'All fonts are free to use in your videos (SIL Open Font License) and come with the app, so they work without internet.',
        ],
      },
      hi: {
        title: 'हिंदी फ़ॉन्ट',
        what: 'अपने हिंदी अक्षरों वाले 22 फ़ॉन्ट, लुक के हिसाब से समूहों में। हर फ़ॉन्ट में आपके अपने शब्द दिखते हैं, ताकि चुनने से पहले लुक देख सकें।',
        where: 'टेक्स्ट चुनें → Font',
        steps: [
          'टेक्स्ट चुनें और Font खोलें। हिंदी टेक्स्ट होने पर पहले "हिंदी fonts" सूची खुलती है।',
          'फ़ॉन्ट समूहों में हैं: सादा, बोल्ड, स्टाइलिश, क्लासिक और हाथ से लिखा। लगाने के लिए किसी पर टैप करें।',
          'अ वाले फ़ॉन्ट में अपने हिंदी अक्षर हैं। "All" में सभी फ़ॉन्ट, "English only" में बिना हिंदी वाले।',
        ],
        tips: [
          'सिर्फ़ अंग्रेज़ी वाले फ़ॉन्ट में हिंदी शब्द Noto Sans Devanagari में दिखते हैं। तब टेक्स्ट बॉक्स के नीचे "हिंदी फ़ॉन्ट लगाएं" बटन आता है।',
          'चुना हुआ हिंदी फ़ॉन्ट याद रहता है और नए हिंदी कैप्शन में लगता है।',
          'सभी फ़ॉन्ट आपकी वीडियो में मुफ़्त इस्तेमाल हो सकते हैं (SIL Open Font License) और ऐप के साथ आते हैं, इसलिए बिना इंटरनेट चलते हैं।',
        ],
      },
    },
    {
      id: 'hindi-captions',
      isNew: true,
      find: { tool: 'Caption style', needs: 'text' as const },
      keywords: ['caption', 'subtitle', 'hindi caption', 'कैप्शन', 'srt'],
      related: ['hindi-fonts'],
      en: {
        title: 'Hindi captions in your font',
        what: 'Hindi captions (made by AI, from a Hindi .srt file, or from scenes) get the Hindi font you picked last. You can change all of them in one tap.',
        where: 'Select a caption → Caption style → Hindi font for captions',
        steps: [
          'Select any Hindi caption and open Caption style.',
          'Under "Hindi font for captions", tap a font: every caption changes, and new Hindi captions will use it too.',
          'The "Hindi" trending look also uses your Hindi font.',
        ],
      },
      hi: {
        title: 'आपके फ़ॉन्ट में हिंदी कैप्शन',
        what: 'हिंदी कैप्शन (AI से बने, हिंदी .srt फ़ाइल से या सीन से) आपका आख़िरी चुना हिंदी फ़ॉन्ट लेते हैं। सभी को एक टैप में बदल सकते हैं।',
        where: 'कैप्शन चुनें → Caption style → कैप्शन का हिंदी फ़ॉन्ट',
        steps: [
          'कोई हिंदी कैप्शन चुनें और Caption style खोलें।',
          '"कैप्शन का हिंदी फ़ॉन्ट" में फ़ॉन्ट पर टैप करें: सारे कैप्शन बदल जाते हैं, और नए हिंदी कैप्शन भी यही लेंगे।',
          '"Hindi" ट्रेंडिंग लुक भी आपका हिंदी फ़ॉन्ट लेता है।',
        ],
      },
    },
  ],
}

export default section
