import type { HelpSection } from '../types'

const section: HelpSection = {
  id: 'annotate',
  order: 105,
  icon: 'brush',
  title: { en: 'Smart Screen Annotate', hi: 'स्मार्ट स्क्रीन एनोटेट' },
  intro: {
    en: 'Tutorials that explain themselves: the cursor glows, every click shows, circles become boxes and lines become underlines. Everything stays editable.',
    hi: 'ऐसे ट्यूटोरियल जो खुद समझाएँ: कर्सर चमकता है, हर क्लिक दिखता है, गोला बॉक्स बनता है और लाइन अंडरलाइन। सब कुछ बाद में बदल सकते हैं।',
  },
  topics: [
    {
      id: 'annotate-record',
      isNew: true,
      platforms: ['windows'],
      find: { tool: 'Record screen', needs: 'project' },
      keywords: ['smart annotate', 'cursor', 'click effect', 'highlight', 'tutorial', 'screen record', 'kersar', 'click dikhana', 'annotation'],
      related: ['screen-record', 'annotate-hotkeys', 'annotate-edit'],
      en: {
        title: 'Record your screen with Smart annotate',
        what: 'While you record your screen, the Windows app notes where the cursor is, every click and the shortcuts you press, plus anything you draw on the screen. After recording they appear as effects over the video: a glowing cursor tip, a ripple on every click, and the keys shown at the bottom.',
        where: 'Toolbar → Record screen → Smart annotate (on by default)',
        steps: [
          'Tap Record screen and keep "Smart annotate" switched on.',
          'Choose the screen or window and press Start recording.',
          'Work as usual. Every click and shortcut (like Ctrl+C) is caught. Plain typing is never recorded, only shortcuts with Ctrl, Alt or Win and keys like Enter or Esc.',
          'To draw on the screen press Alt+Shift+D: circle a word and it becomes a neat box; draw a line under a sentence and it glows like a highlighter, then stays as an underline. Press Esc to stop drawing.',
          'Press Stop & add. The recording goes into the timeline with an "Screen effects" item on its own row.',
        ],
        tips: [
          'The drawing toolbar and your strokes are not recorded in the video itself: they are added by the editor, so you can still change or delete them.',
          'In the browser, cursor and click data cannot be read. Add click effects and drawings later with Annotate (next topic).',
          'Effects follow the video: cutting pauses, trimming, changing the speed or cropping keeps every click on the right moment and spot.',
        ],
      },
      hi: {
        title: 'स्मार्ट एनोटेट के साथ स्क्रीन रिकॉर्ड करें',
        what: 'स्क्रीन रिकॉर्ड करते समय Windows ऐप नोट करता है कि कर्सर कहाँ है, हर क्लिक, और आपने कौन-से शॉर्टकट दबाए, साथ ही आप स्क्रीन पर जो भी बनाते हैं। रिकॉर्डिंग के बाद ये वीडियो पर इफ़ेक्ट बनकर आते हैं: चमकता कर्सर, हर क्लिक पर लहर, और नीचे दबाई गई कुंजियाँ।',
        where: 'टूलबार → स्क्रीन रिकॉर्ड → स्मार्ट एनोटेट (पहले से चालू)',
        steps: [
          '"स्क्रीन रिकॉर्ड" दबाएँ और "स्मार्ट एनोटेट" चालू रखें।',
          'स्क्रीन या विंडो चुनें और "रिकॉर्डिंग शुरू करें" दबाएँ।',
          'हमेशा की तरह काम करें। हर क्लिक और शॉर्टकट (जैसे Ctrl+C) पकड़ा जाता है। आम टाइपिंग कभी रिकॉर्ड नहीं होती, सिर्फ़ Ctrl, Alt या Win वाले शॉर्टकट और Enter, Esc जैसी कुंजियाँ।',
          'स्क्रीन पर बनाने के लिए Alt+Shift+D दबाएँ: किसी शब्द के चारों ओर गोला बनाएँ तो वह साफ़ बॉक्स बन जाता है; किसी वाक्य के नीचे लाइन खींचें तो पहले हाइलाइटर जैसी चमकती है, फिर अंडरलाइन बनकर रहती है। बनाना बंद करने के लिए Esc दबाएँ।',
          '"रोकें और जोड़ें" दबाएँ। रिकॉर्डिंग टाइमलाइन में आ जाती है और उसकी अपनी पंक्ति पर "स्क्रीन इफ़ेक्ट" आइटम बनता है।',
        ],
        tips: [
          'ड्रॉइंग टूलबार और आपकी लाइनें वीडियो में सीधे रिकॉर्ड नहीं होतीं: एडिटर उन्हें जोड़ता है, इसलिए आप उन्हें बाद में बदल या हटा सकते हैं।',
          'ब्राउज़र में कर्सर और क्लिक की जानकारी नहीं मिलती। क्लिक इफ़ेक्ट और ड्रॉइंग बाद में "एनोटेट" से जोड़ें (अगला विषय)।',
          'इफ़ेक्ट वीडियो के साथ चलते हैं: रुकावटें काटने, ट्रिम, स्पीड बदलने या क्रॉप करने पर भी हर क्लिक सही समय और जगह पर रहता है।',
        ],
      },
    },
    {
      id: 'annotate-hotkeys',
      isNew: true,
      platforms: ['windows'],
      keywords: ['laser', 'spotlight', 'zoom', 'hotkey', 'shortcut', 'alt shift', 'draw on screen', 'pen'],
      related: ['annotate-record'],
      en: {
        title: 'Hotkeys while recording: draw, laser, spotlight, zoom',
        what: 'These keys work while a recording with Smart annotate is running, even when another app is in front. The same buttons are in the recording window.',
        steps: [
          'Alt+Shift+D: draw on the screen. Tools: 1 Smart pen, 2 Highlighter, 3 Arrow, 4 Box, 5 Step number, 6 Click effect, 7 Pen. Esc stops drawing.',
          'Alt+Shift+L: laser pointer, a glowing red trail follows the cursor.',
          'Alt+Shift+S: spotlight, everything except the area round the cursor goes dim.',
          'Alt+Shift+Z: zoom in on the cursor; press again to zoom out.',
          'Alt+Shift+H: hide all effects for a while (for a private part), press again to show them.',
        ],
        tips: ['Step numbers count up by themselves: 1, 2, 3… for step-by-step guides.', 'If another app already uses a hotkey, use the buttons in the recording window instead.'],
      },
      hi: {
        title: 'रिकॉर्डिंग के दौरान हॉटकी: ड्रॉ, लेज़र, स्पॉटलाइट, ज़ूम',
        what: 'ये कुंजियाँ स्मार्ट एनोटेट वाली रिकॉर्डिंग चलते समय काम करती हैं, तब भी जब कोई दूसरा ऐप सामने हो। यही बटन रिकॉर्डिंग विंडो में भी हैं।',
        steps: [
          'Alt+Shift+D: स्क्रीन पर बनाएँ। टूल: 1 स्मार्ट पेन, 2 हाइलाइटर, 3 तीर, 4 बॉक्स, 5 स्टेप नंबर, 6 क्लिक इफ़ेक्ट, 7 पेन। Esc से बनाना बंद।',
          'Alt+Shift+L: लेज़र पॉइंटर, कर्सर के पीछे चमकती लाल लकीर।',
          'Alt+Shift+S: स्पॉटलाइट, कर्सर के आसपास के हिस्से को छोड़कर बाकी सब धुंधला-अँधेरा।',
          'Alt+Shift+Z: कर्सर पर ज़ूम; फिर दबाएँ तो ज़ूम वापस।',
          'Alt+Shift+H: कुछ देर के लिए सारे इफ़ेक्ट छिपाएँ (किसी निजी हिस्से के लिए), फिर दबाएँ तो दिखेंगे।',
        ],
        tips: ['स्टेप नंबर खुद बढ़ते हैं: 1, 2, 3… स्टेप-बाय-स्टेप गाइड के लिए।', 'अगर कोई दूसरा ऐप वही हॉटकी इस्तेमाल करता है, तो रिकॉर्डिंग विंडो के बटन इस्तेमाल करें।'],
      },
    },
    {
      id: 'annotate-edit',
      isNew: true,
      find: { tool: 'Annotate', needs: 'nothing' },
      keywords: ['annotate', 'draw on video', 'circle', 'box', 'underline', 'arrow', 'highlighter', 'tap effect', 'finger draw', 'step number', 'auto zoom', 'click sound'],
      related: ['annotate-record'],
      en: {
        title: 'Annotate: draw on any video and change the effects',
        what: 'Draw boxes, underlines, arrows and step numbers on a video with your finger or mouse, add click effects by tapping, and change how recorded cursor and click effects look. Works on phone, computer and the web.',
        where: 'Toolbar → Annotate (or select a "Screen effects" item → Annotate)',
        steps: [
          'Move the playhead to the moment and tap Annotate. It pauses the video.',
          'Draw tab: pick Smart pen and draw on the video. A circle becomes a box, a line under text becomes an underline. Other tools: Highlighter, Arrow, Box, Underline, Pen, Step number and Click effect (tap where the click should show). Type a shortcut like Ctrl+S and tap + Key to show it.',
          'Look tab: cursor highlight (glow, ring, big), click effect (ripple, burst, pulse) and colours, click sound, keys shown, spotlight, auto zoom (at every click, following the cursor, or only where you switched it on), laser trail, how long drawings stay, and smooth cursor.',
          'Marks tab: every click, key and drawing with its time. Tap a time to jump there, ✕ to delete one.',
          'Sync shift moves all effects earlier or later if clicks show a little off. Drag or trim the item on the timeline like any other.',
        ],
        tips: [
          'Auto zoom "At clicks" zooms in just before each click and back out after, like a pro screen-recording app.',
          'Drawings stay 5 seconds by default; set "Drawings stay" to 0 to keep them until the item ends.',
          'Everything shows in the exported video, and the click sound is mixed into it.',
        ],
      },
      hi: {
        title: 'एनोटेट: किसी भी वीडियो पर बनाएँ और इफ़ेक्ट बदलें',
        what: 'उंगली या माउस से वीडियो पर बॉक्स, अंडरलाइन, तीर और स्टेप नंबर बनाएँ, टैप करके क्लिक इफ़ेक्ट जोड़ें, और रिकॉर्ड हुए कर्सर व क्लिक इफ़ेक्ट का रूप बदलें। फ़ोन, कंप्यूटर और वेब सब पर चलता है।',
        where: 'टूलबार → एनोटेट (या "स्क्रीन इफ़ेक्ट" आइटम चुनें → एनोटेट)',
        steps: [
          'प्लेहेड को उस पल पर ले जाएँ और "एनोटेट" दबाएँ। वीडियो रुक जाएगी।',
          'ड्रॉ टैब: स्मार्ट पेन चुनें और वीडियो पर बनाएँ। गोला बॉक्स बन जाता है, टेक्स्ट के नीचे लाइन अंडरलाइन बन जाती है। दूसरे टूल: हाइलाइटर, तीर, बॉक्स, अंडरलाइन, पेन, स्टेप नंबर और क्लिक इफ़ेक्ट (जहाँ क्लिक दिखाना हो वहाँ टैप करें)। Ctrl+S जैसा शॉर्टकट लिखकर "+ कुंजी" दबाएँ तो वह दिखेगा।',
          'लुक टैब: कर्सर हाइलाइट (चमक, रिंग, बड़ा), क्लिक इफ़ेक्ट (लहर, धमाका, पल्स) और रंग, क्लिक की आवाज़, दबाई कुंजियाँ, स्पॉटलाइट, ऑटो ज़ूम (हर क्लिक पर, कर्सर के पीछे, या सिर्फ़ जहाँ आपने चालू किया), लेज़र लकीर, ड्रॉइंग कितनी देर रहे, और स्मूद कर्सर।',
          'मार्क्स टैब: हर क्लिक, कुंजी और ड्रॉइंग उसके समय के साथ। समय पर दबाकर वहाँ जाएँ, ✕ से हटाएँ।',
          'अगर क्लिक थोड़े आगे-पीछे दिखें तो "सिंक शिफ़्ट" से सारे इफ़ेक्ट पहले या बाद में करें। टाइमलाइन पर आइटम को बाकी आइटम की तरह खींचें या ट्रिम करें।',
        ],
        tips: [
          '"हर क्लिक पर" ऑटो ज़ूम हर क्लिक से ठीक पहले ज़ूम करता है और बाद में वापस, प्रो स्क्रीन-रिकॉर्डिंग ऐप जैसा।',
          'ड्रॉइंग पहले से 5 सेकंड रहती है; "ड्रॉइंग कितनी देर रहे" को 0 करें तो आइटम खत्म होने तक रहेगी।',
          'सब कुछ एक्सपोर्ट की गई वीडियो में दिखता है, और क्लिक की आवाज़ भी उसमें मिल जाती है।',
        ],
      },
    },
  ],
}

export default section
