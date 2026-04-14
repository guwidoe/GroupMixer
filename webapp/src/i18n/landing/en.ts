import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  'Private (processed in your browser)',
  'No sign-up',
  'Results in seconds',
];

const OPTIMIZER_FEATURES = [
  'Keep together',
  'Avoid pairings',
  'Multiple rounds',
  'Maximize mixing',
  'Balance genders',
  'Balance any attribute',
  'Tweak results',
];

const CHROME = {
  expertWorkspaceLabel: 'Scenario editor',
  faqHeading: 'Frequently asked questions',
  footerTagline: 'GroupMixer — Free random group generator',
  feedbackLabel: 'Feedback',
  privacyNote: 'All processing happens locally in your browser.',
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
    question: 'Is GroupMixer free to use?',
    answer:
      'Yes. GroupMixer is completely free. There is no sign-up, no account required, and no usage limits.',
  },
  privacy: {
    question: 'Does my data stay private?',
    answer:
      'Yes. All processing happens locally in your browser. Your names and group data are never sent to a server. You can use this page without internet connection once it is loaded.',
  },
  constraints: {
    question: 'Can I add rules like keep-together or keep-apart?',
    answer:
      'Yes. Open the advanced options to add keep-together groups, avoid-pairing rules, multiple sessions, and attribute balancing. Or use the scenario editor for full control.',
  },
  multiSession: {
    question: 'Can I create groups for multiple rounds?',
    answer:
      'Yes. Set the number of sessions in the advanced options and enable "Avoid repeat pairings" to minimize how often the same people end up together.',
  },
  workspace: {
    question: 'What is the scenario editor?',
    answer:
      'The scenario editor gives you detailed control over sessions, constraints, solver settings, warm-start from previous results, and full result analysis. It uses the same powerful solver engine.',
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
      eyebrow: 'Want to do better than random?',
      title: 'Use the full group optimizer.',
      featureBullets: OPTIMIZER_FEATURES,
      buttonLabel: 'Open scenario editor',
      supportingText: 'Your inputs from this page come with you.',
    },
    faqEntries,
    chrome: CHROME,
    useCasesSection: USE_CASES_SECTION,
    advancedSection: ADVANCED_SECTION,
  };
}

export const EN_TOOL_PAGE_CONTENT: Record<ToolPageKey, ToolPageLocalizedContent> = {
  home: createContent({
    title: 'Random Group Generator — Split Names into Teams Instantly | GroupMixer',
    description:
      'Free random group generator. Paste names, pick group count, and generate balanced groups in seconds. No sign-up required. Add constraints when you need them.',
    eyebrow: 'For classrooms, workshops, and events',
    heroTitle: 'Random Group Generator',
    subhead:
      'Paste names, choose the number of groups, and generate instantly.',
    audienceSummary: '',
    faqEntries: [
      {
        question: 'How do I split a list of names into random groups?',
        answer:
          'Paste your names (one per line) into the text box, set the number of groups or people per group, and click "Generate Groups". Your groups appear instantly.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
      FAQS.multiSession,
      FAQS.workspace,
    ],
  }),
  'random-group-generator': createContent({
    title: 'Random Group Generator — Create Groups from a List of Names | GroupMixer',
    description:
      'Free random group generator. Paste a list of names, choose how many groups, and split them instantly. Works for classrooms, workshops, and events.',
    eyebrow: 'For quick random splits',
    heroTitle: 'Random Group Generator',
    subhead:
      'Paste a list of names, choose how many groups you want, and split them instantly. No sign-up, no server — everything runs in your browser.',
    audienceSummary:
      'Ideal when you need a fast, low-friction group maker for class activities, workshop breakouts, and simple event logistics.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'random-team-generator': createContent({
    title: 'Random Team Generator — Create Balanced Teams Fast | GroupMixer',
    description:
      'Free random team generator. Paste names and create balanced teams instantly. Add rules for skill balancing, keep-together, and keep-apart when needed.',
    eyebrow: 'For coaches, leads, and facilitators',
    heroTitle: 'Random Team Generator',
    subhead:
      'Create random teams in seconds. Paste names, pick team count, and generate. Add balancing rules when you need fairer teams.',
    audienceSummary:
      'Built for team-based activities where fairness matters more than pure randomness, especially when roles or skills should be spread out.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'random-pair-generator': createContent({
    title: 'Random Pair Generator — Make Pairs from a List of Names | GroupMixer',
    description:
      'Free random pair generator. Paste names, create random pairs instantly, and reshuffle in seconds. Great for classrooms, workshops, and partner activities.',
    eyebrow: 'For partner work and pair rotations',
    heroTitle: 'Random Pair Generator',
    subhead:
      'Paste names, create random pairs instantly, and reshuffle whenever you want a new partner mix.',
    audienceSummary:
      'Built for teachers, trainers, and facilitators who need fast partner assignments for practice rounds, peer feedback, and icebreakers.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'team-shuffle-generator': createContent({
    title: 'Team Shuffle Generator — Reshuffle Teams Quickly and Fairly | GroupMixer',
    description:
      'Free team shuffle generator. Reshuffle a list of names into fresh teams in seconds. Useful for workshops, training cohorts, sports drills, and group exercises.',
    eyebrow: 'For fresh team mixes without the admin work',
    heroTitle: 'Team Shuffle Generator',
    subhead:
      'Reshuffle people into fresh teams fast. Great when you want new combinations without rebuilding your setup from scratch.',
    audienceSummary:
      'Best for facilitators, coaches, and team leads who regularly rotate groups and want a cleaner, more reviewable way to do it.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'breakout-room-generator': createContent({
    title: 'Breakout Room Generator — Split Participants into Rooms | GroupMixer',
    description:
      'Free breakout room generator. Paste names and split participants into breakout rooms instantly. Great for classes, workshops, and remote meetings.',
    eyebrow: 'For Zoom calls, trainings, and workshops',
    heroTitle: 'Breakout Room Generator',
    subhead:
      'Split participants into breakout rooms instantly. Paste names, set room count, and generate. Perfect for workshops, classes, and remote sessions.',
    audienceSummary:
      'Useful when you need room assignments fast, but still want the option to rotate people across rounds and reduce repetitive pairings.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'workshop-group-generator': createContent({
    title: 'Workshop Group Generator — Create Small Groups for Sessions | GroupMixer',
    description:
      'Free workshop group generator. Split participants into small groups for activities, breakouts, and multi-round sessions. Add constraints when you need them.',
    eyebrow: 'For facilitators running collaborative sessions',
    heroTitle: 'Workshop Group Generator',
    subhead:
      'Create workshop groups in seconds. Start simple, then add rounds, balancing, or pairing rules as your facilitation plan gets more complex.',
    audienceSummary:
      'Made for workshops where group composition affects discussion quality, energy, and how often participants meet new people.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'student-group-generator': createContent({
    title: 'Student Group Generator — Create Classroom Groups Fast | GroupMixer',
    description:
      'Free student group generator for teachers. Paste your class roster and create balanced student groups in seconds. Add rules for keeping students together or apart.',
    eyebrow: 'For teachers and classroom activities',
    heroTitle: 'Student Group Generator',
    subhead:
      'Paste your class roster and create student groups instantly. Keep it simple or add rules like keep-together and balanced teams when needed.',
    audienceSummary:
      'Designed for educators who need a class-friendly way to form groups quickly without giving up control over pairings or balance.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'icebreaker-group-generator': createContent({
    title: 'Icebreaker Group Generator — Create Quick Small Groups for Activities | GroupMixer',
    description:
      'Free icebreaker group generator. Make quick small groups or pairs for workshops, classes, and events. Great for warm-ups, introductions, and networking starters.',
    eyebrow: 'For warm-ups, introductions, and energizers',
    heroTitle: 'Icebreaker Group Generator',
    subhead:
      'Create fast small groups for introductions, warm-ups, and conversation starters without slowing down the room.',
    audienceSummary:
      'Useful when you need low-friction group creation for the first minutes of a class, workshop, meetup, or team event.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'speed-networking-generator': createContent({
    title: 'Speed Networking Generator — Multiple Rounds, Less Repetition | GroupMixer',
    description:
      'Free speed networking generator. Create multiple rounds where participants meet new people each time. Minimize repeat pairings automatically.',
    eyebrow: 'For mixers, meetups, and networking sessions',
    heroTitle: 'Speed Networking Generator',
    subhead:
      'Generate multiple networking rounds where people meet new faces each time. Paste names, set rounds, and minimize repeat pairings.',
    audienceSummary:
      'Best for structured networking formats where the goal is to create new connections instead of repeating the same small groups.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.workspace,
    ],
  }),
  'group-generator-with-constraints': createContent({
    title: 'Group Generator with Constraints — Keep Together, Keep Apart, Balance | GroupMixer',
    description:
      'Free group generator with constraints. Add keep-together, keep-apart, balanced teams, and no-repeat-pairing rules. Paste names and generate smart groups.',
    eyebrow: 'For higher-stakes group planning',
    heroTitle: 'Group Generator with Constraints',
    subhead:
      'Create groups with rules. Keep people together, keep them apart, balance by attribute, and avoid repeat pairings across rounds.',
    audienceSummary:
      'Use this version when the assignment itself matters: preserving pairings, avoiding conflicts, balancing attributes, or rotating across sessions.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.workspace,
    ],
  }),
};
