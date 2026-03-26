import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSampleScenario, createSampleSolution, createSampleSolverSettings } from '../../test/fixtures';
import type { SolverSettings } from '../../types';
import { solverWorkerService } from '../solverWorker';
import { solveScenario } from './solveScenario';

vi.mock('../solverWorker', () => ({
  solverWorkerService: {
    getRecommendedSettings: vi.fn(),
    solveWithProgress: vi.fn(),
    solveWithProgressWarmStart: vi.fn(),
  },
}));

describe('solveScenario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses recommended settings and returns a run-ready scenario payload', async () => {
    const scenario = createSampleScenario({ settings: createSampleSolverSettings() });
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
    vi.mocked(solverWorkerService.getRecommendedSettings).mockResolvedValue(rawRecommended);
    vi.mocked(solverWorkerService.solveWithProgress).mockResolvedValue({
      solution: createSampleSolution(),
      lastProgress: null,
    });

    const result = await solveScenario({
      scenario,
      useRecommendedSettings: true,
      desiredRuntimeSeconds: 7,
      enableBestScheduleTelemetry: true,
    });

    expect(solverWorkerService.getRecommendedSettings).toHaveBeenCalledWith(scenario, 7);
    expect(result.selectedSettings.solver_params).toEqual({
      SimulatedAnnealing: expect.objectContaining({
        initial_temperature: 9,
        reheat_after_no_improvement: 11,
      }),
    });
    expect(result.runScenario.settings.telemetry).toEqual(
      expect.objectContaining({ emit_best_schedule: true }),
    );
    expect(solverWorkerService.solveWithProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          telemetry: expect.objectContaining({ emit_best_schedule: true }),
        }),
      }),
      undefined,
    );
  });

  it('publishes the prepared run settings before the solve resolves', async () => {
    const scenario = createSampleScenario({ settings: createSampleSolverSettings() });
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

    vi.mocked(solverWorkerService.getRecommendedSettings).mockResolvedValue(rawRecommended);
    vi.mocked(solverWorkerService.solveWithProgress).mockReturnValue(solvePromise);

    const pendingResult = solveScenario({
      scenario,
      useRecommendedSettings: true,
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
    vi.mocked(solverWorkerService.getRecommendedSettings).mockRejectedValue(new Error('settings failed'));
    vi.mocked(solverWorkerService.solveWithProgress).mockResolvedValue({
      solution: createSampleSolution(),
      lastProgress: null,
    });

    const result = await solveScenario({
      scenario,
      useRecommendedSettings: true,
    });

    expect(result.selectedSettings).toEqual(scenario.settings);
  });

  it('uses the warm-start path when a schedule is supplied', async () => {
    const scenario = createSampleScenario({ settings: createSampleSolverSettings() });
    const warmStartSchedule = { session_0: { g1: ['p1', 'p2'] } };
    vi.mocked(solverWorkerService.solveWithProgressWarmStart).mockResolvedValue({
      solution: createSampleSolution(),
      lastProgress: null,
    });

    await solveScenario({
      scenario,
      useRecommendedSettings: false,
      warmStartSchedule,
    });

    expect(solverWorkerService.solveWithProgressWarmStart).toHaveBeenCalledWith(
      expect.any(Object),
      warmStartSchedule,
      undefined,
    );
    expect(solverWorkerService.solveWithProgress).not.toHaveBeenCalled();
  });
});
