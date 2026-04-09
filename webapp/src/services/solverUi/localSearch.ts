import type { SolverSettings } from '../../types';
import type {
  SolverBooleanSettingFieldSpec,
  SolverMetricSectionSpec,
  SolverMetricSpec,
  SolverSettingsSectionSpec,
  SolverSettingsSummaryRow,
} from './types';

function finiteNumber(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatRate(value: number | undefined): string {
  return `${(finiteNumber(value) * 100).toFixed(1)}%`;
}

function formatNumber(value: number | undefined, digits = 2): string {
  return finiteNumber(value).toFixed(digits);
}

export const LOCAL_SEARCH_DEBUG_FIELDS: readonly SolverBooleanSettingFieldSpec[] = [
  {
    id: 'debug_validate_invariants',
    inputKey: 'maxIterations',
    type: 'boolean',
    kind: 'family_shared',
    label: 'Validate Invariants',
    description: 'Check for duplicate assignments after each accepted move. Expensive; debugging only.',
    getValue: (settings) => !!settings.logging?.debug_validate_invariants,
    applyValue: (settings, value) => ({
      ...settings,
      logging: {
        ...settings.logging,
        debug_validate_invariants: value,
      },
    }),
  },
  {
    id: 'debug_dump_invariant_context',
    inputKey: 'timeLimit',
    type: 'boolean',
    kind: 'family_shared',
    label: 'Dump Invariant Context',
    description: 'Include move details and partial schedule in invariant failures.',
    getValue: (settings) => !!settings.logging?.debug_dump_invariant_context,
    applyValue: (settings, value) => ({
      ...settings,
      logging: {
        ...settings.logging,
        debug_dump_invariant_context: value,
      },
    }),
  },
];

export const LOCAL_SEARCH_SETTINGS_SECTION: SolverSettingsSectionSpec = {
  id: 'local-search-debugging',
  title: 'Local Search Diagnostics',
  description: 'Shared debug controls for local-search-based solver families.',
  kind: 'family_shared',
  fields: LOCAL_SEARCH_DEBUG_FIELDS,
};

const LOCAL_SEARCH_METRICS: readonly SolverMetricSpec[] = [
  {
    id: 'overall_acceptance_rate',
    label: 'Acceptance Rate',
    description: 'Overall percentage of proposed moves that have been accepted.',
    kind: 'family_shared',
    render: ({ progress }) => formatRate(progress?.overall_acceptance_rate),
  },
  {
    id: 'recent_acceptance_rate',
    label: 'Recent Acceptance',
    description: 'Recent percentage of proposed moves accepted.',
    kind: 'family_shared',
    render: ({ progress }) => formatRate(progress?.recent_acceptance_rate),
  },
  {
    id: 'avg_time_per_iteration_ms',
    label: 'Avg Time / Iteration',
    description: 'Average time taken to complete one iteration.',
    kind: 'family_shared',
    render: ({ progress }) => `${formatNumber(progress?.avg_time_per_iteration_ms)} ms`,
  },
  {
    id: 'search_efficiency',
    label: 'Search Efficiency',
    description: 'High-level proxy for how effectively the search explores the space.',
    kind: 'family_shared',
    render: ({ progress }) => formatNumber(progress?.search_efficiency),
  },
  {
    id: 'clique_swap_success_rate',
    label: 'Clique Swap Success',
    description: 'Share of clique-swap attempts that were accepted.',
    kind: 'family_shared',
    render: ({ progress }) => formatRate(progress?.clique_swap_success_rate),
  },
  {
    id: 'transfer_success_rate',
    label: 'Transfer Success',
    description: 'Share of transfer attempts that were accepted.',
    kind: 'family_shared',
    render: ({ progress }) => formatRate(progress?.transfer_success_rate),
  },
  {
    id: 'swap_success_rate',
    label: 'Swap Success',
    description: 'Share of swap attempts that were accepted.',
    kind: 'family_shared',
    render: ({ progress }) => formatRate(progress?.swap_success_rate),
  },
  {
    id: 'current_constraint_penalty',
    label: 'Constraint Penalty',
    description: 'Current penalty contributed by hard/soft constraints.',
    kind: 'family_shared',
    render: ({ progress }) => formatNumber(progress?.current_constraint_penalty),
  },
  {
    id: 'current_balance_penalty',
    label: 'Balance Penalty',
    description: 'Current penalty from balance objectives and constraints.',
    kind: 'family_shared',
    render: ({ progress }) => formatNumber(progress?.current_balance_penalty),
  },
  {
    id: 'current_repetition_penalty',
    label: 'Repetition Penalty',
    description: 'Current penalty from repeated encounters.',
    kind: 'family_shared',
    render: ({ progress }) => formatNumber(progress?.current_repetition_penalty),
  },
];

export const LOCAL_SEARCH_METRIC_SECTION: SolverMetricSectionSpec = {
  id: 'local-search-metrics',
  title: 'Local Search Metrics',
  description: 'Metrics shared by current local-search solver families.',
  kind: 'family_shared',
  metrics: LOCAL_SEARCH_METRICS,
};

export function summarizeLocalSearchSettings(settings: SolverSettings): readonly SolverSettingsSummaryRow[] {
  return [
    {
      label: 'Invariant Validation',
      value: settings.logging?.debug_validate_invariants ? 'Enabled' : 'Disabled',
    },
    {
      label: 'Invariant Context Dumps',
      value: settings.logging?.debug_dump_invariant_context ? 'Enabled' : 'Disabled',
    },
  ];
}
