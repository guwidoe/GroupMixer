import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  'Keep together or apart',
  'Multiple rounds',
  'Balance by attribute',
];

const HOME_FEATURE_SUMMARY =
  'Paste names to generate random, balanced groups. Keep people together or apart, balance by gender or skill, and create multiple rounds with minimal repeats.';

const OPTIMIZER_FEATURES = [
  'Partial attendance',
  'Custom group capacities',
  'Session-specific constraints',
  'Weighted soft constraints',
  'Pair encounter targets',
  'Advanced constraint tuning',
  'Solver settings',
  'Result analysis',
];

const OPTIMIZER_FEATURE_EXPLANATIONS = [
  'Set which participants attend which sessions instead of assuming everyone is present every round.',
  'Give each group its own capacity and override those capacities for specific sessions when room sizes or staffing change.',
  'Apply together, apart, pinned, repeat, and balance rules only to the sessions where they matter.',
  'Add preferences that can be violated when needed, then tune their weights relative to other goals.',
  'Target how often specific pairs should meet across the schedule, including exact, minimum, or maximum encounter counts.',
  'Fine-tune repeat limits, attribute-balance modes, penalties, and other constraint details beyond the landing-page controls.',
  'Adjust runtime limits, deterministic seeds, solver family, and other optimization settings.',
  'Inspect score breakdowns, constraint compliance, penalties, and saved results in more detail.',
];

const CHROME = {
  expertWorkspaceLabel: 'Scenario editor',
  faqHeading: 'Frequently asked questions',
  footerTagline: 'GroupMixer - Group generator and optimizer',
  feedbackLabel: 'Feedback',
  privacyNote: 'Runs in your browser.',
  scrollHint: 'Scroll down for use cases & FAQ',
};

const USE_CASES_SECTION = {
  title: 'Works for classrooms, workshops, and events',
  description:
    'Start with a simple random split. When you need more control, GroupMixer grows with you.',
  cards: [
    {
      title: 'Classroom groups',
      body: 'Teachers paste a student roster and create balanced groups in seconds. No learning curve.',
    },
    {
      title: 'Workshop breakout rooms',
      body: 'Split participants into breakout rooms for a single session or rotate across multiple rounds.',
    },
    {
      title: 'Speed networking',
      body: 'Generate multiple rounds where people meet new faces each time. Minimize repeat pairings automatically.',
    },
    {
      title: 'Team projects',
      body: 'Divide a class or team into project groups. Optionally balance by skill, role, or department.',
    },
    {
      title: 'Conference sessions',
      body: 'Assign attendees to parallel tracks or discussion tables while respecting constraints.',
    },
    {
      title: 'Social mixers',
      body: 'Plan icebreaker rounds where everyone meets someone new. Keep certain people together or apart.',
    },
  ],
};

const FAQS = {
  free: {
    question: 'Is GroupMixer free?',
    answer:
      'Yes. GroupMixer is completely free to use. If you find it useful and want to support development, you can donate through GitHub Sponsors.',
    link: {
      label: 'Donate on GitHub Sponsors.',
      href: 'https://github.com/sponsors/guwidoe',
    },
  },
  limits: {
    question: 'Are there any usage limits?',
    answer:
      'No. There are no usage limits on GroupMixer.',
  },
  account: {
    question: 'Do I need an account?',
    answer:
      'No. You do not need an account or sign-up. Paste names, adjust the setup, and generate groups right away.',
  },
  privacy: {
    question: 'Where is my data processed?',
    answer:
      'In your browser on this device. Your participant list and all other data you enter stays on your device while you work.',
  },
  offline: {
    question: 'Does it work offline after first load?',
    answer:
      'Yes. After the page has loaded, you can keep using GroupMixer offline in your browser.',
  },
  constraints: {
    question: 'Can I keep people together or apart?',
    answer:
      'Yes. Open the advanced options to add keep-together groups, avoid-pairing rules, multiple sessions, and attribute balancing.',
  },
  attributeBalance: {
    question: 'Can I balance by role, skill, gender, or department?',
    answer:
      'Yes. Add attributes such as role, skill, gender, or department to your participants, then choose which attribute to balance across groups.',
  },
  fixedPeople: {
    question: 'Can I fix certain people to groups?',
    answer:
      'Yes. Use Pinned people in the advanced options to pin specific people to a specific group across all sessions. This is useful for leaders, presenters, or anyone who must stay in a known group.',
  },
  multiSession: {
    question: 'Can I avoid repeat pairings across rounds?',
    answer:
      'Yes. Set the number of sessions and enable "Avoid repeat pairings" to cut down on repeats across rounds.',
  },
  workspace: {
    question: 'When should I use the scenario editor?',
    answer:
      'Use the scenario editor for controls this page does not expose, such as partial attendance, custom capacities by group and session, session-specific constraints, weighted soft constraints, pair encounter targets, advanced constraint tuning, solver settings, previous results, and result analysis.',
  },
};

const CORE_TRUST_FAQS = [FAQS.free, FAQS.limits, FAQS.account, FAQS.privacy, FAQS.offline];
const CONTROL_FAQS = [FAQS.constraints, FAQS.attributeBalance, FAQS.fixedPeople, FAQS.multiSession, FAQS.workspace];

function createContent({
  title,
  description,
  eyebrow,
  heroTitle,
  subhead,
  audienceSummary,
  trustBullets = TRUST_BULLETS,
  optimizerCta,
  useCasesSection = USE_CASES_SECTION,
  faqEntries,
}: {
  title: string;
  description: string;
  eyebrow: string;
  heroTitle: string;
  subhead: string;
  audienceSummary: string;
  trustBullets?: string[];
  optimizerCta?: ToolPageLocalizedContent['optimizerCta'];
  useCasesSection?: ToolPageLocalizedContent['useCasesSection'];
  faqEntries: ToolPageLocalizedContent['faqEntries'];
}): ToolPageLocalizedContent {
  return {
    seo: { title, description },
    hero: {
      eyebrow,
      title: heroTitle,
      subhead,
      audienceSummary,
      trustBullets,
    },
    optimizerCta: optimizerCta ?? {
      eyebrow: 'Need even more control?',
      title: 'Go to scenario editor.',
      featureBullets: OPTIMIZER_FEATURES,
      featureExplanations: OPTIMIZER_FEATURE_EXPLANATIONS,
      buttonLabel: 'Open scenario editor',
      supportingText: 'Your participants, rules, and configuration come with you.',
    },
    faqEntries,
    chrome: CHROME,
    useCasesSection,
  };
}

export const EN_TOOL_PAGE_CONTENT: Partial<Record<ToolPageKey, ToolPageLocalizedContent>> = {
  home: createContent({
    title: 'Group Generator - Random, Balanced & Multi-Round',
    description: HOME_FEATURE_SUMMARY,
    eyebrow: 'For classrooms, workshops, and events',
    heroTitle: 'Random Group Generator',
    subhead: HOME_FEATURE_SUMMARY,
    audienceSummary: '',
    trustBullets: [],
    faqEntries: [
      {
        question: 'How do I split a list of names into random groups?',
        answer:
          'Paste your names (one per line) into the text box, set the number of groups or people per group, and click "Generate Groups". Your groups appear instantly.',
      },
      ...CORE_TRUST_FAQS,
      ...CONTROL_FAQS,
    ],
  }),
};
