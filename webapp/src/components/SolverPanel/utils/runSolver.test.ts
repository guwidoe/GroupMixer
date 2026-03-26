import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSampleProblem, createSampleSolution, createSampleSolverSettings, createSavedProblem } from '../../../test/fixtures';
import type { Problem, ProblemResult, SavedProblem, SolverState } from '../../../types';
import { solveProblem } from '../../../services/solver/solveProblem';
import { problemStorage } from '../../../services/problemStorage';
import { runSolver } from './runSolver';
import { solverWorkerService } from '../../../services/solverWorker';
import { useAppStore } from '../../../store';

vi.mock('../../../services/solver/solveProblem', () => ({
  solveProblem: vi.fn(),
}));

vi.mock('../../../services/solverWorker', () => ({
  solverWorkerService: {
    solveWithProgressWarmStart: vi.fn(),
  },
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

vi.mock('../../../services/problemStorage', () => ({
  problemStorage: {
    getCurrentProblemId: vi.fn(() => null),
    addResult: vi.fn(),
    getProblem: vi.fn(() => null),
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

  vi.mocked(solveProblem).mockResolvedValue({
    solution,
    lastProgress,
    selectedSettings: solverSettings,
    runProblem: {
      ...problem,
      settings: solverSettings,
    },
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
    window.sessionStorage.clear();
    window.__groupmixerLandingEvents = [];
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(useAppStore.getState).mockReturnValue({ currentProblemId: 'problem-1' } as { currentProblemId: string | null });
  });

  it('uses the shared solve service, emits telemetry, and saves via the active store problem id', async () => {
    window.sessionStorage.setItem(
      'groupmixer-telemetry-attribution',
      JSON.stringify({ landingSlug: 'random-team-generator', experiment: 'seo-hero-test', variant: 'B' }),
    );
    const args = createArgs({ useRecommended: true, currentProblemId: null });

    await runSolver(args);

    expect(args.ensureProblemExists).toHaveBeenCalled();
    expect(solveProblem).toHaveBeenCalledWith(
      expect.objectContaining({
        problem: expect.objectContaining({ settings: args.solverSettings }),
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
    vi.mocked(solveProblem).mockResolvedValue({
      solution: args.__expected.solution,
      lastProgress: args.__expected.lastProgress,
      selectedSettings,
      runProblem: {
        ...args.problem,
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
      savedProblems: {
        'problem-1': createSavedProblem({ id: 'problem-1', results: [] }),
      },
    });

    await runSolver(args);

    expect(solverWorkerService.solveWithProgressWarmStart).not.toHaveBeenCalled();
    expect(solveProblem).toHaveBeenCalledWith(
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

  it('warns instead of saving when no active problem id exists in props or store state', async () => {
    vi.mocked(useAppStore.getState).mockReturnValue({ currentProblemId: null } as { currentProblemId: string | null });
    const args = createArgs({ currentProblemId: null });

    await runSolver(args);

    expect(args.addResult).not.toHaveBeenCalled();
    expect(problemStorage.addResult).not.toHaveBeenCalled();
    expect(args.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        title: 'Result Not Saved',
      }),
    );
  });

  it('falls back to persisted storage when props and store state have not caught up yet', async () => {
    vi.mocked(useAppStore.getState).mockReturnValue({ currentProblemId: null } as { currentProblemId: string | null });
    vi.mocked(problemStorage.getCurrentProblemId).mockReturnValue('problem-1');
    const persistedResult = createSavedResult('Result 1');
    vi.mocked(problemStorage.addResult).mockReturnValue(persistedResult);
    vi.mocked(problemStorage.getProblem).mockReturnValue(
      createSavedProblem({ id: 'problem-1', results: [persistedResult] }),
    );
    const args = createArgs({ currentProblemId: null });

    await runSolver(args);

    expect(useAppStore.setState).toHaveBeenCalledWith({ currentProblemId: 'problem-1' });
    expect(args.addResult).not.toHaveBeenCalled();
    expect(problemStorage.addResult).toHaveBeenCalledWith(
      'problem-1',
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
});
