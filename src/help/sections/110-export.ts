import type { HelpSection } from '../types'

const section: HelpSection = {
  id: 'export',
  order: 110,
  icon: 'download',
  title: { en: 'Export, share and upload', hi: 'एक्सपोर्ट, शेयर और अपलोड' },
  intro: { en: 'Save the finished video, make files smaller, and post to YouTube.', hi: 'तैयार वीडियो सेव करें, फ़ाइल छोटी करें, और YouTube पर डालें।' },
  topics: [
    {
      id: 'export-video',
      find: { selector: '[data-help="export"]', needs: 'project' },
      keywords: ['export', 'save video', 'render', 'mp4', 'download', '1080p', '4k', 'quality', 'gif', 'mp3'],
      related: ['background-export', 'compress', 'youtube-upload'],
      en: {
        title: 'Export your video',
        what: 'Turn the project into a video file you can share anywhere.',
        where: 'Editor → Export (top right)',
        steps: [
          'Tap Export at the top right.',
          'Preset: one tap for YouTube 1080p (16:9), Instagram Reel (9:16), WhatsApp Status, Square or Twitter/X. Or Custom (project frame).',
          'Format: MP4 (plays everywhere), WebM, MOV, GIF, or MP3 (audio only).',
          'Resolution: 480p, 720p, 1080p, 2K or 4K. Frame rate: keep the default unless you need another.',
          'File size: Small file, Balanced or High quality. The Estimated size shows below.',
          'Cover: pick the frame used as the thumbnail.',
          'Tap Export and wait. Then Share it, or find it where it was saved.',
        ],
        tips: [
          'Android: saved in Documents/Apna Editor and the share sheet opens. Website: the browser downloads it. Windows: it is saved where you choose.',
          '4K takes about 4 times longer than 1080p and makes big files; it works best on a computer.',
          'Batch exports several sizes in one go (for example YouTube and Reels).',
        ],
      },
      hi: {
        title: 'अपनी वीडियो एक्सपोर्ट करें',
        what: 'प्रोजेक्ट को वीडियो फ़ाइल बनाएँ, जिसे कहीं भी शेयर कर सकें।',
        where: 'एडिटर → एक्सपोर्ट (ऊपर दाएँ)',
        steps: [
          'ऊपर दाएँ "एक्सपोर्ट" दबाएँ।',
          '"Preset": एक टैप में YouTube 1080p (16:9), Instagram Reel (9:16), WhatsApp Status, Square या Twitter/X। या Custom (प्रोजेक्ट का फ़्रेम)।',
          '"Format": MP4 (हर जगह चलता है), WebM, MOV, GIF, या MP3 (सिर्फ़ आवाज़)।',
          '"क्वालिटी": 480p, 720p, 1080p, 2K या 4K। "Frame rate" जब तक ज़रूरत न हो, जैसा है रहने दें।',
          '"फ़ाइल साइज़": Small file, Balanced या High quality। नीचे अनुमानित साइज़ दिखता है।',
          '"कवर": थंबनेल के लिए फ़्रेम चुनें।',
          '"एक्सपोर्ट" दबाकर इंतज़ार करें। फिर "शेयर" करें, या जहाँ सेव हुई वहाँ ढूँढें।',
        ],
        tips: [
          'Android: Documents/Apna Editor में सेव होती है और शेयर का मेन्यू खुलता है। वेबसाइट: ब्राउज़र डाउनलोड करता है। Windows: जहाँ आप चुनें वहाँ सेव होती है।',
          '4K में 1080p से लगभग 4 गुना समय लगता है और फ़ाइल बड़ी बनती है; कंप्यूटर पर सबसे अच्छा।',
          '"बैच" एक बार में कई साइज़ बनाता है (जैसे YouTube और Reels दोनों)।',
        ],
      },
    },
    {
      id: 'background-export',
      keywords: ['background export', 'minimize', 'screen off', 'long export', 'stuck'],
      en: {
        title: 'Long exports in the background',
        what: 'A long export keeps running when you switch apps, minimise the window or move to another tab.',
        where: 'Happens by itself during Export',
        steps: [
          'Start the export as usual.',
          'On Android a "Saving your video" notification shows and the screen stays on; you can switch apps.',
          'On Windows the computer is kept awake until the export ends.',
          'If the app was closed in the middle (usually the phone ran out of memory), the Home screen tells you next time. Your project is safe.',
        ],
        tips: ['On a phone with little memory: close other apps, then choose 720p or the Small file size.'],
      },
      hi: {
        title: 'लंबा एक्सपोर्ट बैकग्राउंड में',
        what: 'लंबा एक्सपोर्ट तब भी चलता रहता है जब आप दूसरा ऐप खोलें, विंडो छोटी करें या दूसरे टैब पर जाएँ।',
        where: 'एक्सपोर्ट के दौरान अपने आप',
        steps: [
          'हमेशा की तरह एक्सपोर्ट शुरू करें।',
          'Android पर "वीडियो सेव हो रही है" सूचना दिखती है और स्क्रीन जलती रहती है; आप दूसरा ऐप खोल सकते हैं।',
          'Windows पर एक्सपोर्ट ख़त्म होने तक कंप्यूटर सोता नहीं।',
          'अगर ऐप बीच में बंद हो गया (अक्सर फ़ोन की मेमोरी भर जाने से), तो अगली बार होम स्क्रीन बताएगी। आपका प्रोजेक्ट सुरक्षित रहता है।',
        ],
        tips: ['कम मेमोरी वाले फ़ोन पर: दूसरे ऐप बंद करें, फिर 720p या Small file चुनें।'],
      },
    },
    {
      id: 'compress',
      find: { selector: '[data-help="compress"]', needs: 'home' },
      keywords: ['compress', 'reduce size', 'smaller', 'whatsapp', 'mb', 'chota karna', 'h265'],
      en: {
        title: 'Compress video (make a file smaller)',
        what: 'Makes any video file smaller, for WhatsApp, email or upload. Works offline; the video never leaves your device.',
        where: 'Home → Compress video',
        steps: [
          'Tap Compress video and Choose a video.',
          'Preset: WhatsApp, YouTube, Small file or Smallest. Or set Target size (MB).',
          'Resolution and Frame rate: lower means smaller. Codec: H.264 plays everywhere, H.265 is smaller.',
          'Check the Estimated size, tap Compress, then Save or Share.',
        ],
        tips: ['If the new file is not smaller, keep the original or try a lower setting.'],
      },
      hi: {
        title: 'वीडियो छोटा करें (फ़ाइल साइज़ कम करें)',
        what: 'किसी भी वीडियो फ़ाइल को छोटा करता है, WhatsApp, ईमेल या अपलोड के लिए। बिना इंटरनेट चलता है; वीडियो आपके डिवाइस से बाहर नहीं जाती।',
        where: 'होम → वीडियो छोटा करें',
        steps: [
          '"वीडियो छोटा करें" दबाकर "वीडियो चुनें"।',
          '"Preset": WhatsApp, YouTube, Small file या Smallest। या "तय साइज़ (MB)" डालें।',
          'क्वालिटी और Frame rate: कम = छोटी फ़ाइल। "कोडेक": H.264 हर जगह चलता है, H.265 ज़्यादा छोटा।',
          'अनुमानित साइज़ देखें, "छोटा करें" दबाएँ, फिर "सेव" या "शेयर"।',
        ],
        tips: ['नई फ़ाइल छोटी न बने तो ओरिजिनल रखें या कम सेटिंग आज़माएँ।'],
      },
    },
    {
      id: 'youtube-upload',
      platforms: ['windows', 'web'],
      keywords: ['youtube', 'upload', 'publish', 'channel'],
      en: {
        title: 'Upload to YouTube',
        what: 'Send the exported video straight to your YouTube channel with title, description, tags and thumbnail.',
        where: 'Export → after the video is ready → Upload to YouTube',
        steps: [
          'Export the video, then tap Upload to YouTube.',
          'The first time, enter your own OAuth client ID (and client secret in the Windows app) from your Google Cloud project, then sign in with Google in the browser.',
          'Fill in Title, Description, Tags (comma separated) and Visibility (Private, Unlisted or Public). The chosen cover becomes the thumbnail.',
          'Tap Upload and keep this screen open until it says Uploaded to your channel.',
        ],
        tips: ['On the phone, use Share and pick the YouTube app. YouTube may take a few minutes to process the video.'],
      },
      hi: {
        title: 'YouTube पर अपलोड',
        what: 'एक्सपोर्ट की हुई वीडियो सीधे अपने YouTube चैनल पर भेजें, टाइटल, डिस्क्रिप्शन, टैग और थंबनेल के साथ।',
        where: 'एक्सपोर्ट → वीडियो बनने के बाद → YouTube पर अपलोड',
        steps: [
          'वीडियो एक्सपोर्ट करें, फिर "YouTube पर अपलोड" दबाएँ।',
          'पहली बार अपने Google Cloud प्रोजेक्ट का OAuth client ID (Windows ऐप में client secret भी) डालें, फिर ब्राउज़र में Google से साइन इन करें।',
          'टाइटल, डिस्क्रिप्शन, टैग (कॉमा से अलग) और Visibility (Private, Unlisted या Public) भरें। चुना हुआ कवर थंबनेल बनेगा।',
          '"अपलोड" दबाएँ और "आपके चैनल पर अपलोड हो गया" आने तक यह स्क्रीन खुली रखें।',
        ],
        tips: ['फ़ोन पर "शेयर" दबाकर YouTube ऐप चुनें। YouTube को वीडियो तैयार करने में कुछ मिनट लग सकते हैं।'],
      },
    },
  ],
}

export default section
