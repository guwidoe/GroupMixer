import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSampleScenario, createSampleSolution, createSampleSolverSettings } from '../../test/fixtures';
import type { SolverSettings } from '../../types';
import type { SolverRuntime } from '../runtime';
import { solveScenario } from './solveScenario';

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
    ...overrides,
  };
}

describe('solveScenario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses recommended settings and returns a run-ready scenario payload', async () => {
    const scenario = createSampleScenario({ settings: createSampleSolverSettings() });
    const runtime = createRuntimeMock();
    const rawRecommended = {
      ...createSampleSolverSettings(),
      solver_params: {
        solver_type: 'SimulatedAnnealing',
        initial_temperature: 9,
        final_temperature: 1,
        cooling_schedule: 'linear',
        reheat_cycles: 2,
        reheat_after_no_improvement: 11,
      },
    } as unknown as SolverSettings;
    vi.mocked(runtime.recommendSettings).mockResolvedValue(rawRecommended);

    const result = await solveScenario({
      scenario,
      useRecommendedSettings: true,
      desiredRuntimeSeconds: 7,
      enableBestScheduleTelemetry: true,
      runtime,
    });

    expect(runtime.recommendSettings).toHaveBeenCalledWith({ scenario, desiredRuntimeSeconds: 7 });
    expect(result.selectedSettings.solver_params).toEqual(rawRecommended.solver_params);
    expect(result.runScenario.settings.telemetry).toEqual(
      expect.objectContaining({ emit_best_schedule: true }),
    );
    expect(runtime.solveWithProgress).toHaveBeenCalledWith({
      scenario: expect.objectContaining({
        settings: expect.objectContaining({
          telemetry: expect.objectContaining({ emit_best_schedule: true }),
        }),
      }),
      progressCallback: undefined,
    });
  });

  it('publishes the prepared run settings before the solve resolves', async () => {
    const scenario = createSampleScenario({ settings: createSampleSolverSettings() });
    const runtime = createRuntimeMock();
    const rawRecommended = {
      ...createSampleSolverSettings(),
      stop_conditions: {
        max_iterations: 486486,
        time_limit_seconds: 2,
        no_improvement_iterations: 243243,
      },
    } as SolverSettings;
    const preparedRunScenarios: typeof scenario[] = [];
    let resolveSolve!: (value: { solution: ReturnType<typeof createSampleSolution>; lastProgress: null }) => void;
    const solvePromise = new Promise<{ solution: ReturnType<typeof createSampleSolution>; lastProgress: null }>((resolve) => {
      resolveSolve = resolve;
    });

    vi.mocked(runtime.recommendSettings).mockResolvedValue(rawRecommended);
    vi.mocked(runtime.solveWithProgress).mockImplementation(async () => {
      const { solution, lastProgress } = await solvePromise;
      return {
        selectedSettings: rawRecommended,
        runScenario: { ...scenario, settings: rawRecommended },
        solution,
        lastProgress,
      };
    });

    const pendingResult = solveScenario({
      scenario,
      useRecommendedSettings: true,
      runtime,
      onRunScenarioPrepared: (runScenario) => {
        preparedRunScenarios.push(runScenario);
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(preparedRunScenarios).toEqual([
      expect.objectContaining({
        settings: expect.objectContaining({
          stop_conditions: expect.objectContaining({
            max_iterations: 486486,
            time_limit_seconds: 2,
            no_improvement_iterations: 243243,
          }),
        }),
      }),
    ]);

    resolveSolve({ solution: createSampleSolution(), lastProgress: null });
    await pendingResult;
  });

  it('falls back to the existing scenario settings when recommended settings fail', async () => {
    const scenario = createSampleScenario({ settings: createSampleSolverSettings() });
    const runtime = createRuntimeMock({
      recommendSettings: vi.fn(async () => {
        throw new Error('settings failed');
      }),
    });
    const onRecommendedSettingsFailure = vi.fn();

    const result = await solveScenario({
      scenario,
      useRecommendedSettings: true,
      recommendationFailurePolicy: 'use-current-settings',
      onRecommendedSettingsFailure,
      runtime,
    });

    expect(result.selectedSettings).toEqual(scenario.settings);
    expect(onRecommendedSettingsFailure).toHaveBeenCalledWith(expect.any(Error));
  });

  it('surfaces recommendation failures when the caller chooses error policy', async () => {
    const scenario = createSampleScenario({ settings: createSampleSolverSettings() });
    const runtime = createRuntimeMock({
      recommendSettings: vi.fn(async () => {
        throw new Error('settings failed');
      }),
    });

    await expect(
      solveScenario({
        scenario,
        useRecommendedSettings: true,
        recommendationFailurePolicy: 'error',
        runtime,
      }),
    ).rejects.toThrow('settings failed');
  });

  it('uses the warm-start path when a schedule is supplied', async () => {
    const scenario = createSampleScenario({ settings: createSampleSolverSettings() });
    const warmStartSchedule = { session_0: { g1: ['p1', 'p2'] } };
    const runtime = createRuntimeMock();

    await solveScenario({
      scenario,
      useRecommendedSettings: false,
      warmStartSchedule,
      runtime,
    });

    expect(runtime.solveWarmStart).toHaveBeenCalledWith({
      scenario: expect.any(Object),
      initialSchedule: warmStartSchedule,
      progressCallback: undefined,
    });
    expect(runtime.solveWithProgress).not.toHaveBeenCalled();
  });
});
