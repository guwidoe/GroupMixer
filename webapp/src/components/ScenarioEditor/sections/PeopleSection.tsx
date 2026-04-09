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
  onOpenBulkUpdateForm: () => void;
  bulkUpdateActive: boolean;
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
  onOpenBulkUpdateForm,
  bulkUpdateActive,
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
      onOpenBulkUpdateForm={onOpenBulkUpdateForm}
      bulkUpdateActive={bulkUpdateActive}
      bulkUpdateTextMode={bulkUpdateTextMode}
      setBulkUpdateTextMode={setBulkUpdateTextMode}
      bulkUpdateCsvInput={bulkUpdateCsvInput}
      setBulkUpdateCsvInput={setBulkUpdateCsvInput}
      bulkUpdateHeaders={bulkUpdateHeaders}
      setBulkUpdateHeaders={setBulkUpdateHeaders}
      bulkUpdateRows={bulkUpdateRows}
      setBulkUpdateRows={setBulkUpdateRows}
      onRefreshBulkUpdate={onRefreshBulkUpdate}
      onApplyBulkUpdate={onApplyBulkUpdate}
      onCloseBulkUpdate={onCloseBulkUpdate}
      onTriggerCsvUpload={onTriggerCsvUpload}
      onTriggerExcelImport={onTriggerExcelImport}
    />
  );
}
