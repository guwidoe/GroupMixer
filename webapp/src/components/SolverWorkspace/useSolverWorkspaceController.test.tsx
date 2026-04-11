import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSolverSettings } from '../../services/solverUi';
import { useSolverWorkspaceController } from './useSolverWorkspaceController';

const mockNavigate = vi.fn();
const mockLoadRuntimeSolverCatalog = vi.fn().mockResolvedValue(undefined);
const mockUpdateScenario = vi.fn();

const mockStoreState = {
  scenario: {
    people: [],
    groups: [],
    num_sessions: 2,
    objectives: [],
    constraints: [],
    settings: createDefaultSolverSettings('solver1'),
  },
  runtimeSolverCatalog: [
    {
      canonical_id: 'solver1',
      display_name: 'Solver 1',
      accepted_config_ids: ['solver1'],
      notes: 'Stable solver.',
      capabilities: {
        supports_initial_schedule: true,
        supports_progress_callback: true,
        supports_benchmark_observer: false,
        supports_recommended_settings: true,
        supports_deterministic_seed: true,
      },
    },
    {
      canonical_id: 'solver3',
      display_name: 'Solver 3',
      accepted_config_ids: ['solver3'],
      notes: 'Experimental solver.',
      capabilities: {
        supports_initial_schedule: true,
        supports_progress_callback: true,
        supports_benchmark_observer: false,
        supports_recommended_settings: false,
        supports_deterministic_seed: true,
      },
    },
  ],
  runtimeSolverCatalogStatus: 'ready',
  runtimeSolverCatalogError: null,
  loadRuntimeSolverCatalog: mockLoadRuntimeSolverCatalog,
  updateScenario: mockUpdateScenario,
};

const mockUseAppStore = vi.fn((selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState));
const mockUseParams = vi.fn(() => ({ section: 'run' }));

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: typeof mockStoreState) => unknown) => mockUseAppStore(selector),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}));

describe('useSolverWorkspaceController', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockLoadRuntimeSolverCatalog.mockClear();
    mockUpdateScenario.mockClear();
    mockUseParams.mockReset();
    mockUseParams.mockReturnValue({ section: 'run' });
    mockStoreState.scenario.settings = createDefaultSolverSettings('solver1');
    mockStoreState.runtimeSolverCatalogStatus = 'ready';
  });

  it('redirects invalid route params back to the canonical run section', async () => {
    mockUseParams.mockReturnValue({ section: 'not-a-real-section' });

    renderHook(() => useSolverWorkspaceController());

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/app/solver/run', { replace: true });
    });
  });

  it('switches the working scenario to match the active manual solver-family route', async () => {
    mockUseParams.mockReturnValue({ section: 'solver3' });

    renderHook(() => useSolverWorkspaceController());

    await waitFor(() => {
      expect(mockUpdateScenario).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            solver_type: 'solver3',
          }),
        }),
      );
    });
  });

  it('loads the runtime catalog when the workspace controller starts from idle', async () => {
    mockStoreState.runtimeSolverCatalogStatus = 'idle';

    renderHook(() => useSolverWorkspaceController());

    await waitFor(() => {
      expect(mockLoadRuntimeSolverCatalog).toHaveBeenCalledTimes(1);
    });
  });
});
