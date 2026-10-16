/** Tiny translation layer: English strings are the keys; Hindi is optional. */
const hi: Record<string, string> = {
  'New project': 'नया प्रोजेक्ट', 'Projects': 'प्रोजेक्ट', 'Import video': 'वीडियो जोड़ें', 'Export': 'एक्सपोर्ट',
  'Split': 'काटें', 'Speed': 'स्पीड', 'Volume': 'आवाज़', 'Filters': 'फ़िल्टर', 'Adjust': 'एडजस्ट', 'Crop': 'क्रॉप',
  'Transition': 'ट्रांज़िशन', 'Duplicate': 'कॉपी', 'Delete': 'हटाएं', 'Audio': 'ऑडियो', 'Text': 'टेक्स्ट',
  'Subtitles': 'सबटाइटल', 'Stickers': 'स्टिकर', 'Overlay': 'ओवरले', 'Blur': 'ब्लर', 'Format': 'फ़ॉर्मेट',
  'Add': 'जोड़ें', 'Undo': 'वापस', 'Redo': 'फिर से', 'Music': 'म्यूज़िक', 'Sound effects': 'साउंड इफ़ेक्ट',
  'Record voice': 'आवाज़ रिकॉर्ड', 'Import audio': 'ऑडियो जोड़ें', 'Done': 'हो गया', 'Cancel': 'रद्द करें',
  'Save': 'सेव', 'Share': 'शेयर', 'Animation': 'एनिमेशन', 'Edit': 'बदलें', 'Style': 'स्टाइल', 'Fit': 'फ़िट',
  'Fill': 'भरें', 'Green screen': 'ग्रीन स्क्रीन', 'Opacity': 'पारदर्शिता', 'Reset': 'रीसेट', 'Apply to all': 'सब पर लगाएं',
  'Offline ready': 'ऑफ़लाइन तैयार', 'Get offline pack': 'ऑफ़लाइन पैक लें', 'Intensity': 'तीव्रता', 'Duration': 'समय',
  'Fade in': 'धीरे शुरू', 'Fade out': 'धीरे खत्म', 'Mute': 'म्यूट', 'Background': 'बैकग्राउंड', 'Aspect ratio': 'आकार',
  'Watermark': 'वॉटरमार्क', 'Resolution': 'क्वालिटी', 'Cover': 'कवर', 'Batch': 'बैच', 'Rotate': 'घुमाएं', 'Flip': 'पलटें',
  'Keyframe-free cut, original quality': 'बिना क्वालिटी खोए तेज़ एक्सपोर्ट', 'Rename': 'नाम बदलें', 'Open': 'खोलें',
  'Pick videos or photos from your phone. Everything stays on your device.': 'फ़ोन से वीडियो या फ़ोटो चुनें। सब कुछ आपके फ़ोन में ही रहता है।',
  'AI Dub': 'AI डब', 'AI captions & dubbing': 'AI कैप्शन और डबिंग', 'Auto captions': 'ऑटो कैप्शन', 'Translate': 'अनुवाद',
  'Voice-over': 'वॉइस-ओवर', 'Generate captions': 'कैप्शन बनाएं', 'Download .srt': '.srt डाउनलोड', 'Quality': 'क्वालिटी',
  'Fast': 'तेज़', 'Balanced': 'संतुलित', 'Accurate': 'सटीक', 'Language spoken in the video': 'वीडियो में बोली गई भाषा',
  'Detect automatically': 'अपने आप पहचानें', 'Write captions in English': 'कैप्शन अंग्रेज़ी में लिखें', 'From': 'से', 'To': 'में',
  'Translate subtitles': 'सबटाइटल अनुवाद करें', 'Only download .srt': 'सिर्फ़ .srt डाउनलोड', 'Hear sample': 'नमूना सुनें',
  'Create voice-over': 'वॉइस-ओवर बनाएं', 'Original sound': 'असली आवाज़', 'Listening to the video…': 'वीडियो सुन रहे हैं…',
  'Translating…': 'अनुवाद हो रहा है…', 'Recording voice-over…': 'वॉइस-ओवर बन रहा है…', 'Making a sample…': 'नमूना बन रहा है…',
  'Downloading AI model (first time only)': 'AI मॉडल डाउनलोड हो रहा है (सिर्फ़ पहली बार)',
  'Voice language (should match the subtitles)': 'आवाज़ की भाषा (सबटाइटल वाली भाषा)',
  'Turns the speech in your video into subtitles. The AI runs on your device; the model downloads once.': 'वीडियो की बोली को सबटाइटल में बदलता है। AI आपके फ़ोन पर चलता है; मॉडल एक बार डाउनलोड होता है।',
  'Translates your subtitles and keeps their timing. Needs internet.': 'सबटाइटल का अनुवाद करता है, समय वही रहता है। इंटरनेट चाहिए।',
  'Reads every subtitle aloud at its time and lays the voice over your video. Translate first to dub into another language.': 'हर सबटाइटल को उसके समय पर बोलकर वीडियो पर आवाज़ डालता है। दूसरी भाषा में डब करने के लिए पहले अनुवाद करें।',
  'Add subtitles first: use Auto captions or import an .srt file.': 'पहले सबटाइटल जोड़ें: ऑटो कैप्शन या .srt फ़ाइल से।',
  'Voice-over added to the timeline. It will be in the exported video.': 'वॉइस-ओवर टाइमलाइन में जुड़ गया। एक्सपोर्ट वीडियो में भी आएगा।',
  'Replace the subtitles you already have?': 'पहले वाले सबटाइटल बदल दें?', 'No speech was found in this video': 'इस वीडियो में बोली नहीं मिली',
  'captions added. Edit any line in Subtitles.': 'कैप्शन जुड़ गए। सबटाइटल में कोई भी लाइन बदल सकते हैं।',
  'Subtitles are now in': 'सबटाइटल अब इस भाषा में हैं:', 'The .srt file was downloaded too.': '.srt फ़ाइल भी डाउनलोड हो गई।',
  'Translated .srt downloaded.': 'अनुवादित .srt डाउनलोड हो गई।', 'no offline voice yet. Voices available:': 'इसकी आवाज़ अभी नहीं है। उपलब्ध आवाज़ें:',
  'Email (optional, raises the free limit to 50,000 characters a day)': 'ईमेल (ज़रूरी नहीं, मुफ़्त सीमा 50,000 अक्षर/दिन हो जाती है)',
  'Show watermark': 'वॉटरमार्क दिखाएं', 'Content': 'क्या दिखे', 'Position': 'जगह', 'Timing': 'समय', 'Logo image': 'लोगो फ़ोटो',
  'Your name or channel': 'आपका नाम या चैनल', 'Shadow': 'छाया', 'Font': 'फ़ॉन्ट', 'No logo yet': 'लोगो नहीं है', 'Upload logo': 'लोगो जोड़ें',
  'Change logo': 'लोगो बदलें', 'Static': 'एक जगह', 'Floating': 'घूमता हुआ', 'Full video': 'पूरा वीडियो', 'Time range': 'कुछ समय',
  'Start': 'शुरू', 'End': 'खत्म', 'Start at playhead': 'यहाँ से शुरू', 'End at playhead': 'यहाँ खत्म', 'ApanaVidEditor watermark': 'ApanaVidEditor वॉटरमार्क',
  'Or drag the watermark on the video.': 'या वीडियो पर वॉटरमार्क को खींचकर रखें।',
  'Custom spot. Pick a box above to snap it back.': 'आपकी चुनी जगह। ऊपर कोई डिब्बा चुनकर वापस ले जाएं।',
  'Moves slowly around the whole frame so it is hard to crop out.': 'पूरे वीडियो में धीरे-धीरे घूमता है ताकि काटकर हटाया न जा सके।',
  'Pick an image (PNG with a transparent background works best)': 'फ़ोटो चुनें (पारदर्शी बैकग्राउंड वाली PNG सबसे अच्छी)',
  'Motion': 'मोशन', 'Preset': 'प्रीसेट', 'Custom (project frame)': 'अपनी सेटिंग (प्रोजेक्ट फ़्रेम)',
  'The video is reframed to': 'वीडियो का आकार बदलकर होगा', 'empty space uses the Format background.': 'खाली जगह में फ़ॉर्मेट वाला बैकग्राउंड आएगा।',
  'Project saved': 'प्रोजेक्ट सेव हो गया', 'Preparing project file…': 'प्रोजेक्ट फ़ाइल बन रही है…', 'Save project': 'प्रोजेक्ट सेव करें',
  'Save as .avp file': '.avp फ़ाइल में सेव करें', 'Open project file (.avp)': 'प्रोजेक्ट फ़ाइल खोलें (.avp)', 'Magnetic snap': 'मैग्नेटिक स्नैप',
  'Frame': 'फ़्रेम', 'Typewriter': 'टाइपराइटर', 'Bounce In': 'उछलकर आए', 'Slide In Left': 'बाएं से आए', 'Slide In Right': 'दाएं से आए',
  'Fade In': 'धीरे दिखे', 'Zoom In': 'ज़ूम होकर आए', 'None': 'कोई नहीं',
}

let lang: 'en' | 'hi' = (() => { try { return localStorage.getItem('lang') === 'hi' ? 'hi' : 'en' } catch { return 'en' } })()

export const getLang = () => lang
export function setLang(l: 'en' | 'hi') {
  lang = l
  try { localStorage.setItem('lang', l) } catch { /* private mode */ }
}
export const t = (s: string) => (lang === 'hi' ? hi[s] ?? s : s)
