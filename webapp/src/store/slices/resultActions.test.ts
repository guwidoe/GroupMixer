import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createResultActions } from './problemManagerSlice/resultActions';
import type { AppStore } from '../types';
import { createSampleProblem, createSampleSolution, createSampleSolverSettings, createSavedProblem } from '../../test/fixtures';
import type { ProblemResult } from '../../types';
import { problemStorage } from '../../services/problemStorage';

vi.mock('../../services/problemStorage', () => ({
  problemStorage: {
    addResult: vi.fn(),
    getProblem: vi.fn(),
  },
}));

function createHarness(overrides: Partial<AppStore> = {}) {
  let state = {
    problem: createSampleProblem(),
    currentProblemId: 'problem-1',
    savedProblems: {
      'problem-1': createSavedProblem({ id: 'problem-1', results: [] }),
    },
    selectedResultIds: [],
    ui: {
      activeTab: 'problem',
      isLoading: false,
      notifications: [],
      showProblemManager: false,
      showResultComparison: false,
      warmStartResultId: null,
    },
    addNotification: vi.fn((notification) => {
      state.ui.notifications.push({
        ...notification,
        id: `notification-${state.ui.notifications.length + 1}`,
        duration: notification.duration ?? 5000,
      });
    }),
    loadSavedProblems: vi.fn(),
    ...overrides,
  } as unknown as AppStore;

  const set = (partial: Partial<AppStore> | ((current: AppStore) => Partial<AppStore>)) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
  };

  const get = () => state;

  return {
    actions: createResultActions(set, get),
    getState: () => state,
  };
}

describe('createResultActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the saved result and updates store state when persistence succeeds', () => {
    const savedProblem = createSavedProblem({ id: 'problem-1', results: [] });
    const persistedResult: ProblemResult = {
      id: 'result-2',
      name: 'Result 1',
      solution: createSampleSolution(),
      solverSettings: createSampleSolverSettings(),
      problemSnapshot: {
        people: savedProblem.problem.people,
        groups: savedProblem.problem.groups,
        num_sessions: savedProblem.problem.num_sessions,
        objectives: savedProblem.problem.objectives,
        constraints: savedProblem.problem.constraints,
      },
      timestamp: 123,
      duration: 456,
    };
    vi.mocked(problemStorage.addResult).mockReturnValue(persistedResult);
    vi.mocked(problemStorage.getProblem).mockReturnValue({
      ...savedProblem,
      results: [persistedResult],
    });

    const harness = createHarness({
      problem: savedProblem.problem,
      savedProblems: { [savedProblem.id]: savedProblem },
      currentProblemId: savedProblem.id,
    });

    const result = harness.actions.addResult(
      createSampleSolution(),
      createSampleSolverSettings(),
      undefined,
      savedProblem.problem,
    );

    expect(result).toEqual(persistedResult);
    expect(problemStorage.addResult).toHaveBeenCalledWith(
      savedProblem.id,
      expect.any(Object),
      expect.any(Object),
      undefined,
      savedProblem.problem,
    );
    expect(harness.getState().savedProblems[savedProblem.id].results).toEqual([persistedResult]);
    expect(harness.getState().ui.notifications.at(-1)).toMatchObject({
      type: 'success',
      title: 'Result Saved',
    });
  });

  it('prefers the persisted problem snapshot after saving so results are not duplicated in state', () => {
    const existingResult: ProblemResult = {
      id: 'result-1',
      name: 'Older Result',
      solution: createSampleSolution({ final_score: 20 }),
      solverSettings: createSampleSolverSettings(),
      problemSnapshot: undefined,
      timestamp: 100,
      duration: 100,
    };
    const savedProblem = createSavedProblem({ id: 'problem-1', results: [existingResult] });
    const persistedResult: ProblemResult = {
      id: 'result-2',
      name: 'Result 2',
      solution: createSampleSolution(),
      solverSettings: createSampleSolverSettings(),
      problemSnapshot: {
        people: savedProblem.problem.people,
        groups: savedProblem.problem.groups,
        num_sessions: savedProblem.problem.num_sessions,
        objectives: savedProblem.problem.objectives,
        constraints: savedProblem.problem.constraints,
      },
      timestamp: 123,
      duration: 456,
    };

    vi.mocked(problemStorage.addResult).mockReturnValue(persistedResult);
    vi.mocked(problemStorage.getProblem).mockReturnValue({
      ...savedProblem,
      results: [existingResult, persistedResult],
    });

    const harness = createHarness({
      problem: savedProblem.problem,
      savedProblems: { [savedProblem.id]: savedProblem },
      currentProblemId: savedProblem.id,
    });

    harness.actions.addResult(createSampleSolution(), createSampleSolverSettings(), undefined, savedProblem.problem);

    expect(harness.getState().savedProblems[savedProblem.id].results).toEqual([existingResult, persistedResult]);
  });

  it('returns null and reports an error when there is no current problem id', () => {
    const harness = createHarness({
      currentProblemId: null,
    });

    const result = harness.actions.addResult(createSampleSolution(), createSampleSolverSettings());

    expect(result).toBeNull();
    expect(problemStorage.addResult).not.toHaveBeenCalled();
    expect(harness.getState().ui.notifications.at(-1)).toMatchObject({
      type: 'error',
      title: 'No Current Problem',
    });
  });
});
