import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSampleScenario, createSampleSolution, createSampleSolverSettings } from '../../../test/fixtures';
import { saveBestSoFar } from './saveBestSoFar';
import { setRuntimeForTests, type SolverRuntime } from '../../../services/runtime';

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
    getActiveSolveSnapshot: vi.fn(() => null),
    hasActiveSolveSnapshot: vi.fn(() => false),
    ...overrides,
  };
}

describe('saveBestSoFar', () => {
  const scenario = createSampleScenario();
  const solverSettings = createSampleSolverSettings();
  let runtime: SolverRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    runtime = createRuntimeMock();
    setRuntimeForTests(runtime);
  });

  afterEach(() => {
    setRuntimeForTests(null);
  });

  it('warns when the solver is not currently running', async () => {
    const addNotification = vi.fn();

    await saveBestSoFar({
      solverState: { ...createSampleSolution(), isRunning: false, isComplete: false, currentIteration: 0, bestScore: 0, elapsedTime: 0, noImprovementCount: 0 } as never,
      scenario,
      runSettings: null,
      solverSettings,
      runScenarioSnapshotRef: { current: scenario },
      addResult: vi.fn(),
      addNotification,
      cancelledRef: { current: false },
      restartAfterSaveRef: { current: false },
      saveInProgressRef: { current: false },
    });

    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        title: 'Solver Not Running',
      }),
    );
  });

  it('evaluates the best schedule snapshot and saves it with run metadata', async () => {
    const addResult = vi.fn();
    const addNotification = vi.fn();
    runtime = createRuntimeMock({
      getActiveSolveSnapshot: vi.fn(() => ({
        runScenario: scenario,
        selectedSettings: solverSettings,
        startedAtMs: 0,
        latestProgress: {
          iteration: 17,
          elapsed_seconds: 3,
          best_score: 8,
          best_schedule: {
            session_0: { g1: ['p1', 'p2'] },
            session_1: { g2: ['p3', 'p4'] },
          },
        } as never,
        bestSchedule: {
          session_0: { g1: ['p1', 'p2'] },
          session_1: { g2: ['p3', 'p4'] },
        },
        latestSolution: null,
      })),
      evaluateSolution: vi.fn(async () =>
        createSampleSolution({ final_score: 8, unique_contacts: 6, iteration_count: 0, elapsed_time_ms: 0 }),
      ),
    });
    setRuntimeForTests(runtime);

    await saveBestSoFar({
      solverState: {
        isRunning: true,
        isComplete: false,
        currentIteration: 10,
        bestScore: 8,
        elapsedTime: 0,
        noImprovementCount: 0,
      } as never,
      scenario,
      runSettings: solverSettings,
      solverSettings,
      runScenarioSnapshotRef: { current: scenario },
      addResult,
      addNotification,
      cancelledRef: { current: false },
      restartAfterSaveRef: { current: false },
      saveInProgressRef: { current: false },
    });

    expect(runtime.evaluateSolution).toHaveBeenCalledWith({
      scenario,
      assignments: [
        { person_id: 'p1', group_id: 'g1', session_id: 0 },
        { person_id: 'p2', group_id: 'g1', session_id: 0 },
        { person_id: 'p3', group_id: 'g2', session_id: 1 },
        { person_id: 'p4', group_id: 'g2', session_id: 1 },
      ],
    });
    expect(addResult).toHaveBeenCalledWith(
      expect.objectContaining({
        final_score: 8,
        iteration_count: 17,
        elapsed_time_ms: 3000,
      }),
      solverSettings,
      undefined,
      scenario,
    );
    expect(addNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Saved Snapshot (Partial Metrics)' }),
    );
  });

  it('falls back to partial metrics when evaluation of the best schedule fails', async () => {
    const addResult = vi.fn(() => ({ id: 'saved-result' }));
    const addNotification = vi.fn();
    runtime = createRuntimeMock({
      getActiveSolveSnapshot: vi.fn(() => ({
        runScenario: scenario,
        selectedSettings: solverSettings,
        startedAtMs: 0,
        latestProgress: {
          iteration: 12,
          elapsed_seconds: 2,
          best_score: 7,
          best_schedule: {
            session_0: { g1: ['p1'] },
          },
        } as never,
        bestSchedule: {
          session_0: { g1: ['p1'] },
        },
        latestSolution: null,
      })),
      evaluateSolution: vi.fn(async () => {
        throw new Error('eval failed');
      }),
    });
    setRuntimeForTests(runtime);

    await saveBestSoFar({
      solverState: {
        isRunning: true,
        isComplete: false,
        currentIteration: 10,
        bestScore: 7,
        elapsedTime: 0,
        noImprovementCount: 0,
      } as never,
      scenario,
      runSettings: null,
      solverSettings,
      runScenarioSnapshotRef: { current: scenario },
      addResult,
      addNotification,
      cancelledRef: { current: false },
      restartAfterSaveRef: { current: false },
      saveInProgressRef: { current: false },
    });

    expect(addResult).toHaveBeenCalledWith(
      expect.objectContaining({
        assignments: [{ person_id: 'p1', group_id: 'g1', session_id: 0 }],
        final_score: 7,
        iteration_count: 12,
        elapsed_time_ms: 2000,
      }),
      solverSettings,
      undefined,
      scenario,
    );
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        title: 'Saved Snapshot (Partial Metrics)',
      }),
    );
  });

  it('requests a save-and-resume flow when no best-schedule snapshot is available yet', async () => {
    const addNotification = vi.fn();
    const cancelledRef = { current: false };
    const restartAfterSaveRef = { current: false };
    const saveInProgressRef = { current: false };
    runtime = createRuntimeMock({
      getActiveSolveSnapshot: vi.fn(() => null),
    });
    setRuntimeForTests(runtime);

    await saveBestSoFar({
      solverState: {
        isRunning: true,
        isComplete: false,
        currentIteration: 10,
        bestScore: 7,
        elapsedTime: 0,
        noImprovementCount: 0,
      } as never,
      scenario,
      runSettings: null,
      solverSettings,
      runScenarioSnapshotRef: { current: scenario },
      addResult: vi.fn(),
      addNotification,
      cancelledRef,
      restartAfterSaveRef,
      saveInProgressRef,
    });

    expect(cancelledRef.current).toBe(true);
    expect(restartAfterSaveRef.current).toBe(true);
    expect(saveInProgressRef.current).toBe(true);
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        title: 'Saving Best-So-Far',
      }),
    );
  });
});
