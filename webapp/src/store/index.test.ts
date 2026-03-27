import { beforeEach, describe, expect, it } from 'vitest';
import { scenarioStorage } from '../services/scenarioStorage';
import { createSampleScenario, createSampleSolution, createSavedScenario } from '../test/fixtures';
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

  it('reuses an existing exact draft instead of creating a duplicate scenario blob', () => {
    const existing = scenarioStorage.createScenario(
      'Random Group Generator draft',
      createSampleScenario(),
    );
    scenarioStorage.addResult(existing.id, createSampleSolution(), createSampleScenario().settings, 'Run 1');

    const syncedId = useAppStore.getState().syncWorkspaceDraft({
      scenario: createSampleScenario(),
      solution: null,
      scenarioName: 'Random Group Generator draft',
    });

    const state = useAppStore.getState();
    expect(syncedId).toBe(existing.id);
    expect(state.currentScenarioId).toBe(existing.id);
    expect(Object.keys(scenarioStorage.getAllScenarios())).toHaveLength(1);
    expect(state.savedScenarios[existing.id]?.results).toHaveLength(1);
  });

  it('switches to an existing exact draft even when the current draft id points elsewhere', () => {
    const staleDraft = scenarioStorage.createScenario(
      'Random Group Generator draft',
      createSampleScenario({ num_sessions: 4 }),
    );
    const matchingDraft = scenarioStorage.createScenario(
      'Random Group Generator draft',
      createSampleScenario({ num_sessions: 2 }),
    );

    const syncedId = useAppStore.getState().syncWorkspaceDraft({
      scenario: createSampleScenario({ num_sessions: 2 }),
      solution: null,
      currentScenarioId: staleDraft.id,
      scenarioName: 'Random Group Generator draft',
    });

    expect(syncedId).toBe(matchingDraft.id);
    expect(useAppStore.getState().currentScenarioId).toBe(matchingDraft.id);
    expect(scenarioStorage.getScenario(staleDraft.id)?.scenario.num_sessions).toBe(4);
  });

  it('selects a saved result as the active result blob within the current scenario', () => {
    const savedScenario = createSavedScenario();

    useAppStore.setState({
      scenario: savedScenario.scenario,
      currentScenarioId: savedScenario.id,
      savedScenarios: { [savedScenario.id]: savedScenario },
    });

    useAppStore.getState().selectCurrentResult(savedScenario.results[0].id);

    const state = useAppStore.getState();
    expect(state.currentResultId).toBe(savedScenario.results[0].id);
    expect(state.solution).toEqual(savedScenario.results[0].solution);
    expect(state.solverState.isComplete).toBe(true);
  });
});
