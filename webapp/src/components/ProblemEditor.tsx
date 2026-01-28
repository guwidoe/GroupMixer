import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import type { Problem } from '../types';

// Extracted components from ProblemEditor directory
import { getDefaultSolverSettings } from './ProblemEditor/helpers';
import { ProblemEditorForms } from './ProblemEditor/ProblemEditorForms';
import { useProblemEditorBulk } from './ProblemEditor/hooks/useProblemEditorBulk';
import { PeopleSection } from './ProblemEditor/sections/PeopleSection';
import { GroupsSection } from './ProblemEditor/sections/GroupsSection';
import { SessionsSection } from './ProblemEditor/sections/SessionsSection';
import { ObjectivesSection } from './ProblemEditor/sections/ObjectivesSection';
import { HardConstraintsSection } from './ProblemEditor/sections/HardConstraintsSection';
import { SoftConstraintsSection } from './ProblemEditor/sections/SoftConstraintsSection';
import { ConstraintsSection } from './ProblemEditor/sections/ConstraintsSection';
import { ProblemEditorHeader } from './ProblemEditor/ProblemEditorHeader';
import { ProblemEditorTabs } from './ProblemEditor/ProblemEditorTabs';
import { ConstraintFormModal } from './ProblemEditor/ConstraintFormModal';
import { ProblemEditorConstraintModals } from './ProblemEditor/ProblemEditorConstraintModals';
import { useProblemEditorConstraints } from './ProblemEditor/hooks/useProblemEditorConstraints';
import { useProblemEditorEntities } from './ProblemEditor/hooks/useProblemEditorEntities';
import { DemoDataWarningModal } from './modals/DemoDataWarningModal';

export function ProblemEditor() {
  const { 
    problem, 
    setProblem, 
    GetProblem,
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
    ui
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

  // === Objectives Helpers ===
  const getCurrentObjectiveWeight = () => {
    if (problem?.objectives && problem.objectives.length > 0) {
      return problem.objectives[0].weight;
    }
    return 1; // Default implicit objective
  };

  const objectiveCount = (() => {
    if (problem?.objectives && problem.objectives.length > 0) {
      // Count only objectives with weight > 0
      return problem.objectives.filter((o) => o.weight > 0).length;
    }
    // Implicit default objective (weight 1)
    return 1;
  })();

  // Auto-save functionality
  useEffect(() => {
    if (problem && currentProblemId) {
      // Debounced auto-save will be handled by the storage service
      updateCurrentProblem(currentProblemId, problem);
    }
  }, [problem, currentProblemId, updateCurrentProblem]);

  const constraints = useProblemEditorConstraints({
    problem,
    sessionsCount,
    addNotification,
    setProblem,
  });

  // Demo data warning modal state
  const [showDemoWarningModal, setShowDemoWarningModal] = useState(false);
  const [pendingDemoCaseId, setPendingDemoCaseId] = useState<string | null>(null);
  const [pendingDemoCaseName, setPendingDemoCaseName] = useState<string | null>(null);

  const handleSaveProblem = () => {
    if (!problem) return;

    if (currentProblemId) {
      updateCurrentProblem(currentProblemId, problem);
      addNotification({ type: 'success', title: 'Saved', message: 'Problem saved.' });
    } else {
      const defaultName = 'Untitled Problem';
      saveProblem(defaultName);
    }
  };

  const handleLoadProblem = () => {
    // Simply open the Problem Manager modal
    setShowProblemManager(true);
  };

  const handleDemoCaseClick = (demoCaseId: string, demoCaseName: string) => {
    // Check if current problem has content
    const currentProblem = problem;
    const hasContent = currentProblem && (
      currentProblem.people.length > 0 || 
      currentProblem.groups.length > 0 || 
      currentProblem.constraints.length > 0
    );

    if (hasContent) {
      // Show warning modal
      setPendingDemoCaseId(demoCaseId);
      setPendingDemoCaseName(demoCaseName);
      setShowDemoWarningModal(true);
    } else {
      // Load directly if no content
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
        settings: problem?.settings || getDefaultSolverSettings()
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

  // Don't render until loading is complete to avoid creating new problems
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

      {/* Navigation */}
      <ProblemEditorTabs
        activeSection={activeSection}
        problem={problem ?? null}
        objectiveCount={objectiveCount}
        onNavigate={(sectionId) => navigate(`/app/problem/${sectionId}`)}
      />

      {/* Content */}
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
          onTriggerExcelImport={() => addNotification({ type: 'info', title: 'Coming Soon', message: 'Excel import is not yet implemented.' })}
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
          onCommit={(newWeight) => {
            if (!problem) return;
            const newObjectives = [
              {
                type: 'maximize_unique_contacts',
                weight: newWeight,
              },
            ];
            updateProblem({ objectives: newObjectives });
          }}
        />
      )}

      {activeSection === 'hard' && (
        <HardConstraintsSection
          onAdd={(type) => {
            if (type === 'ImmovablePeople') {
              constraints.setEditingImmovableIndex(null);
              constraints.setShowImmovableModal(true);
            } else if (type === 'MustStayTogether') {
              constraints.setEditingConstraintIndex(null);
              constraints.setShowMustStayTogetherModal(true);
            } else {
              constraints.setConstraintForm((prev) => ({ ...prev, type }));
              constraints.setShowConstraintForm(true);
            }
          }}
          onEdit={(c, i) => {
            if (c.type === 'ImmovablePeople') {
              constraints.setEditingImmovableIndex(i);
              constraints.setShowImmovableModal(true);
            } else if (c.type === 'MustStayTogether') {
              constraints.setEditingConstraintIndex(i);
              constraints.setShowMustStayTogetherModal(true);
            } else {
              constraints.handleEditConstraint(c, i);
            }
          }}
          onDelete={constraints.handleDeleteConstraint}
        />
      )}

      {activeSection === 'soft' && (
        <SoftConstraintsSection
          onAdd={(type) => {
            constraints.setEditingConstraintIndex(null);
            switch (type) {
              case 'RepeatEncounter':
                constraints.setShowRepeatEncounterModal(true);
                break;
              case 'AttributeBalance':
                constraints.setShowAttributeBalanceModal(true);
                break;
              case 'ShouldNotBeTogether':
                constraints.setShowShouldNotBeTogetherModal(true);
                break;
              case 'ShouldStayTogether':
                constraints.setShowShouldStayTogetherModal(true);
                break;
              case 'PairMeetingCount':
                constraints.setShowPairMeetingCountModal(true);
                break;
              default:
                constraints.setConstraintForm((prev) => ({ ...prev, type }));
                constraints.setShowConstraintForm(true);
            }
          }}
          onEdit={(c, i) => {
            constraints.setEditingConstraintIndex(i);
            switch (c.type) {
              case 'RepeatEncounter':
                constraints.setShowRepeatEncounterModal(true);
                break;
              case 'AttributeBalance':
                constraints.setShowAttributeBalanceModal(true);
                break;
              case 'ShouldNotBeTogether':
                constraints.setShowShouldNotBeTogetherModal(true);
                break;
              case 'ShouldStayTogether':
                constraints.setShowShouldStayTogetherModal(true);
                break;
              case 'PairMeetingCount':
                constraints.setShowPairMeetingCountModal(true);
                break;
              default:
                constraints.handleEditConstraint(c, i);
            }
          }}
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

      {/* Forms */}
      <ProblemEditorForms
        showPersonForm={entities.showPersonForm}
        editingPerson={entities.editingPerson}
        personForm={entities.personForm}
        setPersonForm={entities.setPersonForm}
        attributeDefinitions={attributeDefinitions}
        sessionsCount={sessionsCount}
        onSavePerson={entities.handleAddPerson}
        onUpdatePerson={entities.handleUpdatePerson}
        onCancelPerson={() => {
          entities.setShowPersonForm(false);
          entities.setEditingPerson(null);
          entities.setPersonForm({ attributes: {}, sessions: [] });
        }}
        onShowAttributeForm={() => entities.setShowAttributeForm(true)}
        showGroupForm={entities.showGroupForm}
        editingGroup={entities.editingGroup}
        groupForm={entities.groupForm}
        setGroupForm={entities.setGroupForm}
        groupFormInputs={entities.groupFormInputs}
        setGroupFormInputs={entities.setGroupFormInputs}
        onSaveGroup={entities.handleAddGroup}
        onUpdateGroup={entities.handleUpdateGroup}
        onCancelGroup={() => {
          entities.setShowGroupForm(false);
          entities.setEditingGroup(null);
          entities.setGroupForm({ size: 4 });
          entities.setGroupFormInputs({});
        }}
        showAttributeForm={entities.showAttributeForm}
        editingAttribute={entities.editingAttribute}
        newAttribute={entities.newAttribute}
        setNewAttribute={entities.setNewAttribute}
        onSaveAttribute={entities.handleAddAttribute}
        onUpdateAttribute={entities.handleUpdateAttribute}
        onCancelAttribute={() => {
          entities.setShowAttributeForm(false);
          entities.setNewAttribute({ key: '', values: [''] });
          entities.setEditingAttribute(null);
        }}
        showBulkForm={bulk.showBulkForm}
        bulkTextMode={bulk.bulkTextMode}
        setBulkTextMode={bulk.setBulkTextMode}
        bulkCsvInput={bulk.bulkCsvInput}
        setBulkCsvInput={bulk.setBulkCsvInput}
        bulkHeaders={bulk.bulkHeaders}
        setBulkHeaders={bulk.setBulkHeaders}
        bulkRows={bulk.bulkRows}
        setBulkRows={bulk.setBulkRows}
        onSaveBulkPeople={bulk.handleAddBulkPeople}
        onCloseBulkPeople={() => bulk.setShowBulkForm(false)}
        showBulkUpdateForm={bulk.showBulkUpdateForm}
        bulkUpdateTextMode={bulk.bulkUpdateTextMode}
        setBulkUpdateTextMode={bulk.setBulkUpdateTextMode}
        bulkUpdateCsvInput={bulk.bulkUpdateCsvInput}
        setBulkUpdateCsvInput={bulk.setBulkUpdateCsvInput}
        bulkUpdateHeaders={bulk.bulkUpdateHeaders}
        setBulkUpdateHeaders={bulk.setBulkUpdateHeaders}
        bulkUpdateRows={bulk.bulkUpdateRows}
        setBulkUpdateRows={bulk.setBulkUpdateRows}
        onRefreshBulkUpdate={bulk.refreshBulkUpdateFromCurrent}
        onApplyBulkUpdate={bulk.handleApplyBulkUpdate}
        onCloseBulkUpdate={() => bulk.setShowBulkUpdateForm(false)}
        showGroupBulkForm={bulk.showGroupBulkForm}
        groupBulkTextMode={bulk.groupBulkTextMode}
        setGroupBulkTextMode={bulk.setGroupBulkTextMode}
        groupBulkCsvInput={bulk.groupBulkCsvInput}
        setGroupBulkCsvInput={bulk.setGroupBulkCsvInput}
        groupBulkHeaders={bulk.groupBulkHeaders}
        setGroupBulkHeaders={bulk.setGroupBulkHeaders}
        groupBulkRows={bulk.groupBulkRows}
        setGroupBulkRows={bulk.setGroupBulkRows}
        onSaveGroupBulk={bulk.handleAddGroupBulkPeople}
        onCloseGroupBulk={() => bulk.setShowGroupBulkForm(false)}
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
        onClose={() => {
          constraints.setShowConstraintForm(false);
          constraints.setEditingConstraint(null);
          constraints.setConstraintForm({ type: 'RepeatEncounter', penalty_weight: 1 });
        }}
      />
      <ProblemEditorConstraintModals
        problem={problem ?? null}
        sessionsCount={sessionsCount}
        getProblem={GetProblem}
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

      {/* Demo Data Warning Modal */}
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
