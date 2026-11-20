import type { HelpSection } from '../types'

/** User guide: flower bloom reveal (engine/bloom.ts, panels/BloomPanel.tsx). */
const section: HelpSection = {
  id: 'flower-bloom',
  order: 41,
  icon: 'flower',
  title: { en: 'Flower bloom reveal', hi: 'फूल खिलकर फ़ोटो निकलना' },
  intro: {
    en: 'A flower slowly blooms, your photo or video comes out of it, and its petals fall over the whole screen.',
    hi: 'एक फूल धीरे-धीरे खिलता है, उसके बीच से आपकी फ़ोटो या वीडियो निकलती है और पंखुड़ियां पूरी स्क्रीन पर गिरती हैं।',
  },
  topics: [
    {
      id: 'flower-bloom',
      isNew: true,
      find: { tool: 'Flower bloom', needs: 'nothing' },
      keywords: ['flower bloom', 'phool', 'phool khilna', 'gulab', 'rose', 'kamal', 'lotus', 'surajmukhi', 'sunflower', 'sakura', 'cherry blossom', 'genda', 'marigold', 'petals falling', 'pankhudi', 'wedding intro', 'reveal'],
      related: ['shape-reveal', 'showers'],
      en: {
        title: 'Flower bloom: a flower opens and your photo comes out',
        what: 'A bud grows, opens petal by petal, and the photo or video you pick comes out of its centre. Then the flower breaks apart and its petals fall over the whole screen, some near (big and soft) and some far (small). 5 flowers: Rose, Lotus, Sunflower, Sakura (cherry blossom) and Marigold.',
        where: 'Select nothing → toolbar → Flower bloom (or Shape reveal → Flower bloom tab)',
        steps: [
          'Move the playhead to where the flower should start, and tap Flower bloom.',
          '1. Pick the flower. The picked card keeps blooming so you can see how it looks.',
          '2. Pick the photo or video that comes out: one already in this project, or tap Pick a photo or video… for a new one.',
          '3. Choose how it opens: Opens, then fills the screen (the photo takes over the whole screen), or Stays inside the flower (the photo stays in the middle of the flower, like a frame).',
          'Optional: Petal colour (rose comes in red, pink, white, yellow and orange; or pick your own colour), Blooming time, Flower size, how many Falling petals, how long they keep falling, and Wind (petals drift left or right).',
          'Tap Add at playhead. It goes on its own row from the playhead. Select that row later and tap Flower bloom to change anything.',
        ],
        tips: [
          'Rose is free. Lotus, Sunflower, Sakura and Marigold are Pro.',
          'Drag the row on the timeline to change when the flower opens; with a photo, drag its end to make the petals fall longer.',
          'The flowers and petals are drawn by the app itself, so they stay sharp in 4K and need no download.',
          'Want only falling petals, any time? Stickers → Showers has Rose petals 3D, Lotus petals, Sunflower petals, Sakura rain and Marigold petals.',
          'It looks the same in the preview and in the exported video, on phone and computer.',
        ],
      },
      hi: {
        title: 'फूल खिलना: फूल खुलता है और आपकी फ़ोटो निकलती है',
        what: 'एक कली उगती है, पंखुड़ी-पंखुड़ी खुलती है, और आपकी चुनी फ़ोटो या वीडियो उसके बीच से बाहर आती है। फिर फूल बिखर जाता है और पंखुड़ियां पूरी स्क्रीन पर गिरती हैं, कुछ पास (बड़ी और धुंधली) और कुछ दूर (छोटी)। 5 फूल: गुलाब, कमल, सूरजमुखी, साकुरा (चेरी ब्लॉसम) और गेंदा।',
        where: 'कुछ न चुनें → टूलबार → फूल खिलना (या शेप रिवील → फूल खिलना टैब)',
        steps: [
          'प्लेहेड वहाँ ले जाएँ जहाँ फूल शुरू होना चाहिए, और "फूल खिलना" दबाएँ।',
          '1. फूल चुनें। चुना हुआ कार्ड बार-बार खिलता है ताकि आप देख सकें कैसा दिखेगा।',
          '2. कौन सी फ़ोटो या वीडियो निकले, वो चुनें: इस प्रोजेक्ट की कोई फ़ोटो/वीडियो, या "फ़ोटो या वीडियो चुनें…" दबाकर नई चुनें।',
          '3. कैसे खुले चुनें: "खुलकर पूरी स्क्रीन भर दे" (फ़ोटो पूरी स्क्रीन पर आ जाती है) या "फूल के अंदर ही रहे" (फ़ोटो फूल के बीच में फ़्रेम की तरह रहती है)।',
          'चाहें तो: पंखुड़ी का रंग (गुलाब लाल, गुलाबी, सफ़ेद, पीला और नारंगी में; या अपना रंग), खिलने का समय, फूल का साइज़, कितनी पंखुड़ियां गिरें, कितनी देर गिरें, और हवा (पंखुड़ियां बाएँ या दाएँ उड़ें)।',
          '"प्लेहेड पर जोड़ें" दबाएँ। यह प्लेहेड से अपनी अलग लाइन पर लग जाता है। बाद में कुछ बदलना हो तो वो लाइन चुनें और "फूल खिलना" दबाएँ।',
        ],
        tips: [
          'गुलाब मुफ़्त है। कमल, सूरजमुखी, साकुरा और गेंदा Pro में हैं।',
          'फूल कब खुले, ये बदलने के लिए टाइमलाइन पर लाइन खींचें; फ़ोटो हो तो उसका आख़िरी सिरा खींचकर पंखुड़ियां ज़्यादा देर गिराएँ।',
          'फूल और पंखुड़ियां ऐप ख़ुद बनाता है, इसलिए 4K में भी साफ़ दिखते हैं और कुछ डाउनलोड नहीं करना पड़ता।',
          'सिर्फ़ गिरती पंखुड़ियां चाहिए, कभी भी? स्टिकर → बरसात में गुलाब की पंखुड़ियां 3D, कमल की पंखुड़ियां, सूरजमुखी की पंखुड़ियां, साकुरा की बारिश और गेंदे की पंखुड़ियां हैं।',
          'प्रीव्यू और एक्सपोर्ट की हुई वीडियो में एक जैसा दिखता है, फ़ोन और कंप्यूटर दोनों पर।',
        ],
      },
    },
  ],
}

export default section
