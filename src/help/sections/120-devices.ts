import type { HelpSection } from '../types'

const section: HelpSection = {
  id: 'devices',
  order: 120,
  icon: 'screen',
  title: { en: 'Phone, computer and account', hi: 'फ़ोन, कंप्यूटर और खाता' },
  intro: { en: 'What is different on Android, Windows and the website, and how Free and Pro work.', hi: 'Android, Windows और वेबसाइट में क्या अलग है, और Free व Pro कैसे चलते हैं।' },
  topics: [
    {
      id: 'android',
      platforms: ['android'],
      keywords: ['android', 'phone', 'mobile', 'back button', 'permission', 'apk', 'storage'],
      en: {
        title: 'Using the Android app',
        what: 'The full editor on your phone. A few things work differently from a computer.',
        steps: [
          'The phone\'s Back button closes the open tool or sheet first, then the selection, then leaves the editor.',
          'Pinch the timeline to zoom; long-press an item for its menu (copy, paste, split, delete…).',
          'Allow the camera and microphone when you record; allow photos and videos when you import.',
          'Exported videos and .avp files are saved in Documents/Apna Editor, and the share sheet opens.',
          'Turn the phone sideways for a bigger preview and timeline.',
        ],
        tips: [
          'Phones have less memory than computers. For long videos: close other apps, export at 720p or Small file, and use the Balanced caption model.',
          'Upload to YouTube is not in the phone app; use Share and pick YouTube.',
        ],
      },
      hi: {
        title: 'Android ऐप चलाना',
        what: 'आपके फ़ोन पर पूरा एडिटर। कुछ चीज़ें कंप्यूटर से अलग चलती हैं।',
        steps: [
          'फ़ोन का Back बटन पहले खुला टूल या शीट बंद करता है, फिर चुनाव हटाता है, फिर एडिटर से बाहर ले जाता है।',
          'ज़ूम के लिए टाइमलाइन पर दो उँगलियों से पिंच करें; मेन्यू के लिए आइटम को देर तक दबाएँ (कॉपी, पेस्ट, काटें, हटाएं…)।',
          'रिकॉर्ड करते समय कैमरा और माइक्रोफ़ोन की अनुमति दें; फ़ाइल जोड़ते समय फ़ोटो और वीडियो की अनुमति दें।',
          'एक्सपोर्ट की गई वीडियो और .avp फ़ाइलें Documents/Apna Editor में सेव होती हैं, और शेयर का मेन्यू खुलता है।',
          'बड़े प्रीव्यू और टाइमलाइन के लिए फ़ोन को आड़ा करें।',
        ],
        tips: [
          'फ़ोन में कंप्यूटर से कम मेमोरी होती है। लंबी वीडियो के लिए: दूसरे ऐप बंद करें, 720p या Small file में एक्सपोर्ट करें, और Balanced कैप्शन मॉडल लें।',
          'फ़ोन ऐप में YouTube अपलोड नहीं है; "शेयर" दबाकर YouTube चुनें।',
        ],
      },
    },
    {
      id: 'windows',
      platforms: ['windows'],
      keywords: ['windows', 'computer', 'desktop', 'pc', 'laptop', 'menu', 'installer', 'explorer'],
      en: {
        title: 'Using the Windows app',
        what: 'The desktop app works fully offline and adds a menu bar, file opening from Explorer and the strongest AI models.',
        steps: [
          'Menu bar: File → Open Video (Ctrl+O); Edit → undo, copy, paste; View → zoom and full screen (F11); Help → User Guide (F1), Keyboard Shortcuts, Getting Started, Website, About.',
          'Right-click a video in Explorer → Open with → Apna Editor to start editing it.',
          'Use a mouse and keyboard for speed: see Keyboard shortcuts. Ctrl+wheel zooms the timeline.',
          'The Best caption model and 4K export run well here.',
          'The computer stays awake while an export runs.',
        ],
        tips: ['Your projects are stored in the app\'s own folder on this computer. Use Save as .avp file for a backup you can copy.'],
      },
      hi: {
        title: 'Windows ऐप चलाना',
        what: 'डेस्कटॉप ऐप पूरी तरह बिना इंटरनेट चलता है, और इसमें मेन्यू बार, Explorer से फ़ाइल खोलना और सबसे ताक़तवर AI मॉडल हैं।',
        steps: [
          'मेन्यू बार: File → Open Video (Ctrl+O); Edit → Undo, कॉपी, पेस्ट; View → ज़ूम और पूरी स्क्रीन (F11); Help → User Guide (F1), Keyboard Shortcuts, Getting Started, Website, About।',
          'Explorer में किसी वीडियो पर राइट-क्लिक → Open with → Apna Editor, सीधे एडिटिंग शुरू।',
          'तेज़ी के लिए माउस और कीबोर्ड इस्तेमाल करें: "कीबोर्ड शॉर्टकट" देखें। Ctrl+व्हील टाइमलाइन ज़ूम करता है।',
          'Best कैप्शन मॉडल और 4K एक्सपोर्ट यहाँ अच्छे चलते हैं।',
          'एक्सपोर्ट चलते समय कंप्यूटर सोता नहीं।',
        ],
        tips: ['आपके प्रोजेक्ट इस कंप्यूटर पर ऐप के अपने फ़ोल्डर में रहते हैं। कॉपी करने लायक बैकअप के लिए ".avp फ़ाइल में सेव करें" इस्तेमाल करें।'],
      },
    },
    {
      id: 'website',
      platforms: ['web'],
      keywords: ['website', 'browser', 'chrome', 'edge', 'online', 'pwa'],
      en: {
        title: 'Using the website',
        what: 'The same editor runs in Chrome or Edge at the website, on a computer or a phone. Nothing is uploaded; everything stays in your browser.',
        steps: [
          'Open the website in Chrome or Edge (best support for video, camera and screen recording).',
          'Get the offline pack in Offline & online so it also works without internet.',
          'Do not clear the browser\'s site data: your projects live there. Keep .avp backups of important projects.',
        ],
      },
      hi: {
        title: 'वेबसाइट इस्तेमाल करना',
        what: 'यही एडिटर वेबसाइट पर Chrome या Edge में चलता है, कंप्यूटर या फ़ोन पर। कुछ भी अपलोड नहीं होता; सब आपके ब्राउज़र में रहता है।',
        steps: [
          'वेबसाइट Chrome या Edge में खोलें (वीडियो, कैमरा और स्क्रीन रिकॉर्डिंग के लिए सबसे अच्छे)।',
          '"ऑफ़लाइन और ऑनलाइन" में ऑफ़लाइन पैक लें, ताकि बिना इंटरनेट भी चले।',
          'ब्राउज़र का साइट डेटा साफ़ न करें: आपके प्रोजेक्ट वहीं रहते हैं। ज़रूरी प्रोजेक्ट का .avp बैकअप रखें।',
        ],
      },
    },
    {
      id: 'account',
      find: { selector: '[data-testid="home-account"]', needs: 'home' },
      keywords: ['account', 'sign in', 'login', 'register', 'password', 'google', 'profile', 'delete account'],
      en: {
        title: 'Your account (sign in)',
        what: 'You can edit without an account. An account is only needed to buy or restore Pro on all your devices.',
        where: 'Home → Sign in / Account',
        steps: [
          'Tap Sign in on the Home screen. Continue with Google, or register with your name, email and a password (8+ characters with letters and numbers).',
          'Verify your email from the message you receive.',
          'Forgot the password? Use Reset on the sign-in screen.',
          'In Account you can change your profile, see payments, sign out or delete the account.',
        ],
        tips: ['Your projects and videos stay on your device. The account only keeps your name, email and plan.'],
      },
      hi: {
        title: 'आपका खाता (साइन इन)',
        what: 'बिना खाते के भी एडिट कर सकते हैं। खाता सिर्फ़ Pro ख़रीदने या सभी डिवाइस पर वापस लाने के लिए चाहिए।',
        where: 'होम → साइन इन / खाता',
        steps: [
          'होम स्क्रीन पर "साइन इन" दबाएँ। Google से जारी रखें, या नाम, ईमेल और पासवर्ड (8+ अक्षर, अक्षर और अंक दोनों) से रजिस्टर करें।',
          'आए हुए मेल से अपना ईमेल पक्का (verify) करें।',
          'पासवर्ड भूल गए? साइन इन स्क्रीन पर "रीसेट" इस्तेमाल करें।',
          '"खाता" में प्रोफ़ाइल बदलें, भुगतान देखें, साइन आउट करें या खाता हटाएँ।',
        ],
        tips: ['आपके प्रोजेक्ट और वीडियो आपके डिवाइस पर रहते हैं। खाते में सिर्फ़ आपका नाम, ईमेल और प्लान रहता है।'],
      },
    },
    {
      id: 'free-pro',
      find: { selector: '[data-testid="home-premium"]', needs: 'home' },
      keywords: ['pro', 'premium', 'free', 'subscribe', 'price', 'trial', 'ads', 'crown', 'restore purchase'],
      en: {
        title: 'Free and Pro',
        what: 'Free has basic editing, tracks, text, music, filters, captions, recording, compress and unlimited projects, with ads. Pro removes ads and unlocks the features with a crown.',
        where: 'Home → Premium',
        steps: [
          'Tools with a small crown are Pro: 2K & 4K export, batch export, no Apna Editor mark, AI Dub (translate, voice-over, voice clone, YouTube subtitles), remove noise & audio effects, smart green screen, presenter profile, and content to video.',
          'New accounts get every Pro feature free for a trial period; the Home screen shows the days left.',
          'To buy: Home → Premium → pick a plan → Subscribe (you sign in first).',
          'Changed phone? Sign in with the same account and tap Restore purchase.',
        ],
      },
      hi: {
        title: 'Free और Pro',
        what: 'Free में साधारण एडिटिंग, ट्रैक, टेक्स्ट, म्यूज़िक, फ़िल्टर, कैप्शन, रिकॉर्डिंग, वीडियो छोटा करना और अनगिनत प्रोजेक्ट हैं, विज्ञापन के साथ। Pro विज्ञापन हटाता है और ताज (crown) वाले फ़ीचर खोलता है।',
        where: 'होम → प्रीमियम',
        steps: [
          'छोटे ताज वाले टूल Pro हैं: 2K और 4K एक्सपोर्ट, बैच एक्सपोर्ट, Apna Editor का निशान हटाना, AI डब (अनुवाद, वॉइस-ओवर, वॉइस क्लोन, YouTube सबटाइटल), शोर हटाना और ऑडियो इफ़ेक्ट, स्मार्ट ग्रीन स्क्रीन, प्रेज़ेंटर प्रोफ़ाइल, और कंटेंट से वीडियो।',
          'नए खातों को कुछ दिनों का फ्री ट्रायल मिलता है जिसमें हर Pro फ़ीचर खुला है; होम स्क्रीन बचे दिन बताती है।',
          'ख़रीदने के लिए: होम → प्रीमियम → प्लान चुनें → सब्सक्राइब करें (पहले साइन इन करना होगा)।',
          'फ़ोन बदला? उसी खाते से साइन इन करके "खरीद वापस लाएं" दबाएँ।',
        ],
      },
    },
  ],
}

export default section
