import type { HelpSection } from '../types'

/** User guide: AI chat (edit by typing), prompt enhancer, missing features, online AI with your own key. */
const section: HelpSection = {
  id: 'ai-chat',
  order: 93,
  icon: 'ai',
  title: { en: 'AI chat: edit by typing', hi: 'AI चैट: लिखकर एडिट करें' },
  intro: {
    en: 'Tell the editor what you want in Hindi, Hinglish or English. It shows a plan, you tap Apply, and one Undo takes it all back.',
    hi: 'एडिटर को हिंदी, हिंग्लिश या इंग्लिश में बताइए क्या चाहिए। यह प्लान दिखाता है, आप "लागू करें" दबाते हैं, और एक Undo से सब वापस।',
  },
  topics: [
    {
      id: 'ai-chat',
      isNew: true,
      find: { tool: 'AI chat', needs: 'project' },
      keywords: ['ai chat', 'chat', 'chatbot', 'agent', 'type to edit', 'likh kar edit', 'baat karke', 'command', 'gemma', 'ollama', 'assistant'],
      related: ['ai-chat-enhance', 'ai-chat-missing', 'ai-chat-online', 'local-ai-setup'],
      en: {
        title: 'AI chat: edit by typing what you want',
        what: 'Type an edit like "saare clips pe warm filter lagao aur 9:16 bana do". Everyday requests are understood instantly, even offline and without any AI. Longer or unusual requests go to Local AI (free, on your computer) or, with Pro, an online AI.',
        where: 'Toolbar → AI chat (it is there whatever is selected)',
        steps: [
          'Open a project and tap AI chat in the toolbar.',
          'Type what you want, or tap one of the example chips. Press Enter or Send.',
          'Read the plan: each change is listed. ⚡ means understood without AI, 🤖 means the AI wrote it.',
          'Tap Apply. Everything happens in one go.',
          'Not happy? Tap Undo once (or "Put back" in the chat) and everything returns to how it was.',
        ],
        tips: [
          'It can: filters, effects, brightness/contrast/colour, transitions, speed, volume and mute, music volume, fades, rotate/flip, fit/fill, video shape (9:16, 16:9, 1:1…), background, add and style text and subtitles (karaoke), stickers, cut at a time, remove a stretch (10 to 15 seconds), trim, delete/copy/move clips, camera moves, photo pan & zoom, markers.',
          'Jobs that need listening or your files (subtitles from speech, noise removal, background removal, adding music, AI Dub…) open the right tool for you to finish.',
          '"Ye clip", "is clip ko", "yahan" mean the selected clip and the playhead.',
          'A plan runs all-or-nothing: if one step can’t be done, nothing changes and the chat says why. "Do the parts that work" applies the rest.',
          'Locked tracks are never changed, and the chat never deletes the whole video.',
          'Without Local AI, only the everyday requests work. Set it up in Home → Local AI (Windows can install it for you).',
        ],
      },
      hi: {
        title: 'AI चैट: जो चाहिए वो लिखकर एडिट करें',
        what: 'लिखिए जैसे "सारी क्लिप पर warm फ़िल्टर लगाओ और 9:16 बना दो"। रोज़ के निर्देश तुरंत समझ आते हैं, बिना इंटरनेट और बिना AI के भी। लंबे या अलग निर्देश लोकल AI (मुफ़्त, आपके कंप्यूटर पर) या प्रो में ऑनलाइन AI समझता है।',
        where: 'टूलबार → AI चैट (कुछ भी चुना हो, यह दिखता है)',
        steps: [
          'प्रोजेक्ट खोलें और टूलबार में "AI चैट" दबाएँ।',
          'जो चाहिए वह लिखें या कोई उदाहरण दबाएँ। Enter या "भेजें" दबाएँ।',
          'प्लान पढ़ें: हर बदलाव लिखा होता है। ⚡ मतलब बिना AI के समझा, 🤖 मतलब AI ने लिखा।',
          '"लागू करें" दबाएँ। सब एक साथ हो जाता है।',
          'पसंद नहीं आया? एक बार Undo दबाएँ (या चैट में "पहले जैसा करें") और सब पहले जैसा।',
        ],
        tips: [
          'यह कर सकता है: फ़िल्टर, इफ़ेक्ट, ब्राइटनेस/कॉन्ट्रास्ट/रंग, ट्रांज़िशन, रफ़्तार, आवाज़ और म्यूट, गाने की आवाज़, फ़ेड, घुमाना/उल्टा, फ़िट/फ़िल, वीडियो का आकार (9:16, 16:9, 1:1…), बैकग्राउंड, टेक्स्ट और सबटाइटल जोड़ना व स्टाइल (कराओके), स्टिकर, किसी समय पर काटना, बीच का हिस्सा हटाना (10 से 15 सेकंड), ट्रिम, क्लिप हटाना/कॉपी/आगे-पीछे करना, कैमरा मूव, फ़ोटो ज़ूम, मार्कर।',
          'जिन कामों में सुनना या आपकी फ़ाइल चाहिए (आवाज़ से सबटाइटल, शोर हटाना, बैकग्राउंड हटाना, गाना जोड़ना, AI डब…) उनका टूल खुल जाता है, आप पूरा करें।',
          '"ये क्लिप", "इस क्लिप को", "यहाँ" का मतलब चुनी हुई क्लिप और प्लेहेड।',
          'प्लान पूरा या कुछ नहीं: एक भी कदम न हो पाए तो कुछ नहीं बदलता और चैट कारण बताता है। "जो हो सकता है वह कर दो" से बाक़ी लग जाता है।',
          'लॉक ट्रैक कभी नहीं बदलते, और चैट पूरी वीडियो कभी नहीं हटाता।',
          'लोकल AI के बिना सिर्फ़ रोज़ के निर्देश चलते हैं। होम → लोकल AI में सेट करें (Windows पर अपने आप इंस्टॉल हो सकता है)।',
        ],
      },
    },
    {
      id: 'ai-chat-enhance',
      isNew: true,
      find: { selector: '[data-testid="agent-enhance"]', needs: 'project' },
      keywords: ['prompt', 'enhance', 'saaf karo', 'clear', 'better prompt', 'sudhaaro', '✨'],
      related: ['ai-chat'],
      en: {
        title: '✨ Make my request clearer (prompt enhancer)',
        what: 'Turns a rough request into an exact one (which clips, how many seconds, where, how strong), so the edit comes out right the first time.',
        where: 'AI chat → type → ✨',
        steps: [
          'Type your request the way it comes to mind, e.g. "thoda acha sa bana do".',
          'Tap ✨. The box now holds a clear version, with what was guessed listed under it.',
          'Change anything you want, then tap Send.',
        ],
        tips: [
          'Everyday requests are made clear without AI, instantly. Others use your AI.',
          'If something can’t be guessed, a question is shown under the box.',
        ],
      },
      hi: {
        title: '✨ मेरा निर्देश साफ़ करो (प्रॉम्प्ट सुधार)',
        what: 'कच्चे निर्देश को सटीक बना देता है (कौन सी क्लिप, कितने सेकंड, कहाँ, कितना तेज़), ताकि एडिट पहली बार में सही बने।',
        where: 'AI चैट → लिखें → ✨',
        steps: [
          'जैसा मन में आए वैसा लिखें, जैसे "थोड़ा अच्छा सा बना दो"।',
          '✨ दबाएँ। बॉक्स में साफ़ निर्देश आ जाएगा, और नीचे लिखा होगा कि क्या अंदाज़ा लगाया।',
          'जो बदलना हो बदलें, फिर "भेजें" दबाएँ।',
        ],
        tips: [
          'रोज़ के निर्देश बिना AI के तुरंत साफ़ होते हैं। बाक़ी आपका AI करता है।',
          'जो अंदाज़ा न लग सके, उसका सवाल बॉक्स के नीचे दिखता है।',
        ],
      },
    },
    {
      id: 'ai-chat-missing',
      isNew: true,
      keywords: ['missing feature', 'not possible', 'feature request', 'nahi hai', 'naya feature', 'copy for claude'],
      related: ['ai-chat'],
      en: {
        title: 'When a feature is missing',
        what: 'If your request needs something the editor can’t do yet, the chat says so and lists every missing feature, instead of doing something wrong. The parts it can do are still offered.',
        steps: [
          'Read the orange list "These features are not in the editor yet".',
          'Tap "Copy for Claude" and paste it in the project chat to get them built, or "Save to Testing notes".',
          'Apply the parts that can be done now, if you like.',
          'After an app update with the new features, open AI chat in that project: "Finish it now" completes the rest.',
        ],
      },
      hi: {
        title: 'जब कोई फ़ीचर न हो',
        what: 'अगर आपके निर्देश के लिए ऐसा कुछ चाहिए जो एडिटर अभी नहीं कर सकता, तो चैट ग़लत काम करने के बजाय साफ़ बताता है और सारे ज़रूरी फ़ीचर की सूची देता है। जो हिस्सा हो सकता है, वह फिर भी मिलता है।',
        steps: [
          'नारंगी सूची "ये फ़ीचर अभी एडिटर में नहीं हैं" पढ़ें।',
          '"Claude के लिए कॉपी करें" दबाकर प्रोजेक्ट चैट में पेस्ट करें ताकि वे बन सकें, या "टेस्टिंग नोट्स में सेव करें"।',
          'चाहें तो जो अभी हो सकता है वह लागू करें।',
          'नए फ़ीचर वाला अपडेट आने के बाद उसी प्रोजेक्ट में AI चैट खोलें: "अब पूरा करें" से बाक़ी काम हो जाएगा।',
        ],
      },
    },
    {
      id: 'ai-chat-online',
      isNew: true,
      pro: true,
      find: { selector: '[data-testid="agent-settings"]', needs: 'project' },
      keywords: ['claude', 'gemini', 'chatgpt', 'openai', 'deepseek', 'grok', 'openrouter', 'api key', 'online ai', 'cloud ai'],
      related: ['ai-chat', 'local-ai-setup'],
      en: {
        title: 'Use your own AI: Claude, Gemini, ChatGPT, DeepSeek, Grok (Pro)',
        what: 'Instead of Local AI, the chat can use an online AI with your own API key. It understands harder requests and works on the phone without the laptop.',
        where: 'AI chat → the AI name at the top (⚙) → AI settings',
        steps: [
          'Open AI chat and tap the AI name with ⚙ at the top.',
          'Pick an AI: Claude, Gemini, ChatGPT, DeepSeek, Grok, OpenRouter, or Other (any OpenAI-compatible address).',
          'Read the privacy note and tap "I understand".',
          'Tap "Where do I get a key?", make a key on that site, copy it and paste it in the API key box.',
          'Tap "Save key & test". When it says Connected, pick a model and start chatting.',
        ],
        tips: [
          'Your key stays only on this device (on Windows it is locked with Windows’ own encryption). It is never put in projects or shared files, and never sent to us.',
          'Sent to the AI company: your request and a short list of clips, times and text. Never your video or photo files.',
          'The company bills your own account. "This month" in AI settings shows how much you used.',
          'No internet or key not working? Switch back to Local AI; everyday requests always work without AI.',
          'Web version: some companies block websites from calling them directly. Use the Windows or Android app, or OpenRouter.',
        ],
      },
      hi: {
        title: 'अपना AI चुनें: Claude, Gemini, ChatGPT, DeepSeek, Grok (प्रो)',
        what: 'लोकल AI की जगह चैट आपकी अपनी API key वाला ऑनलाइन AI इस्तेमाल कर सकता है। यह मुश्किल निर्देश भी समझता है और फ़ोन पर लैपटॉप के बिना चलता है।',
        where: 'AI चैट → ऊपर AI का नाम (⚙) → AI सेटिंग',
        steps: [
          'AI चैट खोलें और ऊपर ⚙ वाला AI का नाम दबाएँ।',
          'AI चुनें: Claude, Gemini, ChatGPT, DeepSeek, Grok, OpenRouter, या "Other" (कोई भी OpenAI जैसा पता)।',
          'प्राइवेसी नोट पढ़ें और "मैं समझ गया" दबाएँ।',
          '"key कहाँ मिलेगी?" दबाएँ, उस साइट पर key बनाएँ, कॉपी करें और API key बॉक्स में पेस्ट करें।',
          '"key सेव करें और जाँचें" दबाएँ। "Connected" दिखे तो मॉडल चुनें और चैट शुरू करें।',
        ],
        tips: [
          'आपकी key सिर्फ़ इसी डिवाइस पर रहती है (Windows पर Windows के अपने ताले से बंद)। यह प्रोजेक्ट या शेयर फ़ाइल में नहीं जाती और हमें कभी नहीं भेजी जाती।',
          'AI कंपनी को जाता है: आपका निर्देश और क्लिप, समय व टेक्स्ट की छोटी सूची। आपकी वीडियो या फ़ोटो फ़ाइल कभी नहीं।',
          'पैसा आपके अपने खाते से कटता है। AI सेटिंग में "इस महीने" बताता है कितना इस्तेमाल हुआ।',
          'इंटरनेट नहीं या key नहीं चल रही? लोकल AI पर वापस जाएँ; रोज़ के निर्देश बिना AI के हमेशा चलते हैं।',
          'वेब वर्ज़न: कुछ कंपनियाँ वेबसाइट से सीधे कॉल रोकती हैं। Windows या Android ऐप या OpenRouter इस्तेमाल करें।',
        ],
      },
    },
  ],
}

export default section
