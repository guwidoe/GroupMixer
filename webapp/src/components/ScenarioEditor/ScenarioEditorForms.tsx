import React from 'react';
import type { AttributeDefinition, Group, GroupFormData, Person, PersonFormData } from '../../types';
import { AttributeForm, GroupForm, PersonForm } from './forms';

interface PersonFormConfig {
  showPersonForm: boolean;
  editingPerson: Person | null;
  personForm: PersonFormData;
  setPersonForm: React.Dispatch<React.SetStateAction<PersonFormData>>;
  attributeDefinitions: AttributeDefinition[];
  sessionsCount: number;
  onSavePerson: () => void;
  onUpdatePerson: () => void;
  onCancelPerson: () => void;
  onShowAttributeForm: () => void;
}

interface GroupFormConfig {
  showGroupForm: boolean;
  editingGroup: Group | null;
  groupForm: GroupFormData;
  setGroupForm: React.Dispatch<React.SetStateAction<GroupFormData>>;
  groupFormInputs: { size?: string; sessionSizes?: string[] };
  setGroupFormInputs: React.Dispatch<React.SetStateAction<{ size?: string; sessionSizes?: string[] }>>;
  sessionsCount: number;
  onSaveGroup: () => void;
  onUpdateGroup: () => void;
  onCancelGroup: () => void;
}

interface AttributeFormConfig {
  showAttributeForm: boolean;
  editingAttribute: AttributeDefinition | null;
  newAttribute: { key: string; values: string[] };
  setNewAttribute: React.Dispatch<React.SetStateAction<{ key: string; values: string[] }>>;
  onSaveAttribute: () => void;
  onUpdateAttribute: () => void;
  onCancelAttribute: () => void;
}

interface ScenarioEditorFormsProps {
  person: PersonFormConfig;
  group: GroupFormConfig;
  attribute: AttributeFormConfig;
}

export function ScenarioEditorForms({
  person,
  group,
  attribute,
}: ScenarioEditorFormsProps) {
  return (
    <>
      {person.showPersonForm && (
        <PersonForm
          isEditing={person.editingPerson !== null}
          editingPerson={person.editingPerson}
          personForm={person.personForm}
          setPersonForm={person.setPersonForm}
          attributeDefinitions={person.attributeDefinitions}
          sessionsCount={person.sessionsCount}
          onSave={person.onSavePerson}
          onUpdate={person.onUpdatePerson}
          onCancel={person.onCancelPerson}
          onShowAttributeForm={person.onShowAttributeForm}
        />
      )}

      {group.showGroupForm && (
        <GroupForm
          isEditing={group.editingGroup !== null}
          editingGroup={group.editingGroup}
          groupForm={group.groupForm}
          setGroupForm={group.setGroupForm}
          groupFormInputs={group.groupFormInputs}
          setGroupFormInputs={group.setGroupFormInputs}
          sessionsCount={group.sessionsCount}
          onSave={group.onSaveGroup}
          onUpdate={group.onUpdateGroup}
          onCancel={group.onCancelGroup}
        />
      )}

      {attribute.showAttributeForm && (
        <AttributeForm
          isEditing={attribute.editingAttribute !== null}
          newAttribute={attribute.newAttribute}
          setNewAttribute={attribute.setNewAttribute}
          onSave={attribute.onSaveAttribute}
          onUpdate={attribute.onUpdateAttribute}
          onCancel={attribute.onCancelAttribute}
        />
      )}
    </>
  );
}
