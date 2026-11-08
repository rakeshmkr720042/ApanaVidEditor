import type { HelpSection } from '../types'

/** User guide: the Desi creator pack (festival greetings, shayari cards, festival intro themes). */
const section: HelpSection = {
  id: 'desi-pack',
  order: 57,
  icon: 'text',
  title: { en: 'Desi creator pack', hi: 'देसी क्रिएटर पैक' },
  intro: {
    en: 'Festival greetings, shayari and quote cards, and festival or wedding intros. All built in, works offline.',
    hi: 'त्योहार की शुभकामनाएँ, शायरी और कोट कार्ड, और त्योहार या शादी के इंट्रो। सब ऐप में ही है, बिना इंटरनेट चलता है।',
  },
  topics: [
    {
      id: 'festival-titles',
      isNew: true,
      find: { tool: 'Text', needs: 'nothing' },
      keywords: ['diwali', 'holi', 'eid', 'rakhi', 'navratri', 'ganpati', '15 august', '26 january', 'chhath', 'tyohar', 'festival', 'greeting', 'shubhkamna'],
      en: {
        title: 'Festival greetings',
        what: 'Ready-made animated greetings for Diwali, Holi, Eid, Raksha Bandhan, Navratri, Ganpati, Independence Day, Republic Day, Chhath, Lohri, Pongal, Karwa Chauth, Christmas, New Year, and good morning / good night.',
        where: 'Add a text → Titles → Festivals',
        steps: [
          'Tap Text to add a text, then open the Titles tab.',
          'Tap Festivals and pick a greeting. The font, golden or tiranga colours and animation come with it.',
          'Open Edit to change the words, for example add your name or channel name.',
        ],
        tips: ['The Tiranga colour (saffron, white, green) is also in Style → Shine for any text.'],
      },
      hi: {
        title: 'त्योहार की शुभकामनाएँ',
        what: 'दिवाली, होली, ईद, रक्षाबंधन, नवरात्रि, गणपति, स्वतंत्रता दिवस, गणतंत्र दिवस, छठ, लोहड़ी, पोंगल, करवा चौथ, क्रिसमस, नया साल, और सुप्रभात / शुभ रात्रि के तैयार एनिमेटेड टाइटल।',
        where: 'टेक्स्ट जोड़ें → टाइटल → त्योहार',
        steps: [
          '"टेक्स्ट" दबाकर टेक्स्ट जोड़ें, फिर "टाइटल" टैब खोलें।',
          '"त्योहार" दबाएँ और कोई शुभकामना चुनें। फ़ॉन्ट, सुनहरा या तिरंगा रंग और एनिमेशन साथ में लग जाते हैं।',
          'शब्द बदलने के लिए "एडिट" खोलें, जैसे अपना या चैनल का नाम जोड़ें।',
        ],
        tips: ['तिरंगा रंग (केसरिया, सफ़ेद, हरा) किसी भी टेक्स्ट के लिए "स्टाइल → चमक" में भी है।'],
      },
    },
    {
      id: 'shayari-cards',
      isNew: true,
      find: { tool: 'Text', needs: 'nothing' },
      keywords: ['shayari', 'quote', 'status', 'doha', 'kabir', 'rahim', 'suvichar', 'good morning', 'card', 'whatsapp status'],
      en: {
        title: 'Shayari and quote cards',
        what: 'Puts a line of shayari, a quote, a wish or a doha of Kabir / Rahim on a neat card in the middle of the video. Good for status videos and Reels.',
        where: 'Add a text → Titles → Shayari & quotes',
        steps: [
          'Add a photo or video (or a plain colour background), then tap Text.',
          'Open Titles → Shayari & quotes.',
          'Pick a card look (Classic, Golden, Diary, Night, Minimal) and a type: Motivation, Love, Dosti, Life, Wishes or Dohe.',
          'Tap a line. It appears on the card. Tap Another line for a different one, or type your own words in Edit.',
        ],
        tips: [
          'The card size follows the frame shape, so it fits 9:16 Reels and 16:9 videos.',
          'Move or resize the card in the Position tab.',
          'Shayari cards are not offered for auto captions (captions keep their own look).',
        ],
      },
      hi: {
        title: 'शायरी और कोट कार्ड',
        what: 'शायरी, कोट, शुभकामना या कबीर / रहीम का दोहा वीडियो के बीच में एक सुंदर कार्ड पर लगाता है। स्टेटस वीडियो और रील्स के लिए बढ़िया।',
        where: 'टेक्स्ट जोड़ें → टाइटल → शायरी और कोट्स',
        steps: [
          'फ़ोटो या वीडियो (या सादा रंग का बैकग्राउंड) जोड़ें, फिर "टेक्स्ट" दबाएँ।',
          '"टाइटल → शायरी और कोट्स" खोलें।',
          'कार्ड का लुक चुनें (क्लासिक, सुनहरा, डायरी, रात, सादा) और प्रकार: हौसला, प्यार, दोस्ती, ज़िंदगी, शुभकामनाएँ या दोहे।',
          'किसी लाइन पर दबाएँ, वह कार्ड पर आ जाएगी। दूसरी लाइन के लिए "दूसरी लाइन" दबाएँ, या "एडिट" में अपने शब्द लिखें।',
        ],
        tips: [
          'कार्ड का साइज़ फ़्रेम के आकार के हिसाब से बनता है, इसलिए 9:16 रील्स और 16:9 वीडियो दोनों में ठीक बैठता है।',
          '"पोज़िशन" टैब में कार्ड को खिसका या छोटा-बड़ा कर सकते हैं।',
          'ऑटो कैप्शन पर शायरी कार्ड नहीं आता (कैप्शन का अपना लुक रहता है)।',
        ],
      },
    },
    {
      id: 'festival-intros',
      isNew: true,
      find: { tool: 'Intro/Outro', needs: 'nothing' },
      keywords: ['intro', 'shaadi intro', 'wedding intro', 'diwali intro', 'festival intro', 'theme'],
      en: {
        title: 'Festival and wedding intros',
        what: 'Six new themes in the intro / outro maker: Diwali, Holi, Eid, Shaadi, Rakhi and Tiranga. Each sets matching colours and a font that has Hindi letters.',
        where: 'Toolbar → Intro/Outro → Theme',
        steps: [
          'Tap Intro/Outro and start a new intro or outro.',
          'Under Theme, pick Diwali, Holi, Eid, Shaadi, Rakhi or Tiranga.',
          'Type the title in Hindi or English, add music or a logo if you like, and save.',
        ],
      },
      hi: {
        title: 'त्योहार और शादी के इंट्रो',
        what: 'इंट्रो / आउट्रो मेकर में छह नई थीम: दिवाली, होली, ईद, शादी, राखी और तिरंगा। हर थीम मिलते रंग और हिंदी अक्षरों वाला फ़ॉन्ट लगाती है।',
        where: 'टूलबार → इंट्रो/आउट्रो → थीम',
        steps: [
          '"इंट्रो/आउट्रो" दबाएँ और नया इंट्रो या आउट्रो शुरू करें।',
          '"थीम" में दिवाली, होली, ईद, शादी, राखी या तिरंगा चुनें।',
          'टाइटल हिंदी या अंग्रेज़ी में लिखें, चाहें तो म्यूज़िक या लोगो जोड़ें, और सेव करें।',
        ],
      },
    },
  ],
}

export default section
