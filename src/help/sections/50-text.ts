import type { HelpSection } from '../types'

const section: HelpSection = {
  id: 'text',
  order: 50,
  icon: 'text',
  title: { en: 'Text and titles', hi: 'टेक्स्ट और टाइटल' },
  intro: { en: 'Write on your video in English or Hindi, style it and animate it.', hi: 'वीडियो पर अंग्रेज़ी या हिंदी में लिखें, उसे सजाएँ और चलाएँ।' },
  topics: [
    {
      id: 'add-text',
      find: { tool: 'Text', needs: 'nothing' },
      keywords: ['text', 'write', 'likhna', 'words', 'font', 'type'],
      related: ['text-style', 'titles', 'hindi-fonts', 'hindi-typing'],
      en: {
        title: 'Add text',
        what: 'Write any words on the video, for as long as you want.',
        where: 'Toolbar (nothing selected) → Text',
        steps: [
          'Move the playhead to where the text should appear and tap Text.',
          'Type in the box ("Type here"). A new line is a new line on the video.',
          'Drag the text on the preview to place it; drag a corner to resize; use the round handle to turn it.',
          'Drag its ends on the timeline to set when it shows and hides.',
          'Double-tap the text on the preview (or tap Edit) to change the words later.',
        ],
      },
      hi: {
        title: 'टेक्स्ट जोड़ें',
        what: 'वीडियो पर कुछ भी लिखें, जितनी देर चाहें।',
        where: 'टूलबार (कुछ चुना न हो) → टेक्स्ट',
        steps: [
          'प्लेहेड वहाँ रखें जहाँ टेक्स्ट दिखना चाहिए और "टेक्स्ट" दबाएँ।',
          'बॉक्स में लिखें ("यहाँ लिखें")। नई लाइन वीडियो पर भी नई लाइन बनती है।',
          'जगह तय करने के लिए प्रीव्यू पर टेक्स्ट खींचें; कोना खींचकर छोटा-बड़ा करें; गोल हैंडल से घुमाएँ।',
          'कब दिखे और कब छिपे, यह टाइमलाइन पर उसके सिरे खींचकर तय करें।',
          'बाद में शब्द बदलने के लिए प्रीव्यू पर टेक्स्ट को दो बार दबाएँ (या "बदलें" दबाएँ)।',
        ],
      },
    },
    {
      id: 'text-style',
      find: { tool: 'Style', needs: 'text' },
      keywords: ['font', 'colour', 'color', 'outline', 'shadow', 'glow', 'background', 'bold', 'size', 'style'],
      en: {
        title: 'Text style: font, colour, outline, shadow, glow',
        what: 'Make the text easy to read and match your video.',
        where: 'Select a text → Style',
        steps: [
          'Select the text and tap Style.',
          'Pick a Font, then Size, Bold / Italic, letter Spacing and alignment (Left, Centre, Right).',
          'Pick a Colour. Add an Outline, a Shadow, a Glow, a Background box or Shine for a moving shine.',
          'Opacity makes the text see-through.',
        ],
        tips: ['White text with a dark outline or shadow is readable on any video.'],
      },
      hi: {
        title: 'टेक्स्ट स्टाइल: फ़ॉन्ट, रंग, आउटलाइन, परछाईं, चमक',
        what: 'टेक्स्ट को आसानी से पढ़ने लायक और वीडियो के हिसाब से बनाएँ।',
        where: 'टेक्स्ट चुनें → स्टाइल',
        steps: [
          'टेक्स्ट चुनकर "स्टाइल" दबाएँ।',
          'फ़ॉन्ट चुनें, फिर साइज़, Bold / Italic, अक्षरों के बीच की जगह और लाइन (बाएँ, बीच, दाएँ)।',
          'रंग चुनें। आउटलाइन, परछाईं, चमक (Glow), पीछे बॉक्स (Background) या चलती चमक (Shine) लगाएँ।',
          '"Opacity" से टेक्स्ट पारदर्शी होता है।',
        ],
        tips: ['गहरी आउटलाइन या परछाईं वाला सफ़ेद टेक्स्ट हर वीडियो पर पढ़ने में आता है।'],
      },
    },
    {
      id: 'text-anim',
      find: { tool: 'Animation', needs: 'text' },
      keywords: ['animation', 'typewriter', 'fade', 'bounce', 'letter by letter', 'motion'],
      en: {
        title: 'Text animation',
        what: 'Let the text appear and leave with movement: typewriter, letter by letter, fade, zoom, bounce, slide, spin, blur and more.',
        where: 'Select a text → Animation',
        steps: [
          'Select the text and tap Animation.',
          'Choose an In animation (how it appears) and an Out animation (how it leaves).',
          'Choose a Motion while it shows, if you want it to keep moving.',
          'Play to check. The animation length follows the text length on the timeline.',
        ],
      },
      hi: {
        title: 'टेक्स्ट एनिमेशन',
        what: 'टेक्स्ट हरकत के साथ आए और जाए: टाइपराइटर, एक-एक अक्षर, फ़ेड, ज़ूम, उछाल, खिसकना, घूमना, ब्लर और भी।',
        where: 'टेक्स्ट चुनें → एनिमेशन',
        steps: [
          'टेक्स्ट चुनकर "एनिमेशन" दबाएँ।',
          'आने का (In) और जाने का (Out) एनिमेशन चुनें।',
          'दिखते समय भी हिलता रहे, तो "Motion" चुनें।',
          'चलाकर जाँचें। एनिमेशन की लंबाई टाइमलाइन पर टेक्स्ट की लंबाई के हिसाब से होती है।',
        ],
      },
    },
    {
      id: 'titles',
      find: { tool: 'Titles', needs: 'nothing' },
      keywords: ['title', 'wedding', 'heading', 'intro text', 'ready made'],
      en: {
        title: 'Ready-made titles (wedding, intro, headings)',
        what: 'Designed titles with fonts, colours and animation already set, including wedding and festival looks.',
        where: 'Toolbar → Titles',
        steps: [
          'Move the playhead and tap Titles.',
          'Tap a title to add it.',
          'Change the words in Edit; the design stays.',
        ],
      },
      hi: {
        title: 'तैयार टाइटल (शादी, इंट्रो, हेडिंग)',
        what: 'पहले से सजे टाइटल, जिनमें फ़ॉन्ट, रंग और एनिमेशन लगे हैं; शादी और त्योहार वाले लुक भी।',
        where: 'टूलबार → टाइटल',
        steps: ['प्लेहेड रखें और "टाइटल" दबाएँ।', 'किसी टाइटल पर दबाकर उसे जोड़ें।', '"बदलें" में शब्द बदलें; डिज़ाइन वही रहेगा।'],
      },
    },
    {
      id: 'text-behind',
      find: { tool: 'Behind person', needs: 'text' },
      keywords: ['behind', 'person', 'text behind', 'peeche'],
      en: {
        title: 'Text behind a person',
        what: 'Put big text behind the person in the video, so they stand in front of it (a popular title look).',
        where: 'Select a text → Behind person',
        steps: [
          'Add a big text and place it behind the person\'s head or body.',
          'Tap Behind person. The app finds the person in every frame on your device and draws them in front of the text.',
          'Tap it again to turn it off.',
        ],
        tips: ['Works best with one person who stands out clearly from the background.'],
      },
      hi: {
        title: 'व्यक्ति के पीछे टेक्स्ट',
        what: 'बड़ा टेक्स्ट वीडियो में दिख रहे व्यक्ति के पीछे रखें, ताकि वो उसके आगे खड़ा दिखे (लोकप्रिय टाइटल लुक)।',
        where: 'टेक्स्ट चुनें → व्यक्ति के पीछे',
        steps: [
          'बड़ा टेक्स्ट जोड़ें और उसे व्यक्ति के सिर या शरीर के पीछे रखें।',
          '"व्यक्ति के पीछे" दबाएँ। ऐप आपके डिवाइस पर ही हर फ़्रेम में व्यक्ति को ढूँढता है और उसे टेक्स्ट के आगे दिखाता है।',
          'बंद करने के लिए फिर दबाएँ।',
        ],
        tips: ['एक व्यक्ति हो और बैकग्राउंड से साफ़ अलग दिखे, तो सबसे अच्छा चलता है।'],
      },
    },
  ],
}

export default section
