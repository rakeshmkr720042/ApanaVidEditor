import type { HelpSection } from '../types'

const section: HelpSection = {
  id: 'makers',
  order: 100,
  icon: 'slides',
  title: { en: 'Make videos from photos, text and more', hi: 'फ़ोटो, टेक्स्ट और बहुत कुछ से वीडियो' },
  intro: { en: 'Turn photos, slides, a script, an article, a mind map, a quiz, data or audio into a video, or record your screen and camera.', hi: 'फ़ोटो, स्लाइड, स्क्रिप्ट, आर्टिकल, माइंड मैप, क्विज़, डेटा या ऑडियो को वीडियो बनाएँ, या स्क्रीन और कैमरा रिकॉर्ड करें।' },
  topics: [
    {
      id: 'slideshow',
      find: { tool: 'Slideshow', needs: 'nothing' },
      keywords: ['slideshow', 'photos to video', 'album', 'ken burns'],
      en: {
        title: 'Photo slideshow',
        what: 'Pick photos and they are laid out one after another as a video, with movement and transitions.',
        where: 'Empty project → Photo slideshow, or Toolbar → Slideshow',
        steps: [
          'Tap Photo slideshow (or Slideshow) and pick your photos.',
          'In the Slideshow panel set how long each photo shows, the Ken Burns movement and the Transition. Changes apply to all of them.',
          'Tap Add photos for more, and add music with Audio.',
        ],
      },
      hi: {
        title: 'फ़ोटो स्लाइडशो',
        what: 'फ़ोटो चुनें, वो एक के बाद एक वीडियो की तरह लग जाएँगी, हरकत और ट्रांज़िशन के साथ।',
        where: 'खाली प्रोजेक्ट → फ़ोटो स्लाइडशो, या टूलबार → स्लाइडशो',
        steps: [
          '"फ़ोटो स्लाइडशो" (या "स्लाइडशो") दबाकर फ़ोटो चुनें।',
          '"स्लाइडशो" पैनल में हर फ़ोटो कितनी देर दिखे, Ken Burns हरकत और ट्रांज़िशन तय करें। बदलाव सब पर लगते हैं।',
          'और फ़ोटो के लिए "फ़ोटो जोड़ें" दबाएँ, और "ऑडियो" से म्यूज़िक लगाएँ।',
        ],
      },
    },
    {
      id: 'content-to-video',
      find: { tool: 'Script to video', needs: 'nothing' },
      pro: true,
      keywords: ['script', 'pdf', 'slides', 'ppt', 'article', 'mind map', 'quiz', 'data', 'chart', 'text to video', 'audio to video', 'podcast'],
      en: {
        title: 'Content to video: slides, script, article, mind map, quiz, data, audio',
        what: 'Give the app your content and it builds the scenes, cards, voice and captions for you.',
        where: 'Empty project buttons, or the end of the main toolbar',
        steps: [
          'Slides / PDF to video: pick slides, a PDF or pictures; each becomes a scene. Add an AI voice or your own audio.',
          'Script to video: write or paste your script. Each part becomes a card or picks one of your pictures; choose a card style, AI voice or No voice, and background music.',
          'Article to video: paste an article link (or the text). Choose Key points or Full article; Local AI can shorten it.',
          'Mind map to video: write an outline or build the map; it animates branch by branch (Tree, Radial…).',
          'Quiz to video: write questions as a Quiz or Flashcards; a countdown shows before each answer.',
          'Data to video: type or paste a table; it becomes an animated chart (Bars, Columns, Line, Donut, Big numbers).',
          'Audio to video: pick a podcast or voice recording; captions are made and each chapter gets a scene from your pictures.',
          'Tap Create video. The scenes land on the timeline, ready to edit like any clip.',
        ],
      },
      hi: {
        title: 'कंटेंट से वीडियो: स्लाइड, स्क्रिप्ट, आर्टिकल, माइंड मैप, क्विज़, डेटा, ऑडियो',
        what: 'ऐप को अपना कंटेंट दें, वो सीन, कार्ड, आवाज़ और कैप्शन ख़ुद बना देगा।',
        where: 'खाली प्रोजेक्ट के बटन, या मुख्य टूलबार के अंत में',
        steps: [
          '"स्लाइड / PDF से वीडियो": स्लाइड, PDF या तस्वीरें चुनें; हर एक सीन बनती है। AI आवाज़ या अपना ऑडियो जोड़ें।',
          '"स्क्रिप्ट से वीडियो": अपनी स्क्रिप्ट लिखें या पेस्ट करें। हर हिस्सा एक कार्ड बनता है या आपकी तस्वीर लेता है; कार्ड स्टाइल, AI आवाज़ या बिना आवाज़, और बैकग्राउंड म्यूज़िक चुनें।',
          '"आर्टिकल से वीडियो": आर्टिकल का लिंक (या टेक्स्ट) पेस्ट करें। "मुख्य बिंदु" या "पूरा आर्टिकल" चुनें; लोकल AI उसे छोटा कर सकता है।',
          '"माइंड मैप से वीडियो": आउटलाइन लिखें या मैप बनाएँ; यह एक-एक शाखा करके चलता है (Tree, Radial…)।',
          '"क्विज़ से वीडियो": सवाल क्विज़ या फ़्लैशकार्ड की तरह लिखें; हर जवाब से पहले उल्टी गिनती दिखती है।',
          '"डेटा से वीडियो": टेबल लिखें या पेस्ट करें; यह चलता-फिरता चार्ट बनता है (Bars, Columns, Line, Donut, Big numbers)।',
          '"ऑडियो से वीडियो": पॉडकास्ट या आवाज़ की रिकॉर्डिंग चुनें; कैप्शन बनते हैं और हर चैप्टर को आपकी तस्वीरों से सीन मिलता है।',
          '"वीडियो बनाएँ" दबाएँ। सीन टाइमलाइन पर आ जाते हैं, किसी भी क्लिप की तरह एडिट करने के लिए तैयार।',
        ],
      },
    },
    {
      id: 'screen-record',
      find: { tool: 'Record screen', needs: 'nothing' },
      platforms: ['windows', 'web'],
      keywords: ['screen record', 'screen recording', 'tutorial', 'camera bubble', 'webcam'],
      en: {
        title: 'Record your screen (with camera bubble)',
        what: 'Record the full screen, a window or a browser tab, with your voice and your face in a bubble, straight into the project.',
        where: 'Toolbar → Record screen (or the empty project button)',
        steps: [
          'Tap Record screen. Choose What to record: Full screen, Window or Browser tab, and Whole screen or a Custom area.',
          'Turn on Add camera bubble for your face (● Circle or ▢ Rounded) and drag it where you want it.',
          'Tap Start recording and choose the screen. Pause / Resume any time.',
          'Tap Stop & add. The recording lands on the timeline; the bubble is its own track, so you can still move or hide it.',
        ],
        tips: ['Screen recording needs the Windows app or Chrome / Edge on a computer. On a phone use Record camera.'],
      },
      hi: {
        title: 'स्क्रीन रिकॉर्ड करें (कैमरा बबल के साथ)',
        what: 'पूरी स्क्रीन, कोई विंडो या ब्राउज़र टैब रिकॉर्ड करें, अपनी आवाज़ और बबल में अपने चेहरे के साथ, सीधे प्रोजेक्ट में।',
        where: 'टूलबार → स्क्रीन रिकॉर्ड (या खाली प्रोजेक्ट का बटन)',
        steps: [
          '"स्क्रीन रिकॉर्ड" दबाएँ। क्या रिकॉर्ड करना है चुनें: Full screen, Window या Browser tab, और Whole screen या Custom area।',
          'चेहरे के लिए "कैमरा बबल जोड़ें" चालू करें (● गोल या ▢ गोल कोने) और उसे जहाँ चाहें खींचें।',
          '"रिकॉर्डिंग शुरू करें" दबाकर स्क्रीन चुनें। कभी भी रोकें / जारी रखें।',
          '"रोकें और जोड़ें" दबाएँ। रिकॉर्डिंग टाइमलाइन पर आ जाएगी; बबल अपना अलग ट्रैक है, बाद में भी हिला या छिपा सकते हैं।',
        ],
        tips: ['स्क्रीन रिकॉर्डिंग Windows ऐप या कंप्यूटर पर Chrome / Edge में चलती है। फ़ोन पर "कैमरा रिकॉर्ड" इस्तेमाल करें।'],
      },
    },
    {
      id: 'camera-record',
      find: { tool: 'Record camera', needs: 'nothing' },
      keywords: ['camera', 'selfie', 'record video', 'webcam'],
      en: {
        title: 'Record with the camera',
        what: 'Film yourself with the phone or computer camera, straight into the project.',
        where: 'Toolbar → Record camera',
        steps: [
          'Tap Record camera and allow the camera and microphone.',
          'Tap Open camera; Switch camera flips between front and back.',
          'Start recording, Pause / Resume, then Stop & add.',
        ],
      },
      hi: {
        title: 'कैमरे से रिकॉर्ड करें',
        what: 'फ़ोन या कंप्यूटर के कैमरे से ख़ुद को शूट करें, सीधे प्रोजेक्ट में।',
        where: 'टूलबार → कैमरा रिकॉर्ड',
        steps: ['"कैमरा रिकॉर्ड" दबाएँ और कैमरा व माइक्रोफ़ोन की अनुमति दें।', '"कैमरा खोलें" दबाएँ; "कैमरा बदलें" आगे-पीछे का कैमरा बदलता है।', 'रिकॉर्डिंग शुरू करें, रोकें / जारी रखें, फिर "रोकें और जोड़ें"।'],
      },
    },
  ],
}

export default section
