import type { HelpSection } from '../types'

/** Blackbox log, safe export on phones and getting a project back after a crash. */
const section: HelpSection = {
  id: 'safety',
  order: 85,
  icon: 'blackbox',
  title: { en: 'Crashes, blackbox log and safe export', hi: 'क्रैश, ब्लैकबॉक्स लॉग और सुरक्षित एक्सपोर्ट' },
  intro: {
    en: 'What the app does to keep your work safe, and how to send the developer the cause of a problem.',
    hi: 'आपका काम सुरक्षित रखने के लिए ऐप क्या करता है, और किसी समस्या का कारण डेवलपर को कैसे भेजें।',
  },
  topics: [
    {
      id: 'blackbox',
      isNew: true,
      find: { selector: '[data-help="blackbox"]', needs: 'home' },
      keywords: ['log', 'crash', 'error', 'black box', 'bug', 'report', 'problem', 'galti', 'band ho gaya', 'samasya'],
      related: ['safe-export', 'recover-project'],
      en: {
        title: 'Blackbox log (problem recorder)',
        what: 'Like the black box of an aeroplane, the app quietly records the last few hundred things that happened: buttons you tapped, screens you opened, every export step and every error with its technical details. If the app shows an error, closes suddenly or an export fails, the cause is already saved, even after a restart.',
        where: 'Home → ✈ Blackbox, or in the editor: Save menu → Blackbox log, or Ctrl+Shift+L on a computer',
        steps: [
          'Open the blackbox from the ✈ button on the Home screen (in the editor: the Save button → Blackbox log; on a computer press Ctrl+Shift+L anywhere).',
          'The newest lines are at the top. Red lines are errors and crashes. Tap a line with ▸ to see its details.',
          'Tick "Errors only" to hide the taps and see just the problems.',
          'Tap Copy and paste the text in WhatsApp or a chat for the developer. Or tap Share to send it as a .txt file, or Save file to keep a copy (Android: Documents/Apna Editor).',
          'When the problem is fixed, tap Clear so the next report is short.',
        ],
        tips: [
          'When something goes wrong a small red "Problem recorded" note shows for a few seconds at the bottom left. Tap it to open the log.',
          'On Android the log also shows why the phone closed the app last time (for example "LOW_MEMORY", the phone ran out of memory) and any crash inside the app.',
          'The log stays on your device and is never sent anywhere by itself. It holds names of buttons and short messages, never your videos.',
          'About 600 lines are kept; older ones drop off by themselves.',
        ],
      },
      hi: {
        title: 'ब्लैकबॉक्स लॉग (समस्या रिकॉर्डर)',
        what: 'हवाई जहाज़ के ब्लैक बॉक्स की तरह, ऐप चुपचाप पिछली कुछ सौ बातें रिकॉर्ड करता है: आपने कौन से बटन दबाए, कौन सी स्क्रीन खोली, एक्सपोर्ट का हर चरण और हर एरर तकनीकी जानकारी के साथ। अगर ऐप एरर दिखाए, अचानक बंद हो जाए या एक्सपोर्ट फेल हो, तो कारण पहले से सेव रहता है, ऐप दोबारा शुरू होने के बाद भी।',
        where: 'होम → ✈ ब्लैकबॉक्स, या एडिटर में: Save मेन्यू → ब्लैकबॉक्स लॉग, या कंप्यूटर पर Ctrl+Shift+L',
        steps: [
          'होम स्क्रीन पर ✈ बटन से ब्लैकबॉक्स खोलें (एडिटर में: Save बटन → ब्लैकबॉक्स लॉग; कंप्यूटर पर कहीं भी Ctrl+Shift+L दबाएं)।',
          'सबसे नई लाइनें सबसे ऊपर होती हैं। लाल लाइनें एरर और क्रैश हैं। ▸ वाली लाइन पर टैप करके उसकी पूरी जानकारी देखें।',
          'सिर्फ़ समस्याएं देखने के लिए "सिर्फ़ एरर" पर टिक करें।',
          '"कॉपी" दबाकर टेक्स्ट WhatsApp या चैट में डेवलपर को भेजें। या "शेयर" से .txt फ़ाइल भेजें, या "फ़ाइल सेव करें" से कॉपी रखें (Android: Documents/Apna Editor)।',
          'समस्या ठीक होने पर "साफ़ करें" दबाएं, ताकि अगली रिपोर्ट छोटी रहे।',
        ],
        tips: [
          'कुछ गड़बड़ होने पर नीचे बाईं ओर कुछ सेकंड के लिए छोटा लाल "समस्या रिकॉर्ड हुई" नोट दिखता है। लॉग खोलने के लिए उस पर टैप करें।',
          'Android पर लॉग यह भी बताता है कि पिछली बार फ़ोन ने ऐप क्यों बंद किया (जैसे "LOW_MEMORY", यानी फ़ोन की मेमोरी खत्म हो गई) और ऐप के अंदर का कोई क्रैश।',
          'लॉग आपके डिवाइस पर ही रहता है और अपने आप कहीं नहीं भेजा जाता। इसमें बटनों के नाम और छोटे संदेश होते हैं, आपकी वीडियो कभी नहीं।',
          'लगभग 600 लाइनें रखी जाती हैं; पुरानी लाइनें अपने आप हट जाती हैं।',
        ],
      },
    },
    {
      id: 'safe-export',
      isNew: true,
      find: { selector: '[data-help="export"]', needs: 'project' },
      keywords: ['export crash', 'app band', 'memory', 'out of memory', 'phone', 'safer', 'surakshit', 'storage'],
      related: ['blackbox', 'recover-project'],
      en: {
        title: 'Safe export on phones',
        what: 'Before an export starts, the app compares the phone\'s memory and free storage with the size of the video, and helps you pick settings that will not make the app close.',
        where: 'Editor → Export',
        steps: [
          'Open Export and choose your settings as usual.',
          'If an orange or red note appears ("This export is heavy for this device" or "This export may make the app close"), read the reasons under it.',
          'Tap "Use safer settings" to switch to a lighter resolution, the Small file size and 30 fps. You can also ignore the note and export as you chose.',
          'If an export fails, the app tries again by itself: first with lighter settings, then a last time the most careful way (720p, no hardware video decoder, "careful mode"). It tells you it did ("safer settings" next to the result).',
          'If the phone\'s video encoder fails or stops responding, the app switches to the next encoder by itself; if a video cannot be read fast, it is read the slow, safe way.',
          'If the app closed in the middle of an export, the next time you open Export the safer settings are already picked, with a red note naming the settings that failed.',
        ],
        tips: [
          'Saving and sharing a big video on Android now writes it in small pieces, so large files no longer make the app close at the Save step.',
          'MP4 and MOV files are now put together by the app itself, not by ffmpeg, so the "Finishing…" step at the end needs very little memory, even for long videos. Long sound (over 2.5 minutes) is mixed piece by piece on phones.',
          'Close other apps before a long export and keep the phone charging.',
          'For long videos on a phone, 720p or 1080p with "Small file" is the safest choice. 4K works best on a computer.',
          'Your project is saved the moment you tap Export, so nothing is lost even if the export fails.',
        ],
      },
      hi: {
        title: 'फ़ोन पर सुरक्षित एक्सपोर्ट',
        what: 'एक्सपोर्ट शुरू होने से पहले ऐप फ़ोन की मेमोरी और खाली स्टोरेज को वीडियो के साइज़ से मिलाता है, और ऐसी सेटिंग चुनने में मदद करता है जिससे ऐप बंद न हो।',
        where: 'एडिटर → एक्सपोर्ट',
        steps: [
          'एक्सपोर्ट खोलें और हमेशा की तरह सेटिंग चुनें।',
          'अगर नारंगी या लाल नोट दिखे ("यह एक्सपोर्ट इस डिवाइस के लिए भारी है" या "इस एक्सपोर्ट से ऐप बंद हो सकता है"), तो उसके नीचे लिखे कारण पढ़ें।',
          '"सुरक्षित सेटिंग लें" दबाकर कम रेज़ोल्यूशन, Small file और 30 fps चुनें। आप चाहें तो नोट को छोड़कर अपनी सेटिंग से भी एक्सपोर्ट कर सकते हैं।',
          'अगर एक्सपोर्ट फेल हो जाए, तो ऐप अपने आप फिर कोशिश करता है: पहले हल्की सेटिंग से, फिर आख़िरी बार सबसे सावधान तरीके से (720p, बिना हार्डवेयर वीडियो डिकोडर, "सावधान मोड")। नतीजे के पास "सुरक्षित सेटिंग" लिखा होता है।',
          'अगर फ़ोन का वीडियो एनकोडर फेल हो या रुक जाए, तो ऐप अपने आप अगला एनकोडर लेता है; अगर कोई वीडियो तेज़ी से नहीं पढ़ी जा सके, तो उसे धीमे पर सुरक्षित तरीके से पढ़ा जाता है।',
          'अगर एक्सपोर्ट के बीच ऐप बंद हो गया था, तो अगली बार एक्सपोर्ट खोलने पर सुरक्षित सेटिंग पहले से चुनी होती है, और लाल नोट में फेल हुई सेटिंग लिखी होती है।',
        ],
        tips: [
          'Android पर बड़ी वीडियो सेव और शेयर करते समय अब उसे छोटे हिस्सों में लिखा जाता है, इसलिए बड़ी फ़ाइल पर Save के समय ऐप बंद नहीं होता।',
          'MP4 और MOV फ़ाइल अब ऐप ख़ुद जोड़ता है, ffmpeg नहीं, इसलिए आख़िर का "Finishing…" कदम लंबी वीडियो पर भी बहुत कम मेमोरी लेता है। फ़ोन पर लंबी आवाज़ (2.5 मिनट से ज़्यादा) हिस्सों में मिक्स होती है।',
          'लंबे एक्सपोर्ट से पहले दूसरे ऐप बंद करें और फ़ोन चार्जिंग पर रखें।',
          'फ़ोन पर लंबी वीडियो के लिए 720p या 1080p के साथ "Small file" सबसे सुरक्षित है। 4K कंप्यूटर पर सबसे अच्छा चलता है।',
          'एक्सपोर्ट दबाते ही प्रोजेक्ट सेव हो जाता है, इसलिए एक्सपोर्ट फेल होने पर भी कुछ नहीं खोता।',
        ],
      },
    },
    {
      id: 'recover-project',
      isNew: true,
      find: { selector: '[data-help="recover"]', needs: 'home' },
      keywords: ['autosave', 'recover', 'restore', 'lost', 'crash', 'wapas', 'project kho gaya'],
      related: ['blackbox', 'safe-export'],
      en: {
        title: 'Autosave and getting your project back',
        what: 'Every change is saved on the device within a second, and again the moment you switch to another app or start an export. If the app closes while a project is open, the Home screen offers to open it again.',
        where: 'Home → "Continue where you left off"',
        steps: [
          'Open the app again after a crash (or after the phone closed it).',
          'On the Home screen a blue card shows "Continue where you left off" with the project name.',
          'Tap Open to go straight back to your project, or Dismiss to hide the card.',
        ],
        tips: [
          'You do not need to press Save to keep your work; Save → Save as .avp file is only for a backup file.',
          'The card also shows when you closed the app from recent apps while editing; that is normal.',
        ],
      },
      hi: {
        title: 'ऑटोसेव और प्रोजेक्ट वापस पाना',
        what: 'हर बदलाव एक सेकंड के अंदर डिवाइस पर सेव हो जाता है, और दूसरे ऐप पर जाते ही या एक्सपोर्ट शुरू करते ही फिर सेव होता है। अगर प्रोजेक्ट खुला हो और ऐप बंद हो जाए, तो होम स्क्रीन उसे फिर खोलने का विकल्प देती है।',
        where: 'होम → "जहाँ छोड़ा था वहीं से शुरू करें"',
        steps: [
          'क्रैश के बाद (या फ़ोन के ऐप बंद करने के बाद) ऐप फिर से खोलें।',
          'होम स्क्रीन पर प्रोजेक्ट के नाम के साथ नीला कार्ड "जहाँ छोड़ा था वहीं से शुरू करें" दिखेगा।',
          'सीधे अपने प्रोजेक्ट पर जाने के लिए "Open" दबाएं, या कार्ड छुपाने के लिए "हटाएं"।',
        ],
        tips: [
          'काम बचाने के लिए Save दबाना ज़रूरी नहीं; Save → .avp फ़ाइल सिर्फ़ बैकअप फ़ाइल के लिए है।',
          'अगर एडिट करते समय आपने रीसेंट ऐप्स से ऐप बंद किया, तब भी यह कार्ड दिखता है; यह सामान्य है।',
        ],
      },
    },
    {
      id: 'big-photos',
      isNew: true,
      keywords: ['50 mp', '108 mp', 'big photo', 'photo slideshow', 'crash', 'memory', 'heavy photo', 'badi photo'],
      en: {
        title: 'Very big photos are made lighter',
        what: 'Photos from 50 MP or 108 MP cameras are made 4096 pixels on the long side when you add them (3072 on phones with 4 GB RAM or less). That is still sharper than the video needs, and it keeps photo slideshows from running out of memory on a phone. While you edit, photos that are not on screen for a while also let go of their memory.',
        steps: [
          'Add photos as usual. Nothing to switch on.',
          'Your original photo in the gallery is not changed; only the copy inside the project is lighter.',
        ],
        tips: ['GIFs and SVG logos are kept as they are.'],
      },
      hi: {
        title: 'बहुत बड़ी फ़ोटो हल्की की जाती हैं',
        what: '50 MP या 108 MP कैमरे की फ़ोटो जोड़ते समय लंबी तरफ़ से 4096 पिक्सेल की कर दी जाती हैं (4 GB या कम RAM वाले फ़ोन पर 3072)। यह वीडियो की ज़रूरत से भी ज़्यादा साफ़ है, और इससे फ़ोन पर फ़ोटो स्लाइडशो में मेमोरी ख़त्म नहीं होती। एडिट करते समय जो फ़ोटो कुछ देर स्क्रीन पर नहीं है, उसकी मेमोरी भी खाली कर दी जाती है।',
        steps: [
          'फ़ोटो पहले की तरह जोड़ें। कुछ चालू नहीं करना है।',
          'गैलरी में आपकी असली फ़ोटो नहीं बदलती; सिर्फ़ प्रोजेक्ट के अंदर वाली कॉपी हल्की होती है।',
        ],
        tips: ['GIF और SVG लोगो जैसे हैं वैसे ही रहते हैं।'],
      },
    },
    {
      id: 'android-limits',
      isNew: true,
      platforms: ['android'],
      keywords: ['android', 'phone', 'keyboard', 'webview', 'storage full', 'memory', 'long video', 'remove noise', 'blank screen', 'safed screen', 'jagah', 'keyboard chhup'],
      related: ['recover-project', 'safe-export', 'big-photos'],
      en: {
        title: 'Android phones: keyboard, long videos, full storage',
        what: 'The Android app is tuned so it does not close or lose work on smaller phones. Here is what it does by itself and what a message means.',
        steps: [
          'Typing: on Android 15 and newer the screen moves up above the keyboard, so the text box you type in stays visible.',
          'Long videos: the sound picture (waveform) of a long or very big video is read a little at a time, so adding a 30 minute recording no longer runs out of memory.',
          'Remove noise and Audio effects work on up to 10 minutes of sound at a time on a phone (5 minutes on phones with 4 GB RAM or less; 60 minutes on a computer). For a longer clip you see a message: split the clip into parts first (Split), then switch it on for each part.',
          'Phone storage full: if a photo, video or the project could not be saved because the phone is full, you now see "Phone storage is full". Delete old projects (Home) or free space on the phone, then try again. Before, the app could say it saved when it had not.',
          'Going to the Home screen or getting a call stops the preview, so its sound does not keep playing in the background. Your project is saved at that moment too.',
          'A blank white screen on old phones: if Android System WebView is too old (before version 111), the app now shows how to update it instead of a blank screen. Update "Android System WebView" and "Chrome" from the Play Store.',
        ],
        tips: [
          'If the app ever closes, open it again: Home offers "Continue where you left off", and the Blackbox log shows why.',
          'A test build from GitHub cannot be installed over an older test build (Android says "App not installed"). Uninstall the old one first; this deletes projects kept inside the app, so save important ones as a project file (.avp) before.',
        ],
      },
      hi: {
        title: 'Android फ़ोन: कीबोर्ड, लंबी वीडियो, भरी स्टोरेज',
        what: 'Android ऐप को ऐसा बनाया गया है कि छोटे फ़ोन पर भी बंद न हो और काम न खोए। यहाँ लिखा है कि ऐप ख़ुद क्या करता है और किसी मैसेज का क्या मतलब है।',
        steps: [
          'टाइप करना: Android 15 और नए फ़ोन पर स्क्रीन कीबोर्ड के ऊपर खिसक जाती है, ताकि जिस बॉक्स में आप लिख रहे हैं वह दिखता रहे।',
          'लंबी वीडियो: लंबी या बहुत बड़ी वीडियो की आवाज़ की तस्वीर (वेवफ़ॉर्म) थोड़ा-थोड़ा करके पढ़ी जाती है, इसलिए 30 मिनट की रिकॉर्डिंग जोड़ने पर अब मेमोरी ख़त्म नहीं होती।',
          '"शोर हटाएँ" और "ऑडियो इफ़ेक्ट" फ़ोन पर एक बार में 10 मिनट तक की आवाज़ पर चलते हैं (4 GB या कम RAM वाले फ़ोन पर 5 मिनट; कंप्यूटर पर 60 मिनट)। इससे लंबी क्लिप पर मैसेज दिखेगा: पहले क्लिप को हिस्सों में काटें ("स्प्लिट"), फिर हर हिस्से के लिए इसे चालू करें।',
          'फ़ोन की स्टोरेज भरी: अगर फ़ोन भरा होने से फ़ोटो, वीडियो या प्रोजेक्ट सेव नहीं हुआ, तो अब "फ़ोन की स्टोरेज भर गई है" दिखेगा। पुराने प्रोजेक्ट हटाएँ (होम) या फ़ोन में जगह खाली करें, फिर दोबारा कोशिश करें। पहले ऐप सेव न होने पर भी सेव हुआ बता सकता था।',
          'होम स्क्रीन पर जाने या कॉल आने पर प्रीव्यू रुक जाता है, ताकि उसकी आवाज़ पीछे चलती न रहे। उसी समय आपका प्रोजेक्ट भी सेव हो जाता है।',
          'पुराने फ़ोन पर सफ़ेद/ख़ाली स्क्रीन: अगर "Android System WebView" बहुत पुराना है (वर्ज़न 111 से पहले), तो अब ख़ाली स्क्रीन की जगह उसे अपडेट करने का तरीका दिखता है। Play Store से "Android System WebView" और "Chrome" अपडेट करें।',
        ],
        tips: [
          'अगर ऐप कभी बंद हो जाए तो फिर से खोलें: होम पर "जहाँ छोड़ा था वहीं से जारी रखें" मिलेगा, और ब्लैकबॉक्स लॉग में कारण दिखेगा।',
          'GitHub की टेस्ट बिल्ड पुरानी टेस्ट बिल्ड के ऊपर इंस्टॉल नहीं होती (Android "App not installed" बताता है)। पहले पुरानी अनइंस्टॉल करें; इससे ऐप के अंदर के प्रोजेक्ट मिट जाते हैं, इसलिए ज़रूरी प्रोजेक्ट पहले प्रोजेक्ट फ़ाइल (.avp) के रूप में सेव कर लें।',
        ],
      },
    },
  ],
}

export default section
