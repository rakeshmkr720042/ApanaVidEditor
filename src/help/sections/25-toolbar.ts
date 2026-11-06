import type { HelpSection } from '../types'

const section: HelpSection = {
  id: 'toolbar',
  order: 25,
  icon: 'tune',
  title: { en: 'Toolbar: groups, position and favourites', hi: 'टूलबार: ग्रुप, जगह और पसंदीदा' },
  intro: {
    en: 'Arrange the row of tools your way: groups of related tools, favourites first, your own order, and under the video or beside it.',
    hi: 'टूल की पंक्ति अपने हिसाब से जमाएँ: मिलते-जुलते टूल के ग्रुप, पसंदीदा टूल सबसे आगे, अपना क्रम, और वीडियो के नीचे या बगल में।',
  },
  topics: [
    {
      id: 'toolbar-groups',
      isNew: true,
      find: { selector: '.tool-groups', needs: 'project' },
      keywords: ['group', 'category', 'groups', 'tools', 'toolbar', 'grup', 'shreni', 'audio tools', 'color tools'],
      related: ['toolbar-favourites', 'toolbar-position'],
      en: {
        title: 'Tool groups',
        what: 'Related tools are grouped, so you can see only the ones you need right now, for example only the sound tools.',
        where: 'Editor → the row of groups just above the tools',
        steps: [
          'Above the tools is a row of groups: Favourites, All, Cut & edit, Add, Text, Look & color, Audio, AI & makers.',
          'Tap a group to see only its tools. For example, with a clip selected, Audio shows Volume, Detach audio, Remove noise and Audio effects.',
          'Tap All to see every tool again.',
        ],
        tips: [
          'Only groups that have tools for what you selected are shown. If the picked group has nothing for the selection, All is shown.',
          'Prefer one long row? Turn off "Group similar tools" in Toolbar settings.',
          'Smart shortcuts tools (Your usual) stay in every group.',
        ],
      },
      hi: {
        title: 'टूल के ग्रुप',
        what: 'मिलते-जुलते टूल एक ग्रुप में हैं, ताकि आप अभी सिर्फ़ ज़रूरी टूल देखें, जैसे सिर्फ़ आवाज़ वाले टूल।',
        where: 'एडिटर → टूल के ठीक ऊपर ग्रुप की पंक्ति',
        steps: [
          'टूल के ऊपर ग्रुप की एक पंक्ति है: पसंदीदा, सभी, कट और एडिट, जोड़ें, टेक्स्ट, लुक और कलर, ऑडियो, AI और मेकर।',
          'किसी ग्रुप पर टैप करें, सिर्फ़ उसी के टूल दिखेंगे। जैसे क्लिप चुनी हो तो ऑडियो में वॉल्यूम, ऑडियो अलग करें, शोर हटाएं और ऑडियो इफ़ेक्ट दिखते हैं।',
          'सारे टूल फिर से देखने के लिए "सभी" पर टैप करें।',
        ],
        tips: [
          'वही ग्रुप दिखते हैं जिनमें चुनी हुई चीज़ के लिए टूल हों। चुने गए ग्रुप में कुछ न हो तो "सभी" दिखता है।',
          'एक लंबी पंक्ति पसंद है? टूलबार सेटिंग में "मिलते-जुलते टूल के ग्रुप दिखाएं" बंद करें।',
          'स्मार्ट शॉर्टकट वाले टूल (आपका रोज़ का) हर ग्रुप में रहते हैं।',
        ],
      },
    },
    {
      id: 'toolbar-position',
      isNew: true,
      find: { selector: '[data-testid="toolbar-settings"]', needs: 'project' },
      keywords: ['dock', 'left', 'right', 'side', 'position', 'move toolbar', 'baaye', 'daaye', 'jagah', 'layout', 'preset'],
      related: ['toolbar-groups'],
      en: {
        title: 'Put the toolbar left, right or under the video',
        what: 'Use the empty space beside the video for the tools, or pick a ready-made layout for editing, color or audio work.',
        where: 'Editor → settings button (sliders) at the end of the group row → Toolbar',
        steps: [
          'Tap the settings button (sliders icon) at the end of the group row.',
          'Under "Where the tools sit" pick Left of video, Under the video or Right of video.',
          'Or tap a ready-made layout: Default (all tools under the video), Editing (cut, trim, move tools under the video), Color (look & color tools on the right), Audio (sound tools on the left).',
          'Tap Done.',
        ],
        tips: [
          'A layout only sets the position and the group. You can change either one afterwards.',
          'On a narrow phone screen the tools stay under the video. Turn the phone sideways or use a computer to see them beside it.',
          'On a big screen the side toolbar shows two columns of tools.',
          'In full screen the tools are in the slide-in edit panel, as before.',
        ],
      },
      hi: {
        title: 'टूलबार को वीडियो के बाएँ, दाएँ या नीचे रखें',
        what: 'वीडियो के बगल की खाली जगह में टूल रखें, या एडिटिंग, कलर या ऑडियो काम के लिए तैयार लेआउट चुनें।',
        where: 'एडिटर → ग्रुप की पंक्ति के आख़िर में सेटिंग बटन (स्लाइडर) → टूलबार',
        steps: [
          'ग्रुप की पंक्ति के आख़िर में सेटिंग बटन (स्लाइडर वाला आइकन) दबाएँ।',
          '"टूल कहाँ रहें" में वीडियो के बाएँ, वीडियो के नीचे या वीडियो के दाएँ चुनें।',
          'या कोई तैयार लेआउट दबाएँ: सामान्य (सारे टूल वीडियो के नीचे), एडिटिंग (काटने, ट्रिम, खिसकाने के टूल नीचे), कलर (लुक और कलर टूल दाईं ओर), ऑडियो (आवाज़ के टूल बाईं ओर)।',
          '"हो गया" दबाएँ।',
        ],
        tips: [
          'लेआउट सिर्फ़ जगह और ग्रुप तय करता है। बाद में दोनों बदल सकते हैं।',
          'पतली फ़ोन स्क्रीन पर टूल वीडियो के नीचे ही रहते हैं। बगल में देखने के लिए फ़ोन आड़ा करें या कंप्यूटर इस्तेमाल करें।',
          'बड़ी स्क्रीन पर बगल वाले टूलबार में टूल के दो कॉलम दिखते हैं।',
          'फ़ुल स्क्रीन में टूल पहले की तरह खुलने वाले एडिट पैनल में रहते हैं।',
        ],
      },
    },
    {
      id: 'toolbar-favourites',
      isNew: true,
      find: { selector: '.tool-groups', needs: 'project' },
      keywords: ['favourite', 'favorite', 'pin', 'star', 'pasandida', 'reorder', 'order', 'drag', 'kram', 'arrange'],
      related: ['toolbar-groups'],
      en: {
        title: 'Favourite tools and your own order',
        what: 'Keep the tools you use most in front, and put every tool where you want it.',
        where: 'Editor → press and hold a tool (phone) or right-click it (computer)',
        steps: [
          'Phone: press and hold a tool. Computer: right-click a tool.',
          'Tap "Add to Favourites". The tool gets a small yellow star and comes first in All. The Favourites group (star) shows only your favourites.',
          'To move a tool, tap Move left / Move right (Move up / Move down when the toolbar is beside the video) as many times as you need.',
          'On a computer you can also drag a tool with the mouse and drop it where you want. A blue line shows where it will go.',
        ],
        tips: [
          'Remove a favourite from the same menu, or from the Favourites list in Toolbar settings.',
          'Toolbar settings → Reset order puts every tool back in its usual place.',
          'Your toolbar choices are saved on this device.',
        ],
      },
      hi: {
        title: 'पसंदीदा टूल और अपना क्रम',
        what: 'सबसे ज़्यादा इस्तेमाल होने वाले टूल आगे रखें, और हर टूल को अपनी जगह पर रखें।',
        where: 'एडिटर → टूल को दबाकर रखें (फ़ोन) या उस पर राइट-क्लिक करें (कंप्यूटर)',
        steps: [
          'फ़ोन: टूल को दबाकर रखें। कंप्यूटर: टूल पर राइट-क्लिक करें।',
          '"पसंदीदा में जोड़ें" दबाएँ। टूल पर छोटा पीला तारा आ जाता है और वह "सभी" में सबसे आगे आता है। पसंदीदा ग्रुप (तारा) में सिर्फ़ आपके पसंदीदा टूल दिखते हैं।',
          'टूल खिसकाने के लिए जितनी बार चाहिए "बाएँ खिसकाएँ" / "दाएँ खिसकाएँ" दबाएँ (टूलबार बगल में हो तो ऊपर / नीचे)।',
          'कंप्यूटर पर माउस से टूल को खींचकर जहाँ चाहें वहाँ छोड़ भी सकते हैं। नीली लाइन दिखाती है कि वह कहाँ जाएगा।',
        ],
        tips: [
          'पसंदीदा से हटाने के लिए वही मेन्यू या टूलबार सेटिंग की पसंदीदा सूची इस्तेमाल करें।',
          'टूलबार सेटिंग → "क्रम पहले जैसा करें" से सारे टूल अपनी पुरानी जगह पर आ जाते हैं।',
          'टूलबार की आपकी पसंद इसी डिवाइस पर सेव रहती है।',
        ],
      },
    },
    {
      id: 'toolbar-magnify',
      isNew: true,
      find: { selector: '[data-testid="toolbar"] .tools', needs: 'project' },
      platforms: ['web', 'windows'],
      keywords: ['hover', 'magnify', 'zoom', 'dock effect', 'bada', 'mouse'],
      en: {
        title: 'Tools grow under the mouse',
        what: 'With a mouse, the tool under the cursor lights up and grows, and the tools next to it grow a little less, like a dock. It makes the right tool easy to hit.',
        where: 'Editor → move the mouse over the tools',
        steps: [
          'Move the mouse over the toolbar. The tool under the cursor is the biggest and brightest.',
          'To turn it off, open Toolbar settings and switch off "Magnify tools under the mouse".',
        ],
        tips: ['Touch screens do not use this effect. It is also off in full screen.'],
      },
      hi: {
        title: 'माउस के नीचे टूल बड़े होते हैं',
        what: 'माउस से टूल पर जाने पर कर्सर के नीचे वाला टूल चमकता और बड़ा होता है, आस-पास वाले उससे थोड़े कम बड़े होते हैं, डॉक की तरह। इससे सही टूल दबाना आसान होता है।',
        where: 'एडिटर → टूल पर माउस घुमाएँ',
        steps: [
          'टूलबार पर माउस घुमाएँ। कर्सर के नीचे वाला टूल सबसे बड़ा और चमकदार होता है।',
          'बंद करने के लिए टूलबार सेटिंग खोलें और "माउस के नीचे वाले टूल बड़े करें" बंद करें।',
        ],
        tips: ['टच स्क्रीन पर यह इफ़ेक्ट नहीं चलता। फ़ुल स्क्रीन में भी यह बंद रहता है।'],
      },
    },
  ],
}

export default section
