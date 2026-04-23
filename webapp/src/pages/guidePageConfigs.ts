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
    relatedGuides: {
      title: 'Related guides',
      links: [
        {
          label: 'How to run speed networking rounds without repeat conversations',
          description: 'Use the networking-focused guide when the format is built around repeated short conversations.',
          href: '/guides/run-speed-networking-rounds',
        },
        {
          label: 'How to make balanced student groups',
          description: 'Use the classroom-focused guide when balancing matters more than a plain random split.',
          href: '/guides/make-balanced-student-groups',
        },
        {
          label: 'Random groups vs balanced groups vs constrained groups',
          description: 'Use the comparison guide to decide whether simple random grouping, balancing, or constraints fit your setup best.',
          href: '/guides/random-vs-balanced-vs-constrained-groups',
        },
      ],
    },
  },
  'run-speed-networking-rounds': {
    key: 'run-speed-networking-rounds',
    slug: 'run-speed-networking-rounds',
    canonicalPath: '/guides/run-speed-networking-rounds',
    seo: {
      title: 'How to Run Speed Networking Rounds | GroupMixer Guide',
      description:
        'Learn how to run speed networking rounds without repeat conversations. A practical guide to setting round count, group size, and repeat-avoidance with GroupMixer.',
    },
    hero: {
      eyebrow: 'Guide for event organizers and community hosts',
      title: 'How to run speed networking rounds without repeat conversations',
      intro:
        'Speed networking works best when participants keep meeting new people each round. This guide shows how to structure rounds, avoid obvious repeat conversations, and use GroupMixer when a plain randomizer is not enough.',
    },
    problem: {
      title: 'The goal is not just to make rounds — it is to keep every round worth attending',
      body:
        'If a speed networking format sends people back into the same conversations, the energy drops quickly. The core problem is preserving novelty across several short rounds while keeping the setup simple enough to run live.',
      bullets: [
        'participants want new conversations in each round',
        'repeat pairings feel especially wasteful in short networking sessions',
        'organizers often need a setup they can trust without manual reshuffling between rounds',
      ],
    },
    failureModes: {
      title: 'Why simple randomizers fail for speed networking',
      cards: [
        {
          title: 'They forget previous rounds',
          body:
            'A plain randomizer can create a valid round, but it does not track who already met in earlier rounds.',
        },
        {
          title: 'Manual fixes slow the event down',
          body:
            'Trying to repair repeated conversations by hand between rounds adds stress right when the event needs to stay fast and smooth.',
        },
        {
          title: 'Repeated short conversations are more noticeable',
          body:
            'In a networking format, a repeated pairing is not a minor issue — it directly reduces the value of the next round.',
        },
      ],
    },
    example: {
      title: 'Example networking setup',
      summary:
        'Imagine a 30-person meetup with 5 short networking rounds. You want groups of 3 so people can circulate quickly, and you want each round to introduce as many new contacts as possible.',
      details: [
        '30 participants',
        'groups of 3',
        '5 rounds',
        'avoid repeat pairings enabled',
        'optional fixed hosts or facilitators pinned to specific groups',
      ],
    },
    setup: {
      title: 'Recommended GroupMixer setup',
      intro:
        'For a speed networking session, keep the setup simple and use only the controls that improve the live flow.',
      steps: [
        'Paste the participant list into the quick setup.',
        'Set the group size or number of groups for each round.',
        'Set the number of sessions to the number of networking rounds you plan to run.',
        'Enable “Avoid repeat pairings” so the schedule favors fresh conversations in later rounds.',
        'If needed, add fixed people or simple together/apart rules before generating the rounds.',
      ],
    },
    advanced: {
      title: 'When to use advanced options or the scenario editor',
      body:
        'Use the advanced options when you need practical controls such as fixed hosts, repeated rounds, or simple relationship rules. Move into the scenario editor when the event has stronger constraints, such as session-specific requirements, facilitator assignments, or multiple competing objectives.',
    },
    cta: {
      title: 'Try this setup in the speed networking generator',
      body:
        'Start with the networking-focused tool, then set the round count and enable repeat avoidance before generating the schedule.',
      buttonLabel: 'Open speed networking generator',
      href: '/speed-networking-generator',
    },
    relatedTools: {
      title: 'Related tools',
      links: [
        {
          label: 'Speed Networking Generator',
          description: 'Use the networking-focused tool entry point for repeated short rounds with fewer repeat conversations.',
          href: '/speed-networking-generator',
        },
        {
          label: 'Workshop Group Generator',
          description: 'Use the workshop-focused tool when the format includes breakout rounds beyond pure networking.',
          href: '/workshop-group-generator',
        },
        {
          label: 'Breakout Room Generator',
          description: 'Use the breakout-room tool for remote or hybrid round-based discussion formats.',
          href: '/breakout-room-generator',
        },
      ],
    },
    relatedGuides: {
      title: 'Related guides',
      links: [
        {
          label: 'How to avoid repeat pairings in workshops',
          description: 'Use the workshop-focused guide for repeated small-group sessions beyond networking events.',
          href: '/guides/avoid-repeat-pairings-in-workshops',
        },
        {
          label: 'How to make balanced student groups',
          description: 'Use the classroom-focused guide when you need fairer group composition, not just new contacts.',
          href: '/guides/make-balanced-student-groups',
        },
        {
          label: 'Random groups vs balanced groups vs constrained groups',
          description: 'Use the comparison guide when you are deciding between a simple randomizer and a more structured setup.',
          href: '/guides/random-vs-balanced-vs-constrained-groups',
        },
      ],
    },
  },
  'make-balanced-student-groups': {
    key: 'make-balanced-student-groups',
    slug: 'make-balanced-student-groups',
    canonicalPath: '/guides/make-balanced-student-groups',
    seo: {
      title: 'How to Make Balanced Student Groups | GroupMixer Guide',
      description:
        'Learn how to make balanced student groups for classroom activities and projects. A practical guide to fairer grouping with GroupMixer.',
    },
    hero: {
      eyebrow: 'Guide for teachers and classroom facilitators',
      title: 'How to make balanced student groups',
      intro:
        'Balanced student groups often work better than a fully random split, especially when you want a healthier mix of skill levels, roles, behavior patterns, or social dynamics. This guide shows when balancing helps and how to set it up with GroupMixer.',
    },
    problem: {
      title: 'In classrooms, fair groups usually matter more than perfectly random ones',
      body:
        'A random split is fast, but it can easily cluster the same skill level, confidence level, or social dynamic in one group. The real goal is usually to create groups that feel workable, fair, and useful for the task in front of students.',
      bullets: [
        'teachers often need stronger mixes than pure randomness gives',
        'group quality affects participation, workload balance, and classroom energy',
        'simple balancing can save manual fixing after every regrouping',
      ],
    },
    failureModes: {
      title: 'Why plain random grouping is often not enough',
      cards: [
        {
          title: 'Skills can cluster by accident',
          body:
            'A random split can easily place several strong or struggling students in the same group, even when that is not what you want for the activity.',
        },
        {
          title: 'Social dynamics can dominate a group',
          body:
            'Some groups become unbalanced because friends, dominant personalities, or disengaged students land together by chance.',
        },
        {
          title: 'Manual repair takes time every round',
          body:
            'If you keep adjusting random groups by hand, you lose the speed advantage that made random grouping attractive in the first place.',
        },
      ],
    },
    example: {
      title: 'Example classroom setup',
      summary:
        'Imagine a class of 28 students preparing for a project activity. You want groups of 4, and you want each group to include a healthier mix of confidence levels and subject strengths instead of relying on a pure shuffle.',
      details: [
        '28 students',
        'groups of 4',
        'balance by a CSV column such as reading level, confidence, or subject strength',
        'optional together/apart rules for classroom dynamics',
        'optional fixed students for group leaders or anchor roles',
      ],
    },
    setup: {
      title: 'Recommended GroupMixer setup',
      intro:
        'For balanced classroom groups, start simple and only add the inputs that actually improve the outcome for the activity you are running.',
      steps: [
        'Paste the class roster or switch to CSV input if you want to balance by a classroom attribute.',
        'Choose the number of groups or group size for the activity.',
        'If you have balancing data, select the attribute you want to spread more evenly across the groups.',
        'Add together/apart rules if there are classroom dynamics you already know you need to manage.',
        'Generate the groups, then move into the scenario editor only if the classroom setup has deeper constraints.',
      ],
    },
    advanced: {
      title: 'When to use together/apart rules, fixed people, or the scenario editor',
      body:
        'Use together/apart rules when you already know some student combinations help or hurt the activity. Use fixed people when a leader, helper, or anchor student should stay in a known group. Move into the scenario editor when the class grouping problem becomes more complex than a single quick setup pass.',
    },
    cta: {
      title: 'Try this setup in the student group generator',
      body:
        'Start with the classroom-focused tool, then add balancing or simple pairing rules only where they improve the activity outcome.',
      buttonLabel: 'Open student group generator',
      href: '/student-group-generator',
    },
    relatedTools: {
      title: 'Related tools',
      links: [
        {
          label: 'Student Group Generator',
          description: 'Use the classroom-focused tool entry point for fast roster-based grouping with optional balancing.',
          href: '/student-group-generator',
        },
        {
          label: 'Random Group Generator',
          description: 'Use the simpler random entry point when the activity does not need balancing or classroom rules.',
          href: '/random-group-generator',
        },
        {
          label: 'Group Generator with Constraints',
          description: 'Use the constraint-focused tool when classroom relationships or balancing requirements are more demanding.',
          href: '/group-generator-with-constraints',
        },
      ],
    },
    relatedGuides: {
      title: 'Related guides',
      links: [
        {
          label: 'How to avoid repeat pairings in workshops',
          description: 'Use the workshop-focused guide when your grouping problem is about repeated rounds rather than classroom balancing.',
          href: '/guides/avoid-repeat-pairings-in-workshops',
        },
        {
          label: 'How to run speed networking rounds without repeat conversations',
          description: 'Use the networking-focused guide when the main challenge is repeated short rounds instead of classroom balance.',
          href: '/guides/run-speed-networking-rounds',
        },
        {
          label: 'Random groups vs balanced groups vs constrained groups',
          description: 'Use the comparison guide when you need help deciding whether balancing or classroom constraints are worth the extra setup.',
          href: '/guides/random-vs-balanced-vs-constrained-groups',
        },
      ],
    },
  },
  'random-vs-balanced-vs-constrained-groups': {
    key: 'random-vs-balanced-vs-constrained-groups',
    slug: 'random-vs-balanced-vs-constrained-groups',
    canonicalPath: '/guides/random-vs-balanced-vs-constrained-groups',
    seo: {
      title: 'Random Groups vs Balanced Groups vs Constrained Groups | GroupMixer Guide',
      description:
        'Learn when to use random groups, balanced groups, or constrained groups. A practical guide to choosing the right GroupMixer setup for your event or classroom.',
    },
    hero: {
      eyebrow: 'Guide for teachers, facilitators, and event organizers',
      title: 'Random groups vs balanced groups vs constrained groups',
      intro:
        'Not every grouping problem needs the same level of control. This guide explains when a simple random split is enough, when balancing gives better outcomes, and when you should use constraints because logistics or relationships matter more than speed.',
    },
    problem: {
      title: 'Most people do not need more features — they need the right grouping mode for the job',
      body:
        'A plain randomizer is fast, but it is not always the right answer. The real question is whether your situation needs speed, fairness, or rule-aware scheduling. Once that is clear, choosing the right GroupMixer flow becomes much easier.',
      bullets: [
        'random grouping is best when speed matters more than composition',
        'balanced grouping helps when fairness or mix quality matters',
        'constrained grouping is for cases where real rules must be respected',
      ],
    },
    failureModes: {
      title: 'Why people choose the wrong grouping approach',
      cards: [
        {
          title: 'They use random groups for non-random goals',
          body:
            'If you care about skill mix, fairness, or relationship rules, a pure random split can create predictable problems that then need manual fixing.',
        },
        {
          title: 'They overcomplicate simple cases',
          body:
            'Sometimes a quick random split is exactly right. Adding unnecessary rules can slow you down without improving the outcome.',
        },
        {
          title: 'They wait too long to add constraints',
          body:
            'When facilitators, classroom dynamics, or operational rules matter, forcing those needs into a simple random flow usually causes more work later.',
        },
      ],
    },
    example: {
      title: 'Three common examples',
      summary:
        'Use random groups when you just need a fast split, balanced groups when composition quality matters, and constrained groups when specific rules have to be respected.',
      details: [
        'Random: a quick icebreaker where any valid group is fine',
        'Balanced: a classroom task where you want stronger and weaker students spread across groups',
        'Constrained: a workshop where facilitators are fixed and some people must stay together or apart',
        'Use multiple sessions and avoid-repeat settings when the challenge includes repeated rounds',
      ],
    },
    setup: {
      title: 'How to choose the right GroupMixer setup',
      intro:
        'Start with the simplest setup that actually matches your real objective. If the goal changes, move up from random to balanced or constrained grouping only when that extra control solves a real problem.',
      steps: [
        'Choose simple random grouping when any valid split is acceptable and speed matters most.',
        'Choose balanced grouping when you want a stronger mix across groups based on skills, roles, or other attributes.',
        'Choose constrained grouping when there are rules such as keep-together, keep-apart, fixed people, or facilitator assignments.',
        'Add multiple sessions and avoid-repeat pairings when the challenge spans several rounds instead of one grouping pass.',
        'Use the scenario editor only when the quick setup no longer captures the real constraints of the event or class.',
      ],
    },
    advanced: {
      title: 'When advanced setup is worth it',
      body:
        'Advanced setup is worth using when the cost of a bad grouping is high enough that manual fixes become annoying, unfair, or operationally risky. If the only goal is a quick split, stay simple. If fairness, repeated rounds, or non-negotiable rules matter, the extra setup usually pays for itself.',
    },
    cta: {
      title: 'Start with the main group generator',
      body:
        'If you are still deciding, start with the main tool entry point. From there, you can stay with a simple setup or move into balancing and constraints as needed.',
      buttonLabel: 'Open GroupMixer',
      href: '/',
    },
    relatedTools: {
      title: 'Related tools',
      links: [
        {
          label: 'GroupMixer home',
          description: 'Start from the main tool when you want the simplest path and decide on complexity as you go.',
          href: '/',
        },
        {
          label: 'Random Group Generator',
          description: 'Use the random-focused entry point when speed matters more than balancing or rules.',
          href: '/random-group-generator',
        },
        {
          label: 'Student Group Generator',
          description: 'Use the classroom-focused entry point when balance and fairness matter for student groups.',
          href: '/student-group-generator',
        },
        {
          label: 'Group Generator with Constraints',
          description: 'Use the constraint-focused entry point when grouping rules or logistics must be respected.',
          href: '/group-generator-with-constraints',
        },
      ],
    },
    relatedGuides: {
      title: 'Related guides',
      links: [
        {
          label: 'How to avoid repeat pairings in workshops',
          description: 'Read this when your main challenge is repeated workshop rounds rather than one-time grouping.',
          href: '/guides/avoid-repeat-pairings-in-workshops',
        },
        {
          label: 'How to run speed networking rounds without repeat conversations',
          description: 'Read this when the format is built around repeated short networking rounds.',
          href: '/guides/run-speed-networking-rounds',
        },
        {
          label: 'How to make balanced student groups',
          description: 'Read this when the main question is classroom balance rather than general grouping strategy.',
          href: '/guides/make-balanced-student-groups',
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
