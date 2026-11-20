import type { HelpSection } from '../types'

/** User guide: advanced creator tools, batch 1 (auto reframe, karaoke captions, camera moves, liquid transitions, follow tags). */
const section: HelpSection = {
  id: 'advanced',
  order: 92,
  icon: 'ai',
  title: { en: 'Advanced creator tools', hi: 'एडवांस क्रिएटर टूल' },
  intro: {
    en: 'Pro-style tricks in one tap: reframe for Reels, karaoke captions, cinematic camera moves, liquid transitions and stickers that follow.',
    hi: 'एक टैप में प्रो जैसे कमाल: रील्स के लिए रीफ़्रेम, कराओके कैप्शन, सिनेमैटिक कैमरा मूव, लिक्विड ट्रांज़िशन और पीछे-पीछे चलने वाले स्टिकर।',
  },
  topics: [
    {
      id: 'auto-reframe',
      isNew: true,
      find: { tool: 'Auto reframe', needs: 'nothing' },
      keywords: ['reframe', '9:16', 'reels', 'shorts', 'vertical', 'portrait', 'face', 'auto crop', 'lamba', 'khada video'],
      related: ['make-shorts'],
      en: {
        title: 'Auto reframe: wide video to 9:16, following the face',
        what: 'Turns a wide 16:9 video into a 9:16 Reel / Short (or 1:1, 4:5). The picture slides to keep the person’s face in the frame, like a camera operator following them. The face is found on this device.',
        where: 'Select nothing → toolbar → Auto reframe',
        steps: [
          'Open a project with a wide video and select nothing.',
          'Tap Auto reframe and pick the New shape: 9:16, 1:1 or 4:5.',
          'Pick the Camera: Smooth follow (vlogs, walking) or Steady camera (talking, podcasts).',
          'Optional: Zoom closer for a tighter face shot.',
          'Leave "Save as a new project" on to keep the wide version, then tap Auto reframe. The new project opens by itself.',
        ],
        tips: [
          'Each clip gets zoom & move keyframes. Select a clip → Zoom & move to fix any moment by hand.',
          'If no person is found (or the face model cannot run on an old phone), the video is framed in the middle.',
          'Long videos take a while: the app looks at the video twice every second. Tap Stop to cancel.',
          'Text, stickers and captions keep their places; check them once in the new shape.',
        ],
      },
      hi: {
        title: 'ऑटो रीफ़्रेम: चौड़ी वीडियो से 9:16, चेहरे के साथ',
        what: 'चौड़ी 16:9 वीडियो को 9:16 रील / शॉर्ट (या 1:1, 4:5) बनाता है। तस्वीर खिसककर व्यक्ति का चेहरा फ़्रेम में रखती है, जैसे कैमरामैन पीछे-पीछे चले। चेहरा इसी डिवाइस पर ढूँढा जाता है।',
        where: 'कुछ न चुनें → टूलबार → ऑटो रीफ़्रेम',
        steps: [
          'चौड़ी वीडियो वाला प्रोजेक्ट खोलें और कुछ भी न चुनें।',
          '"ऑटो रीफ़्रेम" दबाएँ और "नया आकार" चुनें: 9:16, 1:1 या 4:5।',
          '"कैमरा" चुनें: स्मूद फ़ॉलो (व्लॉग, चलते हुए) या स्थिर कैमरा (बातचीत, पॉडकास्ट)।',
          'चाहें तो "और पास ज़ूम" से चेहरा बड़ा करें।',
          'चौड़ी वीडियो बचाए रखने के लिए "नए प्रोजेक्ट में सेव करें" चालू रखें, फिर "ऑटो रीफ़्रेम" दबाएँ। नया प्रोजेक्ट अपने-आप खुलता है।',
        ],
        tips: [
          'हर क्लिप पर "ज़ूम और मूव" कीफ़्रेम लगते हैं। किसी पल को हाथ से ठीक करने के लिए क्लिप चुनें → ज़ूम और मूव।',
          'अगर कोई व्यक्ति न मिले (या पुराने फ़ोन पर चेहरे वाला मॉडल न चले), तो वीडियो बीच से फ़्रेम होती है।',
          'लंबी वीडियो में समय लगता है: ऐप हर सेकंड दो बार वीडियो देखता है। रद्द करने के लिए "रोकें" दबाएँ।',
          'टेक्स्ट, स्टिकर और कैप्शन अपनी जगह रहते हैं; नए आकार में उन्हें एक बार देख लें।',
        ],
      },
    },
  ],
}

export default section
