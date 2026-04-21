import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../ui';
import { useAppStore } from '../../store';
import { getPreferredWorkflowGuideResult, resolveWorkflowGuideAction } from './workflowGuide';

export function WorkflowGuideButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentScenarioId = useAppStore((state) => state.currentScenarioId);
  const currentResultId = useAppStore((state) => state.currentResultId);
  const savedScenarios = useAppStore((state) => state.savedScenarios);
  const solution = useAppStore((state) => state.solution);
  const advancedModeEnabled = useAppStore((state) => state.ui.advancedModeEnabled ?? false);
  const showWorkflowGuideButton = useAppStore((state) => state.ui.showWorkflowGuideButton ?? true);
  const selectCurrentResult = useAppStore((state) => state.selectCurrentResult);

  const currentScenario = currentScenarioId ? savedScenarios[currentScenarioId] : null;
  const preferredResult = React.useMemo(
    () => getPreferredWorkflowGuideResult(currentScenario?.results ?? []),
    [currentScenario?.results],
  );

  const workflowAction = resolveWorkflowGuideAction(location.pathname, {
    hasBestResult: Boolean(preferredResult),
    hasDetailedResult: Boolean(solution && currentResultId),
  });

  if (
    !showWorkflowGuideButton
    ||
    !workflowAction
    || (!advancedModeEnabled && workflowAction.kind === 'route' && workflowAction.nextStepId === 'solver')
    || (!advancedModeEnabled && workflowAction.kind === 'route' && workflowAction.nextStepId === 'manual-editor')
  ) {
    return null;
  }

  const handleClick = () => {
    if (workflowAction.kind === 'open-best-result') {
      if (!preferredResult) {
        return;
      }

      selectCurrentResult(preferredResult.id);
      navigate('/app/results');
      return;
    }

    navigate(workflowAction.path);
  };

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-40 sm:bottom-5 sm:right-5 md:bottom-6 md:right-6"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Button
        variant="primary"
        size="lg"
        trailingIcon={<ArrowRight className="h-4 w-4" />}
        className="pointer-events-auto rounded-full px-5 shadow-lg shadow-black/20"
        onClick={handleClick}
        aria-label={workflowAction.label}
        title={workflowAction.label}
      >
        {workflowAction.label}
      </Button>
    </div>
  );
}
