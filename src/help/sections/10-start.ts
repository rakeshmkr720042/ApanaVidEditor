import type { HelpSection } from '../types'

const section: HelpSection = {
  id: 'start',
  order: 10,
  icon: 'plus',
  title: { en: 'Getting started', hi: 'शुरुआत' },
  intro: { en: 'Make your first video, save it, and find your way around.', hi: 'पहली वीडियो बनाएँ, सेव करें और ऐप को समझें।' },
  topics: [
    {
      id: 'first-video',
      find: { selector: '[data-help="new-project"], [data-help="import"]' },
      keywords: ['start', 'begin', 'new', 'shuru', 'pehli video', 'naya'],
      related: ['timeline-basics', 'export-video'],
      en: {
        title: 'Make your first video',
        what: 'From an empty project to a finished video file in a few minutes.',
        where: 'Home → New project',
        steps: [
          'On the Home screen tap New project. The editor opens with an empty screen.',
          'Tap Import video (the big +) and pick one or more videos or photos. They are placed one after another on the main video row of the timeline.',
          'Press Play (or Space on a keyboard) to watch. Drag the timeline left and right to move the white playhead line.',
          'Cut out what you do not want: put the playhead on the spot, tap the clip, then tap Split. Tap the unwanted piece and tap Delete.',
          'Add text, music or captions from the toolbar at the bottom (Text, Audio, Subtitles).',
          'Tap Export at the top right, choose the quality and tap Export. The finished video is saved on your device.',
        ],
        tips: [
          'Your project saves itself after every change. You can close the app and continue later from the Home screen.',
          'Everything happens on your device. Your videos are never uploaded.',
          'Made a mistake? Undo (the curved arrow at the top) takes back every step.',
        ],
      },
      hi: {
        title: 'अपनी पहली वीडियो बनाएँ',
        what: 'खाली प्रोजेक्ट से तैयार वीडियो फ़ाइल तक, बस कुछ मिनट में।',
        where: 'होम → नया प्रोजेक्ट',
        steps: [
          'होम स्क्रीन पर "नया प्रोजेक्ट" दबाएँ। एडिटर खाली स्क्रीन के साथ खुलेगा।',
          '"वीडियो जोड़ें" (बड़ा +) दबाएँ और एक या ज़्यादा वीडियो या फ़ोटो चुनें। ये टाइमलाइन की मुख्य वीडियो लाइन पर एक के बाद एक लग जाएँगी।',
          'देखने के लिए Play दबाएँ (कीबोर्ड पर Space)। टाइमलाइन को बाएँ-दाएँ खींचने से सफ़ेद प्लेहेड लाइन आगे-पीछे होती है।',
          'जो हिस्सा नहीं चाहिए उसे काटें: प्लेहेड को उस जगह रखें, क्लिप को दबाएँ, फिर "काटें" दबाएँ। फ़ालतू टुकड़े को दबाकर "हटाएं" दबाएँ।',
          'नीचे के टूलबार से टेक्स्ट, म्यूज़िक या कैप्शन जोड़ें ("टेक्स्ट", "ऑडियो", "सबटाइटल")।',
          'ऊपर दाएँ "एक्सपोर्ट" दबाएँ, क्वालिटी चुनें और "एक्सपोर्ट" दबाएँ। तैयार वीडियो आपके डिवाइस में सेव हो जाएगी।',
        ],
        tips: [
          'हर बदलाव के बाद प्रोजेक्ट अपने आप सेव होता है। ऐप बंद करके बाद में होम स्क्रीन से वहीं से शुरू कर सकते हैं।',
          'सारा काम आपके डिवाइस पर ही होता है। आपकी वीडियो कहीं अपलोड नहीं होती।',
          'गलती हो गई? ऊपर "वापस" (मुड़ा तीर) हर स्टेप वापस ले लेता है।',
        ],
      },
    },
    {
      id: 'home-screen',
      find: { selector: '[data-help="new-project"]', needs: 'home' },
      keywords: ['home', 'projects', 'list', 'delete project'],
      en: {
        title: 'The Home screen and your projects',
        what: 'The Home screen lists every project on this device and has the tools that work without a project.',
        where: 'Opens when the app starts; the back arrow in the editor returns here',
        steps: [
          'New project: starts an empty project.',
          'Open project file (.avp): opens a project saved as a file (for example sent from another device).',
          'Compress video: makes any video file smaller without opening the editor.',
          'Offline & online: shows what works without internet and downloads the offline pack.',
          'Tap a project card to continue editing it. Each card shows a thumbnail and the length.',
          'To delete a project, tap the trash button on its card and confirm.',
          'The top bar has Help (this guide), Notes, Shortcuts, Premium, Local AI, the language switch (English / हिंदी) and your Account.',
        ],
        tips: ['Storage used (under Offline & online) shows how much space your projects take on this device.'],
      },
      hi: {
        title: 'होम स्क्रीन और आपके प्रोजेक्ट',
        what: 'होम स्क्रीन पर इस डिवाइस के सारे प्रोजेक्ट दिखते हैं, और वो टूल भी जो बिना प्रोजेक्ट के चलते हैं।',
        where: 'ऐप खुलते ही दिखती है; एडिटर में ऊपर बायाँ तीर यहीं लाता है',
        steps: [
          '"नया प्रोजेक्ट": खाली प्रोजेक्ट शुरू करता है।',
          '"प्रोजेक्ट फ़ाइल खोलें (.avp)": फ़ाइल के रूप में सेव किया प्रोजेक्ट खोलता है (जैसे दूसरे डिवाइस से भेजा गया)।',
          '"वीडियो छोटा करें": एडिटर खोले बिना किसी भी वीडियो फ़ाइल का साइज़ कम करता है।',
          '"ऑफ़लाइन और ऑनलाइन": बताता है कि बिना इंटरनेट क्या चलेगा, और ऑफ़लाइन पैक डाउनलोड करता है।',
          'किसी प्रोजेक्ट कार्ड को दबाकर उसकी एडिटिंग आगे करें। हर कार्ड पर छोटी तस्वीर और लंबाई दिखती है।',
          'प्रोजेक्ट हटाने के लिए उसके कार्ड पर कूड़ेदान बटन दबाएँ और पक्का करें।',
          'ऊपर की पट्टी में मदद (यह गाइड), नोट्स, शॉर्टकट, प्रीमियम, लोकल AI, भाषा बदलने का बटन (English / हिंदी) और आपका खाता है।',
        ],
        tips: ['"स्टोरेज इस्तेमाल" (ऑफ़लाइन और ऑनलाइन के पास) बताता है कि आपके प्रोजेक्ट इस डिवाइस में कितनी जगह ले रहे हैं।'],
      },
    },
    {
      id: 'save-project',
      find: { selector: '[data-help="save"]', needs: 'project' },
      keywords: ['save', 'avp', 'backup', 'transfer', 'sev', 'file'],
      related: ['relink'],
      en: {
        title: 'Save, back up and move a project (.avp)',
        what: 'Projects save themselves. An .avp file is a full copy you can keep as a backup or open on another device.',
        where: 'Editor → Save button (disk icon at the top)',
        steps: [
          'Every change is saved by itself within a second. Save project in the save menu saves right away.',
          'To make a backup, tap the save button and choose Save as .avp file. The file has your edits and your media.',
          'To open it later or on another phone or computer, go to Home → Open project file (.avp) and pick the file.',
          'To rename a project, tap its name at the top of the editor.',
        ],
        tips: [
          'If the phone or browser clears its storage, media can go missing. A yellow bar then offers Find files (see Missing files).',
          'On Android the .avp file is saved in Documents/Apna Editor. On Windows you choose the folder.',
        ],
      },
      hi: {
        title: 'प्रोजेक्ट सेव करें, बैकअप लें और दूसरे डिवाइस पर ले जाएँ (.avp)',
        what: 'प्रोजेक्ट अपने आप सेव होते हैं। .avp फ़ाइल पूरी कॉपी है, जिसे बैकअप की तरह रख सकते हैं या दूसरे डिवाइस पर खोल सकते हैं।',
        where: 'एडिटर → सेव बटन (ऊपर डिस्क वाला निशान)',
        steps: [
          'हर बदलाव एक सेकंड में अपने आप सेव हो जाता है। सेव मेन्यू का "प्रोजेक्ट सेव करें" तुरंत सेव करता है।',
          'बैकअप के लिए सेव बटन दबाकर ".avp फ़ाइल में सेव करें" चुनें। इस फ़ाइल में आपकी एडिटिंग और मीडिया दोनों रहते हैं।',
          'बाद में या दूसरे फ़ोन/कंप्यूटर पर खोलने के लिए होम → "प्रोजेक्ट फ़ाइल खोलें (.avp)" दबाकर फ़ाइल चुनें।',
          'प्रोजेक्ट का नाम बदलने के लिए एडिटर में सबसे ऊपर उसके नाम पर दबाएँ।',
        ],
        tips: [
          'अगर फ़ोन या ब्राउज़र अपना स्टोरेज साफ़ कर दे तो मीडिया गायब हो सकता है। तब पीली पट्टी पर "फ़ाइलें ढूँढें" आता है (देखें: गायब फ़ाइलें)।',
          'Android पर .avp फ़ाइल Documents/Apna Editor में सेव होती है। Windows पर फ़ोल्डर आप चुनते हैं।',
        ],
      },
    },
    {
      id: 'undo-redo',
      find: { selector: '[data-help="undo"]', needs: 'project' },
      keywords: ['undo', 'redo', 'mistake', 'galti', 'wapas'],
      en: {
        title: 'Undo and redo',
        what: 'Take back any change, or bring it back again.',
        where: 'Editor → the curved arrows at the top (Ctrl+Z / Ctrl+Y)',
        steps: [
          'Tap the left curved arrow (Undo) to take back the last change. Tap again to go further back.',
          'Tap the right arrow (Redo) to bring a change back.',
          'On a keyboard: Ctrl+Z is undo, Ctrl+Y (or Ctrl+Shift+Z) is redo.',
        ],
        tips: ['A slider drag counts as one step, so one undo takes back the whole drag.'],
      },
      hi: {
        title: 'वापस लें और फिर से करें (Undo / Redo)',
        what: 'कोई भी बदलाव वापस लें, या उसे फिर से ले आएँ।',
        where: 'एडिटर → ऊपर मुड़े हुए तीर (Ctrl+Z / Ctrl+Y)',
        steps: [
          'आख़िरी बदलाव वापस लेने के लिए बायाँ मुड़ा तीर ("वापस") दबाएँ। और पीछे जाने के लिए फिर दबाएँ।',
          'बदलाव वापस लाने के लिए दायाँ तीर ("फिर से") दबाएँ।',
          'कीबोर्ड पर: Ctrl+Z वापस, Ctrl+Y (या Ctrl+Shift+Z) फिर से।',
        ],
        tips: ['स्लाइडर को एक बार खींचना एक ही स्टेप गिना जाता है, इसलिए एक "वापस" पूरा खिंचाव वापस ले लेता है।'],
      },
    },
    {
      id: 'language',
      find: { selector: '[data-help="language"]', needs: 'home' },
      keywords: ['hindi', 'english', 'language', 'bhasha'],
      en: {
        title: 'Switch the app to Hindi or English',
        what: 'The whole app, including this guide, works in English and Hindi.',
        where: 'Home → the हिंदी / English button at the top',
        steps: [
          'On the Home screen tap हिंदी to switch the app to Hindi, or English to switch back.',
          'This guide has its own English / हिंदी switch at the top, so you can read it in either language whatever the app uses.',
        ],
      },
      hi: {
        title: 'ऐप को हिंदी या अंग्रेज़ी में करें',
        what: 'पूरा ऐप, यह गाइड भी, अंग्रेज़ी और हिंदी दोनों में चलता है।',
        where: 'होम → ऊपर हिंदी / English बटन',
        steps: [
          'होम स्क्रीन पर "हिंदी" दबाएँ, ऐप हिंदी में हो जाएगा। वापस जाने के लिए "English" दबाएँ।',
          'इस गाइड में ऊपर अपना अलग English / हिंदी बटन है, ताकि ऐप किसी भी भाषा में हो, गाइड आप अपनी भाषा में पढ़ सकें।',
        ],
      },
    },
    {
      id: 'offline',
      find: { selector: '[data-help="offline"]', needs: 'home' },
      keywords: ['offline', 'internet', 'download', 'model', 'net'],
      en: {
        title: 'Offline & online: what needs internet',
        what: 'Editing, effects, text, music, recording and export always work offline. AI tools need a one-time download.',
        where: 'Home → Offline & online',
        steps: [
          'Open Offline & online on the Home screen. Everything marked ✓ works without internet.',
          'Tap Get offline pack to download the video engine once, so export also works with no internet.',
          'Under AI captions, download a model (Fast, Balanced, Accurate or Best). After that, captions work offline.',
          'Download AI voices and offline translation language pairs here too, if you need them.',
          'Delete a model here to free space.',
        ],
        tips: [
          'Bigger caption models are more accurate but slower. For Hindi and Hinglish choose Accurate, or Best on a computer.',
          'Upload to YouTube, Article to video from a link and voice cloning always need internet.',
        ],
      },
      hi: {
        title: 'ऑफ़लाइन और ऑनलाइन: किसमें इंटरनेट चाहिए',
        what: 'एडिटिंग, इफ़ेक्ट, टेक्स्ट, म्यूज़िक, रिकॉर्डिंग और एक्सपोर्ट हमेशा बिना इंटरनेट चलते हैं। AI टूल के लिए एक बार डाउनलोड करना होता है।',
        where: 'होम → ऑफ़लाइन और ऑनलाइन',
        steps: [
          'होम स्क्रीन पर "ऑफ़लाइन और ऑनलाइन" खोलें। जिस पर ✓ है, वो बिना इंटरनेट चलता है।',
          '"ऑफ़लाइन पैक लें" दबाकर वीडियो इंजन एक बार डाउनलोड करें, ताकि एक्सपोर्ट भी बिना इंटरनेट हो सके।',
          '"AI कैप्शन" में एक मॉडल डाउनलोड करें (Fast, Balanced, Accurate या Best)। उसके बाद कैप्शन बिना इंटरनेट बनेंगे।',
          'ज़रूरत हो तो AI आवाज़ें और ऑफ़लाइन अनुवाद की भाषा-जोड़ी भी यहीं से डाउनलोड करें।',
          'जगह खाली करनी हो तो यहीं से मॉडल हटाएँ।',
        ],
        tips: [
          'बड़े कैप्शन मॉडल ज़्यादा सही लिखते हैं पर धीमे हैं। हिंदी और हिंग्लिश के लिए Accurate चुनें, कंप्यूटर पर Best।',
          'YouTube पर अपलोड, लिंक से आर्टिकल वीडियो और वॉइस क्लोनिंग में हमेशा इंटरनेट चाहिए।',
        ],
      },
    },
    {
      id: 'relink',
      find: { selector: '[data-help="missing"]', needs: 'project' },
      keywords: ['missing', 'relink', 'lost', 'gayab', 'file not found'],
      en: {
        title: 'Missing files: find them again',
        what: 'If the phone or browser cleared its storage, a yellow bar says files are missing. Pick the same files again and every edit comes back.',
        where: 'Editor → yellow "files are missing" bar → Find files',
        steps: [
          'Tap Find files on the yellow bar. The list shows each missing file with its name and length.',
          'Tap Find file next to one and pick that same file from your phone or computer.',
          'Have many? Tap Find many files at once and pick them all; they are matched by name.',
          'The file goes back everywhere it was used, with all your cuts, effects and text.',
        ],
        tips: ['If the picked file is shorter than the project needs, you are told how much is missing.'],
      },
      hi: {
        title: 'गायब फ़ाइलें: फिर से जोड़ें',
        what: 'अगर फ़ोन या ब्राउज़र ने स्टोरेज साफ़ कर दिया, तो पीली पट्टी बताती है कि फ़ाइलें गायब हैं। वही फ़ाइलें फिर चुनें, सारी एडिटिंग लौट आएगी।',
        where: 'एडिटर → पीली "फ़ाइलें गायब हैं" पट्टी → फ़ाइलें ढूँढें',
        steps: [
          'पीली पट्टी पर "फ़ाइलें ढूँढें" दबाएँ। सूची में हर गायब फ़ाइल का नाम और लंबाई दिखेगी।',
          'किसी के आगे "फ़ाइल चुनें" दबाएँ और फ़ोन या कंप्यूटर से वही फ़ाइल चुनें।',
          'बहुत सारी हैं? "एक साथ कई फ़ाइलें चुनें" दबाकर सब चुन लें; नाम से मिलान अपने आप होगा।',
          'फ़ाइल हर उस जगह वापस आ जाएगी जहाँ लगी थी, आपके कट, इफ़ेक्ट और टेक्स्ट के साथ।',
        ],
        tips: ['अगर चुनी गई फ़ाइल प्रोजेक्ट की ज़रूरत से छोटी है, तो बताया जाएगा कि कितना हिस्सा कम है।'],
      },
    },
    {
      id: 'testing-notes',
      find: { selector: '[data-help="notes"]' },
      keywords: ['notes', 'feedback', 'bug', 'report'],
      en: {
        title: 'Testing notes',
        what: 'Write down a bug or an idea while you test, then copy all notes in one go to send them.',
        where: 'Home → Notes, or the note button at the top of the editor',
        steps: [
          'Tap Notes (Home) or the note icon (editor). The editor fills in where you were, for example the open tool.',
          'Type what went wrong or what you want, and save it.',
          'Mark a note done when it is fixed.',
          'Use Copy all (or save as .json) to send every note at once.',
        ],
      },
      hi: {
        title: 'टेस्टिंग नोट्स',
        what: 'टेस्ट करते समय कोई गड़बड़ी या आइडिया लिख लें, फिर सारे नोट्स एक साथ कॉपी करके भेजें।',
        where: 'होम → नोट्स, या एडिटर में ऊपर नोट वाला बटन',
        steps: [
          '"नोट्स" (होम) या नोट का निशान (एडिटर) दबाएँ। एडिटर अपने आप लिख देता है कि आप कहाँ थे, जैसे कौन सा टूल खुला था।',
          'क्या गलत हुआ या क्या चाहिए, लिखें और सेव करें।',
          'ठीक हो जाने पर नोट को "हो गया" कर दें।',
          'सारे नोट एक साथ भेजने के लिए "सब कॉपी करें" (या .json में सेव) इस्तेमाल करें।',
        ],
      },
    },
  ],
}

export default section
