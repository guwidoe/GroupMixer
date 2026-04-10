import React from 'react';
import type { ScenarioSetupSectionId } from './navigation/scenarioSetupNavTypes';
import {
  AttributeDefinitionsSection,
  GroupsSection,
  HardConstraintFamilySection,
  ObjectivesSection,
  PeopleSection,
  RepeatEncounterCollectionSection,
  SessionsSection,
  SoftConstraintFamilySection,
} from './sections';
import type { ScenarioEditorController } from './useScenarioEditorController';

type ScenarioSetupSectionRendererFn = (controller: ScenarioEditorController) => React.ReactNode;

export const scenarioSetupSectionRegistry: Record<ScenarioSetupSectionId, ScenarioSetupSectionRendererFn> = {
  people: (controller) => (
    <PeopleSection
      scenario={controller.scenario ?? null}
      attributeDefinitions={controller.attributeDefinitions}
      sessionsCount={controller.sessionsCount}
      onAddPerson={() => controller.entities.setShowPersonForm(true)}
      onEditPerson={controller.entities.handleEditPerson}
      onDeletePerson={controller.entities.handleDeletePerson}
      onInlineUpdatePerson={controller.entities.handleInlineUpdatePerson}
      onOpenBulkAddForm={controller.bulk.addPeople.openForm}
      onApplyGridPeople={controller.bulk.updatePeople.applyRows}
      createGridPersonRow={controller.bulk.updatePeople.createRow}
      onTriggerCsvUpload={() => controller.bulk.addPeople.csvFileInputRef.current?.click()}
      onTriggerExcelImport={() =>
        controller.addNotification({
          type: 'info',
          title: 'Coming Soon',
          message: 'Excel import is not yet implemented.',
        })
      }
    />
  ),
  attributes: (controller) => (
    <AttributeDefinitionsSection
      attributeDefinitions={controller.attributeDefinitions}
      onAddAttribute={() => controller.entities.setShowAttributeForm(true)}
      onEditAttribute={controller.entities.handleEditAttribute}
      onRemoveAttribute={controller.removeAttributeDefinition}
    />
  ),
  groups: (controller) => (
    <GroupsSection
      scenario={controller.scenario ?? null}
      onAddGroup={() => controller.entities.setShowGroupForm(true)}
      onEditGroup={controller.entities.handleEditGroup}
      onDeleteGroup={controller.entities.handleDeleteGroup}
      onOpenBulkAddForm={controller.bulk.addGroups.openForm}
      onTriggerCsvUpload={() => controller.bulk.addGroups.csvFileInputRef.current?.click()}
    />
  ),
  sessions: (controller) => (
    <SessionsSection
      sessionsCount={controller.sessionsCount}
      onChangeSessionsCount={controller.handleSessionsCountChange}
    />
  ),
  objectives: (controller) => (
    <ObjectivesSection currentWeight={controller.currentObjectiveWeight} onCommit={controller.editorActions.handleObjectiveCommit} />
  ),
  'immovable-people': (controller) => (
    <HardConstraintFamilySection
      family="ImmovablePeople"
      onAdd={controller.editorActions.handleHardConstraintAdd}
      onEdit={controller.editorActions.handleHardConstraintEdit}
      onDelete={controller.constraints.handleDeleteConstraint}
    />
  ),
  'must-stay-together': (controller) => (
    <HardConstraintFamilySection
      family="MustStayTogether"
      onAdd={controller.editorActions.handleHardConstraintAdd}
      onEdit={controller.editorActions.handleHardConstraintEdit}
      onDelete={controller.constraints.handleDeleteConstraint}
    />
  ),
  'repeat-encounter': (controller) => (
    <RepeatEncounterCollectionSection
      scenario={controller.scenario ?? null}
      onAdd={controller.editorActions.handleSoftConstraintAdd}
      onEdit={controller.editorActions.handleSoftConstraintEdit}
      onDelete={controller.constraints.handleDeleteConstraint}
    />
  ),
  'should-not-be-together': (controller) => (
    <SoftConstraintFamilySection
      family="ShouldNotBeTogether"
      onAdd={controller.editorActions.handleSoftConstraintAdd}
      onEdit={controller.editorActions.handleSoftConstraintEdit}
      onDelete={controller.constraints.handleDeleteConstraint}
    />
  ),
  'should-stay-together': (controller) => (
    <SoftConstraintFamilySection
      family="ShouldStayTogether"
      onAdd={controller.editorActions.handleSoftConstraintAdd}
      onEdit={controller.editorActions.handleSoftConstraintEdit}
      onDelete={controller.constraints.handleDeleteConstraint}
    />
  ),
  'attribute-balance': (controller) => (
    <SoftConstraintFamilySection
      family="AttributeBalance"
      onAdd={controller.editorActions.handleSoftConstraintAdd}
      onEdit={controller.editorActions.handleSoftConstraintEdit}
      onDelete={controller.constraints.handleDeleteConstraint}
    />
  ),
  'pair-meeting-count': (controller) => (
    <SoftConstraintFamilySection
      family="PairMeetingCount"
      onAdd={controller.editorActions.handleSoftConstraintAdd}
      onEdit={controller.editorActions.handleSoftConstraintEdit}
      onDelete={controller.constraints.handleDeleteConstraint}
    />
  ),
};
