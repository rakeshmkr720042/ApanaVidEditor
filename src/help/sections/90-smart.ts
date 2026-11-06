import type { HelpSection } from '../types'

const section: HelpSection = {
  id: 'smart',
  order: 90,
  icon: 'smartcut',
  title: { en: 'Smart tools and branding', hi: 'स्मार्ट टूल और ब्रांडिंग' },
  intro: { en: 'Let the app cut pauses, make Shorts, learn your habits, and brand every video.', hi: 'ऐप से रुकावटें कटवाएँ, Shorts बनवाएँ, आपकी आदतें सीखने दें, और हर वीडियो पर अपनी पहचान लगाएँ।' },
  topics: [
    {
      id: 'smart-cut',
      find: { tool: 'Smart cut', needs: 'nothing' },
      keywords: ['smart cut', 'silence', 'pause', 'umm', 'jump cut', 'talking head', 'ruk'],
      en: {
        title: 'Smart cut: cut pauses and "umm" sounds',
        what: 'Takes out the quiet parts between sentences (and umm / aaa sounds) for a fast talking-head video. The sound is checked on this device.',
        where: 'Toolbar → Smart cut → Cut pauses',
        steps: [
          'Tap Smart cut and stay on Cut pauses.',
          'Choose what counts: Only silence, Soft sounds too, or umm sounds.',
          'Tap Find pauses. Tap a time in the list to hear it first.',
          'Tap Cut them. The video gets shorter; captions and text move with the words. Undo takes it back.',
        ],
      },
      hi: {
        title: 'स्मार्ट कट: रुकावटें और "अम्म" काटें',
        what: 'वाक्यों के बीच के चुप हिस्से (और अम्म / आआ की आवाज़ें) निकालकर तेज़ टॉकिंग-हेड वीडियो बनाता है। आवाज़ इसी डिवाइस पर जाँची जाती है।',
        where: 'टूलबार → स्मार्ट कट → रुकावटें काटें',
        steps: [
          '"स्मार्ट कट" दबाएँ और "रुकावटें काटें" पर रहें।',
          'क्या काटना है चुनें: सिर्फ़ चुप्पी, हल्की आवाज़ें भी, या अम्म की आवाज़ें।',
          '"रुकावटें ढूँढें" दबाएँ। सूची में किसी समय पर दबाकर पहले सुन लें।',
          '"काट दें" दबाएँ। वीडियो छोटी हो जाएगी; कैप्शन और टेक्स्ट शब्दों के साथ खिसकेंगे। "वापस" से पहले जैसा।',
        ],
      },
    },
    {
      id: 'punch-in',
      find: { tool: 'Smart cut', needs: 'nothing' },
      keywords: ['punch in', 'zoom cut', 'second camera', 'jump cut zoom'],
      en: {
        title: 'Punch-in zoom (looks like a second camera)',
        what: 'Zooms in on the face on every other clip, so each cut looks like a second camera angle.',
        where: 'Smart cut → Punch-in zoom',
        steps: ['Cut the pauses first so there are many clips (needs at least 2).', 'Open Smart cut → Punch-in zoom and tap Zoom every other clip.', 'Undo takes it back.'],
      },
      hi: {
        title: 'पंच-इन ज़ूम (जैसे दूसरा कैमरा)',
        what: 'हर दूसरी क्लिप में चेहरे पर ज़ूम करता है, ताकि हर कट दूसरे कैमरे जैसा लगे।',
        where: 'स्मार्ट कट → पंच-इन ज़ूम',
        steps: ['पहले रुकावटें काटें ताकि कई क्लिप बनें (कम से कम 2 चाहिए)।', '"स्मार्ट कट" → "पंच-इन ज़ूम" खोलकर "हर दूसरी क्लिप ज़ूम करें" दबाएँ।', '"वापस" से पहले जैसा।'],
      },
    },
    {
      id: 'make-shorts',
      find: { tool: 'Smart cut', needs: 'nothing' },
      keywords: ['shorts', 'reels', 'best moments', 'highlights', '9:16', 'clip long video'],
      en: {
        title: 'Make Shorts from a long video',
        what: 'Finds the liveliest parts of a long video and makes each one a 9:16 Short (a new project), framed on the person. Captions come along.',
        where: 'Smart cut → Make Shorts',
        steps: [
          'Tip: make captions first (Subtitles) so the moments show what is said.',
          'Open Smart cut → Make Shorts, choose the Length and tap Find best moments.',
          'Tap Watch to check a moment, then Make Short. It opens as a new project, ready to edit and export.',
        ],
        tips: ['With Local AI on, your computer\'s AI chooses the moments from the captions.'],
      },
      hi: {
        title: 'लंबी वीडियो से Shorts बनाएँ',
        what: 'लंबी वीडियो के सबसे जोशीले हिस्से ढूँढकर हर एक को 9:16 Short (नया प्रोजेक्ट) बनाता है, व्यक्ति पर फ़्रेम करके। कैप्शन भी साथ आते हैं।',
        where: 'स्मार्ट कट → शॉर्ट्स बनाएँ',
        steps: [
          'सुझाव: पहले कैप्शन बना लें ("सबटाइटल"), ताकि हिस्सों में दिखे कि क्या बोला गया।',
          '"स्मार्ट कट" → "शॉर्ट्स बनाएँ" खोलें, लंबाई चुनें और "सबसे अच्छे हिस्से ढूँढें" दबाएँ।',
          'जाँचने के लिए "देखें" दबाएँ, फिर "शॉर्ट बनाएँ"। यह नए प्रोजेक्ट में खुलेगा, एडिट और एक्सपोर्ट के लिए तैयार।',
        ],
        tips: ['"लोकल AI" चालू हो तो आपके कंप्यूटर का AI कैप्शन पढ़कर हिस्से चुनता है।'],
      },
    },
    {
      id: 'smart-shortcuts',
      find: { tool: 'Smart shortcuts', needs: 'nothing' },
      keywords: ['habits', 'your usual', 'suggestion', 'smart shortcuts', 'repeat'],
      en: {
        title: 'Smart shortcuts ("Your usual")',
        what: 'The editor notices what you do again and again (the same filter, noise removal, volume, text style, place on screen, the next tool) and offers it as one tap. It learns only on this device.',
        where: 'Toolbar → Your usual (when it appears); settings in Smart shortcuts',
        steps: [
          'Just keep editing. When you repeat something, a bar suggests it: tap to apply, or Not now.',
          '"Your usual" at the start of the toolbar applies your usual settings to the selected item.',
          'Open Smart shortcuts (end of the main toolbar, or Home → Shortcuts) to see what it learned, set how sure it must be (70 / 80 / 90%), or Forget everything.',
        ],
        tips: ['"Not now" three times in a row pauses that suggestion.'],
      },
      hi: {
        title: 'स्मार्ट शॉर्टकट ("आपका रोज़ वाला")',
        what: 'एडिटर देखता है कि आप बार-बार क्या करते हैं (वही फ़िल्टर, शोर हटाना, आवाज़, टेक्स्ट स्टाइल, स्क्रीन पर जगह, अगला टूल) और उसे एक टैप में देता है। यह सिर्फ़ इसी डिवाइस पर सीखता है।',
        where: 'टूलबार → आपका रोज़ वाला (जब दिखे); सेटिंग "स्मार्ट शॉर्टकट" में',
        steps: [
          'बस एडिट करते रहें। कुछ दोहराएँगे तो एक पट्टी सुझाव देगी: लगाने के लिए दबाएँ, या "अभी नहीं"।',
          'टूलबार की शुरुआत में "आपका रोज़ वाला" चुने आइटम पर आपकी आम सेटिंग लगाता है।',
          '"स्मार्ट शॉर्टकट" खोलें (मुख्य टूलबार के अंत में, या होम → शॉर्टकट) ताकि देखें क्या सीखा, कितना पक्का हो (70 / 80 / 90%), या "सब भूल जाएँ"।',
        ],
        tips: ['लगातार तीन बार "अभी नहीं" उस सुझाव को रोक देता है।'],
      },
    },
    {
      id: 'presenter',
      find: { selector: '[data-help="presenter"]', needs: 'project' },
      pro: true,
      keywords: ['presenter', 'name card', 'lower third', 'profile', 'branding', 'news strip'],
      en: {
        title: 'Presenter profile (your name and photo on every video)',
        what: 'A name card with your name, title and photo or logo that shows at the start, end or repeatedly in every project.',
        where: 'Editor → person button at the top',
        steps: [
          'Tap the person button at the top of the editor.',
          'Profile: fill in your name (Hindi works too), title and add a photo or logo. It is saved on this device and used in every project.',
          'Design: Corner card, News strip or Full screen, and Colours.',
          'When: show at the start, the end, and/or repeat in the middle.',
          'Off turns it off for this project.',
        ],
      },
      hi: {
        title: 'प्रेज़ेंटर प्रोफ़ाइल (हर वीडियो पर आपका नाम और फ़ोटो)',
        what: 'आपके नाम, पद और फ़ोटो या लोगो वाला नाम-कार्ड, जो हर प्रोजेक्ट में शुरू, अंत या बीच-बीच में दिखता है।',
        where: 'एडिटर → ऊपर व्यक्ति वाला बटन',
        steps: [
          'एडिटर में ऊपर व्यक्ति वाला बटन दबाएँ।',
          '"Profile": अपना नाम (हिंदी में भी), पद लिखें और फ़ोटो या लोगो जोड़ें। यह इसी डिवाइस पर सेव होकर हर प्रोजेक्ट में लगता है।',
          '"Design": Corner card, News strip या Full screen, और रंग।',
          '"When": शुरू में, अंत में, और/या बीच में बार-बार दिखाएँ।',
          '"Off" इस प्रोजेक्ट के लिए बंद करता है।',
        ],
      },
    },
    {
      id: 'watermark',
      find: { tool: 'Watermark', needs: 'nothing' },
      keywords: ['watermark', 'logo', 'channel name', 'copyright', 'protect'],
      en: {
        title: 'Your watermark (logo or channel name)',
        what: 'Put your logo or name on the video so nobody can pass it off as theirs.',
        where: 'Toolbar → Watermark',
        steps: [
          'Tap Watermark. Choose Text (your name or channel) or Logo image (PNG with a transparent background works best).',
          'Position: pick a corner, or drag it on the video.',
          'Static stays in place; Floating moves slowly around the whole frame so it is hard to crop out.',
          'Timing: Full video, or a Time range from Start at playhead to End at playhead.',
        ],
        tips: ['This is your own watermark. The small Apna Editor mark on Free exports is separate; Pro removes it.'],
      },
      hi: {
        title: 'आपका वॉटरमार्क (लोगो या चैनल का नाम)',
        what: 'वीडियो पर अपना लोगो या नाम लगाएँ ताकि कोई उसे अपना न बता सके।',
        where: 'टूलबार → वॉटरमार्क',
        steps: [
          '"वॉटरमार्क" दबाएँ। "Text" (आपका नाम या चैनल) या "Logo image" चुनें (पारदर्शी बैकग्राउंड वाली PNG सबसे अच्छी)।',
          '"Position": कोई कोना चुनें, या वीडियो पर खींचें।',
          '"Static" एक जगह रहता है; "Floating" पूरे फ़्रेम में धीरे-धीरे घूमता है ताकि काटकर हटाना मुश्किल हो।',
          '"Timing": पूरी वीडियो, या "प्लेहेड से शुरू" से "प्लेहेड पर ख़त्म" तक का समय।',
        ],
        tips: ['यह आपका अपना वॉटरमार्क है। Free एक्सपोर्ट पर Apna Editor का छोटा निशान अलग है; Pro उसे हटा देता है।'],
      },
    },
    {
      id: 'intro-outro',
      find: { tool: 'Intro/Outro', needs: 'nothing' },
      keywords: ['intro', 'outro', 'template', 'end screen', 'subscribe'],
      en: {
        title: 'Intro and outro templates',
        what: 'Make your channel intro and end screen once and add them to any video with one tap.',
        where: 'Toolbar → Intro/Outro',
        steps: [
          'Make a short video with your intro (name, logo, music) or end screen (subscribe, next video).',
          'Open Intro/Outro and tap Save this video as a template. Name it and choose Use as my default.',
          'In any project, tap Intro/Outro → Add my intro, Add my outro, or Add my intro + outro.',
          'Ready designs (Bold, Clean, Neon, Desi, News, Elegant) are there too.',
        ],
      },
      hi: {
        title: 'इंट्रो और आउट्रो टेम्पलेट',
        what: 'अपने चैनल का इंट्रो और एंड स्क्रीन एक बार बनाएँ और किसी भी वीडियो में एक टैप से जोड़ें।',
        where: 'टूलबार → इंट्रो/आउट्रो',
        steps: [
          'अपने इंट्रो (नाम, लोगो, म्यूज़िक) या एंड स्क्रीन (सब्सक्राइब, अगली वीडियो) की छोटी वीडियो बनाएँ।',
          '"इंट्रो/आउट्रो" खोलकर "इस वीडियो को टेम्पलेट बनाएँ" दबाएँ। नाम दें और "मेरा डिफ़ॉल्ट" चुनें।',
          'किसी भी प्रोजेक्ट में "इंट्रो/आउट्रो" → "मेरा इंट्रो जोड़ें", "मेरा आउट्रो जोड़ें" या "इंट्रो + आउट्रो जोड़ें"।',
          'तैयार डिज़ाइन (Bold, Clean, Neon, Desi, News, Elegant) भी हैं।',
        ],
      },
    },
  ],
}

export default section
