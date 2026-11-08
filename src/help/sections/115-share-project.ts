import type { HelpSection } from '../types'

/** User guide: sharing a whole project so someone else can keep editing it (lib/projectFile.ts). */
const section: HelpSection = {
  id: 'share-project',
  order: 115,
  icon: 'save',
  title: { en: 'Share a project', hi: 'प्रोजेक्ट शेयर करें' },
  intro: {
    en: 'Send the whole project (with its videos, photos and music) so a friend or your other device can keep editing.',
    hi: 'पूरा प्रोजेक्ट (वीडियो, फ़ोटो और म्यूज़िक के साथ) भेजें, ताकि दोस्त या आपका दूसरा डिवाइस आगे एडिट कर सके।',
  },
  topics: [
    {
      id: 'share-project-file',
      isNew: true,
      find: { selector: '[data-help="save"]', needs: 'project' },
      keywords: ['share', 'send', 'collab', 'collaborate', 'team', 'whatsapp', 'drive', 'bhejo', 'avp', 'friend'],
      en: {
        title: 'Share a project to keep editing elsewhere',
        what: 'Makes one .avp file of the project and opens the share sheet (WhatsApp, Drive, Gmail, Nearby Share…). The other person opens it in Apna Editor and continues where you stopped.',
        where: 'Editor → Save button (top right) → Share project',
        steps: [
          'In the editor, tap the Save button at the top right.',
          'Tap Share project and pick an app (Drive or Nearby Share is best for big files).',
          'On the other device: Home → Open project file (.avp) and pick the file. All the edits, text and media are there.',
        ],
        tips: [
          'The file holds every video and photo, so it is about as big as all of them together.',
          'On a computer that can\'t share files, the file is saved to Downloads; send it from there.',
          'Saving and opening work on phones even for big projects: files are read one at a time.',
          'Old .avp files from earlier versions still open.',
          'Editing together at the same time (live) is not available: it would need an online server.',
        ],
      },
      hi: {
        title: 'प्रोजेक्ट शेयर करें, कहीं और आगे एडिट करें',
        what: 'प्रोजेक्ट की एक .avp फ़ाइल बनाकर शेयर मेन्यू खोलता है (WhatsApp, Drive, Gmail, Nearby Share…)। दूसरा व्यक्ति इसे Apna Editor में खोलकर वहीं से आगे एडिट करता है।',
        where: 'एडिटर → सेव बटन (ऊपर दाएँ) → प्रोजेक्ट शेयर करें',
        steps: [
          'एडिटर में ऊपर दाईं ओर सेव बटन दबाएँ।',
          '"प्रोजेक्ट शेयर करें" दबाएँ और कोई ऐप चुनें (बड़ी फ़ाइल के लिए Drive या Nearby Share सबसे अच्छा)।',
          'दूसरे डिवाइस पर: होम → "प्रोजेक्ट फ़ाइल खोलें (.avp)" और फ़ाइल चुनें। सारी एडिटिंग, टेक्स्ट और मीडिया वहाँ मिल जाएँगे।',
        ],
        tips: [
          'फ़ाइल में सारे वीडियो और फ़ोटो होते हैं, इसलिए यह लगभग उन सबके कुल साइज़ जितनी बड़ी होती है।',
          'जिस कंप्यूटर से फ़ाइल शेयर नहीं होती, वहाँ फ़ाइल Downloads में सेव होती है; वहीं से भेजें।',
          'बड़े प्रोजेक्ट भी फ़ोन पर सेव और खुलते हैं: फ़ाइलें एक-एक करके पढ़ी जाती हैं।',
          'पुराने वर्ज़न की .avp फ़ाइलें भी खुलती हैं।',
          'एक साथ लाइव एडिटिंग नहीं है: उसके लिए ऑनलाइन सर्वर चाहिए।',
        ],
      },
    },
  ],
}

export default section
