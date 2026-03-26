import React from 'react';
import type { ScenarioEditorController } from './useScenarioEditorController';
import {
  AttributeDefinitionsSection,
  ConstraintsSection,
  GroupsSection,
  HardConstraintsSection,
  ObjectivesSection,
  PeopleSection,
  SessionsSection,
  SoftConstraintsSection,
} from './sections';

interface ScenarioSetupSectionRendererProps {
  controller: ScenarioEditorController;
}

export function ScenarioSetupSectionRenderer({ controller }: ScenarioSetupSectionRendererProps) {
  const {
    activeSection,
    scenario,
    attributeDefinitions,
    removeAttributeDefinition,
    sessionsCount,
    addNotification,
    entities,
    bulk,
    constraints,
    editorActions,
    handleSessionsCountChange,
    currentObjectiveWeight,
  } = controller;

  switch (activeSection) {
    case 'people':
      return (
        <PeopleSection
          scenario={scenario ?? null}
          attributeDefinitions={attributeDefinitions}
          sessionsCount={sessionsCount}
          onAddPerson={() => entities.setShowPersonForm(true)}
          onEditPerson={entities.handleEditPerson}
          onDeletePerson={entities.handleDeletePerson}
          onOpenBulkAddForm={bulk.addPeople.openForm}
          onOpenBulkUpdateForm={bulk.updatePeople.openForm}
          onTriggerCsvUpload={() => bulk.addPeople.csvFileInputRef.current?.click()}
          onTriggerExcelImport={() =>
            addNotification({ type: 'info', title: 'Coming Soon', message: 'Excel import is not yet implemented.' })
          }
        />
      );
    case 'attributes':
      return (
        <AttributeDefinitionsSection
          attributeDefinitions={attributeDefinitions}
          onAddAttribute={() => entities.setShowAttributeForm(true)}
          onEditAttribute={entities.handleEditAttribute}
          onRemoveAttribute={removeAttributeDefinition}
        />
      );
    case 'groups':
      return (
        <GroupsSection
          scenario={scenario ?? null}
          onAddGroup={() => entities.setShowGroupForm(true)}
          onEditGroup={entities.handleEditGroup}
          onDeleteGroup={entities.handleDeleteGroup}
          onOpenBulkAddForm={bulk.addGroups.openForm}
          onTriggerCsvUpload={() => bulk.addGroups.csvFileInputRef.current?.click()}
        />
      );
    case 'sessions':
      return (
        <SessionsSection
          sessionsCount={sessionsCount}
          onChangeSessionsCount={handleSessionsCountChange}
        />
      );
    case 'objectives':
      return (
        <ObjectivesSection
          currentWeight={currentObjectiveWeight}
          onCommit={editorActions.handleObjectiveCommit}
        />
      );
    case 'hard':
      return (
        <HardConstraintsSection
          onAdd={editorActions.handleHardConstraintAdd}
          onEdit={editorActions.handleHardConstraintEdit}
          onDelete={constraints.handleDeleteConstraint}
        />
      );
    case 'soft':
      return (
        <SoftConstraintsSection
          onAdd={editorActions.handleSoftConstraintAdd}
          onEdit={editorActions.handleSoftConstraintEdit}
          onDelete={constraints.handleDeleteConstraint}
        />
      );
    case 'constraints':
      return (
        <ConstraintsSection
          scenario={scenario ?? null}
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
      );
    default:
      return null;
  }
}
