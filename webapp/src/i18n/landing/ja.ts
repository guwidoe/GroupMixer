import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  'プライベート（処理はブラウザ内のみ）',
  '登録不要',
  '数秒で完了',
];

const OPTIMIZER_FEATURES = [
  '部分参加',
  'グループ / セッション別定員',
  'セッション別ルール',
  '重み付きソフト制約',
  'ペアの出会い目標',
  '高度な制約チューニング',
  'ソルバー設定',
  '結果分析',
];

const OPTIMIZER_FEATURE_EXPLANATIONS = [
  '全員が毎回参加する前提ではなく、参加者ごとに出席するセッションを設定できます。',
  'グループごとの定員を設定し、部屋や担当者が変わる場合はセッションごとに上書きできます。',
  '同席、分離、固定配置、繰り返し、バランスのルールを必要なセッションだけに適用できます。',
  '必要なら破ってもよい希望条件を追加し、他の目標に対する重みを調整できます。',
  '特定のペアが何回出会うべきかを、ちょうど・最小・最大の目標として指定できます。',
  '繰り返し制限、属性バランスのモード、ペナルティなど、制約の詳細を調整できます。',
  '実行時間、再現用シード、ソルバー種別などの最適化設定を調整できます。',
  'スコア内訳、制約の達成状況、ペナルティ、保存済み結果を詳しく確認できます。',
];

const CHROME = {
  expertWorkspaceLabel: 'シナリオエディター',
  faqHeading: 'よくある質問',
  footerTagline: 'GroupMixer — 無料のグループ作成ツール',
  feedbackLabel: 'フィードバック',
  privacyNote: 'すべての処理はブラウザ内でローカルに実行されます。',
  scrollHint: '下にスクロールして活用例とFAQを見る',
};

const USE_CASES_SECTION = {
  title: '授業・ワークショップ・イベントに便利！',
  description:
    'まずはシンプルなランダム分けから。より細かい調整が必要になったら、GroupMixer がそのまま対応します。',
  cards: [
    {
      title: '授業のグループ分け',
      body: '生徒名簿を貼り付けるだけで、数秒でバランスのよいグループを作成できます。',
    },
    {
      title: 'ワークショップのブレイクアウト',
      body: '単発セッションの分割にも、複数ラウンドのローテーションにも対応できます。',
    },
    {
      title: 'スピードネットワーキング',
      body: '毎回できるだけ新しい相手に会えるよう、複数ラウンドを自動で作成します。',
    },
    {
      title: 'チームプロジェクト',
      body: 'クラスやチームを班に分け、必要に応じて役割やスキルで均衡化します。',
    },
    {
      title: '会議のセッション',
      body: '制約を守りながら、参加者をテーブルや並行セッションに割り当てます。',
    },
    {
      title: '交流イベント',
      body: '毎回新しい人と会えるアイスブレイク用の組み合わせを作成できます。',
    },
  ],
};

const FAQS = {
  free: {
    question: 'GroupMixer は無料ですか？',
    answer:
      'はい。GroupMixer は完全無料です。登録もアカウント作成も不要で、利用制限もありません。',
  },
  privacy: {
    question: 'データは安全に保たれますか？',
    answer:
      'はい。すべての処理はブラウザ内で行われ、名前やグループ情報がサーバーに送信されることはありません。ページを読み込んだ後は、インターネット接続がなくても利用できます。'
  },
  constraints: {
    question: '一緒にしたい人・離したい人などのルールを追加できますか？',
    answer:
      'はい。詳細オプションで「同じグループにする」「一緒にしない」「複数セッション」「属性バランス」などを設定できます。より高度な設定はシナリオエディターで行えます。',
  },
  multiSession: {
    question: '複数ラウンドのグループも作れますか？',
    answer:
      '参加者名を貼り付け、ラウンド数を設定して「繰り返しを避ける」を有効にすると、各ラウンドで重複を抑えた組み合わせを作成します。',
  },
  workspace: {
    question: 'シナリオエディターとは何ですか？',
    answer:
      'シナリオエディターは、このページにない設定が必要な場合に使います。部分参加、グループ/セッション別定員、セッション別制約、重み付きソフト制約、ペアの出会い目標、高度な制約チューニング、ソルバー設定、過去結果、結果分析を扱えます。',
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
      eyebrow: 'さらに細かく制御しますか？',
      title: 'フルシナリオエディターを開く',
      featureBullets: OPTIMIZER_FEATURES,
      featureExplanations: OPTIMIZER_FEATURE_EXPLANATIONS,
      buttonLabel: 'シナリオエディターを開く',
      supportingText: 'このページにない高度な設定に使います。参加者、グループ、セッション、ルールはそのまま引き継がれます。',
    },
    faqEntries,
    chrome: CHROME,
    useCasesSection: USE_CASES_SECTION,
  };
}

export const JA_TOOL_PAGE_CONTENT: Partial<Record<ToolPageKey, ToolPageLocalizedContent>> = {
  home: createContent({
    title: 'ランダムグループ作成ツール — 名前をすぐにグループ分け | GroupMixer',
    description:
      '無料のランダムグループ作成ツール。名前を貼り付けてグループ数を選ぶだけで、数秒でバランスのよいグループを作成できます。登録不要。必要なら設定も追加できます。',
    eyebrow: '授業・ワークショップ・イベント向け',
    heroTitle: 'ランダムグループ作成ツール',
    subhead: '名前を貼り付け、グループ数を選ぶだけで班分け完了',
    audienceSummary: '',
    faqEntries: [
      {
        question: '名前のリストをランダムにグループ分けするには？',
        answer:
          '名前を1行ずつ貼り付け、グループ数または1グループあたりの人数を設定して「グループを作成」をクリックしてください。すぐに結果が表示されます。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
      FAQS.multiSession,
      FAQS.workspace,
    ],
  }),
};
