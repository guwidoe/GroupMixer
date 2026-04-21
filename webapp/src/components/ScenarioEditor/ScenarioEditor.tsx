import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { DemoDataWarningModal } from '../modals/DemoDataWarningModal';
import { GeneratedDemoDataModal } from '../modals/GeneratedDemoDataModal';
import { ReduceSessionsReviewModal } from '../modals/ReduceSessionsReviewModal';
import { ConstraintFormModal } from './ConstraintFormModal';
import { ScenarioSetupLayout } from './layout/ScenarioSetupLayout';
import { ScenarioDocumentHistoryBar } from './ScenarioDocumentHistoryBar';
import { ScenarioEditorConstraintModals } from './ScenarioEditorConstraintModals';
import { ScenarioEditorForms } from './ScenarioEditorForms';
import { ScenarioSetupSectionRenderer } from './ScenarioSetupSectionRenderer';
import { getScenarioSetupLegacyRedirect, resolveScenarioSetupSection } from './navigation/scenarioSetupNav';
import type { ScenarioSetupSectionId } from './navigation/scenarioSetupNavTypes';
import { useDeferredScenarioSectionContent, useDeferredScenarioSetupSummary } from './useDeferredScenarioSectionContent';
import { useScenarioEditorController, type ScenarioEditorSection } from './useScenarioEditorController';
import { useAppStore, useScenarioDocumentHistory } from '../../store';

function ScenarioEditorLoadingState({ label, message }: { label: string; message: string }) {
  return (
    <div
      className="animate-fade-in rounded-2xl border px-6 py-8"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
      role="status"
      aria-live="polite"
    >
      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        Loading {label}…
      </div>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {message}
      </p>
    </div>
  );
}

function resolveRouteSection(section: string | undefined): {
  activeSection: ScenarioEditorSection;
  navigationSection: ScenarioSetupSectionId;
} {
  const activeSection = resolveScenarioSetupSection(section);

  return {
    activeSection,
    navigationSection: activeSection,
  };
}

function ScenarioEditorShell({ activeSection, navigationSection }: { activeSection: ScenarioEditorSection; navigationSection: ScenarioSetupSectionId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const handleNavigate = React.useCallback((sectionId: ScenarioSetupSectionId) => {
    const nextPath = `/app/scenario/${sectionId}`;
    const { setupGridUnsaved, setupGridLeaveHook } = useAppStore.getState();
    if (setupGridUnsaved && setupGridLeaveHook && nextPath !== location.pathname) {
      setupGridLeaveHook(() => navigate(nextPath));
      return;
    }

    navigate(nextPath);
  }, [location.pathname, navigate]);

  return (
    <div className="space-y-6 md:flex md:h-full md:min-h-0 md:flex-col md:space-y-0">
      <ScenarioSetupLayout
        scenario={null}
        attributeDefinitions={[]}
        objectiveCount={0}
        activeSection={navigationSection}
        onNavigate={handleNavigate}
      >
        <ScenarioEditorLoadingState
          label={activeSection}
          message="The setup shell is ready. Scenario content is mounting asynchronously to keep navigation responsive."
        />
      </ScenarioSetupLayout>
    </div>
  );
}

function isEditableShortcutTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  const tagName = element.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function ScenarioEditorLoaded() {
  const controller = useScenarioEditorController();
  const pastCount = useScenarioDocumentHistory((state) => state.pastStates.length);
  const futureCount = useScenarioDocumentHistory((state) => state.futureStates.length);
  const undoScenarioDocument = useAppStore((state) => state.undoScenarioDocument);
  const redoScenarioDocument = useAppStore((state) => state.redoScenarioDocument);
  const canUndo = pastCount > 0;
  const canRedo = futureCount > 0;
  const handleNavigateToSection = React.useCallback((sectionId: ScenarioSetupSectionId) => {
    if (sectionId === controller.navigationSection) {
      return;
    }

    const { setupGridUnsaved, setupGridLeaveHook } = useAppStore.getState();
    if (setupGridUnsaved && setupGridLeaveHook) {
      setupGridLeaveHook(() => controller.navigateToSection(sectionId));
      return;
    }

    controller.navigateToSection(sectionId);
  }, [controller]);
  const deferredSection = useDeferredScenarioSectionContent(
    controller.activeSection,
    controller.scenario ?? null,
    controller.currentScenarioId,
  );
  const deferredSummary = useDeferredScenarioSetupSummary(
    controller.scenario ?? null,
    controller.attributeDefinitions,
    controller.objectiveCount,
    controller.currentScenarioId,
  );
  const showSectionLoadingState = controller.ui.isLoading || deferredSection.isContentLoading;
  const sectionLoadingLabel = controller.ui.isLoading
    ? 'scenario setup'
    : deferredSection.deferredSectionLabel;
  const sectionLoadingMessage = controller.ui.isLoading
    ? 'The setup shell is ready. Scenario data is loading asynchronously to keep navigation responsive.'
    : 'The setup shell is ready. Large scenario content is loading asynchronously to keep navigation responsive.';

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || isEditableShortcutTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const wantsRedo = key === 'y' || (key === 'z' && event.shiftKey);
      const wantsUndo = key === 'z' && !event.shiftKey;

      if (wantsUndo && canUndo) {
        event.preventDefault();
        undoScenarioDocument();
        return;
      }

      if (wantsRedo && canRedo) {
        event.preventDefault();
        redoScenarioDocument();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [canRedo, canUndo, redoScenarioDocument, undoScenarioDocument]);

  return (
    <div className="space-y-6 md:flex md:h-full md:min-h-0 md:flex-col md:space-y-0">
      <ScenarioSetupLayout
        scenario={deferredSummary.summaryScenario}
        attributeDefinitions={deferredSummary.summaryAttributeDefinitions}
        objectiveCount={deferredSummary.summaryObjectiveCount}
        activeSection={controller.navigationSection}
        onNavigate={handleNavigateToSection}
        headerContent={(
          <ScenarioDocumentHistoryBar
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undoScenarioDocument}
            onRedo={redoScenarioDocument}
          />
        )}
      >
        {showSectionLoadingState ? (
          <ScenarioEditorLoadingState label={sectionLoadingLabel} message={sectionLoadingMessage} />
        ) : (
          <ScenarioSetupSectionRenderer controller={controller} />
        )}
      </ScenarioSetupLayout>

      {!controller.ui.isLoading && (
        <ScenarioEditorForms
          person={{
            showPersonForm: controller.entities.showPersonForm,
            editingPerson: controller.entities.editingPerson,
            personForm: controller.entities.personForm,
            setPersonForm: controller.entities.setPersonForm,
            attributeDefinitions: controller.attributeDefinitions,
            sessionsCount: controller.sessionsCount,
            onSavePerson: controller.entities.handleAddPerson,
            onUpdatePerson: controller.entities.handleUpdatePerson,
            onCancelPerson: controller.editorActions.handleCancelPersonForm,
            onShowAttributeForm: () => controller.entities.setShowAttributeForm(true),
          }}
          group={{
            showGroupForm: controller.entities.showGroupForm,
            editingGroup: controller.entities.editingGroup,
            groupForm: controller.entities.groupForm,
            setGroupForm: controller.entities.setGroupForm,
            groupFormInputs: controller.entities.groupFormInputs,
            setGroupFormInputs: controller.entities.setGroupFormInputs,
            sessionsCount: controller.sessionsCount,
            onSaveGroup: controller.entities.handleAddGroup,
            onUpdateGroup: controller.entities.handleUpdateGroup,
            onCancelGroup: controller.editorActions.handleCancelGroupForm,
          }}
          attribute={{
            showAttributeForm: controller.entities.showAttributeForm,
            editingAttribute: controller.entities.editingAttribute,
            newAttribute: controller.entities.newAttribute,
            setNewAttribute: controller.entities.setNewAttribute,
            onSaveAttribute: controller.entities.handleAddAttribute,
            onUpdateAttribute: controller.entities.handleUpdateAttribute,
            onCancelAttribute: controller.editorActions.handleCancelAttributeForm,
          }}
        />
      )}
      {!controller.ui.isLoading && (
        <ConstraintFormModal
          isOpen={controller.constraints.showConstraintForm}
          isEditing={controller.constraints.editingConstraint !== null}
          constraintForm={controller.constraints.constraintForm}
          setConstraintForm={controller.constraints.setConstraintForm}
          scenario={controller.scenario ?? null}
          attributeDefinitions={controller.attributeDefinitions}
          sessionsCount={controller.sessionsCount}
          onAdd={controller.constraints.handleAddConstraint}
          onUpdate={controller.constraints.handleUpdateConstraint}
          onClose={controller.editorActions.handleCloseConstraintForm}
        />
      )}
      {!controller.ui.isLoading && (
        <ScenarioEditorConstraintModals
          sessionsCount={controller.sessionsCount}
          resolveScenario={controller.resolveScenario}
          setScenario={controller.setScenario}
          showImmovableModal={controller.constraints.showImmovableModal}
          setShowImmovableModal={controller.constraints.setShowImmovableModal}
          editingImmovableIndex={controller.constraints.editingImmovableIndex}
          setEditingImmovableIndex={controller.constraints.setEditingImmovableIndex}
          showRepeatEncounterModal={controller.constraints.showRepeatEncounterModal}
          setShowRepeatEncounterModal={controller.constraints.setShowRepeatEncounterModal}
          showAttributeBalanceModal={controller.constraints.showAttributeBalanceModal}
          setShowAttributeBalanceModal={controller.constraints.setShowAttributeBalanceModal}
          showShouldNotBeTogetherModal={controller.constraints.showShouldNotBeTogetherModal}
          setShowShouldNotBeTogetherModal={controller.constraints.setShowShouldNotBeTogetherModal}
          showShouldStayTogetherModal={controller.constraints.showShouldStayTogetherModal}
          setShowShouldStayTogetherModal={controller.constraints.setShowShouldStayTogetherModal}
          showMustStayTogetherModal={controller.constraints.showMustStayTogetherModal}
          setShowMustStayTogetherModal={controller.constraints.setShowMustStayTogetherModal}
          showMustStayApartModal={controller.constraints.showMustStayApartModal}
          setShowMustStayApartModal={controller.constraints.setShowMustStayApartModal}
          showPairMeetingCountModal={controller.constraints.showPairMeetingCountModal}
          setShowPairMeetingCountModal={controller.constraints.setShowPairMeetingCountModal}
          editingConstraintIndex={controller.constraints.editingConstraintIndex}
          setEditingConstraintIndex={controller.constraints.setEditingConstraintIndex}
        />
      )}

      <DemoDataWarningModal
        isOpen={controller.showDemoWarningModal}
        onClose={controller.handleDemoCancel}
        onOverwrite={controller.handleDemoOverwrite}
        onLoadNew={controller.handleDemoLoadNew}
        demoCaseName={controller.pendingDemoCaseName || 'Demo Case'}
      />

      <GeneratedDemoDataModal
        isOpen={controller.showGeneratedDemoModal}
        onClose={controller.handleDemoCancel}
        onGenerate={controller.handleGeneratedDemoSubmit}
      />

      <ReduceSessionsReviewModal
        isOpen={controller.showSessionReductionReviewModal}
        plan={controller.sessionReductionPlan}
        people={controller.scenario?.people ?? []}
        invalidations={controller.sessionReductionInvalidations}
        onClose={controller.handleCancelSessionReduction}
        onConfirm={controller.handleConfirmSessionReduction}
      />
    </div>
  );
}

function DeferredScenarioEditorMount({
  activeSection,
  navigationSection,
}: {
  activeSection: ScenarioEditorSection;
  navigationSection: ScenarioSetupSectionId;
}) {
  const [shouldMountController, setShouldMountController] = React.useState(false);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShouldMountController(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!shouldMountController) {
    return <ScenarioEditorShell activeSection={activeSection} navigationSection={navigationSection} />;
  }

  return <ScenarioEditorLoaded />;
}

export function ScenarioEditor() {
  const { section } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const setLastScenarioSetupSection = useAppStore((state) => state.setLastScenarioSetupSection);
  const { activeSection, navigationSection } = resolveRouteSection(section);

  React.useEffect(() => {
    const redirectSection = getScenarioSetupLegacyRedirect(section);
    if (redirectSection) {
      navigate(`/app/scenario/${redirectSection}`, { replace: true });
    }
  }, [navigate, section]);

  React.useEffect(() => {
    setLastScenarioSetupSection(navigationSection);
  }, [navigationSection, setLastScenarioSetupSection]);

  return (
    <DeferredScenarioEditorMount
      key={navigationSection}
      activeSection={activeSection}
      navigationSection={navigationSection}
    />
  );
}
