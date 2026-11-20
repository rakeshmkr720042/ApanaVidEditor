import type { HelpSection } from '../types'

/** User guide: Scenes (a beautiful place behind and in front of a clip). */
const section: HelpSection = {
  id: 'scenes-behind-front',
  order: 81,
  icon: 'mountain',
  title: { en: 'Scenes behind and in front', hi: 'पीछे और आगे सीन' },
  intro: {
    en: 'Look like you shot your video at the Eiffel Tower, in the mountains or by a waterfall.',
    hi: 'ऐसा दिखाएं जैसे वीडियो एफ़िल टॉवर, पहाड़ों या झरने के पास शूट हुआ हो।',
  },
  topics: [
    {
      id: 'scenes',
      isNew: true,
      find: { tool: 'Scenes', needs: 'clip' },
      keywords: ['scene', 'background', 'eiffel', 'paris', 'jungle', 'safari', 'mountain', 'pahad', 'jharna', 'waterfall', 'fountain', 'garden', 'hill station', 'forest', 'leaves', 'patte', 'peeche', 'aage'],
      en: {
        title: 'Scenes: Eiffel Tower, mountains, jungle behind you, leaves in front',
        what: 'Seven scenes drawn by the app: Flower garden, Hill station, Jungle safari, Snow mountains, Waterfall, Fountain and Eiffel Tower. The scene can go behind the person (the AI takes the real background away), in front of the video as a frame of leaves, flowers or mist, or both.',
        where: 'Select a clip → Scenes',
        steps: [
          'Select the clip and tap Scenes.',
          'Choose how: Frame in front (leaves, flowers, mist near the camera, works on every video), Scene behind me, Behind + in front (best: like the camera is hidden in the trees), or Side by side (you on one side, the landmark on the other).',
          'Tap a scene. Wait a moment the first time while the AI gets ready.',
          'Fine-tune: Background blur (camera focus on you), Camera move (still, slow push in, slow pan), Match the light, Shadow under the feet, Front frame size, Living scene (water flows, clouds and birds move).',
          'Same scene on all clips puts it on every clip. Remove takes it away. Export: the video looks exactly like the preview.',
        ],
        tips: [
          'The scene goes behind people only: the AI finds people, not other things. On a part of the video with nobody in it, only the front frame shows, and the panel tells you.',
          'Best results: one person, standing out from the background. With Green screen on, the scene shows through the green screen.',
          'Free: Frame in front with every scene, and Scene behind me with Flower garden and Hill station. Premium: the other scenes behind you, Behind + in front, and Side by side.',
          'Scenes are drawn by the app itself, so they need no internet and do not make the app bigger.',
        ],
      },
      hi: {
        title: 'सीन: आपके पीछे एफ़िल टॉवर, पहाड़, जंगल, आगे पत्तियाँ',
        what: 'ऐप के बनाए सात सीन: फूलों का बाग़, हिल स्टेशन, जंगल सफ़ारी, बर्फ़ीले पहाड़, झरना, फव्वारा और एफ़िल टॉवर। सीन व्यक्ति के पीछे लग सकता है (AI असली बैकग्राउंड हटाता है), वीडियो के आगे पत्तियों, फूलों या धुंध के फ़्रेम की तरह, या दोनों।',
        where: 'क्लिप चुनें → सीन',
        steps: [
          'क्लिप चुनकर "सीन" दबाएँ।',
          'कैसे चुनें: आगे फ़्रेम (कैमरे के पास पत्तियाँ, फूल, धुंध, हर वीडियो पर), मेरे पीछे सीन, पीछे + आगे (सबसे अच्छा: जैसे कैमरा पेड़ों में छिपा हो), या साथ-साथ (एक तरफ़ आप, दूसरी तरफ़ मशहूर जगह)।',
          'कोई सीन दबाएँ। पहली बार AI तैयार होने तक थोड़ा रुकें।',
          'बारीकी से बदलें: बैकग्राउंड ब्लर (कैमरे का फ़ोकस आप पर), कैमरा मूव (रुका, धीरे पास जाना, धीरे घूमना), रोशनी मिलाएं, पैरों के नीचे छाया, आगे के फ़्रेम का साइज़, जीवंत सीन (पानी बहता है, बादल और पक्षी चलते हैं)।',
          '"सभी क्लिप पर यही सीन" हर क्लिप पर लगाता है। "हटाएं" से सीन हटता है। एक्सपोर्ट बिल्कुल प्रीव्यू जैसा बनता है।',
        ],
        tips: [
          'सीन सिर्फ़ लोगों के पीछे लगता है: AI लोगों को ढूँढता है, बाकी चीज़ों को नहीं। जिस हिस्से में कोई नहीं है, वहाँ सिर्फ़ आगे का फ़्रेम दिखता है, और पैनल यह बताता है।',
          'सबसे अच्छा नतीजा: एक व्यक्ति, जो बैकग्राउंड से अलग दिखे। ग्रीन स्क्रीन चालू हो तो सीन ग्रीन स्क्रीन की जगह दिखता है।',
          'फ़्री: हर सीन के साथ "आगे फ़्रेम", और फूलों का बाग़ व हिल स्टेशन के साथ "मेरे पीछे सीन"। प्रीमियम: बाकी सीन पीछे, "पीछे + आगे" और "साथ-साथ"।',
          'सीन ऐप ख़ुद बनाता है, इसलिए इंटरनेट नहीं चाहिए और ऐप का साइज़ नहीं बढ़ता।',
        ],
      },
    },
  ],
}

export default section
