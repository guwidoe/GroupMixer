import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  '隐私友好（全部在浏览器内处理）',
  '无需注册',
  '几秒出结果',
];

const OPTIMIZER_FEATURES = [
  '部分出席',
  '按小组和场次设置容量',
  '按场次设置规则',
  '加权软约束',
  '配对见面目标',
  '高级约束调优',
  '求解器设置',
  '结果分析',
];

const OPTIMIZER_FEATURE_EXPLANATIONS = [
  '为每位参与者设置参加哪些场次，而不是默认每个人每轮都在场。',
  '为每个小组设置容量，并在房间或主持人安排变化时按场次覆盖容量。',
  '只在需要的场次应用同组、分开、固定分配、重复限制和属性平衡规则。',
  '添加必要时可以被违反的偏好，并调整它们相对于其他目标的权重。',
  '设置特定两人应见面的次数目标，包括精确、至少或至多。',
  '进一步调整重复限制、属性平衡模式、惩罚权重和其他约束细节。',
  '调整运行限制、确定性种子、求解器类型以及其他优化设置。',
  '更详细地查看分数拆解、约束满足情况、惩罚和保存的结果。',
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
      '场景编辑器用于这页没有暴露的控制项，例如部分出席、按小组和场次设置容量、按轮次设置约束、加权软约束、配对见面目标、高级约束调优、求解器设置、历史结果以及结果分析。',
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
      featureExplanations: OPTIMIZER_FEATURE_EXPLANATIONS,
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
};
