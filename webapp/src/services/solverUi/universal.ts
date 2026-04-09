import type { SolverSettings } from '../../types';
import type {
  SolverMetricSectionSpec,
  SolverMetricSpec,
  SolverNumberSettingFieldSpec,
  SolverSettingsSectionSpec,
  SolverSettingsSummaryRow,
} from './types';

function formatMetricValue(value: number | string | undefined, digits = 2): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(digits);
}

export const UNIVERSAL_SETTINGS_FIELDS: readonly SolverNumberSettingFieldSpec[] = [
  {
    id: 'max_iterations',
    inputKey: 'maxIterations',
    type: 'number',
    kind: 'universal',
    label: 'Max Iterations',
    description: 'The maximum number of iterations the solver will run.',
    min: '1',
    max: '100000',
    defaultValue: '10000',
    parse: (raw) => parseInt(raw, 10),
    isValid: (value) => !Number.isNaN(value) && value >= 1,
    getValue: (settings) => settings.stop_conditions.max_iterations ?? 10000,
    applyValue: (settings, value) => ({
      ...settings,
      stop_conditions: {
        ...settings.stop_conditions,
        max_iterations: value,
      },
    }),
  },
  {
    id: 'time_limit_seconds',
    inputKey: 'timeLimit',
    type: 'number',
    kind: 'universal',
    label: 'Time Limit (seconds)',
    description: 'The maximum wall-clock runtime for the solve.',
    min: '1',
    max: '300',
    defaultValue: '30',
    parse: (raw) => parseInt(raw, 10),
    isValid: (value) => !Number.isNaN(value) && value >= 1,
    getValue: (settings) => settings.stop_conditions.time_limit_seconds ?? 30,
    applyValue: (settings, value) => ({
      ...settings,
      stop_conditions: {
        ...settings.stop_conditions,
        time_limit_seconds: value,
      },
    }),
  },
  {
    id: 'no_improvement_iterations',
    inputKey: 'noImprovement',
    type: 'number',
    kind: 'universal',
    label: 'No Improvement Limit',
    description: 'Stop after this many iterations without improvement.',
    min: '1',
    max: '50000',
    defaultValue: '5000',
    placeholder: 'Iterations without improvement before stopping',
    parse: (raw) => parseInt(raw, 10),
    isValid: (value) => !Number.isNaN(value) && value >= 1,
    getValue: (settings) => settings.stop_conditions.no_improvement_iterations ?? 5000,
    applyValue: (settings, value) => ({
      ...settings,
      stop_conditions: {
        ...settings.stop_conditions,
        no_improvement_iterations: value,
      },
    }),
  },
  {
    id: 'seed',
    inputKey: 'seed',
    type: 'number',
    kind: 'universal',
    label: 'Deterministic Seed',
    description: 'Optional deterministic seed for reproducible runs.',
    min: '0',
    max: '2147483647',
    defaultValue: '0',
    placeholder: 'Optional',
    parse: (raw) => parseInt(raw, 10),
    isValid: (value) => !Number.isNaN(value) && value >= 0,
    getValue: (settings) => settings.seed ?? 0,
    applyValue: (settings, value) => ({
      ...settings,
      seed: value,
    }),
  },
];

export const UNIVERSAL_SETTINGS_SECTION: SolverSettingsSectionSpec = {
  id: 'universal-runtime-controls',
  title: 'Universal Runtime Controls',
  description: 'Settings shared across supported solver families.',
  kind: 'universal',
  fields: UNIVERSAL_SETTINGS_FIELDS,
};

const UNIVERSAL_METRICS: readonly SolverMetricSpec[] = [
  {
    id: 'iteration',
    label: 'Iteration',
    description: 'Current iteration count.',
    kind: 'universal',
    render: ({ progress }) => formatMetricValue(progress?.iteration, 0),
  },
  {
    id: 'elapsed_seconds',
    label: 'Elapsed Time',
    description: 'Elapsed solve time in seconds.',
    kind: 'universal',
    render: ({ progress }) => `${formatMetricValue(progress?.elapsed_seconds, 1)}s`,
  },
  {
    id: 'current_score',
    label: 'Current Cost Score',
    description: 'Current overall cost score. Lower is better.',
    kind: 'universal',
    render: ({ progress }) => formatMetricValue(progress?.current_score),
  },
  {
    id: 'best_score',
    label: 'Best Cost Score',
    description: 'Best overall cost score seen so far. Lower is better.',
    kind: 'universal',
    render: ({ progress }) => formatMetricValue(progress?.best_score),
  },
  {
    id: 'no_improvement_count',
    label: 'No Improvement Count',
    description: 'Iterations since the last improving solution.',
    kind: 'universal',
    render: ({ progress }) => formatMetricValue(progress?.no_improvement_count, 0),
  },
  {
    id: 'stop_reason',
    label: 'Stop Reason',
    description: 'Reported stop reason when available.',
    kind: 'universal',
    render: ({ progress }) => progress?.stop_reason ?? '—',
  },
  {
    id: 'effective_seed',
    label: 'Effective Seed',
    description: 'Actual seed used for the solve when reported.',
    kind: 'universal',
    render: ({ progress }) => progress?.effective_seed?.toLocaleString() ?? '—',
  },
];

export const UNIVERSAL_METRIC_SECTION: SolverMetricSectionSpec = {
  id: 'universal-status',
  title: 'Universal Status',
  description: 'Metrics whose semantics are shared across solver families.',
  kind: 'universal',
  metrics: UNIVERSAL_METRICS,
};

export function summarizeUniversalSettings(settings: SolverSettings): readonly SolverSettingsSummaryRow[] {
  return [
    {
      label: 'Max Iterations',
      value: (settings.stop_conditions.max_iterations ?? 0).toLocaleString(),
    },
    {
      label: 'Time Limit',
      value: `${settings.stop_conditions.time_limit_seconds ?? 0}s`,
    },
    {
      label: 'No Improvement Limit',
      value: (settings.stop_conditions.no_improvement_iterations ?? 0).toLocaleString(),
    },
    {
      label: 'Seed',
      value: settings.seed?.toLocaleString() ?? 'Auto',
    },
  ];
}
