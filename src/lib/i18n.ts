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
}

let lang: 'en' | 'hi' = (() => { try { return localStorage.getItem('lang') === 'hi' ? 'hi' : 'en' } catch { return 'en' } })()

export const getLang = () => lang
export function setLang(l: 'en' | 'hi') {
  lang = l
  try { localStorage.setItem('lang', l) } catch { /* private mode */ }
}
export const t = (s: string) => (lang === 'hi' ? hi[s] ?? s : s)
