import React from 'react';
import type { ScenarioEditorController } from './useScenarioEditorController';
import {
  AttributeDefinitionsSection,
  GroupsSection,
  HardConstraintFamilySection,
  ObjectivesSection,
  PeopleSection,
  SessionsSection,
  SoftConstraintFamilySection,
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
    case 'immovable-people':
      return (
        <HardConstraintFamilySection
          family="ImmovablePeople"
          onAdd={editorActions.handleHardConstraintAdd}
          onEdit={editorActions.handleHardConstraintEdit}
          onDelete={constraints.handleDeleteConstraint}
        />
      );
    case 'must-stay-together':
      return (
        <HardConstraintFamilySection
          family="MustStayTogether"
          onAdd={editorActions.handleHardConstraintAdd}
          onEdit={editorActions.handleHardConstraintEdit}
          onDelete={constraints.handleDeleteConstraint}
        />
      );
    case 'repeat-encounter':
      return (
        <SoftConstraintFamilySection
          family="RepeatEncounter"
          onAdd={editorActions.handleSoftConstraintAdd}
          onEdit={editorActions.handleSoftConstraintEdit}
          onDelete={constraints.handleDeleteConstraint}
        />
      );
    case 'should-not-be-together':
      return (
        <SoftConstraintFamilySection
          family="ShouldNotBeTogether"
          onAdd={editorActions.handleSoftConstraintAdd}
          onEdit={editorActions.handleSoftConstraintEdit}
          onDelete={constraints.handleDeleteConstraint}
        />
      );
    case 'should-stay-together':
      return (
        <SoftConstraintFamilySection
          family="ShouldStayTogether"
          onAdd={editorActions.handleSoftConstraintAdd}
          onEdit={editorActions.handleSoftConstraintEdit}
          onDelete={constraints.handleDeleteConstraint}
        />
      );
    case 'attribute-balance':
      return (
        <SoftConstraintFamilySection
          family="AttributeBalance"
          onAdd={editorActions.handleSoftConstraintAdd}
          onEdit={editorActions.handleSoftConstraintEdit}
          onDelete={constraints.handleDeleteConstraint}
        />
      );
    case 'pair-meeting-count':
      return (
        <SoftConstraintFamilySection
          family="PairMeetingCount"
          onAdd={editorActions.handleSoftConstraintAdd}
          onEdit={editorActions.handleSoftConstraintEdit}
          onDelete={constraints.handleDeleteConstraint}
        />
      );
    default:
      return null;
  }
}
