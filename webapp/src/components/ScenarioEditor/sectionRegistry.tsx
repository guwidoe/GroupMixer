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
      onApplyGridPeople={controller.bulk.updatePeople.applyRows}
      createGridPersonRow={controller.bulk.updatePeople.createRow}
    />
  ),
  attributes: (controller) => (
    <AttributeDefinitionsSection
      attributeDefinitions={controller.attributeDefinitions}
      onAddAttribute={() => controller.entities.setShowAttributeForm(true)}
      onEditAttribute={controller.entities.handleEditAttribute}
      onRemoveAttribute={controller.removeAttributeDefinition}
      onApplyGridAttributes={controller.entities.applyGridAttributes}
      createGridAttributeRow={controller.entities.createGridAttributeRow}
    />
  ),
  groups: (controller) => (
    <GroupsSection
      scenario={controller.scenario ?? null}
      onAddGroup={() => controller.entities.setShowGroupForm(true)}
      onEditGroup={controller.entities.handleEditGroup}
      onDeleteGroup={controller.entities.handleDeleteGroup}
      onApplyGridGroups={controller.entities.applyGridGroups}
      createGridGroupRow={controller.entities.createGridGroupRow}
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
      onApplyGridRows={controller.constraints.applyRepeatEncounterGridRows}
      createGridRow={controller.constraints.createRepeatEncounterGridRow}
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
      onApplyAttributeBalanceRows={controller.constraints.applyAttributeBalanceGridRows}
      createAttributeBalanceRow={controller.constraints.createAttributeBalanceGridRow}
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
