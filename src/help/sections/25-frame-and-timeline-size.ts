import type { HelpSection } from '../types'

const section: HelpSection = {
  id: 'frame-and-timeline-size',
  order: 25,
  icon: 'fit',
  title: { en: 'Main frame and timeline size', hi: 'मुख्य फ़्रेम और टाइमलाइन का साइज़' },
  intro: {
    en: 'Make the whole main video smaller and place it anywhere, and fold the timeline away for a bigger preview.',
    hi: 'पूरी मुख्य वीडियो को छोटा करके कहीं भी रखें, और बड़े प्रीव्यू के लिए टाइमलाइन छोटी करें।',
  },
  topics: [
    {
      id: 'main-frame',
      find: { tool: 'Main frame', needs: 'nothing' },
      keywords: ['resize', 'frame', 'picture in picture', 'size', 'position', 'border', 'round', 'frame chhota', 'video chhoti', 'saiz', 'main track'],
      isNew: true,
      related: ['timeline-minimize'],
      en: {
        title: 'Main frame: resize and move the whole main video',
        what: 'Puts the whole main video in a box of any size and shape (9:16, 16:9, 1:1, 4:5 or free) anywhere on the screen, with round corners, a border and a shadow. The background shows around it.',
        where: 'Toolbar → Main frame (or tap "Main" at the left of the timeline → Main frame: size & position)',
        steps: [
          'Tap Main frame in the bottom toolbar. A yellow box shows on the video.',
          'Pick a Shape: Full screen, 9:16 (Reels/Shorts), 16:9 (YouTube), 1:1 (square), 4:5 (Instagram post) or Free.',
          'Drag inside the yellow box to move the video. Drag a corner to resize it (the shape stays) or a side to stretch it (the shape becomes Free).',
          'Pink guide lines show when the box snaps to the centre, the edges or the thirds of the screen. Hold Alt while dragging to place it without snapping.',
          'Choose Fill (covers the box, edges of the video are cut) or Fit (the whole video shows inside the box).',
          'Use Size, Left / right and Up / down for exact values, or Centre / Left / Right / Top / Bottom for quick spots.',
          'Add Round corners, a Border (pick its colour) and a Shadow if you like.',
          'Reset (full screen) puts the video back to fill the screen.',
        ],
        tips: [
          'Around the frame you see the project background: change it in Format → Background (a colour, or Blur for a soft copy of the video).',
          'Text, stickers and overlays do not move with the frame, so you can put a title in the empty space.',
          'On a computer the mouse wheel over the video resizes the frame; on a phone use two fingers. Shift+drag a corner resizes without keeping the shape.',
          'The frame is saved with the project and shows in the exported video. Undo takes back every change.',
          'The settings panel covers the bottom of the preview: make the frame smaller with the Size slider first if you cannot reach the lower corners.',
        ],
      },
      hi: {
        title: 'मुख्य फ़्रेम: पूरी मुख्य वीडियो का साइज़ और जगह बदलें',
        what: 'पूरी मुख्य वीडियो को किसी भी साइज़ और आकार (9:16, 16:9, 1:1, 4:5 या कहीं भी) के बॉक्स में स्क्रीन पर कहीं भी रखता है, गोल कोने, बॉर्डर और छाया के साथ। चारों ओर बैकग्राउंड दिखता है।',
        where: 'टूलबार → मुख्य फ़्रेम (या टाइमलाइन के बाईं ओर "Main" दबाएँ → मुख्य फ़्रेम: साइज़ और जगह)',
        steps: [
          'नीचे टूलबार में "मुख्य फ़्रेम" दबाएँ। वीडियो पर पीला बॉक्स दिखेगा।',
          '"आकार" चुनें: पूरी स्क्रीन, 9:16 (Reels/Shorts), 16:9 (YouTube), 1:1 (चौकोर), 4:5 (Instagram पोस्ट) या कहीं भी।',
          'पीले बॉक्स के अंदर खींचकर वीडियो हिलाएँ। कोना खींचकर साइज़ बदलें (आकार वही रहेगा), या किनारा खींचकर फैलाएँ (आकार "कहीं भी" हो जाएगा)।',
          'जब बॉक्स स्क्रीन के बीच, किनारों या तिहाई लाइनों पर चिपकता है तो गुलाबी गाइड लाइन दिखती है। बिना चिपके रखने के लिए खींचते समय Alt दबाए रखें।',
          '"भरें" (बॉक्स पूरा ढकता है, वीडियो के किनारे कटते हैं) या "फ़िट" (पूरी वीडियो बॉक्स में दिखती है) चुनें।',
          'सही माप के लिए साइज़, बाएँ / दाएँ और ऊपर / नीचे स्लाइडर, या जल्दी जगह के लिए बीच / बाएँ / दाएँ / ऊपर / नीचे बटन इस्तेमाल करें।',
          'चाहें तो गोल कोने, बॉर्डर (रंग चुनें) और छाया जोड़ें।',
          '"रीसेट (पूरी स्क्रीन)" वीडियो को फिर से पूरी स्क्रीन पर कर देता है।',
        ],
        tips: [
          'फ़्रेम के चारों ओर प्रोजेक्ट का बैकग्राउंड दिखता है: इसे Format → बैकग्राउंड में बदलें (कोई रंग, या ब्लर जिससे वीडियो की धुंधली कॉपी दिखे)।',
          'टेक्स्ट, स्टिकर और ओवरले फ़्रेम के साथ नहीं हिलते, इसलिए खाली जगह में टाइटल रख सकते हैं।',
          'कंप्यूटर पर वीडियो के ऊपर माउस व्हील से फ़्रेम का साइज़ बदलता है; फ़ोन पर दो उंगलियों से। Shift+कोना खींचने से आकार रखे बिना साइज़ बदलता है।',
          'फ़्रेम प्रोजेक्ट के साथ सेव होता है और एक्सपोर्ट वीडियो में भी दिखता है। Undo हर बदलाव वापस लेता है।',
          'सेटिंग पैनल प्रीव्यू के नीचे वाले हिस्से को ढकता है: नीचे के कोने न दिखें तो पहले साइज़ स्लाइडर से फ़्रेम छोटा करें।',
        ],
      },
    },
    {
      id: 'timeline-minimize',
      find: { selector: '[data-testid="tl-min"]', needs: 'project' },
      keywords: ['minimize', 'collapse', 'hide timeline', 'bigger preview', 'timeline chhoti', 'band', 'chhupao'],
      isNew: true,
      related: ['main-frame'],
      en: {
        title: 'Minimize the timeline',
        what: 'Folds the timeline into one thin bar so the video preview gets bigger. The bar still shows the whole video and the playhead.',
        where: 'The ⌄ button next to the magnet above the timeline, or Shift+T',
        steps: [
          'Tap the ⌄ (down arrow) button next to the magnet above the timeline, or press Shift+T on a keyboard.',
          'The timeline becomes one thin bar and the preview gets bigger.',
          'The bar shows the clips, a coloured line for each text, sticker, overlay or audio item, the markers and the white playhead. Tap or drag on it to jump.',
          'The − / + buttons on the bar set the timeline zoom for when it opens again.',
          'Tap ⌃ (up arrow) or press Shift+T again to open the full timeline.',
        ],
        tips: [
          'The app remembers your choice: the editor opens the same way next time.',
          'Tools, keyboard shortcuts and the selected item keep working while the timeline is minimized.',
        ],
      },
      hi: {
        title: 'टाइमलाइन छोटी (मिनिमाइज़) करें',
        what: 'टाइमलाइन को एक पतली पट्टी बना देता है ताकि वीडियो प्रीव्यू बड़ा हो जाए। पट्टी में पूरी वीडियो और प्लेहेड दिखते रहते हैं।',
        where: 'टाइमलाइन के ऊपर चुंबक के पास ⌄ बटन, या Shift+T',
        steps: [
          'टाइमलाइन के ऊपर चुंबक के पास ⌄ (नीचे तीर) बटन दबाएँ, या कीबोर्ड पर Shift+T दबाएँ।',
          'टाइमलाइन एक पतली पट्टी बन जाती है और प्रीव्यू बड़ा हो जाता है।',
          'पट्टी में क्लिप, हर टेक्स्ट/स्टिकर/ओवरले/ऑडियो के लिए रंगीन लाइन, मार्कर और सफ़ेद प्लेहेड दिखते हैं। टैप करें या खींचें, वहीं पहुँच जाएँगे।',
          'पट्टी पर − / + बटन टाइमलाइन का ज़ूम सेट करते हैं, जो दोबारा खोलने पर दिखेगा।',
          'पूरी टाइमलाइन खोलने के लिए ⌃ (ऊपर तीर) दबाएँ या फिर से Shift+T दबाएँ।',
        ],
        tips: [
          'ऐप आपकी पसंद याद रखता है: अगली बार एडिटर उसी तरह खुलेगा।',
          'टाइमलाइन छोटी होने पर भी टूल, कीबोर्ड शॉर्टकट और चुना हुआ आइटम काम करते रहते हैं।',
        ],
      },
    },
  ],
}

export default section
