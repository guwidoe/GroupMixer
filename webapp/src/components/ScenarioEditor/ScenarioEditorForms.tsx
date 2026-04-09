import React from 'react';
import type { AttributeDefinition, Group, GroupFormData, Person, PersonFormData } from '../../types';
import { BulkAddGroupsForm, BulkAddPeopleForm } from './bulk';
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

interface BulkAddPeopleFormConfig {
  showBulkForm: boolean;
  bulkTextMode: 'text' | 'grid';
  setBulkTextMode: React.Dispatch<React.SetStateAction<'text' | 'grid'>>;
  bulkCsvInput: string;
  setBulkCsvInput: React.Dispatch<React.SetStateAction<string>>;
  bulkHeaders: string[];
  setBulkHeaders: React.Dispatch<React.SetStateAction<string[]>>;
  bulkRows: Record<string, string>[];
  setBulkRows: React.Dispatch<React.SetStateAction<Record<string, string>[]>>;
  onSaveBulkPeople: () => void;
  onCloseBulkPeople: () => void;
}

interface BulkAddGroupsFormConfig {
  showGroupBulkForm: boolean;
  groupBulkTextMode: 'text' | 'grid';
  setGroupBulkTextMode: React.Dispatch<React.SetStateAction<'text' | 'grid'>>;
  groupBulkCsvInput: string;
  setGroupBulkCsvInput: React.Dispatch<React.SetStateAction<string>>;
  groupBulkHeaders: string[];
  setGroupBulkHeaders: React.Dispatch<React.SetStateAction<string[]>>;
  groupBulkRows: Record<string, string>[];
  setGroupBulkRows: React.Dispatch<React.SetStateAction<Record<string, string>[]>>;
  onSaveGroupBulk: () => void;
  onCloseGroupBulk: () => void;
}

interface ScenarioEditorFormsProps {
  person: PersonFormConfig;
  group: GroupFormConfig;
  attribute: AttributeFormConfig;
  bulkAddPeople: BulkAddPeopleFormConfig;
  bulkAddGroups: BulkAddGroupsFormConfig;
  csvFileInputRef: React.RefObject<HTMLInputElement>;
  onCsvFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  groupCsvFileInputRef: React.RefObject<HTMLInputElement>;
  onGroupCsvFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ScenarioEditorForms({
  person,
  group,
  attribute,
  bulkAddPeople,
  bulkAddGroups,
  csvFileInputRef,
  onCsvFileSelected,
  groupCsvFileInputRef,
  onGroupCsvFileSelected,
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

      {bulkAddPeople.showBulkForm && (
        <BulkAddPeopleForm
          bulkTextMode={bulkAddPeople.bulkTextMode}
          setBulkTextMode={bulkAddPeople.setBulkTextMode}
          bulkCsvInput={bulkAddPeople.bulkCsvInput}
          setBulkCsvInput={bulkAddPeople.setBulkCsvInput}
          bulkHeaders={bulkAddPeople.bulkHeaders}
          setBulkHeaders={bulkAddPeople.setBulkHeaders}
          bulkRows={bulkAddPeople.bulkRows}
          setBulkRows={bulkAddPeople.setBulkRows}
          onSave={bulkAddPeople.onSaveBulkPeople}
          onClose={bulkAddPeople.onCloseBulkPeople}
        />
      )}

      {bulkAddGroups.showGroupBulkForm && (
        <BulkAddGroupsForm
          groupBulkTextMode={bulkAddGroups.groupBulkTextMode}
          setGroupBulkTextMode={bulkAddGroups.setGroupBulkTextMode}
          groupBulkCsvInput={bulkAddGroups.groupBulkCsvInput}
          setGroupBulkCsvInput={bulkAddGroups.setGroupBulkCsvInput}
          groupBulkHeaders={bulkAddGroups.groupBulkHeaders}
          setGroupBulkHeaders={bulkAddGroups.setGroupBulkHeaders}
          groupBulkRows={bulkAddGroups.groupBulkRows}
          setGroupBulkRows={bulkAddGroups.setGroupBulkRows}
          onSave={bulkAddGroups.onSaveGroupBulk}
          onClose={bulkAddGroups.onCloseGroupBulk}
        />
      )}

      <input type="file" accept=".csv,text/csv" ref={csvFileInputRef} className="hidden" onChange={onCsvFileSelected} />
      <input type="file" accept=".csv,text/csv" ref={groupCsvFileInputRef} className="hidden" onChange={onGroupCsvFileSelected} />
    </>
  );
}
