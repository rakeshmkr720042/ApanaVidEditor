/**
 * User guide: AI captions from speech (Auto captions and Audio to video), the speech quality
 * models, and what happens when a model cannot run. Default-exports a HelpSection (see
 * ../types.ts in the User guide); it is written without importing that type so this file also
 * builds before the guide itself is in the app.
 */
const section = {
  id: 'captions-ai',
  order: 55,
  icon: 'ai' as const,
  title: { en: 'AI captions from speech', hi: 'बोली से AI कैप्शन' },
  intro: {
    en: 'Turn what is said in a video or an audio file into captions, on your own device.',
    hi: 'वीडियो या ऑडियो में जो बोला गया है, उसे अपने ही डिवाइस पर कैप्शन में बदलें।',
  },
  topics: [
    {
      id: 'auto-captions',
      isNew: true,
      find: { tool: 'AI Dub', needs: 'nothing' as const },
      keywords: ['subtitle', 'caption', 'speech to text', 'whisper', 'kaise likhe', 'awaaz se text', 'auto caption', 'ऑटो कैप्शन'],
      related: ['caption-quality', 'captions-not-working'],
      en: {
        title: 'Make captions from the speech in your video',
        what: 'The app listens to your video and writes the words as captions with their timing. It runs on your device, so it works offline once the model is on the device.',
        where: 'Editor → toolbar → AI Dub → Auto captions',
        steps: [
          'Open your project and tap AI Dub in the toolbar. The Auto captions tab opens.',
          'Pick the language spoken in the video, or leave Detect automatically.',
          'Pick a Quality: Fast, Balanced, Accurate or Best. A ✓ means that model is already on this device.',
          'Tap Generate captions. First you see "Opening the AI model…" while the model starts, then "Listening to the video…" with the percentage and about how many minutes are left.',
          'When it is done the captions are on the timeline. Fix any word in Subtitles, or select a caption and tap Listen again.',
        ],
        tips: [
          'Bigger qualities are more accurate but slower. On a usual computer Balanced finishes in less time than the video lasts, Accurate takes about as long as the video, and Best several times longer. Fast is the quickest.',
          'If the chosen quality cannot run on this device (not enough memory, damaged files, or not downloaded and no internet), the app makes the captions with the next smaller quality that is on the device and tells you which one it used.',
          'If captions fail, the message ends with "Details:" and the exact reason. Send a screenshot of it to get help.',
        ],
      },
      hi: {
        title: 'वीडियो की बोली से कैप्शन बनाएँ',
        what: 'ऐप आपकी वीडियो को सुनकर बोले गए शब्दों को समय के साथ कैप्शन में लिख देता है। यह आपके डिवाइस पर ही चलता है, इसलिए मॉडल डिवाइस पर आने के बाद बिना इंटरनेट भी काम करता है।',
        where: 'एडिटर → टूलबार → AI Dub → Auto captions',
        steps: [
          'प्रोजेक्ट खोलें और टूलबार में AI Dub दबाएँ। Auto captions टैब खुलेगा।',
          'वीडियो में बोली गई भाषा चुनें, या "अपने आप पहचानें" रहने दें।',
          'क्वालिटी चुनें: Fast, Balanced, Accurate या Best। ✓ का मतलब है वह मॉडल इस डिवाइस पर पहले से है।',
          '"कैप्शन बनाएँ" दबाएँ। पहले "AI मॉडल खुल रहा है…" दिखेगा, फिर "वीडियो सुन रहे हैं…" के साथ प्रतिशत और लगभग कितने मिनट बाकी हैं।',
          'पूरा होने पर कैप्शन टाइमलाइन पर आ जाएँगे। कोई शब्द गलत हो तो Subtitles में ठीक करें, या कैप्शन चुनकर Listen again दबाएँ।',
        ],
        tips: [
          'बड़ी क्वालिटी ज़्यादा सही लिखती है पर धीमी है। आम कंप्यूटर पर Balanced वीडियो की लंबाई से कम समय में पूरा कर देती है, Accurate लगभग वीडियो जितना समय लेती है, और Best कई गुना ज़्यादा। Fast सबसे जल्दी है।',
          'अगर चुनी हुई क्वालिटी इस डिवाइस पर नहीं चल पाती (मेमोरी कम, फ़ाइलें खराब, या डाउनलोड नहीं और इंटरनेट नहीं), तो ऐप डिवाइस पर मौजूद अगली छोटी क्वालिटी से कैप्शन बना देता है और बताता है कि कौन सी इस्तेमाल हुई।',
          'कैप्शन न बनें तो मैसेज के आख़िर में "जानकारी:" के बाद असली कारण लिखा होता है। मदद के लिए उसका स्क्रीनशॉट भेजें।',
        ],
      },
    },
    {
      id: 'caption-quality',
      isNew: true,
      find: { selector: '[data-help="offline"]', needs: 'home' as const },
      keywords: ['model', 'download', 'offline', 'balanced', 'accurate', 'best', 'fast', 'quality', 'मॉडल'],
      related: ['auto-captions', 'captions-not-working'],
      en: {
        title: 'Speech quality models: which one to pick',
        what: 'Four speech models: Fast (~75 MB, built into the Windows and Android apps), Balanced (~140 MB), Accurate (~500 MB) and Best (~1 GB, for computers). Each downloads once and then works offline.',
        where: 'Home → Offline & online → AI captions (or pick it in Auto captions and it downloads the first time)',
        steps: [
          'On the Home screen open Offline & online.',
          'Under AI captions tap Download next to the quality you want. The app downloads it and opens it once to check that it works.',
          'In Auto captions or Audio to video, pick the same quality. It shows ✓ when it is on the device.',
        ],
        tips: [
          'For Hindi and Hinglish, Accurate or Best gives much better captions than Fast.',
          'Best needs a lot of memory. On a laptop with 8 GB or less, or on a phone, use Accurate or Balanced.',
          'For long audio (20 minutes or more) start with Balanced: it is much faster, and you can redo single captions with a higher quality using Listen again.',
        ],
      },
      hi: {
        title: 'बोली के मॉडल: कौन सा चुनें',
        what: 'चार मॉडल हैं: Fast (~75 MB, Windows और Android ऐप में पहले से), Balanced (~140 MB), Accurate (~500 MB) और Best (~1 GB, कंप्यूटर के लिए)। हर मॉडल एक बार डाउनलोड होता है, फिर बिना इंटरनेट चलता है।',
        where: 'होम → Offline & online → AI captions (या Auto captions में चुनें, पहली बार अपने आप डाउनलोड होगा)',
        steps: [
          'होम स्क्रीन पर Offline & online खोलें।',
          'AI captions में जो क्वालिटी चाहिए उसके आगे Download दबाएँ। ऐप उसे डाउनलोड करके एक बार खोलकर जाँचता है कि वह चलता है।',
          'Auto captions या Audio to video में वही क्वालिटी चुनें। डिवाइस पर होने पर उस पर ✓ दिखेगा।',
        ],
        tips: [
          'हिंदी और हिंग्लिश के लिए Accurate या Best, Fast से बहुत बेहतर कैप्शन बनाते हैं।',
          'Best को बहुत मेमोरी चाहिए। 8 GB या कम वाले लैपटॉप पर, या फ़ोन पर, Accurate या Balanced इस्तेमाल करें।',
          'लंबे ऑडियो (20 मिनट या ज़्यादा) के लिए Balanced से शुरू करें: यह बहुत तेज़ है, और किसी एक कैप्शन को Listen again से बड़ी क्वालिटी में दोबारा बना सकते हैं।',
        ],
      },
    },
    {
      id: 'captions-not-working',
      isNew: true,
      keywords: ['caption nahi ban raha', 'not working', 'stuck', 'error', 'fail', 'atak', 'कैप्शन नहीं', 'audio se caption'],
      related: ['auto-captions', 'caption-quality'],
      en: {
        title: 'Captions are not made, or it seems stuck',
        what: 'What the messages mean and what to do when speech to text does not finish.',
        steps: [
          '"Opening the AI model…" for a while: the model is starting. Big models (Accurate, Best) take longer. Wait for the percentage to appear.',
          'The percentage moves slowly: the model is working. The "about N min left" tells you how long. Long audio with Accurate or Best can take a long time; Balanced is much faster.',
          '"… could not run on this device, so … made the captions": your chosen model could not start here; a smaller one did the job. The Details part says why.',
          '"The computer ran out of memory": pick a smaller quality, or close other apps and try again.',
          '"The speech model files are damaged": Home → Offline & online → delete that model and download it again.',
          '"Needs internet the first time": the model is not on the device yet. Connect once, or download it in Offline & online.',
        ],
        tips: [
          'In Audio to video you can tap "Continue without captions" at any time: the scenes are still made, cut at the pauses.',
          'Still stuck? Send a screenshot of the message with its "Details:" line.',
        ],
      },
      hi: {
        title: 'कैप्शन नहीं बन रहे, या अटका हुआ लगता है',
        what: 'मैसेज का मतलब क्या है, और बोली से टेक्स्ट पूरा न हो तो क्या करें।',
        steps: [
          'काफ़ी देर तक "AI मॉडल खुल रहा है…": मॉडल शुरू हो रहा है। बड़े मॉडल (Accurate, Best) ज़्यादा समय लेते हैं। प्रतिशत दिखने तक रुकें।',
          'प्रतिशत धीरे बढ़ रहा है: मॉडल काम कर रहा है। "लगभग N मिनट बाकी" बताता है कितना समय लगेगा। लंबे ऑडियो पर Accurate या Best काफ़ी समय ले सकते हैं; Balanced बहुत तेज़ है।',
          '"… इस डिवाइस पर नहीं चल सका, इसलिए … से कैप्शन बनाए गए": चुना हुआ मॉडल यहाँ शुरू नहीं हो पाया, छोटे मॉडल ने काम कर दिया। "जानकारी" वाले हिस्से में कारण है।',
          '"कंप्यूटर की मेमोरी कम पड़ गई": छोटी क्वालिटी चुनें, या दूसरे ऐप बंद करके फिर कोशिश करें।',
          '"मॉडल की फ़ाइलें खराब हैं": होम → Offline & online → उस मॉडल को हटाकर फिर से डाउनलोड करें।',
          '"पहली बार इंटरनेट चाहिए": मॉडल अभी डिवाइस पर नहीं है। एक बार इंटरनेट से जुड़ें, या Offline & online में डाउनलोड करें।',
        ],
        tips: [
          'Audio to video में कभी भी "कैप्शन के बिना जारी रखें" दबा सकते हैं: सीन फिर भी बनेंगे, रुकावटों पर कटे हुए।',
          'फिर भी अटका है? मैसेज का "जानकारी:" वाली लाइन के साथ स्क्रीनशॉट भेजें।',
        ],
      },
    },
  ],
}

export default section
