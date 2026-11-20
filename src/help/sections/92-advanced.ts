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
    {
      id: 'karaoke-emoji',
      isNew: true,
      find: { tool: 'Caption style', needs: 'text' },
      related: ['caption-style'],
      keywords: ['karaoke', 'emoji', 'word by word', 'bounce', 'glow', 'underline', 'captions style', 'subtitle animation'],
      en: {
        title: 'Karaoke captions with emoji pops',
        what: 'New word-by-word caption looks: Emoji karaoke, Bounce, Glow karaoke and Underline. With "Emoji pops on words" on, a matching emoji springs up over a word while it is said (money / paisa → 💰, love / pyar → ❤️, Hindi words too).',
        where: 'Select a caption → Caption style → Trending looks',
        steps: [
          'Make captions first (Subtitles → Auto captions), or add any text.',
          'Select a caption and open Caption style.',
          'Tap a look: Emoji karaoke, Bounce, Glow karaoke or Underline. All captions change together.',
          'Under "Highlight the word being said" you can mix any style with the "Emoji pops on words" switch and pick the highlight colour.',
        ],
        tips: [
          'The emoji shows for about a second and then fades, so it never covers the next line.',
          'For Shorts, use "Short captions → 2 or 3 words a screen" first; the effects look best on short lines.',
          'Words with no matching emoji simply show no emoji.',
        ],
      },
      hi: {
        title: 'इमोजी के साथ कराओके कैप्शन',
        what: 'शब्द-दर-शब्द कैप्शन के नए लुक: इमोजी कराओके, उछाल, ग्लो कराओके और अंडरलाइन। "शब्दों पर इमोजी उछले" चालू हो, तो जो शब्द बोला जा रहा है उसके ऊपर मिलता-जुलता इमोजी उछलकर आता है (money / पैसा → 💰, love / प्यार → ❤️, हिंदी शब्द भी)।',
        where: 'कैप्शन चुनें → कैप्शन स्टाइल → ट्रेंडिंग लुक',
        steps: [
          'पहले कैप्शन बनाएँ (सबटाइटल → ऑटो कैप्शन), या कोई भी टेक्स्ट जोड़ें।',
          'कोई कैप्शन चुनें और "कैप्शन स्टाइल" खोलें।',
          'एक लुक दबाएँ: इमोजी कराओके, उछाल, ग्लो कराओके या अंडरलाइन। सारे कैप्शन एक साथ बदलते हैं।',
          '"बोले जा रहे शब्द को चमकाएं" में कोई भी स्टाइल "शब्दों पर इमोजी उछले" स्विच के साथ मिला सकते हैं और रंग चुन सकते हैं।',
        ],
        tips: [
          'इमोजी लगभग एक सेकंड दिखकर धीरे से गायब होता है, ताकि अगली लाइन न ढके।',
          'शॉर्ट्स के लिए पहले "छोटे कैप्शन → 2 या 3 शब्द" करें; छोटी लाइनों पर इफ़ेक्ट सबसे अच्छे लगते हैं।',
          'जिस शब्द का कोई इमोजी नहीं है, उस पर इमोजी नहीं आता।',
        ],
      },
    },
    {
      id: 'camera-moves',
      isNew: true,
      find: { tool: 'Camera moves', needs: 'clip' },
      related: ['zoom-move'],
      keywords: ['camera', 'shake', 'zoom', 'crash zoom', 'handheld', 'push in', 'dolly', 'cinematic', 'earthquake', 'hilna', 'jhatka'],
      en: {
        title: 'Camera moves: push-in, crash zoom, handheld, shake…',
        what: 'Eleven cinematic camera moves in one tap: Slow push-in, Pull back, Crash zoom, Handheld, Impact shake, Earthquake, Dutch tilt, Spin in, Slide right / left and Rise up.',
        where: 'Select a clip → Camera moves',
        steps: [
          'Select a clip on the main track.',
          'Tap Camera moves and tap a move. Play to see it.',
          'Drag Strength for a softer or stronger move.',
          'Use on all clips puts the same move on every clip. Remove takes it off.',
        ],
        tips: [
          'The move is saved as zoom & move keyframes, so it exports exactly as you see it. Open Zoom & move to fine-tune it.',
          'Picking another move replaces the old one. Undo takes any change back.',
          'Impact shake is great right on a beat drop: split the clip at the drop and use it on the new clip.',
        ],
      },
      hi: {
        title: 'कैमरा मूव: पास आना, क्रैश ज़ूम, हाथ वाला कैमरा, शेक…',
        what: 'एक टैप में ग्यारह सिनेमा जैसे कैमरा मूव: धीरे पास आना, पीछे हटना, क्रैश ज़ूम, हाथ वाला कैमरा, इम्पैक्ट शेक, भूकंप, तिरछा कैमरा, घूमकर आना, दाएँ / बाएँ खिसकना और ऊपर उठना।',
        where: 'क्लिप चुनें → कैमरा मूव',
        steps: [
          'मेन ट्रैक पर कोई क्लिप चुनें।',
          '"कैमरा मूव" दबाएँ और कोई मूव चुनें। देखने के लिए प्ले करें।',
          'हल्का या तेज़ करने के लिए "ताकत" खिसकाएँ।',
          '"सारी क्लिप पर लगाएँ" से वही मूव हर क्लिप पर लगता है। "हटाएं" से हट जाता है।',
        ],
        tips: [
          'मूव "ज़ूम और मूव" कीफ़्रेम के रूप में सेव होता है, इसलिए एक्सपोर्ट में बिल्कुल वैसा ही आता है। बारीकी से ठीक करने के लिए "ज़ूम और मूव" खोलें।',
          'दूसरा मूव चुनने पर पुराना बदल जाता है। Undo से कोई भी बदलाव वापस होता है।',
          'इम्पैक्ट शेक बीट ड्रॉप पर कमाल लगता है: ड्रॉप पर क्लिप काटें और नई क्लिप पर लगाएँ।',
        ],
      },
    },
    {
      id: 'liquid-transitions',
      isNew: true,
      find: { tool: 'Transition', needs: 'clip' },
      related: ['transitions'],
      keywords: ['transition', 'liquid', 'ink', 'melt', 'water', 'ripple', 'splash', 'smoke', 'goo', 'paani', 'syahi'],
      en: {
        title: 'Liquid & ink transitions',
        what: 'Eight flowing transitions between two clips: Liquid melt, Ink drops, Ink swirl, Water ripple, Liquid wave, Paint splash, Smoke and Gooey morph.',
        where: 'Select a clip → Transition → Liquid & ink',
        steps: [
          'Select the clip before the cut (the transition goes into the next clip).',
          'Tap Transition and pick the Liquid & ink group.',
          'Tap a transition, then set its Duration (0.8 to 1.2 s looks best for these).',
          'Apply to all puts the same transition between every clip.',
        ],
        tips: [
          'They run on the graphics chip, the same in preview and export, on phone and computer.',
          'Ink drops and Smoke look great between a dark and a bright shot; Paint splash suits fun, colourful videos.',
        ],
      },
      hi: {
        title: 'लिक्विड और स्याही ट्रांज़िशन',
        what: 'दो क्लिप के बीच आठ बहते हुए ट्रांज़िशन: लिक्विड मेल्ट, स्याही की बूँदें, स्याही भँवर, पानी की लहर, लिक्विड वेव, पेंट स्प्लैश, धुआँ और गूई मॉर्फ़।',
        where: 'क्लिप चुनें → ट्रांज़िशन → लिक्विड और स्याही',
        steps: [
          'कट से पहले वाली क्लिप चुनें (ट्रांज़िशन अगली क्लिप में जाता है)।',
          '"ट्रांज़िशन" दबाएँ और "लिक्विड और स्याही" ग्रुप चुनें।',
          'कोई ट्रांज़िशन दबाएँ, फिर उसका "समय" रखें (इनके लिए 0.8 से 1.2 सेकंड सबसे अच्छा लगता है)।',
          '"सब पर लगाएं" से हर क्लिप के बीच वही ट्रांज़िशन लगता है।',
        ],
        tips: [
          'ये ग्राफ़िक्स चिप पर चलते हैं, प्रीव्यू और एक्सपोर्ट में एक जैसे, फ़ोन और कंप्यूटर दोनों पर।',
          'स्याही की बूँदें और धुआँ अँधेरे और उजले शॉट के बीच कमाल लगते हैं; पेंट स्प्लैश मज़ेदार, रंगीन वीडियो के लिए है।',
        ],
      },
    },
  ],
}

export default section
