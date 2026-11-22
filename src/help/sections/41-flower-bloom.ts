import type { HelpSection } from '../types'

/** User guide: flower bloom reveal (engine/bloom.ts, panels/BloomPanel.tsx). */
const section: HelpSection = {
  id: 'flower-bloom',
  order: 41,
  icon: 'flower',
  title: { en: 'Flower bloom reveal', hi: 'फूल खिलकर फ़ोटो निकलना' },
  intro: {
    en: 'A real-looking flower garden fills the screen, the camera goes to one bud, it blooms, your photo comes out of its heart and fills the screen, and the petals fall on it.',
    hi: 'पूरी स्क्रीन पर असली जैसा फूलों का बगीचा, कैमरा एक कली पर जाता है, कली खिलती है, उसके बीच से आपकी फ़ोटो निकलकर पूरी स्क्रीन भर देती है और पंखुड़ियां उस पर गिरती हैं।',
  },
  topics: [
    {
      id: 'flower-bloom',
      isNew: true,
      find: { tool: 'Flower bloom', needs: 'nothing' },
      keywords: ['flower bloom', 'phool', 'phool khilna', 'garden', 'bagicha', 'bageecha', 'kali', 'bud', 'camera zoom', 'real flower', 'gulab', 'rose', 'kamal', 'lotus', 'surajmukhi', 'sunflower', 'sakura', 'cherry blossom', 'genda', 'marigold', 'petals falling', 'pankhudi', 'wedding intro', 'reveal'],
      related: ['shape-reveal', 'showers'],
      en: {
        title: 'Flower bloom: a flower garden, one bud blooms and your photo comes out',
        what: 'Like a film shot: first the whole screen is a sunny flower garden. The camera slowly moves in to one closed bud while the rest of the garden goes soft (like a real camera). The bud opens petal by petal into a full flower, your photo (by default the one on the Main track) comes out of its heart, grows and fills the screen, and the flower\'s petals fall freely over it: they tumble, turn over and sway as they fall, some near (big and soft) and some far (small). The flowers are real 3D flowers with light and shade, not flat drawings. 5 flowers, each with its own place: Rose (rose garden), Lotus (pond with lily pads), Sunflower (sunflower field), Sakura (cherry branches) and Marigold (marigold garden).',
        where: 'Select nothing → toolbar → Flower bloom (or Shape reveal → Flower bloom tab)',
        steps: [
          'Move the playhead to where the flower should start, and tap Flower bloom.',
          '1. Pick the flower. The picked card keeps blooming so you can see how it looks.',
          '2. Pick the photo or video that comes out. The photo on the Main track at the playhead is already picked (marked ⭐ Main track); or pick another one, or tap Pick a photo or video… for a new one.',
          '3. Background: 🌷 Flower garden, camera goes to one bud (the full film shot, new) or Only the flower, over my video (the flower opens over whatever is playing, as before).',
          'Then choose how it opens: Opens, then fills the screen (the photo takes over the whole screen and the petals fall on it), or Stays inside the flower (the photo stays in the middle of the flower, like a frame).',
          'Optional: Petal colour (rose comes in red, pink, white, yellow and orange; or pick your own colour), Blooming time, Flower size, how many Falling petals, how long they keep falling, and Wind (petals drift left or right).',
          'Tap Add at playhead. It goes on its own row from the playhead. If the Main track photo is shorter than the bloom, the photo is made longer by itself so the whole bloom plays. Select that row later and tap Flower bloom to change anything.',
        ],
        tips: [
          'Blooming time also sets how slowly the camera moves in: longer = slower, more cinematic.',
          'On a 9:16 Reel / Short the garden fills the tall screen too.',
          'The first frame can take a moment while the garden is drawn; after that it plays smoothly.',
          'Rose is free. Lotus, Sunflower, Sakura and Marigold are Pro.',
          'Drag the row on the timeline to change when the flower opens; with a photo, drag its end to make the petals fall longer.',
          'The flowers and petals are drawn by the app itself, so they stay sharp in 4K and need no download.',
          'Want only falling petals, any time? Stickers → Showers has Rose petals 3D, Lotus petals, Sunflower petals, Sakura rain and Marigold petals.',
          'It looks the same in the preview and in the exported video, on phone and computer.',
        ],
      },
      hi: {
        title: 'फूल खिलना: फूलों का बगीचा, एक कली खिलती है और आपकी फ़ोटो निकलती है',
        what: 'फ़िल्म के शॉट की तरह: पहले पूरी स्क्रीन पर धूप वाला फूलों का बगीचा दिखता है। कैमरा धीरे-धीरे एक बंद कली की तरफ़ जाता है और बाक़ी बगीचा धुंधला हो जाता है (असली कैमरे जैसा)। कली पंखुड़ी-पंखुड़ी खुलकर पूरा फूल बनती है, उसके बीच से आपकी फ़ोटो (अपने आप मेन ट्रैक वाली) निकलती है, बड़ी होकर पूरी स्क्रीन भर देती है, और फूल की पंखुड़ियां उस पर खुलकर गिरती हैं: गिरते हुए घूमती, पलटती और लहराती हैं, कुछ पास (बड़ी और धुंधली) और कुछ दूर (छोटी)। फूल असली 3D फूल हैं, रोशनी और छाया के साथ, सपाट चित्र नहीं। 5 फूल, हर एक की अपनी जगह: गुलाब (गुलाब का बगीचा), कमल (कमल के पत्तों वाला तालाब), सूरजमुखी (सूरजमुखी का खेत), साकुरा (चेरी की डालियां) और गेंदा (गेंदे का बगीचा)।',
        where: 'कुछ न चुनें → टूलबार → फूल खिलना (या शेप रिवील → फूल खिलना टैब)',
        steps: [
          'प्लेहेड वहाँ ले जाएँ जहाँ फूल शुरू होना चाहिए, और "फूल खिलना" दबाएँ।',
          '1. फूल चुनें। चुना हुआ कार्ड बार-बार खिलता है ताकि आप देख सकें कैसा दिखेगा।',
          '2. कौन सी फ़ोटो या वीडियो निकले, वो चुनें। प्लेहेड पर मेन ट्रैक वाली फ़ोटो पहले से चुनी होती है (⭐ मेन ट्रैक लिखा होता है); चाहें तो कोई और चुनें, या "फ़ोटो या वीडियो चुनें…" दबाकर नई चुनें।',
          '3. पीछे क्या दिखे: "🌷 फूलों का बगीचा, कैमरा एक कली पर जाए" (पूरा फ़िल्मी शॉट, नया) या "सिर्फ़ फूल, मेरी वीडियो के ऊपर" (फूल आपकी चल रही वीडियो के ऊपर खिलता है, पहले जैसा)।',
          'फिर कैसे खुले चुनें: "खुलकर पूरी स्क्रीन भर दे" (फ़ोटो पूरी स्क्रीन पर आ जाती है और पंखुड़ियां उस पर गिरती हैं) या "फूल के अंदर ही रहे" (फ़ोटो फूल के बीच में फ़्रेम की तरह रहती है)।',
          'चाहें तो: पंखुड़ी का रंग (गुलाब लाल, गुलाबी, सफ़ेद, पीला और नारंगी में; या अपना रंग), खिलने का समय, फूल का साइज़, कितनी पंखुड़ियां गिरें, कितनी देर गिरें, और हवा (पंखुड़ियां बाएँ या दाएँ उड़ें)।',
          '"प्लेहेड पर जोड़ें" दबाएँ। यह प्लेहेड से अपनी अलग लाइन पर लग जाता है। अगर मेन ट्रैक की फ़ोटो फूल खिलने से छोटी है, तो फ़ोटो अपने आप लंबी हो जाती है ताकि पूरा फूल खिलना चले। बाद में कुछ बदलना हो तो वो लाइन चुनें और "फूल खिलना" दबाएँ।',
        ],
        tips: [
          '"खिलने का समय" से कैमरा कितना धीरे पास जाए, वो भी बदलता है: ज़्यादा समय = धीमा, ज़्यादा फ़िल्मी।',
          '9:16 रील / शॉर्ट्स में भी बगीचा पूरी लंबी स्क्रीन भरता है।',
          'पहली फ़्रेम में बगीचा बनने में थोड़ा समय लग सकता है; उसके बाद आराम से चलता है।',
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
