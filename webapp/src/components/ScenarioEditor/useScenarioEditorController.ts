import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../../store';
import type { Scenario } from '../../types';
import { getDefaultSolverSettings } from './helpers';
import { useScenarioEditorBulk } from './hooks/useScenarioEditorBulk';
import { useScenarioEditorConstraints } from './hooks/useScenarioEditorConstraints';
import { useScenarioEditorEntities } from './hooks/useScenarioEditorEntities';
import { isScenarioSetupSectionId } from './navigation/scenarioSetupNav';
import type { ScenarioSetupSectionId } from './navigation/scenarioSetupNavTypes';
import { createScenarioEditorActions } from './scenarioEditorActions';

export type ScenarioEditorSection = ScenarioSetupSectionId | 'constraints';

export function useScenarioEditorController() {
  const {
    scenario,
    setScenario,
    resolveScenario,
    addNotification,
    loadDemoCase,
    loadDemoCaseOverwrite,
    loadDemoCaseNewScenario,
    attributeDefinitions,
    addAttributeDefinition,
    removeAttributeDefinition,
    setShowScenarioManager,
    currentScenarioId,
    saveScenario,
    updateCurrentScenario,
    updateScenario,
    ui,
  } = useAppStore();

  const { section } = useParams<{ section: string }>();
  const activeSection: ScenarioEditorSection =
    section === 'constraints' || (section && isScenarioSetupSectionId(section)) ? section : 'people';
  const navigationSection = activeSection === 'constraints' ? null : activeSection;
  const navigate = useNavigate();

  const [sessionsCount, setSessionsCount] = useState(scenario?.num_sessions || 3);
  const [showDemoWarningModal, setShowDemoWarningModal] = useState(false);
  const [pendingDemoCaseId, setPendingDemoCaseId] = useState<string | null>(null);
  const [pendingDemoCaseName, setPendingDemoCaseName] = useState<string | null>(null);

  const entities = useScenarioEditorEntities({
    scenario,
    addAttributeDefinition,
    removeAttributeDefinition,
    addNotification,
    setScenario,
  });

  const constraints = useScenarioEditorConstraints({
    scenario,
    sessionsCount,
    addNotification,
    setScenario,
  });

  const bulk = useScenarioEditorBulk({
    scenario,
    attributeDefinitions,
    addAttributeDefinition,
    removeAttributeDefinition,
    addNotification,
    setScenario,
  });

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
    if (pendingDemoCaseId) {
      loadDemoCaseOverwrite(pendingDemoCaseId);
      setShowDemoWarningModal(false);
      setPendingDemoCaseId(null);
      setPendingDemoCaseName(null);
    }
  };

  const handleDemoLoadNew = () => {
    if (pendingDemoCaseId) {
      loadDemoCaseNewScenario(pendingDemoCaseId);
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

      const updatedScenario: Scenario = {
        people: scenario?.people || [],
        groups: scenario?.groups || [],
        num_sessions: count,
        constraints: scenario?.constraints || [],
        settings: scenario?.settings || getDefaultSolverSettings(),
      };

      setScenario(updatedScenario);
    }
  };

  const navigateToSection = (sectionId: ScenarioSetupSectionId) => {
    navigate(`/app/scenario/${sectionId}`);
  };

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
    pendingDemoCaseName,
    handleLoadScenario,
    handleSaveScenario,
    handleDemoCaseClick,
    handleDemoOverwrite,
    handleDemoLoadNew,
    handleDemoCancel,
    handleSessionsCountChange,
    navigateToSection,
  };
}

export type ScenarioEditorController = ReturnType<typeof useScenarioEditorController>;
