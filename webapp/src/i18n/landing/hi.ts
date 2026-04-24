import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  'निजी (सारी प्रोसेसिंग आपके ब्राउज़र में)',
  'बिना साइन-अप',
  'कुछ ही सेकंड में परिणाम',
];

const OPTIMIZER_FEATURES = [
  'Partial attendance',
  'Group-specific capacities',
  'Session-specific group sizes',
  'Session-specific rules',
  'Soft constraints with configurable weights',
  'Pair meeting count targets',
  'Advanced constraint tuning',
  'Solver settings',
  'Detailed result analysis',
];

const CHROME = {
  expertWorkspaceLabel: 'Scenario Editor',
  faqHeading: 'अक्सर पूछे जाने वाले सवाल',
  footerTagline: 'GroupMixer — मुफ़्त रैंडम ग्रुप जनरेटर',
  feedbackLabel: 'फ़ीडबैक',
  privacyNote: 'सारी प्रोसेसिंग आपके ब्राउज़र में लोकली होती है।',
  scrollHint: 'उपयोग के उदाहरण और FAQ देखने के लिए नीचे स्क्रॉल करें',
};

const USE_CASES_SECTION = {
  title: 'क्लासरूम, वर्कशॉप और इवेंट्स के लिए उपयोगी',
  description:
    'शुरुआत एक आसान रैंडम स्प्लिट से करें। जब ज़्यादा नियंत्रण चाहिए हो, GroupMixer उसी जगह आगे बढ़ता है।',
  cards: [
    {
      title: 'क्लासरूम ग्रुप्स',
      body: 'शिक्षक छात्र सूची पेस्ट करके कुछ ही सेकंड में संतुलित ग्रुप बना सकते हैं।',
    },
    {
      title: 'वर्कशॉप ब्रेकआउट रूम',
      body: 'एक सत्र के लिए या कई राउंड की रोटेशन के लिए प्रतिभागियों को बाँटें।',
    },
    {
      title: 'स्पीड नेटवर्किंग',
      body: 'कई राउंड बनाइए ताकि लोग हर बार नए लोगों से मिलें और दोहराव कम हो।',
    },
    {
      title: 'टीम प्रोजेक्ट्स',
      body: 'क्लास या टीम को प्रोजेक्ट ग्रुप्स में बाँटें और ज़रूरत पड़ने पर स्किल या रोल से संतुलन करें।',
    },
    {
      title: 'कॉन्फ्रेंस सेशंस',
      body: 'प्रतिभागियों को टेबल्स या समानांतर ट्रैक्स में बाँटें और साथ ही constraints भी मानें।',
    },
    {
      title: 'सोशल मिक्सर',
      body: 'आइसब्रेकर्स के लिए ऐसे राउंड प्लान करें जहाँ हर कोई किसी नए व्यक्ति से मिले।',
    },
  ],
};

const FAQS = {
  free: {
    question: 'क्या GroupMixer मुफ़्त है?',
    answer:
      'हाँ। GroupMixer पूरी तरह मुफ़्त है। किसी अकाउंट, साइन-अप या उपयोग सीमा की ज़रूरत नहीं है।',
  },
  privacy: {
    question: 'क्या मेरा डेटा निजी रहता है?',
    answer:
      'हाँ। सारी प्रोसेसिंग आपके ब्राउज़र में होती है। नाम और ग्रुप डेटा किसी सर्वर पर नहीं भेजा जाता। पेज लोड होने के बाद आप इसे इंटरनेट कनेक्शन के बिना भी इस्तेमाल कर सकते हैं।'
  },
  constraints: {
    question: 'क्या मैं ऐसे नियम जोड़ सकता हूँ जैसे कुछ लोगों को साथ रखना या अलग रखना?',
    answer:
      'हाँ। एडवांस्ड ऑप्शंस में साथ रखने वाले ग्रुप्स, avoid pairing rules, multiple sessions और attribute balancing जोड़ सकते हैं। ज़्यादा नियंत्रण के लिए Scenario Editor इस्तेमाल करें।',
  },
  multiSession: {
    question: 'क्या मैं कई राउंड के लिए ग्रुप बना सकता हूँ?',
    answer:
      'हाँ। एडवांस्ड ऑप्शंस में sessions सेट करें और "Avoid repeat pairings" चालू करें ताकि वही लोग बार-बार साथ न आएँ।',
  },
  workspace: {
    question: 'Scenario Editor क्या है?',
    answer:
      'Scenario Editor उन controls के लिए है जो इस page पर नहीं हैं: partial attendance, group-specific capacities, session-specific group sizes, session-specific constraints, soft constraints with configurable weights, pair meeting count targets, advanced constraint tuning, solver settings, previous results और detailed analysis।',
  },
};

function createContent({
  title,
  description,
  eyebrow,
  heroTitle,
  subhead,
  audienceSummary,
  faqEntries,
}: {
  title: string;
  description: string;
  eyebrow: string;
  heroTitle: string;
  subhead: string;
  audienceSummary: string;
  faqEntries: ToolPageLocalizedContent['faqEntries'];
}): ToolPageLocalizedContent {
  return {
    seo: { title, description },
    hero: {
      eyebrow,
      title: heroTitle,
      subhead,
      audienceSummary,
      trustBullets: TRUST_BULLETS,
    },
    optimizerCta: {
      eyebrow: 'और भी ज़्यादा control चाहिए?',
      title: 'पूरा Scenario Editor खोलें।',
      featureBullets: OPTIMIZER_FEATURES,
      buttonLabel: 'Scenario Editor खोलें',
      supportingText: 'जब इस पेज से ज़्यादा control चाहिए तब इस्तेमाल करें। Participants, groups, sessions और rules साथ चले जाते हैं।',
    },
    faqEntries,
    chrome: CHROME,
    useCasesSection: USE_CASES_SECTION,
  };
}

export const HI_TOOL_PAGE_CONTENT: Partial<Record<ToolPageKey, ToolPageLocalizedContent>> = {
  home: createContent({
    title: 'रैंडम ग्रुप जनरेटर — नामों को तुरंत ग्रुप्स में बाँटें | GroupMixer',
    description:
      'मुफ़्त रैंडम ग्रुप जनरेटर। नाम पेस्ट करें, ग्रुप की संख्या चुनें और कुछ ही सेकंड में संतुलित ग्रुप बनाएँ। साइन-अप की ज़रूरत नहीं। आवश्यकता हो तो constraints भी जोड़ें।',
    eyebrow: 'क्लासरूम, वर्कशॉप और इवेंट्स के लिए',
    heroTitle: 'रैंडम ग्रुप जनरेटर',
    subhead: 'नाम पेस्ट करें, ग्रुप्स की संख्या चुनें और तुरंत जनरेट करें।',
    audienceSummary: '',
    faqEntries: [
      {
        question: 'मैं नामों की सूची को रैंडम ग्रुप्स में कैसे बाँटूँ?',
        answer:
          'नामों को एक-एक लाइन में पेस्ट करें, ग्रुप्स की संख्या या प्रति ग्रुप लोगों की संख्या सेट करें, फिर "Generate Groups" दबाएँ। ग्रुप्स तुरंत दिखेंगे।',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
      FAQS.multiSession,
      FAQS.workspace,
    ],
  }),
  'random-group-generator': createContent({
    title: 'रैंडम ग्रुप जनरेटर — नामों की सूची से ग्रुप बनाएँ | GroupMixer',
    description:
      'मुफ़्त रैंडम ग्रुप जनरेटर। नामों की सूची पेस्ट करें, कितने ग्रुप चाहिए चुनें और तुरंत बाँटें। क्लासरूम, वर्कशॉप और इवेंट्स के लिए उपयोगी।',
    eyebrow: 'तेज़ रैंडम स्प्लिट के लिए',
    heroTitle: 'रैंडम ग्रुप जनरेटर',
    subhead:
      'नामों की सूची पेस्ट करें, जितने ग्रुप चाहिए चुनें और तुरंत बाँटें। बिना साइन-अप, बिना सर्वर—सब कुछ आपके ब्राउज़र में।',
    audienceSummary:
      'जब आपको कक्षा गतिविधियों, वर्कशॉप ब्रेकआउट्स या सरल इवेंट लॉजिस्टिक्स के लिए तेज़ और आसान ग्रुपिंग चाहिए हो।',
    faqEntries: [
      {
        question: 'रैंडम ग्रुप जनरेटर कैसे काम करता है?',
        answer:
          'नामों को टेक्स्ट बॉक्स में पेस्ट करें, ग्रुप्स की संख्या या ग्रुप साइज चुनें और Generate दबाएँ। GroupMixer तुरंत संतुलित रैंडम विभाजन करता है।',
      },
      {
        question: 'क्या मैं ग्रुप्स की संख्या या ग्रुप साइज नियंत्रित कर सकता हूँ?',
        answer:
          'हाँ। आप तय कर सकते हैं कि कुल कितने ग्रुप हों या हर ग्रुप में कितने लोग हों।',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'random-team-generator': createContent({
    title: 'रैंडम टीम जनरेटर — जल्दी संतुलित टीमें बनाएँ | GroupMixer',
    description:
      'मुफ़्त रैंडम टीम जनरेटर। नाम पेस्ट करें और तुरंत संतुलित टीमें बनाएँ। ज़रूरत पड़ने पर स्किल balancing, साथ रखने या अलग रखने वाले नियम जोड़ें।',
    eyebrow: 'कोच, लीड्स और फैसिलिटेटर्स के लिए',
    heroTitle: 'रैंडम टीम जनरेटर',
    subhead:
      'कुछ ही सेकंड में रैंडम टीमें बनाएँ। नाम पेस्ट करें, टीमों की संख्या चुनें और जनरेट करें। ज़रूरत हो तो fairness rules भी जोड़ें।',
    audienceSummary:
      'ऐसी टीम गतिविधियों के लिए बनाया गया है जहाँ सिर्फ़ randomness नहीं, बल्कि fairness और roles/skills का सही वितरण भी ज़रूरी हो।',
    faqEntries: [
      {
        question: 'मैं रैंडम टीमें कैसे बनाऊँ?',
        answer:
          'प्रतिभागियों के नाम पेस्ट करें, टीमों की संख्या तय करें और Generate दबाएँ। GroupMixer तुरंत संतुलित टीमें बना देता है।',
      },
      {
        question: 'क्या मैं स्किल या रोल के आधार पर टीम संतुलित कर सकता हूँ?',
        answer:
          'हाँ। CSV मोड पर जाएँ, "role" या "skill" जैसे कॉलम जोड़ें और फिर balance-by-attribute विकल्प का उपयोग करें।',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'breakout-room-generator': createContent({
    title: 'ब्रेकआउट रूम जनरेटर — प्रतिभागियों को रूम्स में बाँटें | GroupMixer',
    description:
      'मुफ़्त ब्रेकआउट रूम जनरेटर। नाम पेस्ट करें और प्रतिभागियों को तुरंत breakout rooms में बाँटें। क्लास, वर्कशॉप और रिमोट मीटिंग्स के लिए उपयुक्त।',
    eyebrow: 'Zoom, ट्रेनिंग और वर्कशॉप्स के लिए',
    heroTitle: 'ब्रेकआउट रूम जनरेटर',
    subhead:
      'प्रतिभागियों को तुरंत ब्रेकआउट रूम्स में बाँटें। नाम पेस्ट करें, रूम्स की संख्या तय करें और जनरेट करें।',
    audienceSummary:
      'जब आपको तेज़ रूम assignment चाहिए हो लेकिन साथ ही multiple rounds और कम repetition भी ज़रूरी हों।',
    faqEntries: [
      {
        question: 'मैं ब्रेकआउट रूम्स कैसे बनाऊँ?',
        answer:
          'प्रतिभागियों के नाम पेस्ट करें, रूम्स की संख्या चुनें और Generate दबाएँ। GroupMixer सबको तुरंत rooms में बाँट देता है।',
      },
      {
        question: 'क्या मैं कई राउंड में लोगों को घुमा सकता हूँ?',
        answer:
          'हाँ। Advanced options में sessions सेट करें और repeat pairings से बचने वाला विकल्प चालू करें।',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'workshop-group-generator': createContent({
    title: 'वर्कशॉप ग्रुप जनरेटर — सेशंस के लिए छोटे ग्रुप बनाएँ | GroupMixer',
    description:
      'मुफ़्त वर्कशॉप ग्रुप जनरेटर। गतिविधियों, ब्रेकआउट्स और multi-round sessions के लिए प्रतिभागियों को छोटे ग्रुप्स में बाँटें। ज़रूरत हो तो constraints जोड़ें।',
    eyebrow: 'सहयोगी सेशंस चलाने वाले फैसिलिटेटर्स के लिए',
    heroTitle: 'वर्कशॉप ग्रुप जनरेटर',
    subhead:
      'वर्कशॉप ग्रुप्स कुछ ही सेकंड में बनाएँ। पहले आसान तरीके से शुरू करें, फिर राउंड्स, balancing या pairing rules जोड़ें।',
    audienceSummary:
      'उन वर्कशॉप्स के लिए उपयोगी जहाँ ग्रुप composition चर्चा की गुणवत्ता, ऊर्जा और नए लोगों से मिलने पर असर डालती है।',
    faqEntries: [
      {
        question: 'मैं वर्कशॉप ग्रुप्स कैसे बनाऊँ?',
        answer:
          'प्रतिभागियों के नाम पेस्ट करें, ग्रुप्स की संख्या या प्रति ग्रुप लोगों की संख्या सेट करें और Generate दबाएँ।',
      },
      {
        question: 'क्या मैं वर्कशॉप राउंड्स के बीच लोगों को घुमा सकता हूँ?',
        answer:
          'हाँ। Multiple sessions और avoid-repeat options का उपयोग करें ताकि प्रतिभागी नई-नई लोगों से मिलें।',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'student-group-generator': createContent({
    title: 'स्टूडेंट ग्रुप जनरेटर — क्लासरूम ग्रुप्स जल्दी बनाएँ | GroupMixer',
    description:
      'मुफ़्त स्टूडेंट ग्रुप जनरेटर। क्लास लिस्ट पेस्ट करें और कुछ ही सेकंड में संतुलित छात्र समूह बनाएँ। कुछ छात्रों को साथ या अलग रखने के नियम भी जोड़ें।',
    eyebrow: 'शिक्षकों और क्लास गतिविधियों के लिए',
    heroTitle: 'स्टूडेंट ग्रुप जनरेटर',
    subhead:
      'अपनी क्लास लिस्ट पेस्ट करें और तुरंत स्टूडेंट ग्रुप्स बनाएँ। ज़रूरत होने पर साथ रखने या अलग रखने वाले नियम भी जोड़ें।',
    audienceSummary:
      'उन शिक्षकों के लिए जो जल्दी समूह बनाना चाहते हैं लेकिन pairings और fairness पर नियंत्रण भी बनाए रखना चाहते हैं।',
    faqEntries: [
      {
        question: 'मैं स्टूडेंट ग्रुप्स कैसे बनाऊँ?',
        answer:
          'छात्रों के नाम एक-एक लाइन में पेस्ट करें, ग्रुप्स की संख्या चुनें और Generate दबाएँ। GroupMixer बाकी काम कर देता है।',
      },
      {
        question: 'क्या मैं कुछ छात्रों को साथ या अलग रख सकता हूँ?',
        answer:
          'हाँ। Advanced options में keep-together और avoid-pairing rules सेट करें।',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'speed-networking-generator': createContent({
    title: 'स्पीड नेटवर्किंग जनरेटर — कई राउंड, कम दोहराव | GroupMixer',
    description:
      'मुफ़्त स्पीड नेटवर्किंग जनरेटर। कई राउंड बनाएँ जहाँ प्रतिभागी हर बार नए लोगों से मिलें। दोहराए गए pairings अपने-आप कम करें।',
    eyebrow: 'मिक्सर्स, मीटअप्स और नेटवर्किंग सेशंस के लिए',
    heroTitle: 'स्पीड नेटवर्किंग जनरेटर',
    subhead:
      'कई नेटवर्किंग राउंड बनाएँ जहाँ लोग हर बार नए चेहरों से मिलें। नाम पेस्ट करें, राउंड्स सेट करें और repetition कम करें।',
    audienceSummary:
      'उन structured networking formats के लिए सबसे बेहतर जहाँ लक्ष्य नए connections बनाना हो, न कि बार-बार वही छोटे ग्रुप।',
    faqEntries: [
      {
        question: 'स्पीड नेटवर्किंग जनरेटर कैसे काम करता है?',
        answer:
          'प्रतिभागियों के नाम पेस्ट करें, rounds की संख्या सेट करें और repeat pairings से बचने वाला विकल्प चालू करें। GroupMixer हर राउंड के लिए नए ग्रुप्स बनाने की कोशिश करता है।',
      },
      {
        question: 'क्या मैं नेटवर्किंग ग्रुप साइज नियंत्रित कर सकता हूँ?',
        answer:
          'हाँ। आप प्रति राउंड ग्रुप्स की संख्या या प्रति ग्रुप लोगों की संख्या तय कर सकते हैं।',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.workspace,
    ],
  }),
};
