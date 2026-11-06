import type { HelpSection } from '../types'

const section: HelpSection = {
  id: 'look',
  order: 80,
  icon: 'color',
  title: { en: 'Look: filters, color, effects, transitions', hi: 'लुक: फ़िल्टर, कलर, इफ़ेक्ट, ट्रांज़िशन' },
  intro: { en: 'Change colours and light, add effects and transitions, remove backgrounds and steady shaky video.', hi: 'रंग और रोशनी बदलें, इफ़ेक्ट और ट्रांज़िशन लगाएँ, बैकग्राउंड हटाएँ और हिलती वीडियो स्थिर करें।' },
  topics: [
    {
      id: 'filters',
      find: { tool: 'Filters', needs: 'clip' },
      keywords: ['filter', 'look', 'preset', 'cinematic', 'vintage', 'lut'],
      en: {
        title: 'Filters',
        what: 'One-tap looks in groups: Looks, Digicam, Basic, Portrait, Film, Cinematic, Vintage, Mood, Nature, Urban and more.',
        where: 'Select a clip or overlay → Filters',
        steps: [
          'Select the clip and tap Filters.',
          'Pick a group, then tap a filter to try it. The strength slider makes it softer or stronger.',
          'Apply to all puts it on every clip. None removes it.',
        ],
      },
      hi: {
        title: 'फ़िल्टर',
        what: 'एक टैप वाले लुक, समूहों में: Looks, Digicam, Basic, Portrait, Film, Cinematic, Vintage, Mood, Nature, Urban और भी।',
        where: 'क्लिप या ओवरले चुनें → फ़िल्टर',
        steps: [
          'क्लिप चुनकर "फ़िल्टर" दबाएँ।',
          'कोई समूह चुनें, फिर किसी फ़िल्टर पर दबाकर देखें। ताक़त का स्लाइडर उसे हल्का या गहरा करता है।',
          '"सब पर लगाएं" हर क्लिप पर लगाता है। "None" हटाता है।',
        ],
      },
    },
    {
      id: 'adjust',
      find: { tool: 'Adjust', needs: 'clip' },
      keywords: ['brightness', 'contrast', 'saturation', 'exposure', 'temperature', 'sharpen', 'vignette', 'grain', 'light'],
      en: {
        title: 'Adjust: brightness, contrast, colour warmth…',
        what: 'Fine-tune the light and colour: Exposure, Brightness, Contrast, Saturation, Vibrance, Temperature, Tint, Hue, Highlights, Shadows, Fade, Vignette, Grain and Sharpen.',
        where: 'Select a clip or overlay → Adjust',
        steps: [
          'Select the clip and tap Adjust.',
          'Drag a slider; the preview changes at once. Double-tap a slider to set it back to 0.',
          'Apply to all copies the settings to every clip; Reset clears them.',
        ],
      },
      hi: {
        title: 'एडजस्ट: रोशनी, कंट्रास्ट, रंग की गर्माहट…',
        what: 'रोशनी और रंग बारीकी से ठीक करें: Exposure, Brightness, Contrast, Saturation, Vibrance, Temperature, Tint, Hue, Highlights, Shadows, Fade, Vignette, Grain और Sharpen।',
        where: 'क्लिप या ओवरले चुनें → एडजस्ट',
        steps: [
          'क्लिप चुनकर "एडजस्ट" दबाएँ।',
          'कोई स्लाइडर खींचें; प्रीव्यू तुरंत बदलता है। स्लाइडर पर दो बार दबाने से वो 0 पर आ जाता है।',
          '"सब पर लगाएं" हर क्लिप पर वही सेटिंग लगाता है; "रीसेट" साफ़ करता है।',
        ],
      },
    },
    {
      id: 'color',
      find: { tool: 'Color', needs: 'clip' },
      keywords: ['color grading', 'curves', 'hsl', 'lut', 'cube', 'skin tone', 'grade', 'rang'],
      related: ['color-match', 'scopes'],
      en: {
        title: 'Color: curves, HSL and LUT',
        what: 'Professional colour grading with curves, single-colour changes and .cube LUT files.',
        where: 'Select a clip or overlay → Color',
        steps: [
          'Curves: pick All, Red, Green or Blue. Tap the line to add a point, drag to bend it, double-tap a point to remove it. An S-shape gives more contrast.',
          'HSL: change one colour only, e.g. Orange lightness up for brighter skin, Green saturation down for calmer leaves.',
          'LUT: tap Import .cube LUT to use a ready colour look from a camera maker or a colourist. It is saved in this project.',
          'Apply to all puts the grade on every clip; Reset clears it.',
        ],
      },
      hi: {
        title: 'कलर: कर्व, HSL और LUT',
        what: 'कर्व, एक-एक रंग के बदलाव और .cube LUT फ़ाइल से प्रोफ़ेशनल कलर ग्रेडिंग।',
        where: 'क्लिप या ओवरले चुनें → कलर',
        steps: [
          '"कर्व": All, Red, Green या Blue चुनें। लाइन पर दबाकर बिंदु जोड़ें, खींचकर मोड़ें, बिंदु पर दो बार दबाकर हटाएँ। S जैसा आकार कंट्रास्ट बढ़ाता है।',
          '"HSL": सिर्फ़ एक रंग बदलें, जैसे Orange की रोशनी बढ़ाएँ तो त्वचा चमकेगी, Green का Saturation घटाएँ तो पत्ते शांत दिखेंगे।',
          '"LUT": कैमरा कंपनी या कलरिस्ट का तैयार लुक लगाने के लिए ".cube LUT जोड़ें" दबाएँ। यह इसी प्रोजेक्ट में सेव रहता है।',
          '"सब पर लगाएं" हर क्लिप पर ग्रेड लगाता है; "रीसेट" साफ़ करता है।',
        ],
      },
    },
    {
      id: 'color-match',
      isNew: true,
      find: { tool: 'Color', needs: 'clip' },
      keywords: ['color match', 'match', 'same colour', 'two cameras', 'rang milana'],
      en: {
        title: 'Color match: make two shots look the same',
        what: 'Give this clip the colours of another shot, for example to match a second camera to the main camera.',
        where: 'Select a clip → Color → Match',
        steps: [
          'Select the clip whose colours should change and open Color → Match.',
          'Pick the shot whose colours it should get (another clip, or A photo).',
          'Red, green and blue curves are made by themselves. Fine-tune them in Curves.',
          'Remove the match takes it away.',
        ],
      },
      hi: {
        title: 'कलर मैच: दो शॉट एक जैसे रंग के',
        what: 'इस क्लिप को किसी दूसरे शॉट के रंग दें, जैसे दूसरे कैमरे को मुख्य कैमरे जैसा बनाना।',
        where: 'क्लिप चुनें → कलर → Match',
        steps: [
          'जिस क्लिप के रंग बदलने हैं उसे चुनकर "कलर" → "Match" खोलें।',
          'वो शॉट चुनें जिसके रंग चाहिए (दूसरी क्लिप, या कोई फ़ोटो)।',
          'लाल, हरे और नीले कर्व अपने आप बन जाते हैं। उन्हें "कर्व" में और ठीक करें।',
          '"मैच हटाएँ" इसे हटा देता है।',
        ],
      },
    },
    {
      id: 'scopes',
      isNew: true,
      find: { tool: 'Scopes', needs: 'nothing' },
      keywords: ['scopes', 'waveform', 'histogram', 'vectorscope', 'rgb parade', 'exposure check'],
      en: {
        title: 'Video scopes',
        what: 'Graphs that measure the picture, so you can see if it is too dark, too bright or the colours are off.',
        where: 'Toolbar (nothing selected) → Scopes',
        steps: [
          'Tap Scopes. A small graph shows over the video; tap Scopes again to hide it.',
          'Pick the Scope: Waveform (brightness across the picture), RGB parade (red, green, blue side by side), Histogram (how many dark and bright parts) or Vectorscope (colour and skin tones).',
          'Warnings tell you when Highlights are burnt out or Shadows are crushed.',
          'Tap What is this? for a short explanation of each scope.',
        ],
      },
      hi: {
        title: 'वीडियो स्कोप',
        what: 'तस्वीर को नापने वाले ग्राफ़, ताकि दिखे कि वो बहुत अँधेरी, बहुत चमकीली है या रंग गड़बड़ हैं।',
        where: 'टूलबार (कुछ चुना न हो) → Scopes',
        steps: [
          '"Scopes" दबाएँ। वीडियो के ऊपर छोटा ग्राफ़ दिखेगा; छिपाने के लिए फिर दबाएँ।',
          'स्कोप चुनें: Waveform (तस्वीर में रोशनी), RGB parade (लाल, हरा, नीला साथ-साथ), Histogram (कितने अँधेरे और चमकीले हिस्से) या Vectorscope (रंग और त्वचा का रंग)।',
          'चेतावनी बताती है जब चमकीले हिस्से जल गए हों (Highlights burnt out) या अँधेरे हिस्से दब गए हों (Shadows crushed)।',
          'हर स्कोप की छोटी जानकारी के लिए "यह क्या है?" दबाएँ।',
        ],
      },
    },
    {
      id: 'adjustment-layer',
      isNew: true,
      find: { tool: 'Adjustment layer', needs: 'nothing' },
      keywords: ['adjustment layer', 'one look for all', 'grade everything'],
      en: {
        title: 'Adjustment layer: one look for everything under it',
        what: 'A layer with no picture of its own. Everything under it (main video and lower tracks) gets its look for as long as it lasts. Text and stickers above it stay the same.',
        where: 'Toolbar (nothing selected) → Adjustment layer',
        steps: [
          'Move the playhead and tap Adjustment layer. It appears on its own track.',
          'Use Adjust, Filters, Color and Effects on it to set the look. Strength mixes it with the original.',
          'Drag its ends to cover the part you want, or turn on Cover the whole video.',
          'Change the look once and every clip under it changes.',
        ],
      },
      hi: {
        title: 'एडजस्टमेंट लेयर: नीचे की हर चीज़ पर एक लुक',
        what: 'ऐसी लेयर जिसकी अपनी तस्वीर नहीं होती। उसके नीचे की हर चीज़ (मुख्य वीडियो और नीचे के ट्रैक) को, जितनी देर वो है, उसका लुक मिलता है। उसके ऊपर का टेक्स्ट और स्टिकर वैसे ही रहते हैं।',
        where: 'टूलबार (कुछ चुना न हो) → Adjustment layer',
        steps: [
          'प्लेहेड रखें और "Adjustment layer" दबाएँ। यह अपने अलग ट्रैक पर आएगी।',
          'लुक के लिए इस पर एडजस्ट, फ़िल्टर, कलर और इफ़ेक्ट लगाएँ। "Strength" इसे ओरिजिनल के साथ मिलाता है।',
          'जितना हिस्सा चाहिए उतना ढकने के लिए सिरे खींचें, या "पूरी वीडियो ढकें" चालू करें।',
          'एक बार लुक बदलें, नीचे की हर क्लिप बदल जाएगी।',
        ],
      },
    },
    {
      id: 'effects',
      find: { tool: 'Effects', needs: 'clip' },
      keywords: ['effects', 'glitch', 'vhs', 'cartoon', 'anime', 'sketch', 'old film', 'shake', 'beauty', 'smooth skin', 'polaroid'],
      en: {
        title: 'Effects',
        what: 'Moving GPU effects in groups: Art (cartoon, anime, pencil sketch, comic, oil paint), Beauty (smooth skin, glow, enhance), Frame (polaroid, film strip, phone, camera REC), Dreamy, Light (light leak, bokeh, sparkles, snow), Retro (old film, VHS, glitch, colour pop), Motion (shake, heartbeat zoom) and Shape (cinema bars, mirror, kaleidoscope).',
        where: 'Select a clip or overlay → Effects',
        steps: [
          'Select the clip and tap Effects.',
          'Pick a group, then an effect. Play to see moving effects.',
          'Use the amount slider where there is one. None removes the effect.',
          'Apply to all puts it on every clip.',
        ],
      },
      hi: {
        title: 'इफ़ेक्ट',
        what: 'चलते-फिरते इफ़ेक्ट, समूहों में: Art (कार्टून, एनीमे, पेंसिल स्केच, कॉमिक, ऑयल पेंट), Beauty (मुलायम त्वचा, चमक, साफ़ तस्वीर), Frame (पोलरॉइड, फ़िल्म पट्टी, फ़ोन, कैमरा REC), Dreamy, Light (लाइट लीक, बोके, चमक, बर्फ़), Retro (पुरानी फ़िल्म, VHS, ग्लिच, कलर पॉप), Motion (झटका, धड़कन ज़ूम) और Shape (सिनेमा पट्टी, आईना, कैलिडोस्कोप)।',
        where: 'क्लिप या ओवरले चुनें → इफ़ेक्ट',
        steps: [
          'क्लिप चुनकर "इफ़ेक्ट" दबाएँ।',
          'कोई समूह, फिर कोई इफ़ेक्ट चुनें। चलने वाले इफ़ेक्ट देखने के लिए Play दबाएँ।',
          'जहाँ स्लाइडर हो, उससे मात्रा बदलें। "None" इफ़ेक्ट हटाता है।',
          '"सब पर लगाएं" हर क्लिप पर लगाता है।',
        ],
      },
    },
    {
      id: 'transitions',
      find: { tool: 'Transition', needs: 'clip' },
      keywords: ['transition', 'fade', 'whip', 'wipe', 'slide', 'zoom transition', 'between clips'],
      en: {
        title: 'Transitions between clips',
        what: 'A smooth change from one clip to the next: Trending (whip pan, film burn, light leak, page turn, paper rip, cube, ink spread), Basic fades, Wipes, Slides, Shapes, Zooms and Effects.',
        where: 'Tap the small square between two clips on the timeline, or select a clip → Transition',
        steps: [
          'Tap the small button between two clips (or select the first clip and tap Transition).',
          'Pick a transition and set its Duration.',
          'Apply to all puts the same transition between every pair of clips. None removes it.',
        ],
      },
      hi: {
        title: 'क्लिप के बीच ट्रांज़िशन',
        what: 'एक क्लिप से अगली में आराम से बदलाव: Trending (व्हिप पैन, फ़िल्म बर्न, लाइट लीक, पन्ना पलटना, कागज़ फटना, क्यूब, स्याही फैलना), Basic फ़ेड, Wipe, Slide, Shape, Zoom और Effect।',
        where: 'टाइमलाइन पर दो क्लिप के बीच छोटे बटन पर दबाएँ, या क्लिप चुनें → ट्रांज़िशन',
        steps: [
          'दो क्लिप के बीच छोटा बटन दबाएँ (या पहली क्लिप चुनकर "ट्रांज़िशन" दबाएँ)।',
          'कोई ट्रांज़िशन चुनें और उसकी लंबाई (Duration) तय करें।',
          '"सब पर लगाएं" हर दो क्लिप के बीच वही ट्रांज़िशन लगाता है। "None" हटाता है।',
        ],
      },
    },
    {
      id: 'green-screen',
      find: { tool: 'Green screen', needs: 'clip' },
      pro: true,
      keywords: ['green screen', 'chroma', 'blue screen', 'background change', 'chroma key'],
      en: {
        title: 'Green screen (chroma key)',
        what: 'Remove a green or blue background and put a photo, video or colour behind the person.',
        where: 'Select a clip or overlay → Green screen',
        steps: [
          'Select the clip filmed in front of a green or blue screen and tap Green screen.',
          'The screen colour is found and removed by itself. If not, tap the background in the picture to pick its exact colour.',
          'Background: None (see-through, shows the tracks below), Colour, or Photo / video. Choose Fill screen or Fit whole picture.',
          'Settings are tuned for this video by themselves; adjust the sliders if edges look rough.',
        ],
        tips: ['The background stays with the clip when you move, split or trim it. A shorter background video starts again.'],
      },
      hi: {
        title: 'ग्रीन स्क्रीन (क्रोमा की)',
        what: 'हरा या नीला बैकग्राउंड हटाकर व्यक्ति के पीछे फ़ोटो, वीडियो या रंग लगाएँ।',
        where: 'क्लिप या ओवरले चुनें → ग्रीन स्क्रीन',
        steps: [
          'हरे या नीले पर्दे के आगे शूट की गई क्लिप चुनकर "ग्रीन स्क्रीन" दबाएँ।',
          'पर्दे का रंग अपने आप ढूँढकर हटा दिया जाता है। न हो तो तस्वीर में बैकग्राउंड पर दबाकर उसका ठीक रंग चुनें।',
          '"बैकग्राउंड": None (पारदर्शी, नीचे के ट्रैक दिखेंगे), Colour, या Photo / video। "Fill screen" या "Fit whole picture" चुनें।',
          'सेटिंग इस वीडियो के हिसाब से अपने आप ठीक होती है; किनारे खुरदुरे लगें तो स्लाइडर बदलें।',
        ],
        tips: ['क्लिप को हिलाने, काटने या ट्रिम करने पर बैकग्राउंड साथ रहता है। छोटी बैकग्राउंड वीडियो फिर से शुरू हो जाती है।'],
      },
    },
    {
      id: 'remove-bg',
      find: { tool: 'Remove BG', needs: 'clip' },
      keywords: ['remove background', 'cutout', 'no green screen', 'clone', 'outline', 'person', 'background hatana'],
      en: {
        title: 'Remove background (AI, no green screen) and clone yourself',
        what: 'The AI finds the person in every frame on your device, so you can change the background without a green screen, add an outline, or clone yourself.',
        where: 'Select a clip or overlay → Remove BG',
        steps: [
          'Select the clip and tap Remove BG. Wait while the AI gets ready (first time only).',
          'Background: None, Colour, or Photo / video behind the person.',
          'Outline: add a Line, Glow or Scribble around the person.',
          'Clone yourself: Beside me, Mirror or Echo adds a copy of the person on its own row; drag it to place it.',
        ],
        tips: ['Works best with one person who stands out from the background. If Green screen is on, it is used instead.'],
      },
      hi: {
        title: 'बैकग्राउंड हटाएं (AI, बिना ग्रीन स्क्रीन) और अपना क्लोन',
        what: 'AI आपके डिवाइस पर हर फ़्रेम में व्यक्ति को ढूँढता है, ताकि बिना ग्रीन स्क्रीन बैकग्राउंड बदल सकें, किनारे पर लाइन लगा सकें, या अपना क्लोन बना सकें।',
        where: 'क्लिप या ओवरले चुनें → बैकग्राउंड हटाएं',
        steps: [
          'क्लिप चुनकर "बैकग्राउंड हटाएं" दबाएँ। AI तैयार होने तक रुकें (सिर्फ़ पहली बार)।',
          '"बैकग्राउंड": None, Colour, या व्यक्ति के पीछे Photo / video।',
          '"आउटलाइन": व्यक्ति के चारों ओर Line, Glow या Scribble।',
          '"अपना क्लोन बनाएं": Beside me, Mirror या Echo व्यक्ति की कॉपी अलग लाइन पर जोड़ता है; उसे खींचकर रखें।',
        ],
        tips: ['एक व्यक्ति हो और बैकग्राउंड से अलग दिखे, तो सबसे अच्छा। ग्रीन स्क्रीन चालू हो तो वही इस्तेमाल होता है।'],
      },
    },
    {
      id: 'motion-tools',
      find: { tool: 'Motion', needs: 'clip' },
      keywords: ['stabilize', 'shake', 'smooth slow motion', 'motion blur', '3d photo', 'steady', 'hilna'],
      en: {
        title: 'Motion: stabilize, smooth slow motion, motion blur, 3D photo',
        what: 'Fix shaky hand-held video, make slow motion smooth, add a fast-camera trail, or give a photo depth.',
        where: 'Select a clip → Motion (for a photo: 3D zoom)',
        steps: [
          'Stabilize: takes the shake out of hand-held video (on this device). The picture zooms in a little to hide the edges.',
          'Smooth slow motion: slowed-down parts glide between frames instead of stuttering. Set a speed below 1x first.',
          'Motion blur: moving things leave a soft trail; choose Small, Medium or Large.',
          'For a photo, 3D zoom: pick Zoom in, Zoom out, Slide left / right, Rise or Orbit; near things move more than far ones.',
        ],
      },
      hi: {
        title: 'मोशन: स्थिर करें, स्मूद स्लो मोशन, मोशन ब्लर, 3D फ़ोटो',
        what: 'हाथ से शूट की हिलती वीडियो ठीक करें, स्लो मोशन स्मूद करें, तेज़ कैमरे जैसा धुंधलापन लाएँ, या फ़ोटो में गहराई दें।',
        where: 'क्लिप चुनें → मोशन (फ़ोटो के लिए: 3D ज़ूम)',
        steps: [
          '"स्थिर करें": हाथ से शूट की वीडियो का हिलना हटाता है (इसी डिवाइस पर)। किनारे छिपाने के लिए तस्वीर थोड़ी ज़ूम होती है।',
          '"स्मूद स्लो मोशन": धीमे हिस्से अटकने के बजाय आराम से चलते हैं। पहले स्पीड 1x से कम करें।',
          '"मोशन ब्लर": चलती चीज़ों के पीछे हल्की लकीर; Small, Medium या Large चुनें।',
          'फ़ोटो के लिए "3D ज़ूम": Zoom in, Zoom out, Slide left / right, Rise या Orbit; पास की चीज़ें दूर वाली से ज़्यादा हिलती हैं।',
        ],
      },
    },
  ],
}

export default section
