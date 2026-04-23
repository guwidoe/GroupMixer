import type { GuidePageConfig, GuidePageKey } from './guidePageTypes';

export * from './guidePageTypes';

const GUIDE_PAGE_CONFIGS: Record<GuidePageKey, GuidePageConfig> = {
  'avoid-repeat-pairings-in-workshops': {
    key: 'avoid-repeat-pairings-in-workshops',
    slug: 'avoid-repeat-pairings-in-workshops',
    canonicalPath: '/guides/avoid-repeat-pairings-in-workshops',
    seo: {
      title: 'How to Avoid Repeat Pairings in Workshops | GroupMixer Guide',
      description:
        'Learn how to run repeated workshop rounds without sending the same people back together each time. A practical guide to avoiding repeat pairings with GroupMixer.',
    },
    hero: {
      eyebrow: 'Guide for facilitators and training teams',
      title: 'How to avoid repeat pairings in workshops',
      intro:
        'When a workshop has several rounds, a plain randomizer often sends the same people back together. This guide shows how to keep the group mix fresh across rounds and when to use GroupMixer instead of reshuffling by hand.',
    },
    problem: {
      title: 'The real problem is not making groups once — it is making several rounds that still feel fresh',
      body:
        'A single random split is easy. The hard part starts when you run two, three, or five rounds and want participants to keep meeting new people instead of repeating the same pairings.',
      bullets: [
        'participants notice repeated pairings quickly',
        'manual reshuffling becomes error-prone after the first round',
        'balanced workshops often need both fresh contacts and practical constraints',
      ],
    },
    failureModes: {
      title: 'Why simple randomizers fail here',
      cards: [
        {
          title: 'They optimize only the current round',
          body:
            'A simple shuffle can look fine in round 1, but it does not remember who already worked together in earlier rounds.',
        },
        {
          title: 'Manual fixes do not scale',
          body:
            'Once you start swapping people around by hand, it becomes hard to keep track of who has already met whom.',
        },
        {
          title: 'Fairness and logistics compete',
          body:
            'You may want fresh pairings, but also balanced groups, fixed facilitators, or specific people kept apart.',
        },
      ],
    },
    example: {
      title: 'Example workshop setup',
      summary:
        'Imagine a 24-person workshop with four rounds of table discussions. You want groups of 4, and you want each round to introduce new conversations instead of repeating earlier pairings.',
      details: [
        '24 participants',
        'groups of 4',
        '4 rounds',
        'avoid repeat pairings enabled',
        'optional CSV balancing by role, department, or experience',
      ],
    },
    setup: {
      title: 'Recommended GroupMixer setup',
      intro:
        'For this kind of workshop, start with the quick setup and use the advanced options only where they add real value.',
      steps: [
        'Paste the participant list or switch to CSV if you need balancing fields.',
        'Set the group size or number of groups for a single round.',
        'Increase the number of sessions to the number of workshop rounds you plan to run.',
        'Enable “Avoid repeat pairings” so the tool tries to keep participants meeting new people.',
        'If needed, add keep-together, keep-apart, or fixed-people rules before generating the result.',
      ],
    },
    advanced: {
      title: 'When to use advanced options or the scenario editor',
      body:
        'Use the advanced options when you need a few practical rules, such as fixed facilitators or people who should stay apart. Move into the scenario editor when the workshop has competing constraints, session-specific requirements, or you need deeper review of the generated schedule.',
    },
    cta: {
      title: 'Try this setup in the workshop group generator',
      body:
        'Start with the workshop-focused entry point, then enable multiple sessions and avoid repeat pairings.',
      buttonLabel: 'Open workshop group generator',
      href: '/workshop-group-generator',
    },
    relatedTools: {
      title: 'Related tools',
      links: [
        {
          label: 'Workshop Group Generator',
          description: 'Start from the workshop-focused tool entry point for breakouts and repeated rounds.',
          href: '/workshop-group-generator',
        },
        {
          label: 'Speed Networking Generator',
          description: 'Use the networking-focused tool when the main objective is maximizing new conversations.',
          href: '/speed-networking-generator',
        },
        {
          label: 'Group Generator with Constraints',
          description: 'Use the constraint-focused page when workshop logistics matter as much as novelty.',
          href: '/group-generator-with-constraints',
        },
      ],
    },
  },
};

export const GUIDE_PAGE_ROUTES = Object.values(GUIDE_PAGE_CONFIGS).map((config) => ({
  key: config.key,
  path: config.canonicalPath,
}));

export function getGuidePageConfig(pageKey: GuidePageKey): GuidePageConfig {
  return GUIDE_PAGE_CONFIGS[pageKey];
}
