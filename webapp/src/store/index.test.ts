import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { scenarioStorage } from '../services/scenarioStorage';
import { createAttributeDefinition } from '../services/scenarioAttributes';
import { createSampleScenario, createSampleSolution, createSavedScenario } from '../test/fixtures';
import { useAppStore } from './index';
import { DEFAULT_ATTRIBUTE_DEFINITIONS } from './slices';

describe('useAppStore initialization', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().reset();
  });

  it('hydrates active attribute definitions from the loaded saved scenario', () => {
    vi.useFakeTimers();
    const persistedDefinitions = [createAttributeDefinition('team', ['Blue', 'Red'], 'attr-team')];
    scenarioStorage.saveScenario(
      createSavedScenario({
        id: 'scenario-1',
        attributeDefinitions: persistedDefinitions,
      }),
    );

    expect(useAppStore.getState().attributeDefinitions).toEqual(DEFAULT_ATTRIBUTE_DEFINITIONS);

    useAppStore.getState().initializeApp();
    vi.runAllTimers();

    expect(useAppStore.getState().attributeDefinitions).toEqual([
      expect.objectContaining({
        id: 'attr-team',
        name: 'team',
        key: 'team',
        values: ['A', 'B', 'Blue', 'Red'],
      }),
    ]);
    vi.useRealTimers();
  });

  it('defers saved scenario hydration to the next task so the shell can paint first', () => {
    vi.useFakeTimers();

    const loadSavedScenarios = vi.fn();
    useAppStore.setState({ loadSavedScenarios });

    useAppStore.getState().initializeApp();

    expect(loadSavedScenarios).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(loadSavedScenarios).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
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
      attributeDefinitions: [createAttributeDefinition('team', ['A', 'B'], 'attr-team')],
    });

    const state = useAppStore.getState();
    expect(state.scenario).toMatchObject(scenario);
    expect(state.solution).toEqual(solution);
    expect(state.currentScenarioId).toBeNull();
    expect(state.selectedResultIds).toEqual([]);
    expect(state.ui.warmStartResultId).toBeNull();
    expect(state.ui.showResultComparison).toBe(false);
    expect(state.solverState.isRunning).toBe(false);
    expect(state.solverState.isComplete).toBe(true);
    expect(state.solverState.currentIteration).toBe(solution.iteration_count);
    expect(state.attributeDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'attr-team', name: 'team', key: 'team', values: ['A', 'B'] }),
      ]),
    );
  });

  it('silently provisions and updates a synced workspace draft scenario', () => {
    const firstScenario = createSampleScenario({ num_sessions: 1 });
    const secondScenario = createSampleScenario({ num_sessions: 3 });
    const solution = createSampleSolution();

    const createdId = useAppStore.getState().syncWorkspaceDraft({
      scenario: firstScenario,
      solution: null,
      attributeDefinitions: [createAttributeDefinition('team', ['A', 'B'], 'attr-team')],
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

  it('reuses the current workspace when landing data matches the existing scenario content', () => {
    const existing = scenarioStorage.createScenario(
      'Random Group Generator draft',
      createSampleScenario(),
    );

    useAppStore.setState({
      scenario: existing.scenario,
      attributeDefinitions: existing.attributeDefinitions,
      currentScenarioId: existing.id,
      savedScenarios: { [existing.id]: existing },
    });

    const returnedId = useAppStore.getState().loadWorkspaceAsNewScenario({
      scenario: createSampleScenario(),
      solution: null,
      scenarioName: 'Random Group Generator draft',
    });

    const state = useAppStore.getState();
    expect(returnedId).toBe(existing.id);
    expect(state.currentScenarioId).toBe(existing.id);
    expect(Object.keys(scenarioStorage.getAllScenarios())).toHaveLength(1);
    expect(state.ui.notifications).toEqual([]);
  });

  it('creates a new scenario for landing data and preserves the previous workspace', () => {
    const existing = scenarioStorage.createScenario(
      'Existing workspace',
      createSampleScenario({ num_sessions: 3 }),
    );

    useAppStore.setState({
      scenario: existing.scenario,
      attributeDefinitions: existing.attributeDefinitions,
      currentScenarioId: existing.id,
      savedScenarios: { [existing.id]: existing },
    });

    const returnedId = useAppStore.getState().loadWorkspaceAsNewScenario({
      scenario: createSampleScenario({ num_sessions: 1 }),
      solution: null,
      scenarioName: 'Random Group Generator draft',
    });

    const state = useAppStore.getState();
    expect(returnedId).toBeTruthy();
    expect(returnedId).not.toBe(existing.id);
    expect(state.currentScenarioId).toBe(returnedId);
    expect(scenarioStorage.getScenario(existing.id)?.scenario.num_sessions).toBe(3);
    expect(state.ui.notifications.at(-1)).toEqual(
      expect.objectContaining({
        title: 'Landing Setup Loaded',
      }),
    );
  });

  it('tracks document history for document-level updates and supports undo/redo', () => {
    const initialScenario = createSampleScenario({ num_sessions: 2 });
    useAppStore.getState().replaceWorkspace({
      scenario: initialScenario,
      attributeDefinitions: [createAttributeDefinition('team', ['A', 'B'], 'attr-team')],
    });

    expect(useAppStore.temporal.getState().pastStates).toHaveLength(0);

    useAppStore.getState().updateScenarioDocument((document) => ({
      ...document,
      scenario: {
        ...document.scenario,
        num_sessions: 4,
      },
    }));

    expect(useAppStore.temporal.getState().pastStates).toHaveLength(1);
    expect(useAppStore.getState().scenario?.num_sessions).toBe(4);

    useAppStore.getState().undoScenarioDocument();
    expect(useAppStore.getState().scenario?.num_sessions).toBe(2);
    expect(useAppStore.getState().attributeDefinitions).toEqual(
      useAppStore.getState().scenarioDocument?.attributeDefinitions,
    );

    useAppStore.getState().redoScenarioDocument();
    expect(useAppStore.getState().scenario?.num_sessions).toBe(4);
  });

  it('normalizes scenario-document attribute updates and keeps constraint references in sync', () => {
    useAppStore.getState().replaceWorkspace({
      scenario: {
        people: [
          { id: 'p1', name: 'Alice', attributes: { Team: 'Blue' } },
        ],
        groups: [{ id: 'g1', size: 1 }],
        num_sessions: 1,
        constraints: [
          {
            type: 'AttributeBalance',
            group_id: 'g1',
            attribute_key: 'Team',
            desired_values: { Blue: 1 },
            penalty_weight: 1,
          },
        ],
        settings: createSampleScenario().settings,
      },
      attributeDefinitions: [createAttributeDefinition('Team', ['Blue'], 'attr-team')],
    });

    useAppStore.getState().setAttributeDefinitions([
      createAttributeDefinition('Team', ['Blue', 'Green'], 'attr-team'),
    ]);

    const state = useAppStore.getState();
    const balanceConstraint = state.scenario?.constraints[0];
    expect(state.scenarioDocument?.attributeDefinitions).toEqual(state.attributeDefinitions);
    expect(balanceConstraint).toMatchObject({
      type: 'AttributeBalance',
      attribute_id: 'attr-team',
      attribute_key: 'Team',
    });
    expect(useAppStore.temporal.getState().pastStates).toHaveLength(1);
  });

  it('clears document history when loading a different saved scenario', () => {
    const existing = scenarioStorage.createScenario('Existing', createSampleScenario({ num_sessions: 2 }));
    const incoming = scenarioStorage.createScenario('Incoming', createSampleScenario({ num_sessions: 5 }));

    useAppStore.setState({
      scenario: existing.scenario,
      scenarioDocument: {
        scenario: existing.scenario,
        attributeDefinitions: existing.attributeDefinitions,
      },
      attributeDefinitions: existing.attributeDefinitions,
      currentScenarioId: existing.id,
      savedScenarios: { [existing.id]: existing, [incoming.id]: incoming },
    });
    useAppStore.getState().clearScenarioDocumentHistory();

    useAppStore.getState().updateScenarioDocument((document) => ({
      ...document,
      scenario: {
        ...document.scenario,
        num_sessions: 3,
      },
    }));
    expect(useAppStore.temporal.getState().pastStates).toHaveLength(1);

    useAppStore.getState().loadScenario(incoming.id);

    expect(useAppStore.getState().scenario?.num_sessions).toBe(5);
    expect(useAppStore.temporal.getState().pastStates).toHaveLength(0);
    expect(useAppStore.temporal.getState().futureStates).toHaveLength(0);
  });

  it('applies a reduced-session scenario while clearing active runtime state', () => {
    vi.useFakeTimers();
    const savedScenario = createSavedScenario({
      id: 'scenario-with-result',
      scenario: createSampleScenario({ num_sessions: 4 }),
    });
    scenarioStorage.saveScenario(savedScenario);

    useAppStore.setState({
      scenario: savedScenario.scenario,
      scenarioDocument: {
        scenario: savedScenario.scenario,
        attributeDefinitions: savedScenario.attributeDefinitions,
      },
      attributeDefinitions: savedScenario.attributeDefinitions,
      currentScenarioId: savedScenario.id,
      currentResultId: savedScenario.results[0].id,
      savedScenarios: { [savedScenario.id]: savedScenario },
      solution: createSampleSolution(),
      selectedResultIds: [savedScenario.results[0].id],
      solverState: {
        ...useAppStore.getState().solverState,
        isComplete: true,
      },
      ui: {
        ...useAppStore.getState().ui,
        activeTab: 'results',
        warmStartResultId: savedScenario.results[0].id,
        showResultComparison: true,
      },
      manualEditorUnsaved: true,
      manualEditorLeaveHook: vi.fn(),
    });
    useAppStore.getState().clearScenarioDocumentHistory();

    useAppStore.getState().updateScenarioDocument((document) => ({
      ...document,
      scenario: {
        ...document.scenario,
        num_sessions: 5,
      },
    }));
    expect(useAppStore.temporal.getState().pastStates).toHaveLength(1);

    const reducedScenario = createSampleScenario({ num_sessions: 2 });
    useAppStore.getState().applySessionReductionScenario(reducedScenario);
    vi.runAllTimers();

    const state = useAppStore.getState();
    expect(state.scenario).toMatchObject(reducedScenario);
    expect(state.solution).toBeNull();
    expect(state.currentResultId).toBeNull();
    expect(state.selectedResultIds).toEqual([]);
    expect(state.ui.activeTab).toBe('scenario');
    expect(state.ui.warmStartResultId).toBeNull();
    expect(state.ui.showResultComparison).toBe(false);
    expect(state.manualEditorUnsaved).toBe(false);
    expect(state.manualEditorLeaveHook).toBeNull();
    expect(state.solverState.isComplete).toBe(false);
    expect(useAppStore.temporal.getState().pastStates).toHaveLength(0);
    expect(scenarioStorage.getScenario(savedScenario.id)?.scenario.num_sessions).toBe(2);
    vi.useRealTimers();
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
