import type { HelpSection } from '../types'

/** User guide: trending looks that arrive without updating the app (lib/trending.ts). */
const section: HelpSection = {
  id: 'trending-updates',
  order: 82,
  icon: 'text',
  title: { en: 'New trending looks', hi: 'नए ट्रेंडिंग लुक' },
  intro: {
    en: 'New caption looks and titles arrive by themselves, without installing a new app.',
    hi: 'नए कैप्शन लुक और टाइटल अपने-आप आ जाते हैं, नया ऐप डालने की ज़रूरत नहीं।',
  },
  topics: [
    {
      id: 'trending-looks',
      isNew: true,
      find: { tool: 'Text', needs: 'nothing' },
      keywords: ['trending', 'new looks', 'update', 'naya', 'fire', 'caption style', 'title'],
      en: {
        title: 'Trending looks (🔥)',
        what: 'When the app starts and the internet is on, it quietly checks for new trending caption looks and titles. New ones show first, with a 🔥 mark.',
        where: 'Captions: select a caption → Captions tab → Trending looks. Titles: add a text → Titles → 🔥 Trending',
        steps: [
          'Open the app with the internet on. Nothing to tap: the check runs in the background.',
          'Select a caption or text and open the Captions tab: looks with 🔥 are the newest.',
          'For titles, open Titles and tap 🔥 Trending.',
        ],
        tips: [
          'The app checks at most twice a day and never slows down editing.',
          'Without internet you still get the last looks it downloaded, and every built-in look.',
          'Your videos never change by themselves: a new look is used only when you tap it.',
        ],
      },
      hi: {
        title: 'ट्रेंडिंग लुक (🔥)',
        what: 'ऐप खुलने पर, इंटरनेट हो तो, ऐप चुपचाप नए ट्रेंडिंग कैप्शन लुक और टाइटल देख लेता है। नए लुक सबसे पहले 🔥 निशान के साथ दिखते हैं।',
        where: 'कैप्शन: कैप्शन चुनें → कैप्शन टैब → ट्रेंडिंग लुक। टाइटल: टेक्स्ट जोड़ें → टाइटल → 🔥 ट्रेंडिंग',
        steps: [
          'इंटरनेट चालू रखकर ऐप खोलें। कुछ दबाना नहीं है: जाँच पीछे-पीछे चलती है।',
          'कोई कैप्शन या टेक्स्ट चुनकर "कैप्शन" टैब खोलें: 🔥 वाले लुक सबसे नए हैं।',
          'टाइटल के लिए "टाइटल" खोलें और "🔥 ट्रेंडिंग" दबाएँ।',
        ],
        tips: [
          'ऐप दिन में ज़्यादा से ज़्यादा दो बार जाँचता है और एडिटिंग धीमी नहीं करता।',
          'बिना इंटरनेट के भी पिछली बार आए लुक और ऐप के सारे लुक मिलते हैं।',
          'आपकी वीडियो अपने-आप नहीं बदलती: नया लुक तभी लगता है जब आप उसे दबाएँ।',
        ],
      },
    },
  ],
}

export default section
