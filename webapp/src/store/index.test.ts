import { beforeEach, describe, expect, it } from 'vitest';
import { createSampleProblem, createSampleSolution } from '../test/fixtures';
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

  it('replaces the workspace explicitly without clobbering a saved problem id', () => {
    const problem = createSampleProblem();
    const solution = createSampleSolution();

    useAppStore.setState({
      currentProblemId: 'saved-problem-1',
      selectedResultIds: ['result-a', 'result-b'],
      ui: {
        ...useAppStore.getState().ui,
        warmStartResultId: 'warm-start-result',
        showResultComparison: true,
      },
    });

    useAppStore.getState().replaceWorkspace({
      problem,
      solution,
      attributeDefinitions: [{ key: 'team', values: ['A', 'B'] }],
    });

    const state = useAppStore.getState();
    expect(state.problem).toEqual(problem);
    expect(state.solution).toEqual(solution);
    expect(state.currentProblemId).toBeNull();
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
});
