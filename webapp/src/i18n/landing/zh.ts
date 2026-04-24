import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  '隐私友好（全部在浏览器内处理）',
  '无需注册',
  '几秒出结果',
];

const OPTIMIZER_FEATURES = [
  '部分出席',
  '按场次设置小组',
  '按场次设置规则',
  '更细粒度的硬 / 软约束',
  '求解器设置',
  '详细结果分析',
];

const CHROME = {
  expertWorkspaceLabel: '场景编辑器',
  faqHeading: '常见问题',
  footerTagline: 'GroupMixer — 免费随机分组工具',
  feedbackLabel: '反馈',
  privacyNote: '所有处理都在你的浏览器中本地完成。',
  scrollHint: '向下滚动查看使用场景和常见问题',
};

const USE_CASES_SECTION = {
  title: '适用于课堂、工作坊和活动',
  description:
    '先从简单的随机分组开始。需要更多控制时，GroupMixer 也能继续满足。',
  cards: [
    {
      title: '课堂分组',
      body: '老师只需粘贴学生名单，就能在几秒内生成更均衡的小组。',
    },
    {
      title: '工作坊分组',
      body: '无论是单次分组还是多轮轮换，都可以快速完成。',
    },
    {
      title: '快速社交',
      body: '自动生成多轮分组，让参与者每轮尽量认识新的人。',
    },
    {
      title: '团队项目',
      body: '把班级或团队分成项目小组，并可按技能、角色或部门做平衡。',
    },
    {
      title: '会议与论坛',
      body: '在满足约束的同时，把参与者分配到不同桌次或并行讨论。',
    },
    {
      title: '破冰与社交活动',
      body: '安排让大家认识新人的分组轮次，也可指定某些人要在一起或分开。',
    },
  ],
};

const FAQS = {
  free: {
    question: 'GroupMixer 免费吗？',
    answer:
      '是的。GroupMixer 完全免费，不需要注册账号，也没有使用限制。',
  },
  privacy: {
    question: '我的数据安全吗？',
    answer:
      '是的。所有处理都在你的浏览器中本地完成，姓名和分组数据不会发送到服务器。页面加载完成后，即使没有网络连接你也可以继续使用。'
  },
  constraints: {
    question: '我可以添加“必须同组”或“不能同组”之类的规则吗？',
    answer:
      '可以。打开高级选项后，你可以添加同组规则、避免配对规则、多轮设置以及属性平衡。需要更多控制时，可以进入场景编辑器。',
  },
  multiSession: {
    question: '我可以为多轮活动生成分组吗？',
    answer:
      '可以。在高级选项中设置轮次，并启用“避免重复搭配”，就能减少同样的人反复分在一起。',
  },
  workspace: {
    question: '什么是场景编辑器？',
    answer:
      '场景编辑器用于这页没有暴露的控制项，例如部分出席、按轮次设置不同分组集合、按轮次设置约束、更细粒度的硬/软约束、求解器设置、历史结果以及详细分析。',
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
      eyebrow: '还需要更多控制吗？',
      title: '打开完整场景编辑器。',
      featureBullets: OPTIMIZER_FEATURES,
      buttonLabel: '打开场景编辑器',
      supportingText: '当你需要此页面未提供的高级控制时使用。参与者、小组、场次和规则会一起带过去。',
    },
    faqEntries,
    chrome: CHROME,
    useCasesSection: USE_CASES_SECTION,
  };
}

export const ZH_TOOL_PAGE_CONTENT: Partial<Record<ToolPageKey, ToolPageLocalizedContent>> = {
  home: createContent({
    title: '随机分组生成器 — 立即把名单分成小组 | GroupMixer',
    description:
      '免费随机分组生成器。粘贴名单、选择分组数量，几秒内生成更均衡的小组。无需注册，必要时还可以添加约束规则。',
    eyebrow: '适合课堂、工作坊和各类活动',
    heroTitle: '随机分组生成器',
    subhead: '粘贴名单、选择小组数量，立即生成分组。',
    audienceSummary: '',
    faqEntries: [
      {
        question: '如何把一份名单随机分成小组？',
        answer:
          '把名单按每行一个名字粘贴进去，设置小组数量或每组人数，然后点击“生成分组”。结果会立即显示。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
      FAQS.multiSession,
      FAQS.workspace,
    ],
  }),
  'random-group-generator': createContent({
    title: '随机分组生成器 — 从名单中快速创建小组 | GroupMixer',
    description:
      '免费随机分组生成器。粘贴名单，选择要分成多少组，即可立即完成分组。适合课堂、工作坊和活动场景。',
    eyebrow: '适合快速随机分组',
    heroTitle: '随机分组生成器',
    subhead: '粘贴名单，选择需要的小组数量，立即完成分组。无需注册，也不会把数据发到服务器。',
    audienceSummary:
      '如果你需要为课堂活动、工作坊 breakout 或活动组织做一个快速又省事的分组工具，这一页最适合。',
    faqEntries: [
      {
        question: '随机分组生成器是怎么工作的？',
        answer:
          '把名字逐行粘贴到输入框中，设置小组数量或每组人数，然后点击生成。GroupMixer 会立即给出更均衡的随机分组结果。',
      },
      {
        question: '我可以控制小组数量或每组人数吗？',
        answer:
          '可以。你可以固定小组数量，也可以指定每组人数，其余由 GroupMixer 自动计算。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'random-team-generator': createContent({
    title: '随机团队生成器 — 快速创建更均衡的队伍 | GroupMixer',
    description:
      '免费随机团队生成器。粘贴名单后即可快速生成更均衡的队伍。需要时还可按技能、角色等条件做平衡。',
    eyebrow: '适合教练、组织者和带队负责人',
    heroTitle: '随机团队生成器',
    subhead: '几秒钟内完成随机分队。粘贴名单、选择队伍数量即可生成；需要更公平时还可以加平衡规则。',
    audienceSummary:
      '适合那些公平性比纯随机更重要的团队活动，尤其是需要分散角色或技能时。',
    faqEntries: [
      {
        question: '如何随机生成队伍？',
        answer:
          '粘贴参与者名单，设置队伍数量，然后点击生成。GroupMixer 会立即生成更均衡的队伍。',
      },
      {
        question: '我可以按技能或角色来平衡队伍吗？',
        answer:
          '可以。切换到 CSV 输入模式，添加“角色”或“技能”等列后，就可以使用按属性平衡功能。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'breakout-room-generator': createContent({
    title: 'Breakout Room 生成器 — 快速把参与者分到不同房间 | GroupMixer',
    description:
      '免费 breakout room 生成器。粘贴名单后即可把参与者快速分配到不同房间，适合课堂、工作坊和线上会议。',
    eyebrow: '适合 Zoom、培训和工作坊',
    heroTitle: 'Breakout Room 生成器',
    subhead: '快速把参与者分到不同 breakout room。粘贴名单、设置房间数量，一键生成。',
    audienceSummary:
      '当你需要快速完成房间分配，同时又希望支持多轮轮换和减少重复搭配时，这一页非常适合。',
    faqEntries: [
      {
        question: '如何创建 breakout rooms？',
        answer:
          '粘贴参与者名单，选择房间数量，然后点击生成。GroupMixer 会立即把所有人分配到不同房间。',
      },
      {
        question: '可以在多轮 breakout 中轮换人员吗？',
        answer:
          '可以。在高级选项中设置轮次数，并启用“避免重复搭配”，就能让参与者每轮尽量认识新的人。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'workshop-group-generator': createContent({
    title: '工作坊分组生成器 — 为活动环节快速创建小组 | GroupMixer',
    description:
      '免费工作坊分组生成器。可为活动、小组讨论和多轮环节快速生成小组。需要时还可以添加约束规则。',
    eyebrow: '适合主持协作型工作坊的人',
    heroTitle: '工作坊分组生成器',
    subhead: '几秒内创建工作坊分组。先简单开始，需要时再加入多轮、平衡或搭配规则。',
    audienceSummary:
      '当小组组成会直接影响讨论质量、参与热度和新连接的产生时，这一页尤其有价值。',
    faqEntries: [
      {
        question: '如何为工作坊创建小组？',
        answer:
          '粘贴参与者名单，设置小组数量或每组人数，然后点击生成。GroupMixer 会立即给出适合工作坊使用的分组。',
      },
      {
        question: '我可以在多轮工作坊里轮换人员吗？',
        answer:
          '可以。使用多轮设置和避免重复搭配功能，可以让参与者在整个流程中尽量认识新的人。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'student-group-generator': createContent({
    title: '学生分组生成器 — 快速创建课堂小组 | GroupMixer',
    description:
      '免费学生分组生成器。粘贴班级名单，几秒内生成更均衡的学生小组。也可添加某些学生必须同组或不能同组的规则。',
    eyebrow: '适合老师和课堂活动',
    heroTitle: '学生分组生成器',
    subhead: '粘贴班级名单，立即生成学生小组。既可简单快速，也能在需要时加上同组或分开规则。',
    audienceSummary:
      '适合希望快速完成课堂分组、同时又想保留一定公平性和可控性的老师。',
    faqEntries: [
      {
        question: '如何创建学生分组？',
        answer:
          '按每行一个名字粘贴学生名单，选择小组数量，然后点击生成。GroupMixer 会自动完成分组。',
      },
      {
        question: '我可以让某些学生在一起或分开吗？',
        answer:
          '可以。在高级选项中设置“保持在一起”或“避免同组”规则即可。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'speed-networking-generator': createContent({
    title: '快速社交分组生成器 — 多轮分组，减少重复搭配 | GroupMixer',
    description:
      '免费快速社交分组生成器。自动创建多轮分组，让参与者每轮尽量认识不同的人，并减少重复搭配。',
    eyebrow: '适合社交活动、meetup 和 networking 场景',
    heroTitle: '快速社交分组生成器',
    subhead: '粘贴名单，设置轮次，快速生成每轮都尽量遇到新人的 networking 分组。',
    audienceSummary:
      '适合需要结构化社交的场景，目标是让更多新连接发生，而不是总在同样的小组里重复。',
    faqEntries: [
      {
        question: '快速社交分组生成器是怎么工作的？',
        answer:
          '粘贴参与者名单，设置轮次数，并启用“避免重复搭配”。GroupMixer 会为每一轮生成尽量减少重复相遇的分组。',
      },
      {
        question: '我可以控制每组人数吗？',
        answer:
          '可以。你可以设置每轮的小组数量，或者直接指定每组人数。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.workspace,
    ],
  }),
};
