import type { AutoSolveTelemetry, SolverSettings } from '../../types';
import { UNIVERSAL_SETTINGS_FIELDS } from './universal';
import type {
  SolverMetricSectionSpec,
  SolverMetricSpec,
  SolverSettingsSectionSpec,
  SolverSettingsSummaryRow,
  SolverUiSpec,
} from './types';

function finiteNumber(value: number | undefined | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatNumber(value: number | undefined | null, digits = 2): string {
  return finiteNumber(value) ? value.toFixed(digits) : '—';
}

function formatSeconds(value: number | undefined | null): string {
  return finiteNumber(value) ? `${value.toFixed(2)}s` : '—';
}

function formatBool(value: boolean | undefined | null): string {
  return typeof value === 'boolean' ? (value ? 'Yes' : 'No') : '—';
}

function formatEnumLabel(value: string | undefined | null): string {
  if (!value) {
    return '—';
  }

  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function autoTelemetry(context: { benchmarkTelemetry?: { auto?: AutoSolveTelemetry | null } | null }): AutoSolveTelemetry | null {
  return context.benchmarkTelemetry?.auto ?? null;
}

export const AUTO_SETTINGS_SECTION: SolverSettingsSectionSpec = {
  id: 'auto-policy-settings',
  title: 'Auto Policy Controls',
  description: 'Auto owns routing, construction, and runtime budgets. The webapp exposes only safe shared controls such as deterministic seeding.',
  kind: 'solver_specific',
  fields: UNIVERSAL_SETTINGS_FIELDS.filter((field) => field.id === 'seed'),
};

const AUTO_TELEMETRY_METRICS: readonly SolverMetricSpec[] = [
  {
    id: 'auto_selected_solver',
    label: 'Selected Solver',
    description: 'Concrete solver family selected by Auto. Product default Auto should delegate actual solving to solver3.',
    kind: 'solver_specific',
    render: (context) => autoTelemetry(context)?.selected_solver ?? '—',
  },
  {
    id: 'auto_complexity_score',
    label: 'Complexity Score',
    description: 'Canonical input-only problem complexity score used to derive Auto runtime budgets.',
    kind: 'solver_specific',
    render: (context) => formatNumber(autoTelemetry(context)?.complexity_score, 2),
  },
  {
    id: 'auto_complexity_model',
    label: 'Complexity Model',
    description: 'Version identifier for the deterministic complexity model used by Auto.',
    kind: 'solver_specific',
    render: (context) => autoTelemetry(context)?.complexity_model_version ?? '—',
  },
  {
    id: 'auto_total_budget',
    label: 'Total Budget',
    description: 'Total complexity-derived wall-clock budget assigned by Auto.',
    kind: 'solver_specific',
    render: (context) => formatSeconds(autoTelemetry(context)?.total_budget_seconds),
  },
  {
    id: 'auto_construction_budget',
    label: 'Construction Budget',
    description: 'Bounded time reserved for the oracle-guided construction attempt before search.',
    kind: 'solver_specific',
    render: (context) => formatSeconds(autoTelemetry(context)?.oracle_construction_budget_seconds),
  },
  {
    id: 'auto_scaffold_budget',
    label: 'Scaffold Budget',
    description: 'Subset of construction time reserved for constraint-scenario scaffold/warmup work.',
    kind: 'solver_specific',
    render: (context) => formatSeconds(autoTelemetry(context)?.scaffold_budget_seconds),
  },
  {
    id: 'auto_oracle_recombination_budget',
    label: 'Oracle/Recombination Budget',
    description: 'Subset of construction time reserved for solver6 oracle, projection, merge, and recombination work.',
    kind: 'solver_specific',
    render: (context) => formatSeconds(autoTelemetry(context)?.oracle_recombination_budget_seconds),
  },
  {
    id: 'auto_search_budget',
    label: 'Search Budget',
    description: 'Time reserved for solver3 search after construction. Auto keeps at least 70% of total runtime for search.',
    kind: 'solver_specific',
    render: (context) => formatSeconds(autoTelemetry(context)?.search_budget_seconds),
  },
  {
    id: 'auto_constructor_attempt',
    label: 'Constructor Attempt',
    description: 'Constructor path Auto attempted before handing the incumbent to solver3 search.',
    kind: 'solver_specific',
    render: (context) => formatEnumLabel(autoTelemetry(context)?.constructor_attempt),
  },
  {
    id: 'auto_constructor_outcome',
    label: 'Constructor Outcome',
    description: 'Outcome of the constructor attempt, including explicit timeout/validation/unsupported/fallback cases.',
    kind: 'solver_specific',
    render: (context) => formatEnumLabel(autoTelemetry(context)?.constructor_outcome),
  },
  {
    id: 'auto_constructor_fallback',
    label: 'Baseline Fallback',
    description: 'Whether Auto explicitly fell back from oracle-guided construction to baseline construction.',
    kind: 'solver_specific',
    render: (context) => formatBool(autoTelemetry(context)?.constructor_fallback_used),
  },
  {
    id: 'auto_constructor_wall',
    label: 'Constructor Wall Time',
    description: 'Measured wall-clock time spent constructing the starting incumbent.',
    kind: 'solver_specific',
    render: (context) => formatSeconds(autoTelemetry(context)?.constructor_wall_seconds),
  },
  {
    id: 'auto_constructor_failure',
    label: 'Constructor Failure',
    description: 'Explicit failure reason recorded when oracle-guided construction could not supply the incumbent.',
    kind: 'solver_specific',
    render: (context) => autoTelemetry(context)?.constructor_failure ?? '—',
    isVisible: (context) => Boolean(autoTelemetry(context)?.constructor_failure),
  },
];

export const AUTO_TELEMETRY_METRIC_SECTION: SolverMetricSectionSpec = {
  id: 'auto-run-telemetry',
  title: 'Auto Route and Budget Telemetry',
  description: 'Completion telemetry for Auto route selection, complexity-derived budgets, constructor outcome, and explicit fallback behavior.',
  kind: 'solver_specific',
  metrics: AUTO_TELEMETRY_METRICS,
};

export function summarizeAutoSettings(settings: SolverSettings): readonly SolverSettingsSummaryRow[] {
  return [
    {
      label: 'Mode',
      value: 'Auto default',
    },
    {
      label: 'Actual Solver',
      value: 'Solver 3',
    },
    {
      label: 'Runtime Budget',
      value: 'Complexity-derived',
    },
    {
      label: 'Construction',
      value: 'Oracle-guided with explicit baseline fallback',
    },
    {
      label: 'Seed',
      value: settings.seed?.toLocaleString() ?? 'Auto',
    },
  ];
}

export const AUTO_UI_SPEC: SolverUiSpec = {
  familyId: 'auto',
  displayName: 'Auto',
  shortDescription: 'Product-default solve mode: solver3 with complexity-derived budgets, bounded oracle-guided construction, and explicit fallback telemetry.',
  algorithmHighlights: [
    'Always delegates actual search to solver3; it is not a hidden multi-solver router.',
    'Derives total runtime from canonical problem complexity instead of user-tuned stop conditions.',
    'Bounds constraint-scenario oracle-guided construction and reserves at least 70% of runtime for search.',
    'Falls back to baseline construction only as an explicit, telemetry-visible solver3 construction fallback.',
  ],
  settingsSections: [AUTO_SETTINGS_SECTION],
  liveMetricSections: [AUTO_TELEMETRY_METRIC_SECTION],
  summarizeSettings: summarizeAutoSettings,
};
