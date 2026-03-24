import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../../store';
import type { Problem } from '../../types';
import { DemoDataWarningModal } from '../modals/DemoDataWarningModal';
import { ConstraintFormModal } from './ConstraintFormModal';
import { getDefaultSolverSettings } from './helpers';
import { useProblemEditorBulk } from './hooks/useProblemEditorBulk';
import { useProblemEditorConstraints } from './hooks/useProblemEditorConstraints';
import { useProblemEditorEntities } from './hooks/useProblemEditorEntities';
import { ProblemEditorConstraintModals } from './ProblemEditorConstraintModals';
import { ProblemEditorForms } from './ProblemEditorForms';
import { ProblemEditorHeader } from './ProblemEditorHeader';
import { ProblemEditorTabs } from './ProblemEditorTabs';
import { createProblemEditorActions } from './problemEditorActions';
import { ConstraintsSection } from './sections/ConstraintsSection';
import { GroupsSection } from './sections/GroupsSection';
import { HardConstraintsSection } from './sections/HardConstraintsSection';
import { ObjectivesSection } from './sections/ObjectivesSection';
import { PeopleSection } from './sections/PeopleSection';
import { SessionsSection } from './sections/SessionsSection';
import { SoftConstraintsSection } from './sections/SoftConstraintsSection';

export function ProblemEditor() {
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
  const activeSection = section || 'people';
  const navigate = useNavigate();

  const [sessionsCount, setSessionsCount] = useState(problem?.num_sessions || 3);
  const entities = useProblemEditorEntities({
    problem,
    addAttributeDefinition,
    removeAttributeDefinition,
    addNotification,
    setProblem,
  });

  const getCurrentObjectiveWeight = () => {
    if (problem?.objectives && problem.objectives.length > 0) {
      return problem.objectives[0].weight;
    }
    return 1;
  };

  const objectiveCount = (() => {
    if (problem?.objectives && problem.objectives.length > 0) {
      return problem.objectives.filter((objective) => objective.weight > 0).length;
    }
    return 1;
  })();

  useEffect(() => {
    if (problem && currentProblemId) {
      updateCurrentProblem(currentProblemId, problem);
    }
  }, [problem, currentProblemId, updateCurrentProblem]);

  const constraints = useProblemEditorConstraints({
    problem,
    sessionsCount,
    addNotification,
    setProblem,
  });

  const [showDemoWarningModal, setShowDemoWarningModal] = useState(false);
  const [pendingDemoCaseId, setPendingDemoCaseId] = useState<string | null>(null);
  const [pendingDemoCaseName, setPendingDemoCaseName] = useState<string | null>(null);

  const handleSaveProblem = () => {
    if (!problem) return;

    if (currentProblemId) {
      updateCurrentProblem(currentProblemId, problem);
      addNotification({ type: 'success', title: 'Saved', message: 'Problem saved.' });
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

  if (ui.isLoading) {
    return <div className="animate-fade-in">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <ProblemEditorHeader
        onLoadProblem={handleLoadProblem}
        onSaveProblem={handleSaveProblem}
        onDemoCaseClick={handleDemoCaseClick}
      />

      <ProblemEditorTabs
        activeSection={activeSection}
        problem={problem ?? null}
        objectiveCount={objectiveCount}
        onNavigate={(sectionId) => navigate(`/app/problem/${sectionId}`)}
      />

      {activeSection === 'people' && (
        <PeopleSection
          problem={problem ?? null}
          attributeDefinitions={attributeDefinitions}
          sessionsCount={sessionsCount}
          onAddAttribute={() => entities.setShowAttributeForm(true)}
          onEditAttribute={entities.handleEditAttribute}
          onRemoveAttribute={removeAttributeDefinition}
          onAddPerson={() => entities.setShowPersonForm(true)}
          onEditPerson={entities.handleEditPerson}
          onDeletePerson={entities.handleDeletePerson}
          onOpenBulkAddForm={bulk.openBulkAddForm}
          onOpenBulkUpdateForm={bulk.openBulkUpdateForm}
          onTriggerCsvUpload={() => bulk.csvFileInputRef.current?.click()}
          onTriggerExcelImport={() =>
            addNotification({ type: 'info', title: 'Coming Soon', message: 'Excel import is not yet implemented.' })
          }
        />
      )}

      {activeSection === 'groups' && (
        <GroupsSection
          problem={problem ?? null}
          onAddGroup={() => entities.setShowGroupForm(true)}
          onEditGroup={entities.handleEditGroup}
          onDeleteGroup={entities.handleDeleteGroup}
          onOpenBulkAddForm={bulk.openGroupBulkForm}
          onTriggerCsvUpload={() => bulk.groupCsvFileInputRef.current?.click()}
        />
      )}

      {activeSection === 'sessions' && (
        <SessionsSection
          sessionsCount={sessionsCount}
          onChangeSessionsCount={handleSessionsCountChange}
        />
      )}

      {activeSection === 'objectives' && (
        <ObjectivesSection
          currentWeight={getCurrentObjectiveWeight()}
          onCommit={editorActions.handleObjectiveCommit}
        />
      )}

      {activeSection === 'hard' && (
        <HardConstraintsSection
          onAdd={editorActions.handleHardConstraintAdd}
          onEdit={editorActions.handleHardConstraintEdit}
          onDelete={constraints.handleDeleteConstraint}
        />
      )}

      {activeSection === 'soft' && (
        <SoftConstraintsSection
          onAdd={editorActions.handleSoftConstraintAdd}
          onEdit={editorActions.handleSoftConstraintEdit}
          onDelete={constraints.handleDeleteConstraint}
        />
      )}

      {activeSection === 'constraints' && (
        <ConstraintsSection
          problem={problem ?? null}
          activeConstraintTab={constraints.activeConstraintTab}
          constraintCategoryTab={constraints.constraintCategoryTab}
          hardTypes={constraints.HARD_TYPES}
          softTypes={constraints.SOFT_TYPES}
          onChangeCategory={constraints.setConstraintCategoryTab}
          onChangeTab={constraints.setActiveConstraintTab}
          onAddConstraint={() => constraints.setShowConstraintForm(true)}
          onEditConstraint={constraints.handleEditConstraint}
          onDeleteConstraint={constraints.handleDeleteConstraint}
        />
      )}

      <ProblemEditorForms
        person={{
          showPersonForm: entities.showPersonForm,
          editingPerson: entities.editingPerson,
          personForm: entities.personForm,
          setPersonForm: entities.setPersonForm,
          attributeDefinitions,
          sessionsCount,
          onSavePerson: entities.handleAddPerson,
          onUpdatePerson: entities.handleUpdatePerson,
          onCancelPerson: editorActions.handleCancelPersonForm,
          onShowAttributeForm: () => entities.setShowAttributeForm(true),
        }}
        group={{
          showGroupForm: entities.showGroupForm,
          editingGroup: entities.editingGroup,
          groupForm: entities.groupForm,
          setGroupForm: entities.setGroupForm,
          groupFormInputs: entities.groupFormInputs,
          setGroupFormInputs: entities.setGroupFormInputs,
          onSaveGroup: entities.handleAddGroup,
          onUpdateGroup: entities.handleUpdateGroup,
          onCancelGroup: editorActions.handleCancelGroupForm,
        }}
        attribute={{
          showAttributeForm: entities.showAttributeForm,
          editingAttribute: entities.editingAttribute,
          newAttribute: entities.newAttribute,
          setNewAttribute: entities.setNewAttribute,
          onSaveAttribute: entities.handleAddAttribute,
          onUpdateAttribute: entities.handleUpdateAttribute,
          onCancelAttribute: editorActions.handleCancelAttributeForm,
        }}
        bulkAddPeople={{
          showBulkForm: bulk.showBulkForm,
          bulkTextMode: bulk.bulkTextMode,
          setBulkTextMode: bulk.setBulkTextMode,
          bulkCsvInput: bulk.bulkCsvInput,
          setBulkCsvInput: bulk.setBulkCsvInput,
          bulkHeaders: bulk.bulkHeaders,
          setBulkHeaders: bulk.setBulkHeaders,
          bulkRows: bulk.bulkRows,
          setBulkRows: bulk.setBulkRows,
          onSaveBulkPeople: bulk.handleAddBulkPeople,
          onCloseBulkPeople: () => bulk.setShowBulkForm(false),
        }}
        bulkUpdatePeople={{
          showBulkUpdateForm: bulk.showBulkUpdateForm,
          bulkUpdateTextMode: bulk.bulkUpdateTextMode,
          setBulkUpdateTextMode: bulk.setBulkUpdateTextMode,
          bulkUpdateCsvInput: bulk.bulkUpdateCsvInput,
          setBulkUpdateCsvInput: bulk.setBulkUpdateCsvInput,
          bulkUpdateHeaders: bulk.bulkUpdateHeaders,
          setBulkUpdateHeaders: bulk.setBulkUpdateHeaders,
          bulkUpdateRows: bulk.bulkUpdateRows,
          setBulkUpdateRows: bulk.setBulkUpdateRows,
          onRefreshBulkUpdate: bulk.refreshBulkUpdateFromCurrent,
          onApplyBulkUpdate: bulk.handleApplyBulkUpdate,
          onCloseBulkUpdate: () => bulk.setShowBulkUpdateForm(false),
        }}
        bulkAddGroups={{
          showGroupBulkForm: bulk.showGroupBulkForm,
          groupBulkTextMode: bulk.groupBulkTextMode,
          setGroupBulkTextMode: bulk.setGroupBulkTextMode,
          groupBulkCsvInput: bulk.groupBulkCsvInput,
          setGroupBulkCsvInput: bulk.setGroupBulkCsvInput,
          groupBulkHeaders: bulk.groupBulkHeaders,
          setGroupBulkHeaders: bulk.setGroupBulkHeaders,
          groupBulkRows: bulk.groupBulkRows,
          setGroupBulkRows: bulk.setGroupBulkRows,
          onSaveGroupBulk: bulk.handleAddGroupBulkPeople,
          onCloseGroupBulk: () => bulk.setShowGroupBulkForm(false),
        }}
        csvFileInputRef={bulk.csvFileInputRef}
        onCsvFileSelected={bulk.handleCsvFileSelected}
        groupCsvFileInputRef={bulk.groupCsvFileInputRef}
        onGroupCsvFileSelected={bulk.handleGroupCsvFileSelected}
      />
      <ConstraintFormModal
        isOpen={constraints.showConstraintForm}
        isEditing={constraints.editingConstraint !== null}
        constraintForm={constraints.constraintForm}
        setConstraintForm={constraints.setConstraintForm}
        problem={problem ?? null}
        attributeDefinitions={attributeDefinitions}
        sessionsCount={sessionsCount}
        onAdd={constraints.handleAddConstraint}
        onUpdate={constraints.handleUpdateConstraint}
        onClose={editorActions.handleCloseConstraintForm}
      />
      <ProblemEditorConstraintModals
        problem={problem ?? null}
        sessionsCount={sessionsCount}
        resolveProblem={resolveProblem}
        setProblem={setProblem}
        showImmovableModal={constraints.showImmovableModal}
        setShowImmovableModal={constraints.setShowImmovableModal}
        editingImmovableIndex={constraints.editingImmovableIndex}
        setEditingImmovableIndex={constraints.setEditingImmovableIndex}
        showRepeatEncounterModal={constraints.showRepeatEncounterModal}
        setShowRepeatEncounterModal={constraints.setShowRepeatEncounterModal}
        showAttributeBalanceModal={constraints.showAttributeBalanceModal}
        setShowAttributeBalanceModal={constraints.setShowAttributeBalanceModal}
        showShouldNotBeTogetherModal={constraints.showShouldNotBeTogetherModal}
        setShowShouldNotBeTogetherModal={constraints.setShowShouldNotBeTogetherModal}
        showShouldStayTogetherModal={constraints.showShouldStayTogetherModal}
        setShowShouldStayTogetherModal={constraints.setShowShouldStayTogetherModal}
        showMustStayTogetherModal={constraints.showMustStayTogetherModal}
        setShowMustStayTogetherModal={constraints.setShowMustStayTogetherModal}
        showPairMeetingCountModal={constraints.showPairMeetingCountModal}
        setShowPairMeetingCountModal={constraints.setShowPairMeetingCountModal}
        editingConstraintIndex={constraints.editingConstraintIndex}
        setEditingConstraintIndex={constraints.setEditingConstraintIndex}
      />

      <DemoDataWarningModal
        isOpen={showDemoWarningModal}
        onClose={handleDemoCancel}
        onOverwrite={handleDemoOverwrite}
        onLoadNew={handleDemoLoadNew}
        demoCaseName={pendingDemoCaseName || 'Demo Case'}
      />
    </div>
  );
}
