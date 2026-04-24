import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  'निजी (सारी प्रोसेसिंग आपके ब्राउज़र में)',
  'बिना साइन-अप',
  'कुछ ही सेकंड में परिणाम',
];

const OPTIMIZER_FEATURES = [
  'Partial attendance',
  'Custom capacities by group and session',
  'Session-specific rules',
  'Weighted soft constraints',
  'Pair encounter targets',
  'Advanced constraint tuning',
  'Solver settings',
  'Result analysis',
];

const OPTIMIZER_FEATURE_EXPLANATIONS = [
  'Choose which participants attend which sessions instead of assuming everyone is present in every round.',
  'Set capacities per group and override them per session when room sizes or staffing changes.',
  'Apply together, apart, pinned, repeat, and balance rules only to the sessions where they matter.',
  'Add preferences that may be broken when needed, then tune their weights against other goals.',
  'Target how often specific pairs should meet, including exact, minimum, or maximum encounter counts.',
  'Fine-tune repeat limits, attribute-balance modes, penalties, and other constraint details.',
  'Adjust runtime limits, deterministic seeds, solver family, and other optimization settings.',
  'Inspect score breakdowns, constraint compliance, penalties, and saved results in more detail.',
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
      'Scenario Editor उन controls के लिए है जो इस page पर नहीं हैं: partial attendance, custom capacities by group and session, session-specific constraints, weighted soft constraints, pair encounter targets, advanced constraint tuning, solver settings, previous results और result analysis।',
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
      featureExplanations: OPTIMIZER_FEATURE_EXPLANATIONS,
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
};
