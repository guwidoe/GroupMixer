import { getBestResult } from '../ResultsHistory/utils';
import { getScenarioSetupSectionById } from '../ScenarioEditor/navigation/scenarioSetupNav';
import type { ScenarioSetupSectionId } from '../ScenarioEditor/navigation/scenarioSetupNavTypes';
import type { ScenarioResult } from '../../types';

export type WorkflowGuideStepId =
  | ScenarioSetupSectionId
  | 'solver'
  | 'results'
  | 'result-details'
  | 'manual-editor';

export type WorkflowGuideAction =
  | {
      kind: 'route';
      currentStepId: WorkflowGuideStepId;
      label: string;
      path: string;
      nextStepId: WorkflowGuideStepId;
    }
  | {
      kind: 'open-best-result';
      currentStepId: WorkflowGuideStepId;
      label: string;
      nextStepId: WorkflowGuideStepId;
    };

export const WORKFLOW_GUIDE_SETUP_ORDER: readonly ScenarioSetupSectionId[] = [
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
] as const;

export const WORKFLOW_GUIDE_ORDER: readonly WorkflowGuideStepId[] = [
  ...WORKFLOW_GUIDE_SETUP_ORDER,
  'solver',
  'results',
  'result-details',
  'manual-editor',
] as const;

function getWorkflowGuideRoute(stepId: WorkflowGuideStepId): string {
  if (stepId === 'solver') {
    return '/app/solver';
  }
  if (stepId === 'results') {
    return '/app/history';
  }
  if (stepId === 'result-details') {
    return '/app/results';
  }
  if (stepId === 'manual-editor') {
    return '/app/editor';
  }

  const section = getScenarioSetupSectionById(stepId);
  return `/app/scenario/${section?.routeSegment ?? stepId}`;
}

function getWorkflowGuideStepLabel(stepId: WorkflowGuideStepId): string {
  if (stepId === 'solver') {
    return 'Solver';
  }
  if (stepId === 'results') {
    return 'Saved Results';
  }
  if (stepId === 'result-details') {
    return 'Current Result';
  }
  if (stepId === 'manual-editor') {
    return 'Manual Editor';
  }

  const section = getScenarioSetupSectionById(stepId);
  return section?.shortLabel ?? section?.label ?? stepId;
}

export function resolveWorkflowGuideStep(pathname: string): WorkflowGuideStepId | null {
  if (pathname.startsWith('/app/scenario/')) {
    const routeSection = pathname.slice('/app/scenario/'.length).split('/')[0] ?? '';
    const section = getScenarioSetupSectionById(routeSection);
    return section?.id ?? null;
  }

  if (pathname.startsWith('/app/solver')) {
    return 'solver';
  }

  if (pathname.startsWith('/app/history')) {
    return 'results';
  }

  if (pathname.startsWith('/app/results')) {
    return 'result-details';
  }

  if (pathname.startsWith('/app/editor')) {
    return 'manual-editor';
  }

  return null;
}

export function resolveWorkflowGuideAction(
  pathname: string,
  options?: {
    hasBestResult?: boolean;
    hasDetailedResult?: boolean;
  },
): WorkflowGuideAction | null {
  const currentStepId = resolveWorkflowGuideStep(pathname);
  if (!currentStepId) {
    return null;
  }

  if (currentStepId === 'results') {
    return options?.hasBestResult
      ? {
          kind: 'open-best-result',
          currentStepId,
          label: 'Open Best Saved Result',
          nextStepId: 'result-details',
        }
      : null;
  }

  if (currentStepId === 'result-details') {
    if (!options?.hasDetailedResult) {
      return null;
    }

    return {
      kind: 'route',
      currentStepId,
      label: 'Open Manual Editor',
      path: getWorkflowGuideRoute('manual-editor'),
      nextStepId: 'manual-editor',
    };
  }

  const currentIndex = WORKFLOW_GUIDE_ORDER.indexOf(currentStepId);
  if (currentIndex === -1) {
    return null;
  }

  const nextStepId = WORKFLOW_GUIDE_ORDER[currentIndex + 1];
  if (!nextStepId || nextStepId === 'result-details' || nextStepId === 'manual-editor') {
    return null;
  }

  return {
    kind: 'route',
    currentStepId,
    nextStepId,
    label: `Next: ${getWorkflowGuideStepLabel(nextStepId)}`,
    path: getWorkflowGuideRoute(nextStepId),
  };
}

export function getPreferredWorkflowGuideResult(results: ScenarioResult[]): ScenarioResult | null {
  if (results.length === 0) {
    return null;
  }

  const mostRecentResult = results.reduce((latest, current) => (current.timestamp > latest.timestamp ? current : latest));
  return getBestResult(results, mostRecentResult)
    ?? results.reduce((best, current) => (current.solution.final_score < best.solution.final_score ? current : best));
}
