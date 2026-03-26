import React from 'react';
import type { ProblemEditorController } from './useProblemEditorController';
import {
  ConstraintsSection,
  GroupsSection,
  HardConstraintsSection,
  ObjectivesSection,
  PeopleSection,
  SessionsSection,
  SoftConstraintsSection,
} from './sections';

interface ProblemSetupSectionRendererProps {
  controller: ProblemEditorController;
}

export function ProblemSetupSectionRenderer({ controller }: ProblemSetupSectionRendererProps) {
  const {
    activeSection,
    problem,
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
          problem={problem ?? null}
          attributeDefinitions={attributeDefinitions}
          sessionsCount={sessionsCount}
          onAddAttribute={() => entities.setShowAttributeForm(true)}
          onEditAttribute={entities.handleEditAttribute}
          onRemoveAttribute={removeAttributeDefinition}
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
    case 'groups':
      return (
        <GroupsSection
          problem={problem ?? null}
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
      );
    default:
      return null;
  }
}
