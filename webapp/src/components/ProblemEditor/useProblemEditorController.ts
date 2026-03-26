import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../../store';
import type { Problem } from '../../types';
import { getDefaultSolverSettings } from './helpers';
import { useProblemEditorBulk } from './hooks/useProblemEditorBulk';
import { useProblemEditorConstraints } from './hooks/useProblemEditorConstraints';
import { useProblemEditorEntities } from './hooks/useProblemEditorEntities';
import { isProblemSetupSectionId } from './navigation/problemSetupNav';
import type { ProblemSetupSectionId } from './navigation/problemSetupNavTypes';
import { createProblemEditorActions } from './problemEditorActions';

export type ProblemEditorSection = ProblemSetupSectionId | 'constraints';

export function useProblemEditorController() {
  const {
    problem,
    setProblem,
    resolveProblem,
    addNotification,
    loadDemoCase,
    loadDemoCaseOverwrite,
    loadDemoCaseNewProblem,
    attributeDefinitions,
    addAttributeDefinition,
    removeAttributeDefinition,
    setShowProblemManager,
    currentProblemId,
    saveProblem,
    updateCurrentProblem,
    updateProblem,
    ui,
  } = useAppStore();

  const { section } = useParams<{ section: string }>();
  const activeSection: ProblemEditorSection =
    section === 'constraints' || (section && isProblemSetupSectionId(section)) ? section : 'people';
  const navigationSection = activeSection === 'constraints' ? null : activeSection;
  const navigate = useNavigate();

  const [sessionsCount, setSessionsCount] = useState(problem?.num_sessions || 3);
  const [showDemoWarningModal, setShowDemoWarningModal] = useState(false);
  const [pendingDemoCaseId, setPendingDemoCaseId] = useState<string | null>(null);
  const [pendingDemoCaseName, setPendingDemoCaseName] = useState<string | null>(null);

  const entities = useProblemEditorEntities({
    problem,
    addAttributeDefinition,
    removeAttributeDefinition,
    addNotification,
    setProblem,
  });

  const constraints = useProblemEditorConstraints({
    problem,
    sessionsCount,
    addNotification,
    setProblem,
  });

  const bulk = useProblemEditorBulk({
    problem,
    attributeDefinitions,
    addAttributeDefinition,
    removeAttributeDefinition,
    addNotification,
    setProblem,
  });

  const editorActions = createProblemEditorActions({
    problem,
    updateProblem,
    constraints,
    entities,
  });

  const objectiveCount = (() => {
    if (problem?.objectives && problem.objectives.length > 0) {
      return problem.objectives.filter((objective) => objective.weight > 0).length;
    }
    return 1;
  })();

  const currentObjectiveWeight = (() => {
    if (problem?.objectives && problem.objectives.length > 0) {
      return problem.objectives[0].weight;
    }
    return 1;
  })();

  useEffect(() => {
    if (problem && currentProblemId) {
      try {
        updateCurrentProblem(currentProblemId, problem);
      } catch (error) {
        addNotification({
          type: 'error',
          title: 'Auto-save Failed',
          message: error instanceof Error ? error.message : 'Failed to persist problem changes.',
        });
      }
    }
  }, [problem, currentProblemId, updateCurrentProblem, addNotification]);

  const handleSaveProblem = () => {
    if (!problem) return;

    if (currentProblemId) {
      try {
        updateCurrentProblem(currentProblemId, problem);
        addNotification({ type: 'success', title: 'Saved', message: 'Problem saved.' });
      } catch (error) {
        addNotification({
          type: 'error',
          title: 'Save Failed',
          message: error instanceof Error ? error.message : 'Failed to persist problem changes.',
        });
      }
    } else {
      saveProblem('Untitled Problem');
    }
  };

  const handleLoadProblem = () => {
    setShowProblemManager(true);
  };

  const handleDemoCaseClick = (demoCaseId: string, demoCaseName: string) => {
    const currentProblem = problem;
    const hasContent =
      currentProblem &&
      (currentProblem.people.length > 0 ||
        currentProblem.groups.length > 0 ||
        currentProblem.constraints.length > 0);

    if (hasContent) {
      setPendingDemoCaseId(demoCaseId);
      setPendingDemoCaseName(demoCaseName);
      setShowDemoWarningModal(true);
    } else {
      loadDemoCase(demoCaseId);
    }
  };

  const handleDemoOverwrite = () => {
    if (pendingDemoCaseId) {
      loadDemoCaseOverwrite(pendingDemoCaseId);
      setShowDemoWarningModal(false);
      setPendingDemoCaseId(null);
      setPendingDemoCaseName(null);
    }
  };

  const handleDemoLoadNew = () => {
    if (pendingDemoCaseId) {
      loadDemoCaseNewProblem(pendingDemoCaseId);
      setShowDemoWarningModal(false);
      setPendingDemoCaseId(null);
      setPendingDemoCaseName(null);
    }
  };

  const handleDemoCancel = () => {
    setShowDemoWarningModal(false);
    setPendingDemoCaseId(null);
    setPendingDemoCaseName(null);
  };

  const handleSessionsCountChange = (count: number | null) => {
    if (count !== null) {
      setSessionsCount(count);

      const updatedProblem: Problem = {
        people: problem?.people || [],
        groups: problem?.groups || [],
        num_sessions: count,
        constraints: problem?.constraints || [],
        settings: problem?.settings || getDefaultSolverSettings(),
      };

      setProblem(updatedProblem);
    }
  };

  const navigateToSection = (sectionId: ProblemSetupSectionId) => {
    navigate(`/app/problem/${sectionId}`);
  };

  return {
    problem,
    setProblem,
    resolveProblem,
    addNotification,
    attributeDefinitions,
    removeAttributeDefinition,
    ui,
    sessionsCount,
    activeSection,
    navigationSection,
    objectiveCount,
    currentObjectiveWeight,
    entities,
    constraints,
    bulk,
    editorActions,
    showDemoWarningModal,
    pendingDemoCaseName,
    handleLoadProblem,
    handleSaveProblem,
    handleDemoCaseClick,
    handleDemoOverwrite,
    handleDemoLoadNew,
    handleDemoCancel,
    handleSessionsCountChange,
    navigateToSection,
  };
}

export type ProblemEditorController = ReturnType<typeof useProblemEditorController>;
