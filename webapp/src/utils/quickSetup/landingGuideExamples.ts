import type { GuidePageKey } from '../../pages/guidePageTypes';
import type {
  QuickSetupDraft,
  QuickSetupFixedAssignment,
  QuickSetupGroupingMode,
  QuickSetupParticipantColumn,
} from '../../components/EmbeddableTool/types';
import type { DemoCaseWithMetrics } from '../../components/ScenarioEditor/types';
import type { ToolPagePreset } from '../../pages/toolPageTypes';
import { serializeParticipantColumns } from './participantColumns';

export interface LandingGuideExample {
  key: GuidePageKey;
  label: string;
  description: string;
  groupingMode: QuickSetupGroupingMode;
  groupingValue: number;
  sessions: number;
  preset: ToolPagePreset;
  avoidRepeatPairings: boolean;
  participantColumns: QuickSetupParticipantColumn[];
  balanceAttributeKeys: string[];
  keepTogetherInput: string;
  avoidPairingsInput: string;
  fixedAssignments: QuickSetupFixedAssignment[];
}

type ExampleRow = Record<string, string> & { name: string };

function columnsFromRows(rows: ExampleRow[]): QuickSetupParticipantColumn[] {
  const attributeKeys = [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => key !== 'name')))];
  return [
    {
      id: 'name',
      name: 'Name',
      values: rows.map((row) => row.name).join('\n'),
    },
    ...attributeKeys.map((key, index) => ({
      id: `attribute-${index + 1}`,
      name: key,
      values: rows.map((row) => row[key] ?? '').join('\n'),
    })),
  ];
}

function namesColumn(names: string[]): QuickSetupParticipantColumn[] {
  return [{
    id: 'name',
    name: 'Name',
    values: names.join('\n'),
  }];
}

function rows(names: string[], attributeRows: Array<Record<string, string>>): ExampleRow[] {
  return names.map((name, index) => ({ name, ...(attributeRows[index] ?? {}) }));
}

const workshopNames = [
  'Maya Chen', 'Owen Brooks', 'Priya Shah', 'Noah Patel',
  'Lena Hoffmann', 'Ethan Rivera', 'Ava Thompson', 'Jonas Weber',
  'Sofia Garcia', 'Miles Johnson', 'Nina Fischer', 'Caleb Morgan',
  'Emma Wilson', 'Leo Martin', 'Hannah Kim', 'Felix Wagner',
  'Mila Novak', 'Theo Brown', 'Amara Singh', 'Julian Park',
  'Clara Evans', 'Samir Khan', 'Iris Meyer', 'Ben Carter',
];

const speedNetworkingNames = [
  'Amelia Grant', 'Mateo Silva', 'Nora Blake', 'Elias Reed', 'Chloe Ward',
  'Daniel Fox', 'Isla Hayes', 'Lucas Stone', 'Mia Palmer', 'Oscar Lane',
  'Grace Ellis', 'Leo Bennett', 'Hannah Price', 'Kai Foster', 'Eva Brooks',
  'Max Turner', 'Zoe Parker', 'Liam Hughes', 'Ruby Scott', 'Finn Cooper',
  'Naomi Bell', 'Arjun Rao', 'Lily Adams', 'Jasper King', 'Ivy Green',
  'Ravi Mehta', 'Sophie Clark', 'Mason Hill', 'Leah Young', 'Omar Lewis',
];

const classroomNames = [
  'Aiden Miller', 'Bella Davis', 'Carlos Nguyen', 'Dina Ahmed',
  'Elena Rossi', 'Finn Walker', 'Gia Patel', 'Henry Moore',
  'Ivy Nelson', 'Jamal Carter', 'Kira Lopez', 'Luca Stein',
  'Maya Brooks', 'Noah Kim', 'Olivia Price', 'Pavel Ivanov',
  'Quinn Taylor', 'Rina Shah', 'Sami Haddad', 'Tara Collins',
  'Uma Singh', 'Victor Reed', 'Willa Young', 'Xavier Long',
  'Yara Klein', 'Zane Murphy', 'Nia Green', 'Theo Scott',
];

const compareNames = [
  'Ana Torres', 'Ben Wallace', 'Cara Mills', 'Diego Ramos', 'Eve Coleman', 'Farah Ali',
  'Gabe Foster', 'Holly Pierce', 'Ivan Novak', 'Jade Bennett', 'Kenji Sato', 'Lena Morris',
  'Marta Ruiz', 'Nolan Price', 'Opal Grant', 'Peter Shaw', 'Rhea Kapoor', 'Simon Lee',
];

const fairClassNames = [
  'Alice Morgan', 'Bruno Keller', 'Celia Park', 'David Ross', 'Elif Kaya', 'Freya Stone',
  'George Bell', 'Hana Ito', 'Isaac Ford', 'Julia Wolf', 'Kamal Singh', 'Laura West',
  'Marco Conti', 'Nora Hayes', 'Oskar Meyer', 'Paula Cruz', 'Quentin Brooks', 'Rosa Diaz',
  'Sara Nguyen', 'Tobias Klein', 'Una Murphy', 'Vera Schmidt', 'Will Carter', 'Ximena Ortiz',
  'Yusuf Khan', 'Zoe Miller',
];

const pairRotationNames = [
  'Avery Cook', 'Blake Harris', 'Carmen Reed', 'Devon Lewis', 'Elena Hill',
  'Felix Clark', 'Gemma Young', 'Harper King', 'Ibrahim Cole', 'Juno Scott',
  'Keira Hall', 'Logan Ward', 'Mira Allen', 'Nathan Wright', 'Olive Baker',
  'Parker Green', 'Riley Adams',
];

const breakoutNames = [
  'Alicia Romero', 'Bryce Allen', 'Camila Stone', 'Derek Hill', 'Elena Grant', 'Farid Khan',
  'Greta Weber', 'Hugo Martin', 'Iris Bell', 'Jonah Price', 'Kara Mills', 'Luis Ortega',
  'Mina Shah', 'Nate Brooks', 'Olivia Chen', 'Pia Wagner', 'Quincy Ford', 'Rafael Silva',
  'Selma Novak', 'Tariq Aziz', 'Uma Patel', 'Viktor Klein', 'Wendy Moore', 'Xander Lee',
  'Yasmin Reed', 'Zara Collins', 'Adam Young', 'Bianca Scott', 'Cole Evans', 'Daria Meyer',
  'Eli Turner', 'Fatima Ali', 'Gavin Ward', 'Helena Price', 'Ian Parker', 'Jasmin Khan',
];

const teamNames = [
  'Mia Anderson', 'Jon Bell', 'Priya Kapoor', 'Felix Meyer', 'Sofia Rossi', 'Owen Clark',
  'Hannah Lee', 'Mateo Ruiz', 'Nora Schmidt', 'Sam Wilson', 'Lena Becker', 'Ravi Patel',
  'Clara Jones', 'Theo Fischer', 'Amara Johnson', 'Lucas Brown', 'Eva Zimmer', 'Noah Davis',
  'Iris Wang', 'Ben Miller', 'Maya Singh', 'Oscar Taylor', 'Zoe Martin', 'Ethan Moore',
];

export const LANDING_GUIDE_EXAMPLES: LandingGuideExample[] = [
  {
    key: 'avoid-repeat-pairings-in-workshops',
    label: 'Workshop table rotations',
    description: '24 participants, four discussion rounds, balanced roles, and fresh tablemates each round.',
    groupingMode: 'groupSize',
    groupingValue: 4,
    sessions: 4,
    preset: 'networking',
    avoidRepeatPairings: true,
    participantColumns: columnsFromRows(rows(workshopNames, workshopNames.map((_, index) => ({
      role: ['Facilitator', 'Product', 'Design', 'Engineering'][index % 4],
    })))),
    balanceAttributeKeys: ['role'],
    keepTogetherInput: 'Maya Chen, Owen Brooks',
    avoidPairingsInput: 'Priya Shah, Noah Patel\nEmma Wilson, Leo Martin',
    fixedAssignments: [],
  },
  {
    key: 'run-speed-networking-rounds',
    label: 'Speed networking rounds',
    description: '30 attendees in groups of 3 across five rounds, optimized for new conversations.',
    groupingMode: 'groupSize',
    groupingValue: 3,
    sessions: 5,
    preset: 'networking',
    avoidRepeatPairings: true,
    participantColumns: namesColumn(speedNetworkingNames),
    balanceAttributeKeys: [],
    keepTogetherInput: '',
    avoidPairingsInput: '',
    fixedAssignments: [],
  },
  {
    key: 'make-balanced-student-groups',
    label: 'Balanced student project groups',
    description: '28 students, groups of 4, balanced by skill level with a few known classroom constraints.',
    groupingMode: 'groupSize',
    groupingValue: 4,
    sessions: 1,
    preset: 'balanced',
    avoidRepeatPairings: false,
    participantColumns: columnsFromRows(rows(classroomNames, classroomNames.map((_, index) => ({
      skill: ['Strong', 'Developing', 'Steady', 'Developing'][index % 4],
    })))),
    balanceAttributeKeys: ['skill'],
    keepTogetherInput: 'Aiden Miller, Bella Davis',
    avoidPairingsInput: 'Carlos Nguyen, Dina Ahmed\nJamal Carter, Kira Lopez',
    fixedAssignments: [
      { personId: 'Elena Rossi', groupId: '1' },
      { personId: 'Noah Kim', groupId: '2' },
    ],
  },
  {
    key: 'random-vs-balanced-vs-constrained-groups',
    label: 'Balanced plus constrained workshop',
    description: 'A compact example showing when balancing and explicit rules are both useful.',
    groupingMode: 'groupCount',
    groupingValue: 3,
    sessions: 1,
    preset: 'balanced',
    avoidRepeatPairings: false,
    participantColumns: columnsFromRows(rows(compareNames, compareNames.map((_, index) => ({
      track: ['Strategy', 'Design', 'Technical'][index % 3],
    })))),
    balanceAttributeKeys: ['track'],
    keepTogetherInput: 'Ana Torres, Ben Wallace',
    avoidPairingsInput: 'Cara Mills, Diego Ramos\nJade Bennett, Kenji Sato',
    fixedAssignments: [
      { personId: 'Eve Coleman', groupId: '1' },
      { personId: 'Marta Ruiz', groupId: '2' },
      { personId: 'Rhea Kapoor', groupId: '3' },
    ],
  },
  {
    key: 'split-a-class-into-fair-groups',
    label: 'Fair classroom split',
    description: '26 students, fair group sizes, gender balance, and apart rules for known dynamics.',
    groupingMode: 'groupSize',
    groupingValue: 4,
    sessions: 1,
    preset: 'balanced',
    avoidRepeatPairings: false,
    participantColumns: columnsFromRows(rows(fairClassNames, fairClassNames.map((_, index) => ({
      gender: ['Girl', 'Boy'][index % 2],
    })))),
    balanceAttributeKeys: ['gender'],
    keepTogetherInput: '',
    avoidPairingsInput: 'Alice Morgan, Bruno Keller\nIsaac Ford, Julia Wolf\nYusuf Khan, Zoe Miller',
    fixedAssignments: [
      { personId: 'Celia Park', groupId: '1' },
      { personId: 'Marco Conti', groupId: '2' },
    ],
  },
  {
    key: 'make-random-pairs-from-a-list',
    label: 'Peer feedback pair rotation',
    description: '17 participants, mostly pairs, three rounds, and no repeat partners.',
    groupingMode: 'groupSize',
    groupingValue: 2,
    sessions: 3,
    preset: 'networking',
    avoidRepeatPairings: true,
    participantColumns: namesColumn(pairRotationNames),
    balanceAttributeKeys: [],
    keepTogetherInput: '',
    avoidPairingsInput: 'Avery Cook, Blake Harris\nCarmen Reed, Devon Lewis',
    fixedAssignments: [],
  },
  {
    key: 'assign-breakout-rooms-for-online-workshops',
    label: 'Online breakout rooms',
    description: '36 workshop participants, six rooms, three rounds, balanced experience levels, and room hosts.',
    groupingMode: 'groupCount',
    groupingValue: 6,
    sessions: 3,
    preset: 'networking',
    avoidRepeatPairings: true,
    participantColumns: columnsFromRows(rows(breakoutNames, breakoutNames.map((_, index) => ({
      experience: ['New', 'Practiced', 'Advanced'][index % 3],
    })))),
    balanceAttributeKeys: ['experience'],
    keepTogetherInput: '',
    avoidPairingsInput: 'Alicia Romero, Bryce Allen',
    fixedAssignments: [
      { personId: 'Alicia Romero', groupId: '1' },
      { personId: 'Hugo Martin', groupId: '2' },
      { personId: 'Mina Shah', groupId: '3' },
      { personId: 'Tariq Aziz', groupId: '4' },
      { personId: 'Adam Young', groupId: '5' },
      { personId: 'Helena Price', groupId: '6' },
    ],
  },
  {
    key: 'create-balanced-random-teams',
    label: 'Cross-functional project teams',
    description: '24 people, four project teams, balanced disciplines, and fixed team leads.',
    groupingMode: 'groupCount',
    groupingValue: 4,
    sessions: 1,
    preset: 'balanced',
    avoidRepeatPairings: false,
    participantColumns: columnsFromRows(rows(teamNames, teamNames.map((_, index) => ({
      discipline: ['Engineering', 'Design', 'Product', 'Data'][index % 4],
    })))),
    balanceAttributeKeys: ['discipline'],
    keepTogetherInput: '',
    avoidPairingsInput: 'Mia Anderson, Jon Bell\nSofia Rossi, Owen Clark',
    fixedAssignments: [
      { personId: 'Priya Kapoor', groupId: '1' },
      { personId: 'Hannah Lee', groupId: '2' },
      { personId: 'Nora Schmidt', groupId: '3' },
      { personId: 'Clara Jones', groupId: '4' },
    ],
  },
];

const LANDING_GUIDE_EXAMPLE_BY_KEY = new Map(LANDING_GUIDE_EXAMPLES.map((example) => [example.key, example]));

export function getLandingGuideExample(key: GuidePageKey): LandingGuideExample {
  const example = LANDING_GUIDE_EXAMPLE_BY_KEY.get(key);
  if (!example) {
    throw new Error(`Unknown landing guide example: ${key}`);
  }
  return example;
}

export function createLandingGuideExampleDraft(key: GuidePageKey, baseDraft: QuickSetupDraft): QuickSetupDraft {
  const example = getLandingGuideExample(key);
  const attributeKeys = example.participantColumns.slice(1).map((column) => column.name.trim()).filter(Boolean);
  const manualBalanceAttributeKeys = attributeKeys.filter((attributeKey) => !example.balanceAttributeKeys.includes(attributeKey));

  return {
    ...baseDraft,
    participantColumns: example.participantColumns,
    participantInput: serializeParticipantColumns(example.participantColumns),
    inputMode: example.participantColumns.length > 1 ? 'csv' : 'names',
    groupingMode: example.groupingMode,
    groupingValue: example.groupingValue,
    sessions: example.sessions,
    avoidRepeatPairings: example.avoidRepeatPairings,
    preset: example.preset,
    keepTogetherInput: example.keepTogetherInput,
    avoidPairingsInput: example.avoidPairingsInput,
    fixedAssignments: example.fixedAssignments,
    balanceAttributeKey: example.balanceAttributeKeys[0] ?? null,
    balanceTargets: {},
    manualBalanceAttributeKeys,
    advancedOpen: true,
    workspaceScenarioId: null,
  };
}

function getParticipantCount(example: LandingGuideExample): number {
  return example.participantColumns[0]?.values.split(/\r?\n/).filter((value) => value.trim().length > 0).length ?? 0;
}

function getGroupCount(example: LandingGuideExample): number {
  const participantCount = getParticipantCount(example);
  return example.groupingMode === 'groupCount'
    ? example.groupingValue
    : Math.max(1, Math.ceil(participantCount / Math.max(1, example.groupingValue)));
}

export async function loadLandingGuideExampleCasesWithMetrics(): Promise<DemoCaseWithMetrics[]> {
  return LANDING_GUIDE_EXAMPLES.map((example) => ({
    id: example.key,
    name: example.label,
    description: example.description,
    category: 'Simple',
    filename: '',
    peopleCount: getParticipantCount(example),
    groupCount: getGroupCount(example),
    sessionCount: example.sessions,
  }));
}
