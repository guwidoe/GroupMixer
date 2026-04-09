import type { SolverSettings } from '../../types';
import { DEFAULT_SOLVER3_CORRECTNESS_LANE } from './defaults';
import { getSolver3Params } from './translate';
import type {
  SolverBooleanSettingFieldSpec,
  SolverMetricSectionSpec,
  SolverMetricSpec,
  SolverNumberSettingFieldSpec,
  SolverSettingsSectionSpec,
  SolverSettingsSummaryRow,
  SolverUiSpec,
} from './types';

function formatNumber(value: number | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function withSolver3Params(
  settings: SolverSettings,
  update: (params: ReturnType<typeof getSolver3Params>) => ReturnType<typeof getSolver3Params>,
): SolverSettings {
  const current = getSolver3Params(settings);
  const next = update(current);
  return {
    ...settings,
    solver_type: 'solver3',
    solver_params: {
      solver_type: 'solver3',
      correctness_lane: {
        ...DEFAULT_SOLVER3_CORRECTNESS_LANE,
        ...next.correctness_lane,
      },
    },
  };
}

export const SOLVER3_SETTINGS_FIELDS: readonly (SolverBooleanSettingFieldSpec | SolverNumberSettingFieldSpec)[] = [
  {
    id: 'correctness_lane_enabled',
    inputKey: 'correctnessLaneEnabled',
    type: 'boolean',
    kind: 'solver_specific',
    label: 'Enable Correctness Lane',
    description: 'Run sampled correctness/oracle checks during search. Intended for correctness runs, not perf runs.',
    getValue: (settings) => getSolver3Params(settings).correctness_lane?.enabled ?? DEFAULT_SOLVER3_CORRECTNESS_LANE.enabled,
    applyValue: (settings, value) => withSolver3Params(settings, (params) => ({
      ...params,
      correctness_lane: {
        ...DEFAULT_SOLVER3_CORRECTNESS_LANE,
        ...params.correctness_lane,
        enabled: value,
      },
    })),
  },
  {
    id: 'correctness_lane_sample_every_accepted_moves',
    inputKey: 'correctnessLaneSampleEveryAcceptedMoves',
    type: 'number',
    kind: 'solver_specific',
    label: 'Correctness Sample Cadence',
    description: 'Run sampled correctness checks every N accepted moves.',
    min: '1',
    max: '100000',
    step: '1',
    defaultValue: '16',
    parse: (raw) => parseInt(raw, 10),
    isValid: (value) => !Number.isNaN(value) && value >= 1,
    getValue: (settings) => getSolver3Params(settings).correctness_lane?.sample_every_accepted_moves
      ?? DEFAULT_SOLVER3_CORRECTNESS_LANE.sample_every_accepted_moves,
    applyValue: (settings, value) => withSolver3Params(settings, (params) => ({
      ...params,
      correctness_lane: {
        ...DEFAULT_SOLVER3_CORRECTNESS_LANE,
        ...params.correctness_lane,
        sample_every_accepted_moves: value,
      },
    })),
  },
];

export const SOLVER3_SETTINGS_SECTION: SolverSettingsSectionSpec = {
  id: 'solver3-specific',
  title: 'Solver 3: Dense-State Search',
  description: 'Solver3-specific controls. Recommendation is currently unsupported.',
  kind: 'solver_specific',
  fields: SOLVER3_SETTINGS_FIELDS,
};

const SOLVER3_METRICS: readonly SolverMetricSpec[] = [
  {
    id: 'acceptance_threshold',
    label: 'Acceptance Threshold',
    description: 'Solver3 reuses the shared temperature field to report its current search/acceptance threshold.',
    kind: 'solver_specific',
    render: ({ progress }) => formatNumber(progress?.temperature, 4),
  },
  {
    id: 'search_schedule_progress',
    label: 'Search Schedule Progress',
    description: 'Solver3 reuses the shared cooling_progress field to report progress through its search schedule.',
    kind: 'solver_specific',
    render: ({ progress }) => {
      const value = typeof progress?.cooling_progress === 'number' && Number.isFinite(progress.cooling_progress)
        ? progress.cooling_progress
        : 0;
      return `${(value * 100).toFixed(1)}%`;
    },
  },
  {
    id: 'local_optima_escapes',
    label: 'Escapes from Local Optima',
    description: 'Number of uphill or exploratory moves used to escape local optima.',
    kind: 'solver_specific',
    render: ({ progress }) => progress?.local_optima_escapes?.toLocaleString() ?? '0',
  },
];

export const SOLVER3_METRIC_SECTION: SolverMetricSectionSpec = {
  id: 'solver3-specific-metrics',
  title: 'Solver 3 Specific Metrics',
  description: 'Metrics whose labels and meaning must stay solver3-specific.',
  kind: 'solver_specific',
  metrics: SOLVER3_METRICS,
};

export function summarizeSolver3Settings(settings: SolverSettings): readonly SolverSettingsSummaryRow[] {
  const params = getSolver3Params(settings);
  const lane = params.correctness_lane ?? DEFAULT_SOLVER3_CORRECTNESS_LANE;
  return [
    {
      label: 'Correctness Lane',
      value: lane.enabled ? 'Enabled' : 'Disabled',
    },
    {
      label: 'Sample Every Accepted Moves',
      value: lane.sample_every_accepted_moves.toLocaleString(),
    },
  ];
}

export const SOLVER3_UI_SPEC: SolverUiSpec = {
  familyId: 'solver3',
  displayName: 'Solver 3',
  shortDescription: 'Performance-oriented dense-state solver family with optional correctness-lane sampling.',
  algorithmHighlights: [
    'Uses a dense compiled problem and flat runtime state.',
    'Targets fast hot-path search operations.',
    'Exposes an optional sampled correctness lane for validation runs.',
    'Should be presented as an alternative family, not a silent replacement for solver1.',
  ],
  settingsSections: [SOLVER3_SETTINGS_SECTION],
  liveMetricSections: [SOLVER3_METRIC_SECTION],
  summarizeSettings: summarizeSolver3Settings,
};
