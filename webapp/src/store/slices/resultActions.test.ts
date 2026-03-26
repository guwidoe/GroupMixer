import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createResultActions } from './scenarioManagerSlice/resultActions';
import type { AppStore } from '../types';
import { createSampleScenario, createSampleSolution, createSampleSolverSettings, createSavedScenario } from '../../test/fixtures';
import type { ScenarioResult } from '../../types';
import { scenarioStorage } from '../../services/scenarioStorage';

vi.mock('../../services/scenarioStorage', () => ({
  scenarioStorage: {
    addResult: vi.fn(),
    getScenario: vi.fn(),
  },
}));

function createHarness(overrides: Partial<AppStore> = {}) {
  let state = {
    scenario: createSampleScenario(),
    currentScenarioId: 'scenario-1',
    savedScenarios: {
      'scenario-1': createSavedScenario({ id: 'scenario-1', results: [] }),
    },
    selectedResultIds: [],
    ui: {
      activeTab: 'scenario',
      isLoading: false,
      notifications: [],
      showScenarioManager: false,
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
    loadSavedScenarios: vi.fn(),
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
    const savedScenario = createSavedScenario({ id: 'scenario-1', results: [] });
    const persistedResult: ScenarioResult = {
      id: 'result-2',
      name: 'Result 1',
      solution: createSampleSolution(),
      solverSettings: createSampleSolverSettings(),
      scenarioSnapshot: {
        people: savedScenario.scenario.people,
        groups: savedScenario.scenario.groups,
        num_sessions: savedScenario.scenario.num_sessions,
        objectives: savedScenario.scenario.objectives,
        constraints: savedScenario.scenario.constraints,
      },
      timestamp: 123,
      duration: 456,
    };
    vi.mocked(scenarioStorage.addResult).mockReturnValue(persistedResult);
    vi.mocked(scenarioStorage.getScenario).mockReturnValue({
      ...savedScenario,
      results: [persistedResult],
    });

    const harness = createHarness({
      scenario: savedScenario.scenario,
      savedScenarios: { [savedScenario.id]: savedScenario },
      currentScenarioId: savedScenario.id,
    });

    const result = harness.actions.addResult(
      createSampleSolution(),
      createSampleSolverSettings(),
      undefined,
      savedScenario.scenario,
    );

    expect(result).toEqual(persistedResult);
    expect(scenarioStorage.addResult).toHaveBeenCalledWith(
      savedScenario.id,
      expect.any(Object),
      expect.any(Object),
      undefined,
      savedScenario.scenario,
    );
    expect(harness.getState().savedScenarios[savedScenario.id].results).toEqual([persistedResult]);
    expect(harness.getState().ui.notifications.at(-1)).toMatchObject({
      type: 'success',
      title: 'Result Saved',
    });
  });

  it('prefers the persisted scenario snapshot after saving so results are not duplicated in state', () => {
    const existingResult: ScenarioResult = {
      id: 'result-1',
      name: 'Older Result',
      solution: createSampleSolution({ final_score: 20 }),
      solverSettings: createSampleSolverSettings(),
      scenarioSnapshot: undefined,
      timestamp: 100,
      duration: 100,
    };
    const savedScenario = createSavedScenario({ id: 'scenario-1', results: [existingResult] });
    const persistedResult: ScenarioResult = {
      id: 'result-2',
      name: 'Result 2',
      solution: createSampleSolution(),
      solverSettings: createSampleSolverSettings(),
      scenarioSnapshot: {
        people: savedScenario.scenario.people,
        groups: savedScenario.scenario.groups,
        num_sessions: savedScenario.scenario.num_sessions,
        objectives: savedScenario.scenario.objectives,
        constraints: savedScenario.scenario.constraints,
      },
      timestamp: 123,
      duration: 456,
    };

    vi.mocked(scenarioStorage.addResult).mockReturnValue(persistedResult);
    vi.mocked(scenarioStorage.getScenario).mockReturnValue({
      ...savedScenario,
      results: [existingResult, persistedResult],
    });

    const harness = createHarness({
      scenario: savedScenario.scenario,
      savedScenarios: { [savedScenario.id]: savedScenario },
      currentScenarioId: savedScenario.id,
    });

    harness.actions.addResult(createSampleSolution(), createSampleSolverSettings(), undefined, savedScenario.scenario);

    expect(harness.getState().savedScenarios[savedScenario.id].results).toEqual([existingResult, persistedResult]);
  });

  it('returns null and reports an error when there is no current scenario id', () => {
    const harness = createHarness({
      currentScenarioId: null,
    });

    const result = harness.actions.addResult(createSampleSolution(), createSampleSolverSettings());

    expect(result).toBeNull();
    expect(scenarioStorage.addResult).not.toHaveBeenCalled();
    expect(harness.getState().ui.notifications.at(-1)).toMatchObject({
      type: 'error',
      title: 'No Current Scenario',
    });
  });
});
