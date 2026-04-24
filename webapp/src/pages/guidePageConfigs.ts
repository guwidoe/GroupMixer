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
        'optional attribute balancing by role, department, or experience',
      ],
    },
    setup: {
      title: 'Recommended GroupMixer setup',
      intro:
        'For this kind of workshop, start with the quick setup and use the advanced options only where they add real value.',
      steps: [
        'Paste the participant list and add attributes if you need balancing fields.',
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
        {
          label: 'How to split a class into fair groups',
          description: 'Use the classroom fairness guide when the question is less about optimization jargon and more about what feels fair in practice.',
          href: '/guides/split-a-class-into-fair-groups',
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
        'If needed, add pinned people or simple together/apart rules before generating the rounds.',
      ],
    },
    advanced: {
      title: 'When to use advanced options or the scenario editor',
      body:
        'Use the advanced options when you need practical controls such as fixed hosts, repeated rounds, or simple relationship rules. Move into the scenario editor when the event has stronger constraints, such as session-specific requirements, facilitator assignments, or multiple competing objectives.',
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
        {
          label: 'How to split a class into fair groups',
          description: 'Use the classroom fairness guide when your concern is fair student-group composition rather than event-style rounds.',
          href: '/guides/split-a-class-into-fair-groups',
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
        'balance by an attribute such as reading level, confidence, or subject strength',
        'optional together/apart rules for classroom dynamics',
        'optional fixed students for group leaders or anchor roles',
      ],
    },
    setup: {
      title: 'Recommended GroupMixer setup',
      intro:
        'For balanced classroom groups, start simple and only add the inputs that actually improve the outcome for the activity you are running.',
      steps: [
        'Paste the class roster and add classroom attributes if you want to balance group composition.',
        'Choose the number of groups or group size for the activity.',
        'If you have balancing data, select the attribute you want to spread more evenly across the groups.',
        'Add together/apart rules if there are classroom dynamics you already know you need to manage.',
        'Generate the groups, then move into the scenario editor only if the classroom setup has deeper constraints.',
      ],
    },
    advanced: {
      title: 'When to use together/apart rules, pinned people, or the scenario editor',
      body:
        'Use together/apart rules when you already know some student combinations help or hurt the activity. Use pinned people when a leader, helper, or anchor student should stay in a known group. Move into the scenario editor when the class grouping problem becomes more complex than a single quick setup pass.',
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
        {
          label: 'How to split a class into fair groups',
          description: 'Use the natural-language classroom guide for teacher workflows centered on fairness and group dynamics.',
          href: '/guides/split-a-class-into-fair-groups',
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
        'Choose constrained grouping when there are rules such as keep-together, keep-apart, pinned people, or facilitator assignments.',
        'Add multiple sessions and avoid-repeat pairings when the challenge spans several rounds instead of one grouping pass.',
        'Use the scenario editor only when the quick setup no longer captures the real constraints of the event or class.',
      ],
    },
    advanced: {
      title: 'When advanced setup is worth it',
      body:
        'Advanced setup is worth using when the cost of a bad grouping is high enough that manual fixes become annoying, unfair, or operationally risky. If the only goal is a quick split, stay simple. If fairness, repeated rounds, or non-negotiable rules matter, the extra setup usually pays for itself.',
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
        {
          label: 'How to split a class into fair groups',
          description: 'Read this when you want the classroom version of the same decision in more natural teacher language.',
          href: '/guides/split-a-class-into-fair-groups',
        },
      ],
    },
  },
  'split-a-class-into-fair-groups': {
    key: 'split-a-class-into-fair-groups',
    slug: 'split-a-class-into-fair-groups',
    canonicalPath: '/guides/split-a-class-into-fair-groups',
    seo: {
      title: 'How to Split a Class Into Fair Groups | GroupMixer Guide',
      description:
        'Learn how to split a class into fair groups for projects, discussions, and classroom activities. A practical teacher guide to fairer grouping with GroupMixer.',
    },
    hero: {
      eyebrow: 'Guide for teachers and classroom organizers',
      title: 'How to split a class into fair groups',
      intro:
        'When teachers say they want fair groups, they usually do not mean perfectly random ones. They mean groups that feel workable, balanced enough, and less likely to create the same social or skill imbalance every time. This guide shows how to get there without reorganizing the class by hand.',
    },
    problem: {
      title: 'Fair classroom groups are usually about workable balance, not perfect randomness',
      body:
        'A quick random split can be fine for some activities, but many classroom tasks need something better. Fair groups often mean spreading confidence, ability, behavior patterns, or friendship dynamics in a way that gives each group a reasonable chance to work well.',
      bullets: [
        'teachers often want groups that feel fair to students, not just mathematically random',
        'uneven class dynamics can make one random split work much worse than another',
        'a small amount of structure can avoid repeated manual regrouping',
      ],
    },
    failureModes: {
      title: 'Why “just randomize it” often falls short in a classroom',
      cards: [
        {
          title: 'The same group can collect too much challenge at once',
          body:
            'A random split can accidentally stack several struggling students, dominant students, or close friends into one group, making the task harder to manage.',
        },
        {
          title: 'Fairness is judged by how the groups feel in practice',
          body:
            'Students usually notice whether one group looks easier, louder, or more supported than another, even when the grouping was technically random.',
        },
        {
          title: 'Manual adjustments eat the time you were trying to save',
          body:
            'Once you start fixing a random result by hand, you lose the speed benefit and still may not end up with a consistent process.',
        },
      ],
    },
    example: {
      title: 'Example classroom setup',
      summary:
        'Imagine a class of 26 students doing a collaborative project. You want groups of 4 or 5, but you do not want one group to end up with all the strongest speakers, all the close friends, or all the students who need the most support.',
      details: [
        '26 students',
        'groups of 4 or 5',
        'balance by confidence, reading level, or another classroom attribute when available',
        'optional apart rules for combinations that consistently derail the activity',
        'optional pinned people for helpers, leaders, or anchor students',
      ],
    },
    setup: {
      title: 'Recommended GroupMixer setup',
      intro:
        'Start with the student-group flow, then add only the structure that helps this specific class activity feel fairer and easier to run.',
      steps: [
        'Paste the class list and add classroom attributes when you want to balance group composition.',
        'Choose the number of groups or group size that fits the task.',
        'Use balancing when fairness depends on spreading skill, confidence, or another known attribute across groups.',
        'Use together/apart rules only for classroom dynamics you already know matter.',
        'Generate the groups, then review whether the result is fair enough before moving into a more advanced scenario.',
      ],
    },
    advanced: {
      title: 'When to balance, when to stay random, and when to add rules',
      body:
        'Stay with simple random grouping when any reasonable split is fine. Use balancing when you want a more even spread of student strengths or needs. Add together/apart rules or pinned people when you already know certain combinations help or hurt the activity. Move into the scenario editor only when the classroom problem has more constraints than a quick setup can handle cleanly.',
    },
    relatedGuides: {
      title: 'Related guides',
      links: [
        {
          label: 'How to make balanced student groups',
          description: 'Read this for the more explicitly balance-focused version of the same classroom problem.',
          href: '/guides/make-balanced-student-groups',
        },
        {
          label: 'Random groups vs balanced groups vs constrained groups',
          description: 'Read this if you want a broader framework for deciding how much grouping structure your situation needs.',
          href: '/guides/random-vs-balanced-vs-constrained-groups',
        },
        {
          label: 'How to avoid repeat pairings in workshops',
          description: 'Read this when the challenge is repeated rounds rather than one classroom grouping pass.',
          href: '/guides/avoid-repeat-pairings-in-workshops',
        },
      ],
    },
  },
  'make-random-pairs-from-a-list': {
    key: 'make-random-pairs-from-a-list',
    slug: 'make-random-pairs-from-a-list',
    canonicalPath: '/guides/make-random-pairs-from-a-list',
    seo: {
      title: 'How to Make Random Pairs From a List of Names | GroupMixer Guide',
      description:
        'Learn how to turn a list of names into random pairs for partner work, pair rotations, peer feedback, and repeated classroom or workshop rounds.',
    },
    hero: {
      eyebrow: 'Guide for teachers, trainers, and facilitators',
      title: 'How to make random pairs from a list of names',
      intro:
        'Random pairs are useful for partner work, peer review, drills, coaching conversations, and quick practice rounds. This guide explains how to create pairs, reshuffle pairs, and avoid sending the same people back together when the activity has more than one round.',
    },
    problem: {
      title: 'Pairing looks simple until you need fresh partners or exceptions',
      body:
        'Turning a list of names into pairs is easy once. It becomes harder when the group has an odd number of people, some pairings should be avoided, or you want pair rotations where participants meet a new partner in each round.',
      bullets: [
        'partner work often needs pairs quickly without spreadsheet cleanup',
        'pair rotations need memory of who already worked together',
        'some activities still need avoid-pairing rules or fixed helpers',
      ],
    },
    failureModes: {
      title: 'Where simple pair randomizers fall short',
      cards: [
        {
          title: 'They do not handle repeats across rounds',
          body:
            'A quick pair shuffle can work for one round, but it does not always prevent the same pair from appearing again later.',
        },
        {
          title: 'Odd numbers need a decision',
          body:
            'When the participant count is odd, one group may need three people or one participant may need to sit out. That should be intentional, not a surprise.',
        },
        {
          title: 'Manual pair fixes are easy to lose track of',
          body:
            'Once you start moving pairs by hand, it becomes harder to remember which combinations were already used.',
        },
      ],
    },
    example: {
      title: 'Example pair-rotation setup',
      summary:
        'Imagine 17 students doing three peer-feedback rounds. You want pairs where possible, one group of three if needed, and you want each round to give students a different partner.',
      details: [
        '17 participants',
        'groups of 2 where possible',
        '3 pair-rotation rounds',
        'avoid repeat pairings enabled for later rounds',
        'optional apart rules for pairings that should not happen',
      ],
    },
    setup: {
      title: 'Recommended GroupMixer setup',
      intro:
        'For random pairs, use group size as the main control and add repeat-avoidance only when the activity has multiple rounds.',
      steps: [
        'Paste the list of names into the participant input.',
        'Set the group size to 2 people per group.',
        'Use one session for a single pair split, or multiple sessions for pair rotations.',
        'Enable avoid-repeat pairings when participants should meet a different partner in each round.',
        'Add avoid-pairing rules only for combinations that genuinely should not be paired.',
      ],
    },
    advanced: {
      title: 'When pair rotations need more control',
      body:
        'Use advanced controls when pair assignments need to respect real constraints, such as avoiding specific pairings, keeping helpers with specific participants, or spreading repeated encounters over several sessions. Keep the setup simple when you only need one quick random pairing pass.',
    },
    relatedGuides: {
      title: 'Related guides',
      links: [
        {
          label: 'Random groups vs balanced groups vs constrained groups',
          description: 'Use this guide when you are deciding whether pairs are enough or whether the activity needs balancing and constraints.',
          href: '/guides/random-vs-balanced-vs-constrained-groups',
        },
        {
          label: 'How to avoid repeat pairings in workshops',
          description: 'Use this guide when repeated pairings matter across workshop rounds, not just pair work.',
          href: '/guides/avoid-repeat-pairings-in-workshops',
        },
        {
          label: 'How to split a class into fair groups',
          description: 'Use this guide when pair work is part of a broader classroom grouping problem.',
          href: '/guides/split-a-class-into-fair-groups',
        },
      ],
    },
  },
  'assign-breakout-rooms-for-online-workshops': {
    key: 'assign-breakout-rooms-for-online-workshops',
    slug: 'assign-breakout-rooms-for-online-workshops',
    canonicalPath: '/guides/assign-breakout-rooms-for-online-workshops',
    seo: {
      title: 'How to Assign Breakout Rooms for Online Workshops | GroupMixer Guide',
      description:
        'Learn how to assign participants to breakout rooms for online workshops, Zoom calls, trainings, and hybrid events with room counts and repeated rounds.',
    },
    hero: {
      eyebrow: 'Guide for remote facilitators and workshop hosts',
      title: 'How to assign breakout rooms for online workshops',
      intro:
        'Breakout rooms work best when participants are assigned quickly and the room mix supports the activity. This guide covers room count, group size, repeated breakout rounds, and when to avoid repeat pairings in remote or hybrid sessions.',
    },
    problem: {
      title: 'Breakout room assignments need to be fast, fair enough, and easy to explain',
      body:
        'In a live online workshop, people are waiting while rooms are created. The grouping process needs to handle the participant list, room count, and repeat rounds without turning into manual spreadsheet work.',
      bullets: [
        'remote facilitators often need room assignments before attention drops',
        'room count and group size need to match the activity format',
        'multi-round breakout rooms should avoid obvious repeated conversations',
      ],
    },
    failureModes: {
      title: 'Why manual breakout room planning gets messy',
      cards: [
        {
          title: 'Room count changes under pressure',
          body:
            'A few missing participants can change the right number of rooms or room size, especially in live online sessions.',
        },
        {
          title: 'Repeated rounds create accidental repeats',
          body:
            'If every breakout round is generated independently, participants can end up with the same people again.',
        },
        {
          title: 'Hybrid and training sessions add constraints',
          body:
            'Facilitators, hosts, language needs, or experience levels may need to be distributed instead of shuffled blindly.',
        },
      ],
    },
    example: {
      title: 'Example breakout-room setup',
      summary:
        'Imagine a 36-person online training with three breakout rounds. You want 6 rooms per round, a reasonable mix of experience levels, and fewer repeated conversations.',
      details: [
        '36 participants',
        '6 breakout rooms',
        '3 repeated breakout rounds',
        'optional attribute balancing by role, location, or experience',
        'optional fixed hosts or facilitators assigned to rooms',
      ],
    },
    setup: {
      title: 'Recommended GroupMixer setup',
      intro:
        'For breakout rooms, start with the room count or room size that matches the live facilitation plan.',
      steps: [
        'Paste the participant list before the session or after attendance is known.',
        'Set the number of groups to the number of breakout rooms, or set the people per room.',
        'Use multiple sessions for repeated breakout rounds.',
        'Enable avoid-repeat pairings when repeated rooms should introduce new conversations.',
        'Use participant attributes or pinned people only when facilitators, roles, or experience levels matter.',
      ],
    },
    advanced: {
      title: 'When breakout rooms need constraints',
      body:
        'Use constraints when the room assignment has real facilitation requirements, such as fixed room hosts, people who should not be placed together, or roles that should be spread across rooms. For a simple one-round discussion, a quick random split is usually enough.',
    },
    relatedGuides: {
      title: 'Related guides',
      links: [
        {
          label: 'How to avoid repeat pairings in workshops',
          description: 'Use this guide when breakout rooms are part of repeated workshop rounds.',
          href: '/guides/avoid-repeat-pairings-in-workshops',
        },
        {
          label: 'How to run speed networking rounds without repeat conversations',
          description: 'Use this guide when the breakout-room format is closer to repeated networking rounds.',
          href: '/guides/run-speed-networking-rounds',
        },
        {
          label: 'Random groups vs balanced groups vs constrained groups',
          description: 'Use this guide when deciding whether room assignments need balancing or explicit constraints.',
          href: '/guides/random-vs-balanced-vs-constrained-groups',
        },
      ],
    },
  },
  'create-balanced-random-teams': {
    key: 'create-balanced-random-teams',
    slug: 'create-balanced-random-teams',
    canonicalPath: '/guides/create-balanced-random-teams',
    seo: {
      title: 'How to Create Balanced Random Teams | GroupMixer Guide',
      description:
        'Learn how to create balanced random teams from a list of names, including team count, skills or roles, managers, coaches, and simple grouping rules.',
    },
    hero: {
      eyebrow: 'Guide for coaches, managers, and facilitators',
      title: 'How to create balanced random teams',
      intro:
        'A random team generator is useful when you need teams quickly, but many team activities also need a reasonable spread of skills, roles, or experience. This guide explains how to keep the speed of random teams while adding enough structure to make the result usable.',
    },
    problem: {
      title: 'Good team splits are usually random enough, not purely random',
      body:
        'Pure random teams can accidentally stack all the same skill, role, or experience level together. For coaches, managers, and facilitators, the practical goal is often to make teams quickly while keeping the team count and composition workable.',
      bullets: [
        'team count affects whether groups are too large or too small',
        'skills or roles may need to be spread across teams',
        'some team assignments need simple together/apart rules',
      ],
    },
    failureModes: {
      title: 'Why random team generation often needs a little structure',
      cards: [
        {
          title: 'Skills can cluster by chance',
          body:
            'A pure shuffle can place several experienced people or several beginners on the same team.',
        },
        {
          title: 'Roles can become uneven',
          body:
            'If one team gets all designers, facilitators, or senior people, the result may be random but not useful.',
        },
        {
          title: 'Manual balancing undermines the speed',
          body:
            'If every random result needs manual swaps, the generator is no longer saving much time.',
        },
      ],
    },
    example: {
      title: 'Example balanced-team setup',
      summary:
        'Imagine 24 participants split into 4 project teams. You want each team to have a reasonable mix of skills or roles without hand-building every team.',
      details: [
        '24 participants',
        '4 teams',
        'optional attributes for skill, role, department, or experience',
        'balance by one useful attribute at a time',
        'optional together/apart rules for known team dynamics',
      ],
    },
    setup: {
      title: 'Recommended GroupMixer setup',
      intro:
        'For balanced teams, start with the target team count, then add attributes only when they improve the split.',
      steps: [
        'Paste names for a quick team split, or add attributes when you need skills or roles.',
        'Set the number of teams or the desired people per team.',
        'Choose an attribute to balance when composition matters.',
        'Add keep-together or keep-apart rules only for known team requirements.',
        'Review the result and simplify the setup if the extra rules are not improving the teams.',
      ],
    },
    advanced: {
      title: 'When team generation becomes a constraints problem',
      body:
        'Use balancing when the team mix matters but the rules are soft. Use constraints when certain assignments are non-negotiable, such as people who must stay apart, fixed leaders, or repeated sessions where the same people should not keep meeting.',
    },
    relatedGuides: {
      title: 'Related guides',
      links: [
        {
          label: 'Random groups vs balanced groups vs constrained groups',
          description: 'Use this guide to decide whether random teams, balanced teams, or constrained teams fit the situation.',
          href: '/guides/random-vs-balanced-vs-constrained-groups',
        },
        {
          label: 'How to make balanced student groups',
          description: 'Use this guide when balanced teams are for classroom activities.',
          href: '/guides/make-balanced-student-groups',
        },
        {
          label: 'How to split a class into fair groups',
          description: 'Use this guide when fairness and classroom dynamics matter more than team terminology.',
          href: '/guides/split-a-class-into-fair-groups',
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
