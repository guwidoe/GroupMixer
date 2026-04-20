import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../../store';
import type { Scenario } from '../../types';
import { getDefaultSolverSettings } from './helpers';
import { useScenarioEditorBulkUpdatePeople } from './hooks/useScenarioEditorBulkUpdatePeople';
import { useScenarioEditorConstraints } from './hooks/useScenarioEditorConstraints';
import { useScenarioEditorEntities } from './hooks/useScenarioEditorEntities';
import { resolveScenarioSetupSection } from './navigation/scenarioSetupNav';
import type { ScenarioSetupSectionId } from './navigation/scenarioSetupNavTypes';
import { createScenarioEditorActions } from './scenarioEditorActions';
import {
  createGeneratedDemoScenario,
  formatGeneratedDemoScenarioName,
  GENERATED_DEMO_CASE_ID,
  type GeneratedDemoScenarioOptions,
} from '../../services/demoScenarioGenerator';
import {
  buildSessionReductionInvalidations,
  planSessionCountReduction,
  type SessionCountReductionPlan,
} from '../../services/sessionCountMigration';

export type ScenarioEditorSection = ScenarioSetupSectionId;

export function useScenarioEditorController() {
  const {
    scenario,
    setScenario,
    resolveScenario,
    addNotification,
    loadDemoCase,
    loadDemoCaseOverwrite,
    loadDemoCaseNewScenario,
    loadGeneratedDemoScenario,
    loadGeneratedDemoScenarioOverwrite,
    loadGeneratedDemoScenarioNewScenario,
    attributeDefinitions,
    addAttributeDefinition,
    removeAttributeDefinition,
    setAttributeDefinitions,
    setShowScenarioManager,
    currentScenarioId,
    saveScenario,
    updateCurrentScenario,
    updateScenario,
    applySessionReductionScenario,
    ui,
    solution,
    currentResultId,
    manualEditorUnsaved,
  } = useAppStore();

  const { section } = useParams<{ section: string }>();
  const activeSection: ScenarioEditorSection = resolveScenarioSetupSection(section);
  const navigationSection = activeSection;
  const navigate = useNavigate();

  const [sessionsCount, setSessionsCount] = useState(scenario?.num_sessions || 3);
  const [showDemoWarningModal, setShowDemoWarningModal] = useState(false);
  const [showGeneratedDemoModal, setShowGeneratedDemoModal] = useState(false);
  const [pendingDemoCaseId, setPendingDemoCaseId] = useState<string | null>(null);
  const [pendingDemoCaseName, setPendingDemoCaseName] = useState<string | null>(null);
  const [pendingGeneratedScenario, setPendingGeneratedScenario] = useState<Scenario | null>(null);
  const [sessionReductionPlan, setSessionReductionPlan] = useState<SessionCountReductionPlan | null>(null);

  const entities = useScenarioEditorEntities({
    scenario,
    attributeDefinitions,
    addAttributeDefinition,
    setAttributeDefinitions,
    addNotification,
    setScenario,
  });

  const constraints = useScenarioEditorConstraints({
    scenario,
    attributeDefinitions,
    sessionsCount,
    addNotification,
    setScenario,
  });

  const bulk = {
    updatePeople: useScenarioEditorBulkUpdatePeople({
      scenario,
      attributeDefinitions,
      addNotification,
      setAttributeDefinitions,
      setScenario,
    }),
  };

  const editorActions = createScenarioEditorActions({
    scenario,
    updateScenario,
    constraints,
    entities,
  });

  const objectiveCount = (() => {
    if (scenario?.objectives && scenario.objectives.length > 0) {
      return scenario.objectives.filter((objective) => objective.weight > 0).length;
    }
    return 1;
  })();

  const currentObjectiveWeight = (() => {
    if (scenario?.objectives && scenario.objectives.length > 0) {
      return scenario.objectives[0].weight;
    }
    return 1;
  })();

  useEffect(() => {
    if (scenario && currentScenarioId) {
      try {
        updateCurrentScenario(currentScenarioId, scenario);
      } catch (error) {
        addNotification({
          type: 'error',
          title: 'Auto-save Failed',
          message: error instanceof Error ? error.message : 'Failed to persist scenario changes.',
        });
      }
    }
  }, [scenario, currentScenarioId, updateCurrentScenario, addNotification]);

  useEffect(() => {
    setSessionsCount(scenario?.num_sessions || 3);
  }, [scenario?.num_sessions]);

  const handleSaveScenario = () => {
    if (!scenario) return;

    if (currentScenarioId) {
      try {
        updateCurrentScenario(currentScenarioId, scenario);
        addNotification({ type: 'success', title: 'Saved', message: 'Scenario saved.' });
      } catch (error) {
        addNotification({
          type: 'error',
          title: 'Save Failed',
          message: error instanceof Error ? error.message : 'Failed to persist scenario changes.',
        });
      }
    } else {
      saveScenario('Untitled Scenario');
    }
  };

  const handleLoadScenario = () => {
    setShowScenarioManager(true);
  };

  const handleDemoCaseClick = (demoCaseId: string, demoCaseName: string) => {
    if (demoCaseId === GENERATED_DEMO_CASE_ID) {
      setShowGeneratedDemoModal(true);
      return;
    }

    const currentScenario = scenario;
    const hasContent =
      currentScenario &&
      (currentScenario.people.length > 0 ||
        currentScenario.groups.length > 0 ||
        currentScenario.constraints.length > 0);

    if (hasContent) {
      setPendingDemoCaseId(demoCaseId);
      setPendingDemoCaseName(demoCaseName);
      setShowDemoWarningModal(true);
    } else {
      loadDemoCase(demoCaseId);
    }
  };

  const handleDemoOverwrite = () => {
    if (pendingGeneratedScenario) {
      loadGeneratedDemoScenarioOverwrite(pendingGeneratedScenario, pendingDemoCaseName ?? 'Random Demo');
      setShowDemoWarningModal(false);
      setPendingGeneratedScenario(null);
      setPendingDemoCaseId(null);
      setPendingDemoCaseName(null);
      return;
    }

    if (pendingDemoCaseId) {
      loadDemoCaseOverwrite(pendingDemoCaseId);
      setShowDemoWarningModal(false);
      setPendingDemoCaseId(null);
      setPendingDemoCaseName(null);
    }
  };

  const handleDemoLoadNew = () => {
    if (pendingGeneratedScenario) {
      loadGeneratedDemoScenarioNewScenario(pendingGeneratedScenario, pendingDemoCaseName ?? 'Random Demo');
      setShowDemoWarningModal(false);
      setPendingGeneratedScenario(null);
      setPendingDemoCaseId(null);
      setPendingDemoCaseName(null);
      return;
    }

    if (pendingDemoCaseId) {
      loadDemoCaseNewScenario(pendingDemoCaseId);
      setShowDemoWarningModal(false);
      setPendingDemoCaseId(null);
      setPendingDemoCaseName(null);
    }
  };

  const handleDemoCancel = () => {
    setShowDemoWarningModal(false);
    setShowGeneratedDemoModal(false);
    setPendingGeneratedScenario(null);
    setPendingDemoCaseId(null);
    setPendingDemoCaseName(null);
  };

  const handleGeneratedDemoSubmit = (options: GeneratedDemoScenarioOptions) => {
    const generatedScenario = createGeneratedDemoScenario(options);
    const generatedScenarioName = formatGeneratedDemoScenarioName(options);
    const currentScenario = scenario;
    const hasContent =
      currentScenario &&
      (currentScenario.people.length > 0 || currentScenario.groups.length > 0 || currentScenario.constraints.length > 0);

    setShowGeneratedDemoModal(false);

    if (hasContent) {
      setPendingGeneratedScenario(generatedScenario);
      setPendingDemoCaseId(null);
      setPendingDemoCaseName(generatedScenarioName);
      setShowDemoWarningModal(true);
      return;
    }

    loadGeneratedDemoScenario(generatedScenario, generatedScenarioName);
  };

  const handleSessionsCountChange = (count: number | null) => {
    if (count === null) {
      return;
    }

    const currentScenario = scenario;
    const previousSessionCount = currentScenario?.num_sessions ?? sessionsCount;

    if (!currentScenario || count >= previousSessionCount) {
      setSessionsCount(count);

      const updatedScenario: Scenario = {
        people: currentScenario?.people || [],
        groups: currentScenario?.groups || [],
        num_sessions: count,
        constraints: currentScenario?.constraints || [],
        settings: currentScenario?.settings || getDefaultSolverSettings(),
      };

      setScenario(updatedScenario);
      return;
    }

    setSessionReductionPlan(planSessionCountReduction({
      scenario: currentScenario,
      nextSessionCount: count,
    }));
  };

  const handleCancelSessionReduction = () => {
    setSessionReductionPlan(null);
  };

  const handleConfirmSessionReduction = () => {
    if (!sessionReductionPlan?.canApply || !sessionReductionPlan.nextScenario) {
      return;
    }

    const summaryParts = [
      sessionReductionPlan.summary.peopleTrimmed > 0
        ? `${sessionReductionPlan.summary.peopleTrimmed} people trimmed`
        : null,
      sessionReductionPlan.summary.groupsTrimmed > 0
        ? `${sessionReductionPlan.summary.groupsTrimmed} groups truncated`
        : null,
      sessionReductionPlan.summary.constraintsTrimmed > 0
        ? `${sessionReductionPlan.summary.constraintsTrimmed} constraints trimmed`
        : null,
      sessionReductionPlan.summary.constraintsRemoved > 0
        ? `${sessionReductionPlan.summary.constraintsRemoved} constraints removed`
        : null,
    ].filter(Boolean).join(', ');

    setSessionsCount(sessionReductionPlan.nextSessionCount);
    applySessionReductionScenario(sessionReductionPlan.nextScenario);
    setSessionReductionPlan(null);

    addNotification({
      type: 'success',
      title: 'Sessions Updated',
      message: summaryParts.length > 0
        ? `Reduced the scenario from ${sessionReductionPlan.previousSessionCount} sessions to ${sessionReductionPlan.nextSessionCount}; ${summaryParts}.`
        : `Reduced the scenario from ${sessionReductionPlan.previousSessionCount} sessions to ${sessionReductionPlan.nextSessionCount}.`,
    });
  };

  const navigateToSection = (sectionId: ScenarioSetupSectionId) => {
    navigate(`/app/scenario/${sectionId}`);
  };

  const sessionReductionInvalidations = sessionReductionPlan
    ? buildSessionReductionInvalidations({
        hasActiveSolution: Boolean(solution || currentResultId),
        hasWarmStartSelection: Boolean(ui.warmStartResultId),
        hasManualEditorState: manualEditorUnsaved,
      })
    : [];

  return {
    scenario,
    setScenario,
    resolveScenario,
    addNotification,
    attributeDefinitions,
    removeAttributeDefinition,
    currentScenarioId,
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
    showGeneratedDemoModal,
    pendingDemoCaseName,
    handleLoadScenario,
    handleSaveScenario,
    handleDemoCaseClick,
    handleDemoOverwrite,
    handleDemoLoadNew,
    handleDemoCancel,
    handleGeneratedDemoSubmit,
    handleSessionsCountChange,
    sessionReductionPlan,
    sessionReductionInvalidations,
    showSessionReductionReviewModal: sessionReductionPlan !== null,
    handleCancelSessionReduction,
    handleConfirmSessionReduction,
    navigateToSection,
  };
}

export type ScenarioEditorController = ReturnType<typeof useScenarioEditorController>;
