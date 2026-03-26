import React from 'react';
import { DemoDataWarningModal } from '../modals/DemoDataWarningModal';
import { ConstraintFormModal } from './ConstraintFormModal';
import { ScenarioSetupLayout } from './layout/ScenarioSetupLayout';
import { ScenarioEditorConstraintModals } from './ScenarioEditorConstraintModals';
import { ScenarioEditorForms } from './ScenarioEditorForms';
import { ScenarioEditorHeader } from './ScenarioEditorHeader';
import { ScenarioSetupSectionRenderer } from './ScenarioSetupSectionRenderer';
import { useScenarioEditorController } from './useScenarioEditorController';

export function ScenarioEditor() {
  const controller = useScenarioEditorController();

  if (controller.ui.isLoading) {
    return <div className="animate-fade-in">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <ScenarioSetupLayout
        scenario={controller.scenario ?? null}
        attributeDefinitions={controller.attributeDefinitions}
        objectiveCount={controller.objectiveCount}
        activeSection={controller.navigationSection}
        onNavigate={controller.navigateToSection}
        sidebarHeader={
          <ScenarioEditorHeader
            onLoadScenario={controller.handleLoadScenario}
            onSaveScenario={controller.handleSaveScenario}
            onDemoCaseClick={controller.handleDemoCaseClick}
          />
        }
        collapsedSidebarHeader={
          <ScenarioEditorHeader
            onLoadScenario={controller.handleLoadScenario}
            onSaveScenario={controller.handleSaveScenario}
            onDemoCaseClick={controller.handleDemoCaseClick}
            collapsed
          />
        }
      >
        <ScenarioSetupSectionRenderer controller={controller} />
      </ScenarioSetupLayout>

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
        bulkAddPeople={{
          showBulkForm: controller.bulk.addPeople.showForm,
          bulkTextMode: controller.bulk.addPeople.textMode,
          setBulkTextMode: controller.bulk.addPeople.setTextMode,
          bulkCsvInput: controller.bulk.addPeople.csvInput,
          setBulkCsvInput: controller.bulk.addPeople.setCsvInput,
          bulkHeaders: controller.bulk.addPeople.headers,
          setBulkHeaders: controller.bulk.addPeople.setHeaders,
          bulkRows: controller.bulk.addPeople.rows,
          setBulkRows: controller.bulk.addPeople.setRows,
          onSaveBulkPeople: controller.bulk.addPeople.save,
          onCloseBulkPeople: () => controller.bulk.addPeople.setShowForm(false),
        }}
        bulkUpdatePeople={{
          showBulkUpdateForm: controller.bulk.updatePeople.showForm,
          bulkUpdateTextMode: controller.bulk.updatePeople.textMode,
          setBulkUpdateTextMode: controller.bulk.updatePeople.setTextMode,
          bulkUpdateCsvInput: controller.bulk.updatePeople.csvInput,
          setBulkUpdateCsvInput: controller.bulk.updatePeople.setCsvInput,
          bulkUpdateHeaders: controller.bulk.updatePeople.headers,
          setBulkUpdateHeaders: controller.bulk.updatePeople.setHeaders,
          bulkUpdateRows: controller.bulk.updatePeople.rows,
          setBulkUpdateRows: controller.bulk.updatePeople.setRows,
          onRefreshBulkUpdate: controller.bulk.updatePeople.refreshFromCurrent,
          onApplyBulkUpdate: controller.bulk.updatePeople.apply,
          onCloseBulkUpdate: () => controller.bulk.updatePeople.setShowForm(false),
        }}
        bulkAddGroups={{
          showGroupBulkForm: controller.bulk.addGroups.showForm,
          groupBulkTextMode: controller.bulk.addGroups.textMode,
          setGroupBulkTextMode: controller.bulk.addGroups.setTextMode,
          groupBulkCsvInput: controller.bulk.addGroups.csvInput,
          setGroupBulkCsvInput: controller.bulk.addGroups.setCsvInput,
          groupBulkHeaders: controller.bulk.addGroups.headers,
          setGroupBulkHeaders: controller.bulk.addGroups.setHeaders,
          groupBulkRows: controller.bulk.addGroups.rows,
          setGroupBulkRows: controller.bulk.addGroups.setRows,
          onSaveGroupBulk: controller.bulk.addGroups.save,
          onCloseGroupBulk: () => controller.bulk.addGroups.setShowForm(false),
        }}
        csvFileInputRef={controller.bulk.addPeople.csvFileInputRef}
        onCsvFileSelected={controller.bulk.addPeople.handleCsvFileSelected}
        groupCsvFileInputRef={controller.bulk.addGroups.csvFileInputRef}
        onGroupCsvFileSelected={controller.bulk.addGroups.handleCsvFileSelected}
      />
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
        showPairMeetingCountModal={controller.constraints.showPairMeetingCountModal}
        setShowPairMeetingCountModal={controller.constraints.setShowPairMeetingCountModal}
        editingConstraintIndex={controller.constraints.editingConstraintIndex}
        setEditingConstraintIndex={controller.constraints.setEditingConstraintIndex}
      />

      <DemoDataWarningModal
        isOpen={controller.showDemoWarningModal}
        onClose={controller.handleDemoCancel}
        onOverwrite={controller.handleDemoOverwrite}
        onLoadNew={controller.handleDemoLoadNew}
        demoCaseName={controller.pendingDemoCaseName || 'Demo Case'}
      />
    </div>
  );
}
