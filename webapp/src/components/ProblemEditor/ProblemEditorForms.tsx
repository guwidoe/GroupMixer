import React from 'react';
import type { AttributeDefinition, Group, GroupFormData, Person, PersonFormData } from '../../types';
import { BulkAddGroupsForm, BulkAddPeopleForm, BulkUpdatePeopleForm } from './bulk';
import { AttributeForm, GroupForm, PersonForm } from './forms';

interface ProblemEditorFormsProps {
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

  showGroupForm: boolean;
  editingGroup: Group | null;
  groupForm: GroupFormData;
  setGroupForm: React.Dispatch<React.SetStateAction<GroupFormData>>;
  groupFormInputs: { size?: string };
  setGroupFormInputs: React.Dispatch<React.SetStateAction<{ size?: string }>>;
  onSaveGroup: () => void;
  onUpdateGroup: () => void;
  onCancelGroup: () => void;

  showAttributeForm: boolean;
  editingAttribute: AttributeDefinition | null;
  newAttribute: { key: string; values: string[] };
  setNewAttribute: React.Dispatch<React.SetStateAction<{ key: string; values: string[] }>>;
  onSaveAttribute: () => void;
  onUpdateAttribute: () => void;
  onCancelAttribute: () => void;

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

  showBulkUpdateForm: boolean;
  bulkUpdateTextMode: 'text' | 'grid';
  setBulkUpdateTextMode: React.Dispatch<React.SetStateAction<'text' | 'grid'>>;
  bulkUpdateCsvInput: string;
  setBulkUpdateCsvInput: React.Dispatch<React.SetStateAction<string>>;
  bulkUpdateHeaders: string[];
  setBulkUpdateHeaders: React.Dispatch<React.SetStateAction<string[]>>;
  bulkUpdateRows: Record<string, string>[];
  setBulkUpdateRows: React.Dispatch<React.SetStateAction<Record<string, string>[]>>;
  onRefreshBulkUpdate: () => void;
  onApplyBulkUpdate: () => void;
  onCloseBulkUpdate: () => void;

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

  csvFileInputRef: React.RefObject<HTMLInputElement>;
  onCsvFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  groupCsvFileInputRef: React.RefObject<HTMLInputElement>;
  onGroupCsvFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ProblemEditorForms({
  showPersonForm,
  editingPerson,
  personForm,
  setPersonForm,
  attributeDefinitions,
  sessionsCount,
  onSavePerson,
  onUpdatePerson,
  onCancelPerson,
  onShowAttributeForm,
  showGroupForm,
  editingGroup,
  groupForm,
  setGroupForm,
  groupFormInputs,
  setGroupFormInputs,
  onSaveGroup,
  onUpdateGroup,
  onCancelGroup,
  showAttributeForm,
  editingAttribute,
  newAttribute,
  setNewAttribute,
  onSaveAttribute,
  onUpdateAttribute,
  onCancelAttribute,
  showBulkForm,
  bulkTextMode,
  setBulkTextMode,
  bulkCsvInput,
  setBulkCsvInput,
  bulkHeaders,
  setBulkHeaders,
  bulkRows,
  setBulkRows,
  onSaveBulkPeople,
  onCloseBulkPeople,
  showBulkUpdateForm,
  bulkUpdateTextMode,
  setBulkUpdateTextMode,
  bulkUpdateCsvInput,
  setBulkUpdateCsvInput,
  bulkUpdateHeaders,
  setBulkUpdateHeaders,
  bulkUpdateRows,
  setBulkUpdateRows,
  onRefreshBulkUpdate,
  onApplyBulkUpdate,
  onCloseBulkUpdate,
  showGroupBulkForm,
  groupBulkTextMode,
  setGroupBulkTextMode,
  groupBulkCsvInput,
  setGroupBulkCsvInput,
  groupBulkHeaders,
  setGroupBulkHeaders,
  groupBulkRows,
  setGroupBulkRows,
  onSaveGroupBulk,
  onCloseGroupBulk,
  csvFileInputRef,
  onCsvFileSelected,
  groupCsvFileInputRef,
  onGroupCsvFileSelected,
}: ProblemEditorFormsProps) {
  return (
    <>
      {showPersonForm && (
        <PersonForm
          isEditing={editingPerson !== null}
          editingPerson={editingPerson}
          personForm={personForm}
          setPersonForm={setPersonForm}
          attributeDefinitions={attributeDefinitions}
          sessionsCount={sessionsCount}
          onSave={onSavePerson}
          onUpdate={onUpdatePerson}
          onCancel={onCancelPerson}
          onShowAttributeForm={onShowAttributeForm}
        />
      )}

      {showGroupForm && (
        <GroupForm
          isEditing={editingGroup !== null}
          editingGroup={editingGroup}
          groupForm={groupForm}
          setGroupForm={setGroupForm}
          groupFormInputs={groupFormInputs}
          setGroupFormInputs={setGroupFormInputs}
          onSave={onSaveGroup}
          onUpdate={onUpdateGroup}
          onCancel={onCancelGroup}
        />
      )}

      {showAttributeForm && (
        <AttributeForm
          isEditing={editingAttribute !== null}
          newAttribute={newAttribute}
          setNewAttribute={setNewAttribute}
          onSave={onSaveAttribute}
          onUpdate={onUpdateAttribute}
          onCancel={onCancelAttribute}
        />
      )}

      {showBulkForm && (
        <BulkAddPeopleForm
          bulkTextMode={bulkTextMode}
          setBulkTextMode={setBulkTextMode}
          bulkCsvInput={bulkCsvInput}
          setBulkCsvInput={setBulkCsvInput}
          bulkHeaders={bulkHeaders}
          setBulkHeaders={setBulkHeaders}
          bulkRows={bulkRows}
          setBulkRows={setBulkRows}
          onSave={onSaveBulkPeople}
          onClose={onCloseBulkPeople}
        />
      )}

      {showBulkUpdateForm && (
        <BulkUpdatePeopleForm
          bulkUpdateTextMode={bulkUpdateTextMode}
          setBulkUpdateTextMode={setBulkUpdateTextMode}
          bulkUpdateCsvInput={bulkUpdateCsvInput}
          setBulkUpdateCsvInput={setBulkUpdateCsvInput}
          bulkUpdateHeaders={bulkUpdateHeaders}
          setBulkUpdateHeaders={setBulkUpdateHeaders}
          bulkUpdateRows={bulkUpdateRows}
          setBulkUpdateRows={setBulkUpdateRows}
          onRefreshFromCurrent={onRefreshBulkUpdate}
          onApply={onApplyBulkUpdate}
          onClose={onCloseBulkUpdate}
        />
      )}

      {showGroupBulkForm && (
        <BulkAddGroupsForm
          groupBulkTextMode={groupBulkTextMode}
          setGroupBulkTextMode={setGroupBulkTextMode}
          groupBulkCsvInput={groupBulkCsvInput}
          setGroupBulkCsvInput={setGroupBulkCsvInput}
          groupBulkHeaders={groupBulkHeaders}
          setGroupBulkHeaders={setGroupBulkHeaders}
          groupBulkRows={groupBulkRows}
          setGroupBulkRows={setGroupBulkRows}
          onSave={onSaveGroupBulk}
          onClose={onCloseGroupBulk}
        />
      )}

      <input type="file" accept=".csv,text/csv" ref={csvFileInputRef} className="hidden" onChange={onCsvFileSelected} />
      <input type="file" accept=".csv,text/csv" ref={groupCsvFileInputRef} className="hidden" onChange={onGroupCsvFileSelected} />
    </>
  );
}
