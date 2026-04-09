import type { SolverSettings } from '../../types';
import { getSolver1Params } from './translate';
import type {
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

function withSolver1Params(
  settings: SolverSettings,
  update: (params: ReturnType<typeof getSolver1Params>) => ReturnType<typeof getSolver1Params>,
): SolverSettings {
  const current = getSolver1Params(settings);
  return {
    ...settings,
    solver_type: 'SimulatedAnnealing',
    solver_params: {
      SimulatedAnnealing: update(current),
    },
  };
}

export const SOLVER1_SETTINGS_FIELDS: readonly SolverNumberSettingFieldSpec[] = [
  {
    id: 'initial_temperature',
    inputKey: 'initialTemp',
    type: 'number',
    kind: 'solver_specific',
    label: 'Initial Temperature',
    description: 'Starting simulated annealing temperature. Higher values allow more exploration.',
    min: '0.1',
    max: '10',
    step: '0.1',
    defaultValue: '1',
    parse: (raw) => parseFloat(raw),
    isValid: (value) => !Number.isNaN(value) && value >= 0.1,
    getValue: (settings) => getSolver1Params(settings).initial_temperature,
    applyValue: (settings, value) => withSolver1Params(settings, (params) => ({ ...params, initial_temperature: value })),
  },
  {
    id: 'final_temperature',
    inputKey: 'finalTemp',
    type: 'number',
    kind: 'solver_specific',
    label: 'Final Temperature',
    description: 'Temperature at which simulated annealing stops cooling.',
    min: '0.001',
    max: '1',
    step: '0.001',
    defaultValue: '0.01',
    parse: (raw) => parseFloat(raw),
    isValid: (value) => !Number.isNaN(value) && value >= 0.001,
    getValue: (settings) => getSolver1Params(settings).final_temperature,
    applyValue: (settings, value) => withSolver1Params(settings, (params) => ({ ...params, final_temperature: value })),
  },
  {
    id: 'reheat_cycles',
    inputKey: 'reheatCycles',
    type: 'number',
    kind: 'solver_specific',
    label: 'Reheat Cycles',
    description: 'Number of full cool-down/reheat cycles. 0 disables cycling.',
    min: '0',
    max: '100000',
    defaultValue: '0',
    placeholder: '0 = disabled',
    parse: (raw) => parseInt(raw, 10),
    isValid: (value) => !Number.isNaN(value) && value >= 0,
    getValue: (settings) => getSolver1Params(settings).reheat_cycles,
    applyValue: (settings, value) => withSolver1Params(settings, (params) => ({ ...params, reheat_cycles: value })),
  },
  {
    id: 'reheat_after_no_improvement',
    inputKey: 'reheat',
    type: 'number',
    kind: 'solver_specific',
    label: 'Reheat After No Improvement',
    description: 'Reset temperature after this many non-improving iterations. 0 disables the trigger.',
    min: '0',
    max: '50000',
    defaultValue: '0',
    placeholder: '0 = disabled',
    parse: (raw) => parseInt(raw, 10),
    isValid: (value) => !Number.isNaN(value) && value >= 0,
    getValue: (settings) => getSolver1Params(settings).reheat_after_no_improvement,
    applyValue: (settings, value) => withSolver1Params(settings, (params) => ({ ...params, reheat_after_no_improvement: value })),
  },
];

export const SOLVER1_SETTINGS_SECTION: SolverSettingsSectionSpec = {
  id: 'solver1-specific',
  title: 'Solver 1: Simulated Annealing',
  description: 'Solver1-specific annealing controls.',
  kind: 'solver_specific',
  fields: SOLVER1_SETTINGS_FIELDS,
};

const SOLVER1_METRICS: readonly SolverMetricSpec[] = [
  {
    id: 'temperature',
    label: 'Temperature',
    description: 'Current simulated annealing temperature.',
    kind: 'solver_specific',
    render: ({ progress }) => formatNumber(progress?.temperature, 4),
  },
  {
    id: 'cooling_progress',
    label: 'Cooling Progress',
    description: 'Progress through the simulated annealing cooling schedule.',
    kind: 'solver_specific',
    render: ({ progress }) => {
      const value = typeof progress?.cooling_progress === 'number' && Number.isFinite(progress.cooling_progress)
        ? progress.cooling_progress
        : 0;
      return `${(value * 100).toFixed(1)}%`;
    },
  },
  {
    id: 'reheats_performed',
    label: 'Reheats Performed',
    description: 'Number of times the annealing schedule has been reheated.',
    kind: 'solver_specific',
    render: ({ progress }) => progress?.reheats_performed?.toLocaleString() ?? '0',
  },
  {
    id: 'iterations_since_last_reheat',
    label: 'Iterations Since Last Reheat',
    description: 'Iterations completed since the last reheat.',
    kind: 'solver_specific',
    render: ({ progress }) => progress?.iterations_since_last_reheat?.toLocaleString() ?? '0',
  },
];

export const SOLVER1_METRIC_SECTION: SolverMetricSectionSpec = {
  id: 'solver1-specific-metrics',
  title: 'Solver 1 Specific Metrics',
  description: 'Metrics whose meaning is specific to simulated annealing.',
  kind: 'solver_specific',
  metrics: SOLVER1_METRICS,
};

export function summarizeSolver1Settings(settings: SolverSettings): readonly SolverSettingsSummaryRow[] {
  const params = getSolver1Params(settings);
  return [
    { label: 'Initial Temperature', value: formatNumber(params.initial_temperature) },
    { label: 'Final Temperature', value: formatNumber(params.final_temperature) },
    { label: 'Cooling Schedule', value: params.cooling_schedule },
    {
      label: 'Reheat After',
      value: params.reheat_after_no_improvement === 0 ? 'Disabled' : params.reheat_after_no_improvement.toLocaleString(),
    },
    {
      label: 'Reheat Cycles',
      value: params.reheat_cycles === 0 ? 'Disabled' : params.reheat_cycles.toLocaleString(),
    },
  ];
}

export const SOLVER1_UI_SPEC: SolverUiSpec = {
  familyId: 'solver1',
  displayName: 'Solver 1',
  shortDescription: 'Current production solver family backed by simulated annealing.',
  algorithmHighlights: [
    'Starts with a high temperature for exploration.',
    'Gradually cools to focus on improving local moves.',
    'Can escape local optima by accepting some uphill moves.',
    'Optional reheats restart exploration when search gets stuck.',
  ],
  settingsSections: [SOLVER1_SETTINGS_SECTION],
  liveMetricSections: [SOLVER1_METRIC_SECTION],
  summarizeSettings: summarizeSolver1Settings,
};
