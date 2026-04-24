import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  'プライベート（処理はブラウザ内のみ）',
  '登録不要',
  '数秒で完了',
];

const OPTIMIZER_FEATURES = [
  '部分参加',
  'セッション別グループ',
  'セッション別ルール',
  '重みを設定できるソフト制約',
  'ペアの出会い回数目標',
  'ソルバー設定',
  '詳細な結果分析',
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
      'シナリオエディターは、このページにない設定が必要な場合に使います。部分参加、セッション別のグループセット、セッション別制約、重みを設定できるソフト制約、ペアの出会い回数目標、ソルバー設定、過去結果、詳細分析を扱えます。',
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
  'random-group-generator': createContent({
    title: 'ランダムグループ作成ツール — 名前リストからグループを作成 | GroupMixer',
    description:
      '無料のランダムグループ作成ツール。名前リストを貼り付けてグループ数を選ぶだけで、すぐに分けられます。授業・ワークショップ・イベントに最適です。',
    eyebrow: '素早いランダム分けに',
    heroTitle: 'ランダムグループ作成ツール',
    subhead:
      '名前リストを貼り付けて、必要なグループ数を選ぶだけ。登録不要、サーバー送信なしでブラウザ内だけで動作します。',
    audienceSummary:
      '授業・ワークショップ・イベント運営などで、手間をかけずにすばやくグループ分けしたいときに最適です。',
    faqEntries: [
      {
        question: 'ランダムグループ作成ツールはどのように動きますか？',
        answer:
          '名前を1行ずつ貼り付け、グループ数または1グループあたりの人数を指定して「グループを作成」を押すと、すぐにバランスのよいグループが作成されます。',
      },
      {
        question: 'グループ数やグループあたりの人数は指定できますか？',
        answer:
          'はい。グループ数を固定することも、1グループあたりの人数を指定することもできます。必要な人数計算は GroupMixer が自動で行います。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'random-team-generator': createContent({
    title: 'ランダムチーム作成ツール — バランスのよいチームをすばやく作成 | GroupMixer',
    description:
      '無料のランダムチーム作成ツール。名前を貼り付けるだけで、バランスのよいチームを即座に作成できます。必要に応じてスキルや役割のバランスも設定可能です。',
    eyebrow: 'コーチ、リーダー、ファシリテーター向け',
    heroTitle: 'ランダムチーム作成ツール',
    subhead:
      '名前を貼り付けてチーム数を選ぶだけで、数秒でチームを作成できます。公平さが必要な場合はバランス設定も使えます。',
    audienceSummary:
      '完全なランダムよりも、公平さや役割・スキルの分散が重要なチーム分けに向いています。',
    faqEntries: [
      {
        question: 'ランダムにチームを作るには？',
        answer:
          '参加者名を貼り付け、チーム数を設定して「グループを作成」を押してください。GroupMixer がすぐにバランスよく分けます。',
      },
      {
        question: 'スキルや役割でチームを均等にできますか？',
        answer:
          'はい。CSV モードに切り替えて「役割」や「スキル」などの列を追加し、属性バランス機能を使えば偏りを抑えて配分できます。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'breakout-room-generator': createContent({
    title: 'ブレイクアウトルーム作成ツール — 参加者を部屋に分ける | GroupMixer',
    description:
      '無料のブレイクアウトルーム作成ツール。名前を貼り付けて参加者を即座に部屋分けできます。授業、ワークショップ、オンライン会議に最適です。',
    eyebrow: 'Zoom、研修、ワークショップ向け',
    heroTitle: 'ブレイクアウトルーム作成ツール',
    subhead:
      '名前を貼り付けて部屋数を決めるだけで、すぐにブレイクアウトルームへ振り分けできます。',
    audienceSummary:
      '部屋分けをすばやく行いたい場面でも、複数ラウンドでのローテーションや組み合わせの重複回避に対応できます。',
    faqEntries: [
      {
        question: 'ブレイクアウトルームを作成するには？',
        answer:
          '参加者名を貼り付け、部屋数を選んで「グループを作成」を押してください。すぐに各ルームへ割り当てられます。',
      },
      {
        question: '複数ラウンドで参加者を入れ替えられますか？',
        answer:
          'はい。セッション数を設定し、「繰り返しを避ける」を有効にすると、毎回できるだけ新しい相手に出会えるように調整されます。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'workshop-group-generator': createContent({
    title: 'ワークショップ用グループ作成ツール — セッション用の小グループを作成 | GroupMixer',
    description:
      '無料のワークショップ用グループ作成ツール。アクティビティやブレイクアウト、複数ラウンド用の小グループを簡単に作成できます。必要なら制約も追加可能です。',
    eyebrow: '協働型セッションを運営する方向け',
    heroTitle: 'ワークショップ用グループ作成ツール',
    subhead:
      'ワークショップのグループを数秒で作成。まずはシンプルに、必要ならラウンド数やバランス、制約を追加できます。',
    audienceSummary:
      '参加者の組み合わせが会話の質やエネルギー、新しい出会いに影響するワークショップに適しています。',
    faqEntries: [
      {
        question: 'ワークショップのグループを作るには？',
        answer:
          '参加者名を貼り付け、グループ数または人数を設定して「グループを作成」を押してください。すぐに使えるグループが作成されます。',
      },
      {
        question: 'ラウンドごとに参加者を入れ替えられますか？',
        answer:
          'はい。複数セッションと重複回避を使えば、進行の中で新しい人同士が会いやすくなります。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'student-group-generator': createContent({
    title: '学生グループ作成ツール — 授業のグループ分けをすばやく | GroupMixer',
    description:
      '無料の学生グループ作成ツール。クラス名簿を貼り付けるだけで、数秒でバランスのよいグループを作れます。特定の生徒を一緒にしたり離したりする設定も可能です。',
    eyebrow: '教師と授業活動向け',
    heroTitle: '学生グループ作成ツール',
    subhead:
      'クラス名簿を貼り付けるだけで即座にグループ分け。必要なら「一緒にする」「離す」などのルールも追加できます。',
    audienceSummary:
      '教師が、ペアや班分けの公平さを保ちながら、すばやくグループを作りたい場面に向いています。',
    faqEntries: [
      {
        question: '学生グループを作るには？',
        answer:
          '生徒名を1行ずつ貼り付け、グループ数を選んで「グループを作成」を押してください。GroupMixer が自動で分けます。',
      },
      {
        question: '特定の生徒を一緒にしたり離したりできますか？',
        answer:
          'はい。詳細オプションで「一緒にする」「同じグループにしない」を指定できます。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'speed-networking-generator': createContent({
    title: 'スピードネットワーキング作成ツール — 複数ラウンドで重複を減らす | GroupMixer',
    description:
      '無料のスピードネットワーキング作成ツール。参加者が毎回新しい相手と会える複数ラウンドを作成し、同じ組み合わせの繰り返しを自動で減らします。',
    eyebrow: '交流会、ミートアップ、ネットワーキング向け',
    heroTitle: 'スピードネットワーキング作成ツール',
    subhead:
      '名前を貼り付けてラウンド数を決めるだけで、毎回新しい相手と会いやすいネットワーキングを作成できます。',
    audienceSummary:
      '同じ小グループを繰り返すのではなく、新しいつながりを増やしたい構造化ネットワーキングに最適です。',
    faqEntries: [
      {
        question: 'スピードネットワーキング作成ツールはどう動きますか？',
        answer:
          '参加者名を貼り付け、ラウンド数を設定して「繰り返しを避ける」を有効にすると、各ラウンドで重複を抑えた組み合わせを作成します。',
      },
      {
        question: 'グループサイズは調整できますか？',
        answer:
          'はい。各ラウンドのグループ数または1グループあたりの人数を指定できます。',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.workspace,
    ],
  }),
};
