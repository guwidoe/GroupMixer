import React from 'react';
import type { AttributeDefinition, Person, Scenario } from '../../../types';
import { PeopleDirectory } from './people/PeopleDirectory';

interface PeopleSectionProps {
  scenario: Scenario | null;
  attributeDefinitions: AttributeDefinition[];
  sessionsCount: number;
  onAddPerson: () => void;
  onEditPerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
  onInlineUpdatePerson: (personId: string, updates: { attributes?: Record<string, string>; sessions?: number[] | undefined }) => void;
  onOpenBulkAddForm: () => void;
  onApplyGridPeople: (people: Person[]) => void;
  createGridPersonRow: () => Person;
  onTriggerCsvUpload: () => void;
  onTriggerExcelImport: () => void;
}

export function PeopleSection({
  scenario,
  attributeDefinitions,
  sessionsCount,
  onAddPerson,
  onEditPerson,
  onDeletePerson,
  onInlineUpdatePerson,
  onOpenBulkAddForm,
  onApplyGridPeople,
  createGridPersonRow,
  onTriggerCsvUpload,
  onTriggerExcelImport,
}: PeopleSectionProps) {
  return (
    <PeopleDirectory
      scenario={scenario}
      attributeDefinitions={attributeDefinitions}
      sessionsCount={sessionsCount}
      onAddPerson={onAddPerson}
      onEditPerson={onEditPerson}
      onDeletePerson={onDeletePerson}
      onInlineUpdatePerson={onInlineUpdatePerson}
      onOpenBulkAddForm={onOpenBulkAddForm}
      onApplyGridPeople={onApplyGridPeople}
      createGridPersonRow={createGridPersonRow}
      onTriggerCsvUpload={onTriggerCsvUpload}
      onTriggerExcelImport={onTriggerExcelImport}
    />
  );
}
