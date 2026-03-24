import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSampleProblem, createSampleSolution, createSampleSolverSettings, createSavedProblem } from '../../../test/fixtures';
import type { Problem, ProblemResult, SavedProblem, SolverState, SolverSettings } from '../../../types';
import { runSolver } from './runSolver';
import { solverWorkerService } from '../../../services/solverWorker';
import { useAppStore } from '../../../store';

vi.mock('../../../services/solverWorker', () => ({
  solverWorkerService: {
    getRecommendedSettings: vi.fn(),
    solveWithProgress: vi.fn(),
    solveWithProgressWarmStart: vi.fn(),
  },
}));

vi.mock('../../../utils/warmStart', () => ({
  reconcileResultToInitialSchedule: vi.fn(() => ({ session_0: { g1: ['p1', 'p2'] } })),
}));

vi.mock('../../../store', () => ({
  useAppStore: {
    getState: vi.fn(),
  },
}));

function createSavedResult(name = 'Saved Result'): ProblemResult {
  const problem = createSampleProblem();
  const solution = createSampleSolution();

  return {
    id: 'saved-result',
    name,
    solution,
    solverSettings: problem.settings,
    problemSnapshot: {
      people: problem.people,
      groups: problem.groups,
      num_sessions: problem.num_sessions,
      objectives: problem.objectives,
      constraints: problem.constraints,
    },
    timestamp: 1000,
    duration: solution.elapsed_time_ms,
  };
}

function createArgs(overrides: Partial<Parameters<typeof runSolver>[0]> = {}) {
  const problem = createSampleProblem();
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
  const ensureProblemExists = vi.fn(() => problem);

  vi.mocked(solverWorkerService.solveWithProgress).mockResolvedValue({
    solution,
    lastProgress,
  });

  return {
    useRecommended: false,
    problem,
    currentProblemId: 'problem-1',
    savedProblems: { 'problem-1': createSavedProblem({ id: 'problem-1', results: [] }) } as Record<string, SavedProblem>,
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
    ensureProblemExists,
    setRunSettings,
    setLiveVizState,
    liveVizLastUiUpdateRef: { current: 123 },
    runProblemSnapshotRef: { current: null as Problem | null },
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
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(useAppStore.getState).mockReturnValue({ currentProblemId: 'problem-1' } as { currentProblemId: string | null });
  });

  it('uses recommended settings, normalizes them, and saves via the active store problem id', async () => {
    const rawRecommended = {
      solver_type: 'SimulatedAnnealing',
      stop_conditions: { time_limit_seconds: 5 },
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

    const args = createArgs({ useRecommended: true, currentProblemId: null });

    await runSolver(args);

    expect(args.ensureProblemExists).toHaveBeenCalled();
    expect(solverWorkerService.getRecommendedSettings).toHaveBeenCalledWith(args.problem, 7);
    expect(args.setRunSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        solver_params: {
          SimulatedAnnealing: {
            initial_temperature: 9,
            final_temperature: 1,
            cooling_schedule: 'linear',
            reheat_cycles: 2,
            reheat_after_no_improvement: 11,
          },
        },
      }),
    );
    expect(solverWorkerService.solveWithProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          solver_params: {
            SimulatedAnnealing: expect.objectContaining({
              initial_temperature: 9,
              reheat_after_no_improvement: 11,
            }),
          },
        }),
      }),
      expect.any(Function),
    );
    expect(args.addResult).toHaveBeenCalledWith(
      args.__expected.solution,
      expect.objectContaining({
        solver_params: {
          SimulatedAnnealing: expect.objectContaining({
            initial_temperature: 9,
          }),
        },
      }),
      undefined,
      expect.any(Object),
    );
  });

  it('falls back to existing settings when recommended settings lookup fails', async () => {
    vi.mocked(solverWorkerService.getRecommendedSettings).mockRejectedValue(new Error('settings failed'));
    const args = createArgs({ useRecommended: true });

    await runSolver(args);

    expect(args.setRunSettings).toHaveBeenCalledWith(args.solverSettings);
    expect(args.addResult).toHaveBeenCalledWith(
      args.__expected.solution,
      args.solverSettings,
      undefined,
      expect.any(Object),
    );
  });

  it('falls back to a normal solve when the selected warm-start result is missing', async () => {
    const args = createArgs({
      warmStartResultId: 'missing-result',
      savedProblems: {
        'problem-1': createSavedProblem({ id: 'problem-1', results: [] }),
      },
    });

    await runSolver(args);

    expect(solverWorkerService.solveWithProgressWarmStart).not.toHaveBeenCalled();
    expect(solverWorkerService.solveWithProgress).toHaveBeenCalled();
    expect(args.setWarmStartFromResult).toHaveBeenCalledWith(null);
    expect(args.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        title: 'Warm Start Failed',
      }),
    );
  });

  it('warns instead of saving when no active problem id exists in store state', async () => {
    vi.mocked(useAppStore.getState).mockReturnValue({ currentProblemId: null } as { currentProblemId: string | null });
    const args = createArgs();

    await runSolver(args);

    expect(args.addResult).not.toHaveBeenCalled();
    expect(args.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        title: 'Result Not Saved',
      }),
    );
  });
});
