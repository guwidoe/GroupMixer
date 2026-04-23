import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';
import { EN_TECHNICAL_TOOL_PAGE_CONTENT } from './enTechnical';

const TRUST_BULLETS = [
  'Keep together or apart',
  'Multiple rounds',
  'Balance by attribute',
];

const HOME_FEATURE_SUMMARY =
  'Paste names to generate random, balanced groups. Keep people together or apart, balance by gender or skill, and create multiple rounds with minimal repeats.';

const OPTIMIZER_FEATURES = [
  'Partial attendance',
  'Session-specific groups',
  'Session-specific rules',
  'Hard + soft constraints',
  'Advanced attribute balancing',
  'Solver tuning',
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

const ADVANCED_SECTION = {
  title: 'Need more control?',
  description:
    "GroupMixer is more than a random shuffler. When simple groups aren't enough, unlock advanced rules without switching tools.",
  cards: [
    {
      title: 'Keep certain people together',
      body: 'Ensure friends, co-workers, or pre-assigned pairs always land in the same group.',
    },
    {
      title: 'Keep certain people apart',
      body: 'Prevent specific people from being grouped together — useful for conflict avoidance or diversity.',
    },
    {
      title: 'Avoid repeat pairings',
      body: "Run multiple rounds where the same two people don't end up together again.",
    },
    {
      title: 'Balance groups by attribute',
      body: 'Use CSV input to balance groups by role, skill level, gender, department, or any custom column.',
    },
  ],
  buttonLabel: 'Open scenario editor',
  supportingText:
    'The scenario editor gives you full control over sessions, constraints, solver settings, and detailed result analysis.',
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
  csvBalance: {
    question: 'Can I balance by role, skill, gender, or department from CSV?',
    answer:
      'Yes. Switch to CSV input mode, add columns such as role, skill, gender, or department, then choose which attribute to balance across groups.',
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
      'Use the scenario editor when the quick setup is not enough. It gives you more control over sessions, constraints, solver settings, previous results, and detailed analysis.',
  },
};

const CORE_TRUST_FAQS = [FAQS.free, FAQS.limits, FAQS.account, FAQS.privacy, FAQS.offline];
const CONTROL_FAQS = [FAQS.constraints, FAQS.csvBalance, FAQS.fixedPeople, FAQS.multiSession, FAQS.workspace];

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
  advancedSection = ADVANCED_SECTION,
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
  advancedSection?: ToolPageLocalizedContent['advancedSection'];
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
      title: 'Open the full scenario editor.',
      featureBullets: OPTIMIZER_FEATURES,
      buttonLabel: 'Open scenario editor',
      supportingText:
        'Bring this setup with you, then fine-tune partial attendance, session-specific groups and constraints, hard vs. soft rules, and solver details.',
    },
    faqEntries,
    chrome: CHROME,
    useCasesSection,
    advancedSection,
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
  'random-group-generator': createContent({
    title: 'Random Group Generator - Split Names into Groups',
    description:
      'Split a list of names into groups. Set group count or group size, then add balancing, pairing rules, or multiple rounds when needed.',
    eyebrow: 'For quick random splits',
    heroTitle: 'Random Group Generator',
    subhead:
      'Paste names, choose group count or group size, and split the list right away.',
    audienceSummary:
      'Splits any name list into groups for class activities, workshop breakouts, and quick event logistics.',
    faqEntries: [
      {
        question: 'How does the random group generator work?',
        answer:
          'Paste names into the text box (one per line), set the number of groups or the size per group, and click Generate. GroupMixer creates a balanced random split instantly.',
      },
      {
        question: 'Can I control the number of groups or group size?',
        answer:
          'Yes. You can either set a fixed number of groups or specify how many people you want per group. GroupMixer handles the math for you.',
      },
      ...CORE_TRUST_FAQS,
      FAQS.constraints,
      FAQS.csvBalance,
      FAQS.fixedPeople,
    ],
  }),
  'random-team-generator': createContent({
    title: 'Random Team Generator - Create Balanced Teams',
    description:
      'Turn a list of names into teams. Balance skills or roles, keep people together or apart, generate multiple rounds with minimal repeats.',
    eyebrow: 'For coaches, leads, and facilitators',
    heroTitle: 'Random Team Generator',
    subhead:
      'Paste names, choose team count, and generate teams. Add balancing rules when the split needs more structure.',
    audienceSummary:
      'Build more balanced teams by spreading skills, roles, or any other attribute across the groups.',
    faqEntries: [
      {
        question: 'How do I create random teams?',
        answer:
          'Paste your participant names, set the number of teams, and click Generate. GroupMixer splits them into balanced teams instantly.',
      },
      {
        question: 'Can I balance teams by skill or role?',
        answer:
          'Yes. Switch to CSV input mode and add columns like "role" or "skill". Then use the balance-by-attribute option to distribute those attributes evenly.',
      },
      ...CORE_TRUST_FAQS,
      FAQS.csvBalance,
      FAQS.fixedPeople,
      FAQS.multiSession,
    ],
  }),
  'random-pair-generator': createContent({
    title: 'Random Pair Generator - Turn a List of Names into Pairs',
    description:
      'Turn a list of names into pairs. Avoid certain pairings and avoid repeats across sessions.',
    eyebrow: 'For partner work and pair rotations',
    heroTitle: 'Random Pair Generator',
    subhead:
      'Paste names and generate pairs. Avoid certain pairings and prevent repeats across sessions.',
    audienceSummary:
      'For partner work, peer feedback, drills, and short practice rounds.',
    faqEntries: [
      {
        question: 'How do I make random pairs from a list of names?',
        answer:
          'Paste names into the text box, switch the grouping size to 2 people per group if needed, and click Generate. GroupMixer creates partner pairs instantly.',
      },
      {
        question: 'Can I reshuffle pairs for a second round?',
        answer:
          'Yes. Generate again to reshuffle, or use multiple sessions with avoid-repeat pairings when you want fresh partners across rounds.',
      },
      ...CORE_TRUST_FAQS,
      FAQS.multiSession,
      FAQS.fixedPeople,
    ],
  }),
  'team-shuffle-generator': createContent({
    title: 'Team Shuffle Generator - Reshuffle Teams and Keep Them Balanced',
    description:
      'Reshuffle the same roster into new teams. Keep teams balanced by role, skill, or any attribute.',
    eyebrow: 'For fresh team mixes without the admin work',
    heroTitle: 'Team Shuffle Generator',
    subhead:
      'Reshuffle the same roster into fresh teams. Keep the mix balanced and add pairing rules when needed.',
    audienceSummary:
      'Reshuffles the same roster for drills, workshops, and repeat activities where each round needs a fresh mix.',
    faqEntries: [
      {
        question: 'What is a team shuffle generator?',
        answer:
          'It is a fast way to remix the same participants into new teams. Paste your names, choose the number of teams, and GroupMixer produces a fresh split instantly.',
      },
      {
        question: 'Can I keep a reshuffle fair instead of fully random?',
        answer:
          'Yes. You can balance by attributes such as skill, role, or department so the reshuffled teams stay more even.',
      },
      ...CORE_TRUST_FAQS,
      FAQS.constraints,
      FAQS.csvBalance,
      FAQS.fixedPeople,
    ],
  }),
  'breakout-room-generator': createContent({
    title: 'Breakout Room Generator - Assign Participants to Rooms',
    description:
      'Assign participants to breakout rooms. Choose room count, rotate across rounds, and minimize repeat pairings.',
    eyebrow: 'For Zoom calls, trainings, and workshops',
    heroTitle: 'Breakout Room Generator',
    subhead:
      'Paste names, set room count, and assign participants to breakout rooms. Add rounds, balance gender, experience or other attributes.',
    audienceSummary:
      'Assigns participants to breakout rooms, rotates them across rounds, and keep the room mix more even.',
    faqEntries: [
      {
        question: 'How do I create breakout rooms?',
        answer:
          'Paste participant names, choose the number of rooms, and click Generate. GroupMixer assigns everyone to rooms instantly.',
      },
      {
        question: 'Can I rotate people across multiple breakout rounds?',
        answer:
          'Yes. Set the number of sessions in the advanced options and enable "Avoid repeat pairings" so people meet new faces each round.',
      },
      ...CORE_TRUST_FAQS,
      FAQS.constraints,
      FAQS.fixedPeople,
      FAQS.multiSession,
    ],
  }),
  'workshop-group-generator': createContent({
    title: 'Workshop Group Generator - Create Small Groups for Sessions',
    description:
      'Create workshop groups for breakouts, discussions, and rotating sessions. Keep certain people together or apart and cut down on repeats across rounds.',
    eyebrow: 'For facilitators running collaborative sessions',
    heroTitle: 'Workshop Group Generator',
    subhead:
      'Set up workshop groups for breakouts, table work, and rotating sessions.',
    audienceSummary:
      'Create workshop groups for breakouts and rotating sessions while keeping important pairing rules intact.',
    faqEntries: [
      {
        question: 'How do I create workshop groups?',
        answer:
          'Paste participant names, set the number of groups or people per group, and click Generate. GroupMixer creates workshop-ready groups instantly.',
      },
      {
        question: 'Can I rotate people between workshop rounds?',
        answer:
          'Yes. Use multiple sessions and avoid-repeat pairings to keep workshop participants meeting new people throughout the agenda.',
      },
      ...CORE_TRUST_FAQS,
      FAQS.constraints,
      FAQS.csvBalance,
      FAQS.multiSession,
    ],
  }),
  'student-group-generator': createContent({
    title: 'Student Group Generator - Create Classroom Groups',
    description:
      'Student group generator for teachers. Paste your class roster and create balanced student groups in seconds. Add rules for keeping students together or apart or balancing gender, skill level, or any attribute.',
    eyebrow: 'For teachers and classroom activities',
    heroTitle: 'Student Group Generator',
    subhead:
      'Paste a class roster and build groups. Add pairing rules or balancing when the activity needs more structure.',
    audienceSummary:
      'Builds classroom groups while letting you control pairings and balance by skill, gender, or any other attribute.',
    faqEntries: [
      {
        question: 'How do I create student groups?',
        answer:
          'Paste student names (one per line), choose the number of groups, and click Generate. GroupMixer handles the rest.',
      },
      {
        question: 'Can I keep certain students together or apart?',
        answer:
          'Yes. Open the advanced options to specify keep-together and avoid-pairing rules. The solver respects these when creating groups.',
      },
      ...CORE_TRUST_FAQS,
      FAQS.csvBalance,
      FAQS.fixedPeople,
      FAQS.multiSession,
    ],
  }),
  'icebreaker-group-generator': createContent({
    title: 'Icebreaker Group Generator - Quick Groups for Warm-Ups',
    description:
      'Icebreaker group generator. Make quick small groups or pairs for workshops, classes, and events. Great for warm-ups, introductions, and networking starters.',
    eyebrow: 'For warm-ups, introductions, and energizers',
    heroTitle: 'Icebreaker Group Generator',
    subhead:
      'Set up small groups or pairs for warm-ups, introductions, and short conversations.',
    audienceSummary:
      'For quick warm-ups at the start of a class, workshop, meetup, or event.',
    faqEntries: [
      {
        question: 'How do I make groups for an icebreaker activity?',
        answer:
          'Paste names, choose the number of groups or people per group, and click Generate. GroupMixer gives you small groups that are ready for a quick activity.',
      },
      {
        question: 'Can I use this for multiple icebreaker rounds?',
        answer:
          'Yes. Set multiple sessions and avoid repeat pairings so people meet different participants across short rounds.',
      },
      ...CORE_TRUST_FAQS,
      FAQS.multiSession,
      FAQS.fixedPeople,
    ],
  }),
  'speed-networking-generator': createContent({
    title: 'Speed Networking Generator - Multiple Rounds with Fewer Repeats',
    description:
      'Plan speed networking rounds where participants keep meeting new people. Set group size, round count, and reduce repeat pairings.',
    eyebrow: 'For mixers, meetups, and networking sessions',
    heroTitle: 'Speed Networking Generator',
    subhead:
      'Create round-based networking groups so participants keep meeting new people instead of repeating the same conversations.',
    audienceSummary:
      'Generates round-based networking groups that maximize new contacts and cut down on repeated pairings.',
    faqEntries: [
      {
        question: 'How does the speed networking generator work?',
        answer:
          'Paste participant names, set the number of rounds (sessions), and enable "Avoid repeat pairings". GroupMixer creates groups for each round while minimizing how often the same people meet.',
      },
      {
        question: 'Can I control group size for networking rounds?',
        answer:
          'Yes. Set either the number of groups per round or the people per group. GroupMixer calculates the rest.',
      },
      ...CORE_TRUST_FAQS,
      FAQS.fixedPeople,
      FAQS.workspace,
    ],
  }),
  'group-generator-with-constraints': createContent({
    title: 'Group Generator with Constraints - Keep Together, Keep Apart, Balance',
    description:
      'Create groups with rules. Keep people together, keep people apart, balance attributes, and avoid repeat pairings across rounds.',
    eyebrow: 'For higher-stakes group planning',
    heroTitle: 'Group Generator with Constraints',
    subhead:
      'Create groups with rules. Keep people together, keep them apart, balance by attribute, and reduce repeat pairings.',
    audienceSummary:
      'Builds groups around the rules first: together/apart constraints, attribute balancing, and repeated-round planning.',
    faqEntries: [
      {
        question: 'What constraints can I set?',
        answer:
          'You can keep certain people together, keep others apart, avoid repeat pairings across sessions, and balance groups by any CSV column (like role, skill, or department).',
      },
      {
        question: 'Do I need the scenario editor for constraints?',
        answer:
          'No. Basic constraints are available right here in the advanced options. The scenario editor adds deeper control for complex planning.',
      },
      ...CORE_TRUST_FAQS,
      FAQS.csvBalance,
      FAQS.fixedPeople,
      FAQS.workspace,
    ],
  }),
  ...EN_TECHNICAL_TOOL_PAGE_CONTENT,
};
