import { describe, expect, it } from 'vitest';
import { createSampleSolution } from '../../test/fixtures';
import { getPreferredWorkflowGuideResult, resolveWorkflowGuideAction, resolveWorkflowGuideStep, WORKFLOW_GUIDE_ORDER } from './workflowGuide';

describe('workflowGuide', () => {
  it('keeps the beginner workflow order in a single sequence', () => {
    expect(WORKFLOW_GUIDE_ORDER).toEqual([
      'sessions',
      'groups',
      'attributes',
      'people',
      'immovable-people',
      'must-stay-together',
      'repeat-encounter',
      'should-not-be-together',
      'should-stay-together',
      'attribute-balance',
      'pair-meeting-count',
      'objectives',
      'solver',
      'results',
      'result-details',
      'manual-editor',
    ]);
  });

  it('resolves setup and app routes into workflow steps', () => {
    expect(resolveWorkflowGuideStep('/app/scenario/sessions')).toBe('sessions');
    expect(resolveWorkflowGuideStep('/app/solver')).toBe('solver');
    expect(resolveWorkflowGuideStep('/app/history')).toBe('results');
    expect(resolveWorkflowGuideStep('/app/results')).toBe('result-details');
    expect(resolveWorkflowGuideStep('/app/editor')).toBe('manual-editor');
  });

  it('routes setup pages to the next workflow step', () => {
    expect(resolveWorkflowGuideAction('/app/scenario/sessions')).toEqual({
      kind: 'route',
      currentStepId: 'sessions',
      nextStepId: 'groups',
      label: 'Next: Groups',
      path: '/app/scenario/groups',
    });

    expect(resolveWorkflowGuideAction('/app/scenario/objectives')).toEqual({
      kind: 'route',
      currentStepId: 'objectives',
      nextStepId: 'solver',
      label: 'Next: Solver',
      path: '/app/solver',
    });
  });

  it('uses special actions for results history and detailed view', () => {
    expect(resolveWorkflowGuideAction('/app/history', { hasBestResult: true })).toEqual({
      kind: 'open-best-result',
      currentStepId: 'results',
      nextStepId: 'result-details',
      label: 'Open Best Saved Result',
    });

    expect(resolveWorkflowGuideAction('/app/history', { hasBestResult: false })).toBeNull();

    expect(resolveWorkflowGuideAction('/app/results', { hasDetailedResult: true })).toEqual({
      kind: 'route',
      currentStepId: 'result-details',
      nextStepId: 'manual-editor',
      label: 'Open Manual Editor',
      path: '/app/editor',
    });
  });

  it('chooses the best workflow result with a fallback to the lowest score', () => {
    const older = {
      id: 'older',
      name: 'Older',
      solution: createSampleSolution({ final_score: 9 }),
      solverSettings: { solver_type: 'solver1', stop_conditions: {}, solver_params: {} },
      timestamp: 1000,
      duration: 100,
    };
    const newer = {
      id: 'newer',
      name: 'Newer',
      solution: createSampleSolution({ final_score: 4 }),
      solverSettings: { solver_type: 'solver1', stop_conditions: {}, solver_params: {} },
      timestamp: 2000,
      duration: 100,
    };

    expect(getPreferredWorkflowGuideResult([older, newer])?.id).toBe('newer');
    expect(getPreferredWorkflowGuideResult([])).toBeNull();
  });
});
