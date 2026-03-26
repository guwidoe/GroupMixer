import { beforeEach, describe, expect, it } from 'vitest';
import { createSampleScenario, createSampleSolution } from '../test/fixtures';
import { useAppStore } from './index';
import { ATTRIBUTE_DEFS_KEY, DEFAULT_ATTRIBUTE_DEFINITIONS } from './slices';

describe('useAppStore initialization', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().reset();
  });

  it('hydrates attribute definitions during initializeApp instead of store import', () => {
    const persistedDefinitions = [{ key: 'team', values: ['Blue', 'Red'] }];
    localStorage.setItem(ATTRIBUTE_DEFS_KEY, JSON.stringify(persistedDefinitions));

    expect(useAppStore.getState().attributeDefinitions).toEqual(DEFAULT_ATTRIBUTE_DEFINITIONS);

    useAppStore.getState().initializeApp();

    expect(useAppStore.getState().attributeDefinitions).toEqual(persistedDefinitions);
  });

  it('replaces the workspace explicitly without clobbering a saved scenario id', () => {
    const scenario = createSampleScenario();
    const solution = createSampleSolution();

    useAppStore.setState({
      currentScenarioId: 'saved-scenario-1',
      selectedResultIds: ['result-a', 'result-b'],
      ui: {
        ...useAppStore.getState().ui,
        warmStartResultId: 'warm-start-result',
        showResultComparison: true,
      },
    });

    useAppStore.getState().replaceWorkspace({
      scenario,
      solution,
      attributeDefinitions: [{ key: 'team', values: ['A', 'B'] }],
    });

    const state = useAppStore.getState();
    expect(state.scenario).toEqual(scenario);
    expect(state.solution).toEqual(solution);
    expect(state.currentScenarioId).toBeNull();
    expect(state.selectedResultIds).toEqual([]);
    expect(state.ui.warmStartResultId).toBeNull();
    expect(state.ui.showResultComparison).toBe(false);
    expect(state.solverState.isRunning).toBe(false);
    expect(state.solverState.isComplete).toBe(true);
    expect(state.solverState.currentIteration).toBe(solution.iteration_count);
    expect(state.attributeDefinitions).toEqual(
      expect.arrayContaining([{ key: 'team', values: ['A', 'B'] }]),
    );
  });

  it('silently provisions and updates a synced workspace draft scenario', () => {
    const firstScenario = createSampleScenario({ num_sessions: 1 });
    const secondScenario = createSampleScenario({ num_sessions: 3 });
    const solution = createSampleSolution();

    const createdId = useAppStore.getState().syncWorkspaceDraft({
      scenario: firstScenario,
      solution: null,
      attributeDefinitions: [{ key: 'team', values: ['A', 'B'] }],
      scenarioName: 'Random Group Generator draft',
    });

    let state = useAppStore.getState();
    expect(createdId).toBeTruthy();
    expect(state.currentScenarioId).toBe(createdId);
    expect(state.savedScenarios[createdId]?.name).toBe('Random Group Generator draft');
    expect(state.savedScenarios[createdId]?.scenario.num_sessions).toBe(1);

    const updatedId = useAppStore.getState().syncWorkspaceDraft({
      scenario: secondScenario,
      solution,
      currentScenarioId: createdId,
      scenarioName: 'Random Group Generator draft',
    });

    state = useAppStore.getState();
    expect(updatedId).toBe(createdId);
    expect(state.scenario?.num_sessions).toBe(3);
    expect(state.solution).toEqual(solution);
    expect(state.savedScenarios[createdId]?.scenario.num_sessions).toBe(3);
  });
});
