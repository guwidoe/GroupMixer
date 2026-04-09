import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSampleScenario, createSampleSolution, createSampleSolverSettings, createSavedScenario } from '../../../test/fixtures';
import type { Scenario, ScenarioResult, SavedScenario, SolverState } from '../../../types';
import { RuntimeCancelledError, setRuntimeForTests, type SolverRuntime } from '../../../services/runtime';
import { solveScenario } from '../../../services/solver/solveScenario';
import { scenarioStorage } from '../../../services/scenarioStorage';
import { runSolver } from './runSolver';
import { useAppStore } from '../../../store';

vi.mock('../../../services/solver/solveScenario', () => ({
  solveScenario: vi.fn(),
}));

vi.mock('../../../utils/warmStart', () => ({
  reconcileResultToInitialSchedule: vi.fn(() => ({ session_0: { g1: ['p1', 'p2'] } })),
}));

vi.mock('../../../store', () => ({
  useAppStore: {
    getState: vi.fn(),
    setState: vi.fn(),
  },
}));

vi.mock('../../../services/scenarioStorage', () => ({
  scenarioStorage: {
    getCurrentScenarioId: vi.fn(() => null),
    addResult: vi.fn(),
    getScenario: vi.fn(() => null),
  },
}));

function createSavedResult(name = 'Saved Result'): ScenarioResult {
  const scenario = createSampleScenario();
  const solution = createSampleSolution();

  return {
    id: 'saved-result',
    name,
    solution,
    solverSettings: scenario.settings,
    scenarioSnapshot: {
      people: scenario.people,
      groups: scenario.groups,
      num_sessions: scenario.num_sessions,
      objectives: scenario.objectives,
      constraints: scenario.constraints,
    },
    timestamp: 1000,
    duration: solution.elapsed_time_ms,
  };
}

function createRuntimeMock(overrides: Partial<SolverRuntime> = {}): SolverRuntime {
  return {
    initialize: vi.fn(async () => undefined),
    getCapabilities: vi.fn(async () => ({
      runtimeId: 'test',
      executionModel: 'local-browser',
      lifecycle: 'local-active-solve',
      supportsStreamingProgress: true,
      supportsWarmStart: true,
      supportsCancellation: true,
      supportsEvaluation: true,
      supportsRecommendedSettings: true,
      supportsActiveSolveInspection: true,
      progressTransport: 'shared-mailbox',
      progressMailbox: {
        transport: 'shared-mailbox',
        supported: true,
        requiresCrossOriginIsolation: true,
        crossOriginIsolated: true,
        sharedArrayBufferAvailable: true,
      },
    })),
    listSolvers: vi.fn(async () => ({ solvers: [] })),
    getSolverDescriptor: vi.fn(async () => ({
      kind: 'solver1',
      canonical_id: 'solver1',
      display_name: 'Solver 1',
      accepted_config_ids: ['solver1', 'SimulatedAnnealing'],
      capabilities: {
        supports_initial_schedule: true,
        supports_progress_callback: true,
        supports_benchmark_observer: true,
        supports_recommended_settings: true,
        supports_deterministic_seed: true,
      },
      notes: 'solver1 notes',
    })),
    getDefaultSolverSettings: vi.fn(async () => createSampleSolverSettings()),
    validateScenario: vi.fn(async () => ({ valid: true, issues: [] })),
    recommendSettings: vi.fn(async () => createSampleSolverSettings()),
    solveWithProgress: vi.fn(async () => ({
      selectedSettings: createSampleSolverSettings(),
      runScenario: createSampleScenario(),
      solution: createSampleSolution(),
      lastProgress: null,
    })),
    solveWarmStart: vi.fn(async () => ({
      selectedSettings: createSampleSolverSettings(),
      runScenario: createSampleScenario(),
      solution: createSampleSolution(),
      lastProgress: null,
    })),
    evaluateSolution: vi.fn(async () => createSampleSolution()),
    cancel: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createArgs(overrides: Partial<Parameters<typeof runSolver>[0]> = {}) {
  const scenario = createSampleScenario();
  const solverSettings = createSampleSolverSettings();
  const solution = createSampleSolution();
  const lastProgress = {
    iteration: 42,
    elapsed_seconds: 1.2,
    current_score: 15,
    best_score: 10,
    no_improvement_count: 3,
    current_constraint_penalty: 0,
    current_repetition_penalty: 0,
    current_balance_penalty: 0,
    best_constraint_penalty: 0,
    best_repetition_penalty: 0,
    best_balance_penalty: 0,
  };

  const addNotification = vi.fn();
  const addResult = vi.fn(() => createSavedResult());
  const setRunSettings = vi.fn();
  const setLiveVizState = vi.fn();
  const setSolverState = vi.fn();
  const setSolution = vi.fn();
  const startSolver = vi.fn();
  const setWarmStartFromResult = vi.fn();
  const ensureScenarioExists = vi.fn(() => scenario);

  vi.mocked(solveScenario).mockResolvedValue({
    solution,
    lastProgress,
    selectedSettings: solverSettings,
    runScenario: {
      ...scenario,
      settings: solverSettings,
    },
  });

  return {
    useRecommended: false,
    scenario,
    currentScenarioId: 'scenario-1',
    savedScenarios: { 'scenario-1': createSavedScenario({ id: 'scenario-1', results: [] }) } as Record<string, SavedScenario>,
    warmStartResultId: null,
    setWarmStartFromResult,
    solverSettings,
    solverState: {
      isRunning: false,
      isComplete: false,
      currentIteration: 0,
      bestScore: 0,
      elapsedTime: 0,
      noImprovementCount: 0,
    } satisfies SolverState,
    desiredRuntimeMain: 7,
    showLiveVizRef: { current: false },
    startSolver,
    setSolverState,
    setSolution,
    addNotification,
    addResult,
    ensureScenarioExists,
    setRunSettings,
    setLiveVizState,
    liveVizLastUiUpdateRef: { current: 123 },
    runScenarioSnapshotRef: { current: null as Scenario | null },
    cancelledRef: { current: false },
    solverCompletedRef: { current: false },
    restartAfterSaveRef: { current: false },
    saveInProgressRef: { current: false },
    __expected: { solution, solverSettings, lastProgress },
    ...overrides,
  };
}

describe('runSolver', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.__groupmixerLandingEvents = [];
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setRuntimeForTests(createRuntimeMock());
    vi.mocked(useAppStore.getState).mockReturnValue({ currentScenarioId: 'scenario-1' } as { currentScenarioId: string | null });
  });

  afterEach(() => {
    setRuntimeForTests(null);
  });

  it('uses the shared solve service, emits telemetry, and saves via the active store scenario id', async () => {
    window.sessionStorage.setItem(
      'groupmixer-telemetry-attribution',
      JSON.stringify({ landingSlug: 'random-team-generator', experiment: 'seo-hero-test', variant: 'B' }),
    );
    const args = createArgs({ useRecommended: true, currentScenarioId: null });

    await runSolver(args);

    expect(args.ensureScenarioExists).toHaveBeenCalled();
    expect(solveScenario).toHaveBeenCalledWith(
      expect.objectContaining({
        scenario: expect.objectContaining({ settings: args.solverSettings }),
        useRecommendedSettings: true,
        desiredRuntimeSeconds: 7,
        enableBestScheduleTelemetry: false,
      }),
    );
    expect(args.setRunSettings).toHaveBeenCalledWith(
      expect.objectContaining(args.solverSettings),
    );
    expect(args.addResult).toHaveBeenCalledWith(
      args.__expected.solution,
      args.__expected.solverSettings,
      undefined,
      expect.any(Object),
    );
    expect(window.__groupmixerLandingEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'solver_started',
          payload: expect.objectContaining({
            landingSlug: 'random-team-generator',
            experiment: 'seo-hero-test',
            variant: 'B',
            mode: 'automatic',
          }),
        }),
        expect.objectContaining({
          name: 'solver_completed',
          payload: expect.objectContaining({
            landingSlug: 'random-team-generator',
            experiment: 'seo-hero-test',
            variant: 'B',
            mode: 'automatic',
          }),
        }),
      ]),
    );
  });

  it('uses the solver-service selected settings payload for the run', async () => {
    const args = createArgs({ useRecommended: true });
    const selectedSettings = createSampleSolverSettings();
    selectedSettings.stop_conditions.time_limit_seconds = 5;
    vi.mocked(solveScenario).mockResolvedValue({
      solution: args.__expected.solution,
      lastProgress: args.__expected.lastProgress,
      selectedSettings,
      runScenario: {
        ...args.scenario,
        settings: selectedSettings,
      },
    });

    await runSolver(args);

    expect(args.setRunSettings).toHaveBeenCalledWith(selectedSettings);
    expect(args.addResult).toHaveBeenCalledWith(
      args.__expected.solution,
      selectedSettings,
      undefined,
      expect.any(Object),
    );
  });

  it('falls back to a normal solve when the selected warm-start result is missing', async () => {
    const args = createArgs({
      warmStartResultId: 'missing-result',
      savedScenarios: {
        'scenario-1': createSavedScenario({ id: 'scenario-1', results: [] }),
      },
    });

    await runSolver(args);

    expect(solveScenario).toHaveBeenCalledWith(
      expect.objectContaining({
        warmStartSchedule: undefined,
      }),
    );
    expect(args.setWarmStartFromResult).toHaveBeenCalledWith(null);
    expect(args.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        title: 'Warm Start Failed',
      }),
    );
  });

  it('warns instead of saving when no active scenario id exists in props or store state', async () => {
    vi.mocked(useAppStore.getState).mockReturnValue({ currentScenarioId: null } as { currentScenarioId: string | null });
    const args = createArgs({ currentScenarioId: null });

    await runSolver(args);

    expect(args.addResult).not.toHaveBeenCalled();
    expect(scenarioStorage.addResult).not.toHaveBeenCalled();
    expect(args.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        title: 'Result Not Saved',
      }),
    );
  });

  it('falls back to persisted storage when props and store state have not caught up yet', async () => {
    vi.mocked(useAppStore.getState).mockReturnValue({ currentScenarioId: null } as { currentScenarioId: string | null });
    vi.mocked(scenarioStorage.getCurrentScenarioId).mockReturnValue('scenario-1');
    const persistedResult = createSavedResult('Result 1');
    vi.mocked(scenarioStorage.addResult).mockReturnValue(persistedResult);
    vi.mocked(scenarioStorage.getScenario).mockReturnValue(
      createSavedScenario({ id: 'scenario-1', results: [persistedResult] }),
    );
    const args = createArgs({ currentScenarioId: null });

    await runSolver(args);

    expect(useAppStore.setState).toHaveBeenCalledWith({ currentScenarioId: 'scenario-1' });
    expect(args.addResult).not.toHaveBeenCalled();
    expect(scenarioStorage.addResult).toHaveBeenCalledWith(
      'scenario-1',
      args.__expected.solution,
      args.__expected.solverSettings,
      undefined,
      expect.any(Object),
    );
    expect(args.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: 'Result Saved',
      }),
    );
  });

  it('uses typed runtime cancellation semantics for cancelled solves', async () => {
    const args = createArgs();
    vi.mocked(solveScenario).mockRejectedValue(new RuntimeCancelledError());

    await runSolver(args);

    expect(args.setSolverState).toHaveBeenCalledWith({ isRunning: false, isComplete: false });
    expect(args.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        title: 'Solver Cancelled',
      }),
    );
  });

  it('resumes via the runtime warm-start path after a save-and-resume completion', async () => {
    vi.useFakeTimers();
    const runtime = createRuntimeMock({
      solveWarmStart: vi.fn(async () => ({
        selectedSettings: createSampleSolverSettings(),
        runScenario: createSampleScenario(),
        solution: createSampleSolution(),
        lastProgress: null,
      })),
    });
    setRuntimeForTests(runtime);
    const args = createArgs();
    vi.mocked(solveScenario).mockImplementation(async () => {
      args.cancelledRef.current = true;
      args.restartAfterSaveRef.current = true;
      args.saveInProgressRef.current = true;
      return {
        solution: args.__expected.solution,
        lastProgress: args.__expected.lastProgress,
        selectedSettings: args.__expected.solverSettings,
        runScenario: {
          ...args.scenario,
          settings: args.__expected.solverSettings,
        },
      };
    });

    const runPromise = runSolver(args);
    await vi.runAllTimersAsync();
    await runPromise;
    await vi.runAllTimersAsync();

    expect(runtime.solveWarmStart).toHaveBeenCalledWith({
      scenario: expect.any(Object),
      initialSchedule: expect.any(Object),
      progressCallback: expect.any(Function),
    });
    expect(args.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        title: 'Resuming Solver',
      }),
    );
    vi.useRealTimers();
  });
});
