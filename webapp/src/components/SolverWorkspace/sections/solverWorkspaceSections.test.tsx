/* eslint-disable react/no-multi-comp */
import { render, screen } from '@testing-library/react';
import { PlayCircle } from 'lucide-react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRunController = {
  selectedSolverFamilyId: 'solver1',
  solverCatalog: [],
  handleSelectSolverFamily: vi.fn(),
  solverState: { isRunning: false },
  scenario: null,
  selectedSolverCatalogEntry: null,
  solverCatalogStatus: 'ready',
  solverCatalogErrorMessage: null,
  solverFormInputs: {},
  setSolverFormInputs: vi.fn(),
  desiredRuntimeMain: 3,
  setDesiredRuntimeMain: vi.fn(),
  handleStartSolver: vi.fn(),
  setShowCancelConfirm: vi.fn(),
  handleSaveBestSoFar: vi.fn(),
  handleResetSolver: vi.fn(),
  displaySettings: {
    solver_type: 'solver1',
    stop_conditions: {},
    solver_params: {},
  },
  showLiveViz: false,
  toggleLiveViz: vi.fn(),
  liveVizState: null,
  liveVizPluginId: 'scheduleMatrix',
  handleLiveVizPluginChange: vi.fn(),
  getLiveVizScenario: vi.fn(),
  showMetrics: false,
  toggleMetrics: vi.fn(),
  desiredRuntimeSettings: 3,
  setDesiredRuntimeSettings: vi.fn(),
  handleAutoSetSettings: vi.fn(),
  solverSettings: {
    solver_type: 'solver1',
    stop_conditions: {},
    solver_params: {},
  },
  currentScenarioId: null,
  savedScenarios: {},
  warmStartSelection: null,
  setWarmStartSelection: vi.fn(),
  setWarmStartFromResult: vi.fn(),
  allowedSessionsLocal: null,
  setAllowedSessionsLocal: vi.fn(),
  handleSettingsChange: vi.fn(),
  selectedSolverUiSpec: null,
};

vi.mock('../useSolverWorkspaceRunController', () => ({
  useSolverWorkspaceRunController: () => mockRunController,
}));

vi.mock('../blocks/SolverFamilyChooser', () => ({
  SolverFamilyChooser: () => <div>SolverFamilyChooser</div>,
}));

vi.mock('../blocks/SolverRunControls', () => ({
  SolverRunControls: () => <div>SolverRunControls</div>,
}));

vi.mock('../blocks/SolverStatusDashboard', () => ({
  SolverStatusDashboard: () => <div>SolverStatusDashboard</div>,
}));

vi.mock('../blocks/RecommendedSettingsPanel', () => ({
  RecommendedSettingsPanel: () => <div>RecommendedSettingsPanel</div>,
}));

vi.mock('../blocks/WarmStartPanel', () => ({
  WarmStartPanel: () => <div>WarmStartPanel</div>,
}));

vi.mock('../blocks/AllowedSessionsPanel', () => ({
  AllowedSessionsPanel: () => <div>AllowedSessionsPanel</div>,
}));

vi.mock('../blocks/SolverSettingsSections', () => ({
  SolverSettingsSections: () => <div>SolverSettingsSections</div>,
}));

vi.mock('../blocks/DetailedMetricsPanel', () => ({
  DetailedMetricsPanel: () => <div>DetailedMetricsPanel</div>,
}));

vi.mock('../blocks/SolverFamilyInfoPanel', () => ({
  SolverFamilyInfoPanel: () => <div>SolverFamilyInfoPanel</div>,
}));

import { RunSolverSection } from './RunSolverSection';
import { SolverFamilySection } from './SolverFamilySection';

describe('solver workspace sections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the recommended run page with chooser and without manual settings sections', () => {
    render(<RunSolverSection />);

    expect(screen.getByRole('heading', { name: 'Run Solver' })).toBeInTheDocument();
    expect(screen.getByText('SolverFamilyChooser')).toBeInTheDocument();
    expect(screen.getByText('SolverRunControls')).toBeInTheDocument();
    expect(screen.getByText('RecommendedSettingsPanel')).toBeInTheDocument();
    expect(screen.queryByText('LiveVisualizationPanel')).not.toBeInTheDocument();
    expect(screen.queryByText('DetailedMetricsPanel')).not.toBeInTheDocument();
    expect(screen.queryByText('SolverFamilyInfoPanel')).not.toBeInTheDocument();
    expect(screen.queryByText('SolverSettingsSections')).not.toBeInTheDocument();
  });

  it('renders the manual solver-family page without duplicating the family chooser', () => {
    render(
      <SolverFamilySection
        section={{
          id: 'solver3',
          routeSegment: 'solver3',
          label: 'Solver 3',
          description: 'Manual tuning surface for Solver 3.',
          tooltipDescription: 'Manual tuning surface for Solver 3.',
          group: 'manual-tuning',
          order: 3,
          icon: PlayCircle,
          familyId: 'solver3',
          catalogEntry: {
            id: 'solver3',
            displayName: 'Solver 3',
            acceptedConfigIds: ['solver3'],
            notes: 'Experimental solver.',
            capabilities: {
              supportsInitialSchedule: true,
              supportsProgressCallback: true,
              supportsBenchmarkObserver: false,
              supportsRecommendedSettings: false,
              supportsDeterministicSeed: true,
            },
            uiSpecAvailable: true,
            experimental: true,
          },
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Solver 3' })).toBeInTheDocument();
    expect(screen.getByText('Experimental')).toBeInTheDocument();
    expect(screen.getByText('SolverSettingsSections')).toBeInTheDocument();
    expect(screen.queryByText('LiveVisualizationPanel')).not.toBeInTheDocument();
    expect(screen.getByText('DetailedMetricsPanel')).toBeInTheDocument();
    expect(screen.getByText('SolverFamilyInfoPanel')).toBeInTheDocument();
    expect(screen.queryByText('SolverFamilyChooser')).not.toBeInTheDocument();
  });
});
