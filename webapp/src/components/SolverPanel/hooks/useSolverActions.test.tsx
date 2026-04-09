import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setRuntimeForTests, type SolverRuntime } from '../../../services/runtime';
import { createSampleScenario, createSampleSolverSettings, createSavedScenario, createSampleSolution } from '../../../test/fixtures';
import { useSolverActions } from './useSolverActions';
import { runSolver } from '../utils/runSolver';

vi.mock('../utils/runSolver', () => ({
  runSolver: vi.fn(async () => undefined),
}));

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
      accepted_config_ids: ['solver1'],
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

function createProps() {
  const scenario = createSampleScenario({ settings: createSampleSolverSettings() });
  return {
    scenario,
    currentScenarioId: 'scenario-1',
    savedScenarios: { 'scenario-1': createSavedScenario({ id: 'scenario-1', scenario }) },
    warmStartResultId: null,
    setWarmStartFromResult: vi.fn(),
    solverSettings: scenario.settings,
    solverState: {
      isRunning: true,
      isComplete: false,
      currentIteration: 0,
      bestScore: 0,
      elapsedTime: 0,
      noImprovementCount: 0,
    },
    desiredRuntimeMain: 3,
    desiredRuntimeSettings: 3,
    showLiveVizRef: { current: false },
    startSolver: vi.fn(),
    stopSolver: vi.fn(),
    resetSolver: vi.fn(),
    setSolverState: vi.fn(),
    setSolution: vi.fn(),
    addNotification: vi.fn(),
    addResult: vi.fn(),
    ensureScenarioExists: vi.fn(() => scenario),
    handleSettingsChange: vi.fn(),
    setShowCancelConfirm: vi.fn(),
  };
}

describe('useSolverActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    setRuntimeForTests(null);
  });

  it('waits for an in-flight cancel to finish before starting a new solve', async () => {
    let resolveCancel!: () => void;
    const cancelPromise = new Promise<void>((resolve) => {
      resolveCancel = resolve;
    });

    const runtime = createRuntimeMock({
      cancel: vi.fn(async () => {
        await cancelPromise;
      }),
    });
    setRuntimeForTests(runtime);

    const props = createProps();
    const { result, rerender } = renderHook((currentProps) => useSolverActions(currentProps), {
      initialProps: props,
    });

    const cancelRun = act(async () => {
      await result.current.handleCancelDiscard();
    });

    await vi.waitFor(() => {
      expect(runtime.cancel).toHaveBeenCalledTimes(1);
    });

    rerender({
      ...props,
      solverState: {
        ...props.solverState,
        isRunning: false,
      },
    });

    const startRun = act(async () => {
      await result.current.handleStartSolver(false);
    });

    await Promise.resolve();
    expect(runSolver).not.toHaveBeenCalled();

    resolveCancel();

    await cancelRun;
    await startRun;

    expect(runSolver).toHaveBeenCalledTimes(1);
  });
});
