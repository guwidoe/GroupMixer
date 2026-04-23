import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TECHNICAL_OPTIMIZER_CTA = {
  eyebrow: 'For constraint-heavy plans',
  title: 'Open the full scenario editor.',
  featureBullets: [
    'Hard and soft rules',
    'Multiple sessions',
    'Attribute balancing',
    'Repeat-pairing control',
    'Solver settings',
  ],
  buttonLabel: 'Open scenario editor',
  supportingText: 'Use it when the quick setup needs deeper constraint control.',
};

const COMMON_FAQS = {
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
  workspace: {
    question: 'When should I use the scenario editor?',
    answer:
      'Use the scenario editor when the quick setup is not enough. It gives you more control over sessions, constraints, solver settings, previous results, and detailed analysis.',
  },
};

export const EN_TECHNICAL_TOOL_PAGE_CONTENT: Partial<Record<ToolPageKey, ToolPageLocalizedContent>> = {
  'multi-round-group-assignment-tool': {
    seo: {
      title: 'Multi-Round Group Assignment Tool with Constraints',
      description:
        'Create multi-round group assignments while minimizing repeat pairings. Add keep-together, keep-apart, and attribute-balancing constraints.',
    },
    hero: {
      eyebrow: 'For repeated sessions and rotations',
      title: 'Multi-Round Group Assignment Tool with Constraints',
      subhead:
        'Assign people across several rounds while minimizing repeat pairings. Add rules for who should stay together or apart, then move into the scenario editor for deeper constraint control.',
      audienceSummary:
        'Designed for workshops, classes, conferences, and networking formats where each round needs a fresh mix.',
      trustBullets: [
        'Multiple rounds',
        'Minimal repeat pairings',
        'Keep together or apart',
        'Balance by attribute',
      ],
    },
    optimizerCta: TECHNICAL_OPTIMIZER_CTA,
    useCasesSection: {
      title: 'Built for repeated group assignment problems',
      description:
        'Use the quick setup for a first draft, then use the scenario editor when the assignment has strict rules or competing objectives.',
      cards: [
        {
          title: 'Round-based rotations',
          body: 'Create several sessions from the same roster so people meet different participants in each round.',
        },
        {
          title: 'Repeat-pairing control',
          body: 'Penalize repeated pairings across sessions instead of manually checking every round.',
        },
        {
          title: 'Together and apart rules',
          body: 'Keep key pairs or subgroups together, and prevent specific pairs from landing in the same group.',
        },
        {
          title: 'Attribute balancing',
          body: 'Use CSV columns such as role, team, skill, department, or gender to spread attributes across groups.',
        },
        {
          title: 'Concrete example',
          body: '36 participants, groups of 4, 5 rounds, avoid repeats, keep departments mixed, and keep two people apart.',
        },
        {
          title: 'Browser-first workflow',
          body: 'Start with the online tool, inspect the result, then open the scenario editor when the constraints need more detail.',
        },
      ],
    },
    advancedSection: {
      title: 'How GroupMixer models the assignment',
      description:
        'Multi-round assignments are treated as an optimization problem: satisfy hard rules, reduce penalties, and keep the final schedule usable.',
      cards: [
        {
          title: 'Sessions',
          body: 'Each round is a session with its own group assignments, while repeat encounters are tracked across the full schedule.',
        },
        {
          title: 'Constraints',
          body: 'Together, apart, repeat-encounter, and attribute-balance rules are converted into solver constraints.',
        },
        {
          title: 'Reviewable results',
          body: 'Results can be viewed as cards, lists, plain text, or CSV before you copy or refine the scenario.',
        },
        {
          title: 'Advanced editor handoff',
          body: 'The scenario editor keeps the same participants and settings, so you can tune complex cases without starting over.',
        },
      ],
      buttonLabel: 'Open scenario editor',
      supportingText: 'Use the full editor for strict constraints, custom weights, and result analysis.',
    },
    faqEntries: [
      {
        question: 'What is the best tool for multi-round group assignments with constraints?',
        answer:
          'GroupMixer is built for this use case: repeated sessions, minimal repeat pairings, keep-together and keep-apart rules, and optional attribute balancing.',
      },
      {
        question: 'Can I create groups across multiple rounds without repeat pairings?',
        answer:
          'Yes. Set the number of sessions and GroupMixer adds a repeat-encounter objective so the same pairs are less likely to appear together again.',
      },
      {
        question: 'Can I balance each round by role, department, or gender?',
        answer:
          'Yes. Switch to CSV input, add a column for the attribute, and choose that attribute in the advanced options.',
      },
      COMMON_FAQS.free,
      COMMON_FAQS.limits,
      COMMON_FAQS.account,
      COMMON_FAQS.privacy,
      COMMON_FAQS.offline,
      COMMON_FAQS.workspace,
    ],
    chrome: {
      expertWorkspaceLabel: 'Scenario editor',
      faqHeading: 'Frequently asked questions',
      footerTagline: 'GroupMixer - Group generator and optimizer',
      feedbackLabel: 'Feedback',
      privacyNote: 'Runs in your browser.',
      scrollHint: 'Scroll down for constraints & FAQ',
    },
  },
  'group-assignment-optimizer': {
    seo: {
      title: 'Group Assignment Optimizer - Balance Groups with Constraints',
      description:
        'Optimize group assignments with hard and soft constraints. Balance attributes, avoid pairings, keep people together, and plan multiple sessions.',
    },
    hero: {
      eyebrow: 'For optimized assignments, not just random shuffles',
      title: 'Group Assignment Optimizer',
      subhead:
        'Create group assignments that account for competing rules: balanced attributes, pairing constraints, multiple sessions, and repeat-encounter penalties.',
      audienceSummary:
        'Use it when a plain randomizer is not enough and the assignment needs a solver-backed result.',
      trustBullets: [
        'Solver-backed grouping',
        'Hard and soft constraints',
        'CSV attributes',
        'Scenario editor handoff',
      ],
    },
    optimizerCta: TECHNICAL_OPTIMIZER_CTA,
    useCasesSection: {
      title: 'Optimization features',
      description:
        'GroupMixer turns a practical roster problem into a structured assignment model that can be generated, inspected, and refined.',
      cards: [
        {
          title: 'Attribute balance',
          body: 'Spread roles, skills, departments, gender, experience levels, or any custom CSV column across groups.',
        },
        {
          title: 'Pairing constraints',
          body: 'Respect people who should stay together and penalize pairings that should be avoided.',
        },
        {
          title: 'Multi-session planning',
          body: 'Plan repeated rounds where unique contacts matter and repeated pairs should be minimized.',
        },
        {
          title: 'Uneven rosters',
          body: 'Handle participant counts that do not divide perfectly while keeping group sizes practical.',
        },
        {
          title: 'Concrete example',
          body: '28 attendees, groups of 4, balance by department and role, avoid manager-report pairings, run 3 rounds.',
        },
        {
          title: 'Editable model',
          body: 'Open the generated scenario to tune constraints, solver settings, sessions, groups, and analysis views.',
        },
      ],
    },
    advancedSection: {
      title: 'When to use an optimizer',
      description:
        'Use an optimizer when the quality of the grouping depends on several rules at once, not just a fair shuffle.',
      cards: [
        {
          title: 'Plain random is too weak',
          body: 'Random splits can accidentally repeat pairs, cluster attributes, or violate known relationship rules.',
        },
        {
          title: 'Manual work does not scale',
          body: 'Checking every pairing and attribute distribution across several rounds gets error-prone quickly.',
        },
        {
          title: 'Some rules conflict',
          body: 'The solver can search for a practical compromise when balancing, repeat avoidance, and pair rules compete.',
        },
        {
          title: 'You need explainable outputs',
          body: 'The result can be reviewed by session and exported in formats that work for facilitation and planning.',
        },
      ],
      buttonLabel: 'Open scenario editor',
      supportingText: 'Use the full editor for complex constraints and result analysis.',
    },
    faqEntries: [
      {
        question: 'What is a group assignment optimizer?',
        answer:
          'It is a tool that searches for group assignments that satisfy or minimize violations of rules such as balancing attributes, avoiding pairs, and reducing repeat encounters.',
      },
      {
        question: 'Can GroupMixer handle hard and soft constraints?',
        answer:
          'Yes. The quick setup covers common rules, and the scenario editor gives deeper control over constraints, objectives, and solver settings.',
      },
      {
        question: 'Is this an alternative to using OR-Tools directly?',
        answer:
          'For many workshop, classroom, and event cases, yes. GroupMixer provides an online interface for common group-assignment constraints without requiring solver code.',
      },
      COMMON_FAQS.free,
      COMMON_FAQS.limits,
      COMMON_FAQS.account,
      COMMON_FAQS.privacy,
      COMMON_FAQS.offline,
      COMMON_FAQS.workspace,
    ],
    chrome: {
      expertWorkspaceLabel: 'Scenario editor',
      faqHeading: 'Frequently asked questions',
      footerTagline: 'GroupMixer - Group generator and optimizer',
      feedbackLabel: 'Feedback',
      privacyNote: 'Runs in your browser.',
      scrollHint: 'Scroll down for optimizer details & FAQ',
    },
  },
  'social-golfer-problem-solver': {
    seo: {
      title: 'Social Golfer Problem Solver - Multi-Round Groups',
      description:
        'Create social-golfer-style schedules for events and workshops. Generate repeated small-group rounds while minimizing repeat pairings.',
    },
    hero: {
      eyebrow: 'For social golfer style scheduling',
      title: 'Social Golfer Problem Solver',
      subhead:
        'Generate repeated small-group rounds where participants meet as many different people as possible. Use it for mixers, workshops, cohorts, and table rotations.',
      audienceSummary:
        'A practical online version of the classic repeated-group scheduling problem, with optional real-world constraints.',
      trustBullets: [
        'Groups of fixed size',
        'Several rounds',
        'Minimal repeated pairs',
        'Event-ready exports',
      ],
    },
    optimizerCta: TECHNICAL_OPTIMIZER_CTA,
    useCasesSection: {
      title: 'Social golfer style use cases',
      description:
        'The classic problem is about repeated groups with few or no repeated pairings. GroupMixer adapts that idea for real events.',
      cards: [
        {
          title: 'Networking rounds',
          body: 'Rotate attendees through several short rounds so each person meets more unique participants.',
        },
        {
          title: 'Workshop tables',
          body: 'Create table groups across agenda blocks while reducing repeated conversations.',
        },
        {
          title: 'Classroom rotations',
          body: 'Give students different collaborators across activities without hand-building each round.',
        },
        {
          title: 'Community mixers',
          body: 'Plan repeatable social rounds where the goal is broad mixing rather than tournament scoring.',
        },
        {
          title: 'Concrete example',
          body: '32 people, groups of 4, 6 rounds, minimize repeat pairings, then export the schedule for facilitators.',
        },
        {
          title: 'Beyond the classic problem',
          body: 'Add keep-apart, keep-together, and attribute-balance rules when the real event needs more control.',
        },
      ],
    },
    advancedSection: {
      title: 'How it differs from tournament software',
      description:
        'This page is for repeated social grouping, not brackets, standings, wins, losses, or Swiss tournament pairings.',
      cards: [
        {
          title: 'No standings required',
          body: 'The objective is better mixing across rounds, not ranking competitors.',
        },
        {
          title: 'Small groups, not matches',
          body: 'Each round can contain groups of 2, 3, 4, or more people depending on your format.',
        },
        {
          title: 'Repeat minimization',
          body: 'GroupMixer tracks repeated pairings across sessions and searches for a lower-repeat schedule.',
        },
        {
          title: 'Real-world constraints',
          body: 'You can add practical rules that classic social golfer examples usually ignore.',
        },
      ],
      buttonLabel: 'Open scenario editor',
      supportingText: 'Use the full editor for larger schedules and additional constraints.',
    },
    faqEntries: [
      {
        question: 'What is the social golfer problem?',
        answer:
          'It is a repeated-group scheduling problem where people are assigned to groups across rounds while trying to avoid pairing the same people together more than once.',
      },
      {
        question: 'Can GroupMixer solve social golfer style schedules online?',
        answer:
          'Yes. Set a group size, choose multiple sessions, and generate a schedule that minimizes repeated pairings.',
      },
      {
        question: 'Can I add constraints beyond repeat avoidance?',
        answer:
          'Yes. GroupMixer also supports keep-together, keep-apart, and attribute-balancing rules.',
      },
      COMMON_FAQS.free,
      COMMON_FAQS.limits,
      COMMON_FAQS.account,
      COMMON_FAQS.privacy,
      COMMON_FAQS.offline,
      COMMON_FAQS.workspace,
    ],
    chrome: {
      expertWorkspaceLabel: 'Scenario editor',
      faqHeading: 'Frequently asked questions',
      footerTagline: 'GroupMixer - Group generator and optimizer',
      feedbackLabel: 'Feedback',
      privacyNote: 'Runs in your browser.',
      scrollHint: 'Scroll down for social golfer details & FAQ',
    },
  },
  'constraint-based-team-generator': {
    seo: {
      title: 'Constraint-Based Team Generator - Balanced Teams with Rules',
      description:
        'Generate teams with constraints. Keep people together or apart, balance teams by attributes, and create multiple rounds with fewer repeats.',
    },
    hero: {
      eyebrow: 'For team generation with rules',
      title: 'Constraint-Based Team Generator',
      subhead:
        'Build teams around real constraints: keep certain people together, keep others apart, balance attributes, and reduce repeated pairings across rounds.',
      audienceSummary:
        'For classrooms, workshops, managers, and events where team quality matters more than pure randomness.',
      trustBullets: [
        'Keep together',
        'Keep apart',
        'Balance teams',
        'Multiple rounds',
      ],
    },
    optimizerCta: TECHNICAL_OPTIMIZER_CTA,
    useCasesSection: {
      title: 'Constraints you can model',
      description:
        'Start with names or CSV data, then add the rules that matter for the team assignment.',
      cards: [
        {
          title: 'Keep people together',
          body: 'Place co-facilitators, support pairs, or preassigned partners in the same team.',
        },
        {
          title: 'Keep people apart',
          body: 'Avoid known conflicts, manager-report pairings, or combinations that would reduce team quality.',
        },
        {
          title: 'Balance attributes',
          body: 'Distribute skills, roles, departments, experience levels, gender, or custom attributes from CSV input.',
        },
        {
          title: 'Avoid repeat pairings',
          body: 'Run multiple rounds and reduce repeated pairings when teams rotate across sessions.',
        },
        {
          title: 'Concrete example',
          body: '24 people, teams of 4, balance by role, keep two facilitators together, keep two participants apart.',
        },
        {
          title: 'Editable results',
          body: 'Generate a draft, review it, then open the scenario editor for deeper control when needed.',
        },
      ],
    },
    advancedSection: {
      title: 'Why constraint-based beats basic random teams',
      description:
        'A basic team generator can shuffle names. Constraint-based generation lets the assignment reflect the real rules of the session.',
      cards: [
        {
          title: 'Better balance',
          body: 'Avoid teams that accidentally cluster the same role, skill, or department.',
        },
        {
          title: 'Fewer manual fixes',
          body: 'Put known relationship rules into the setup instead of repairing the output by hand.',
        },
        {
          title: 'Multi-round support',
          body: 'Create more than one round and reduce repeated pairings across the schedule.',
        },
        {
          title: 'Same tool, deeper editor',
          body: 'Use the quick generator first, then open the scenario editor for complex cases.',
        },
      ],
      buttonLabel: 'Open scenario editor',
      supportingText: 'Use the full editor for hard constraints, custom weights, and detailed review.',
    },
    faqEntries: [
      {
        question: 'Can I generate teams with constraints online?',
        answer:
          'Yes. GroupMixer lets you paste names or CSV data, add common constraints, and generate teams in the browser.',
      },
      {
        question: 'Can I balance teams by gender, role, skill, or department?',
        answer:
          'Yes. Use CSV input with a column for the attribute you want to balance, then select that attribute in advanced options.',
      },
      {
        question: 'Can I keep people together or apart?',
        answer:
          'Yes. Add keep-together groups and avoid-pairing rules in the advanced options, or use the scenario editor for deeper control.',
      },
      COMMON_FAQS.free,
      COMMON_FAQS.limits,
      COMMON_FAQS.account,
      COMMON_FAQS.privacy,
      COMMON_FAQS.offline,
      COMMON_FAQS.workspace,
    ],
    chrome: {
      expertWorkspaceLabel: 'Scenario editor',
      faqHeading: 'Frequently asked questions',
      footerTagline: 'GroupMixer - Group generator and optimizer',
      feedbackLabel: 'Feedback',
      privacyNote: 'Runs in your browser.',
      scrollHint: 'Scroll down for constraints & FAQ',
    },
  },
};
