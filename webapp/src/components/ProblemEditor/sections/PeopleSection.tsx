import React from 'react';
import type { AttributeDefinition, Person, Problem } from '../../../types';
import { AttributeDefinitionsSection } from './people/AttributeDefinitionsSection';
import { PeopleDirectory } from './people/PeopleDirectory';

interface PeopleSectionProps {
  problem: Problem | null;
  attributeDefinitions: AttributeDefinition[];
  sessionsCount: number;
  onAddAttribute: () => void;
  onEditAttribute: (definition: AttributeDefinition) => void;
  onRemoveAttribute: (key: string) => void;
  onAddPerson: () => void;
  onEditPerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
  onOpenBulkAddForm: () => void;
  onOpenBulkUpdateForm: () => void;
  onTriggerCsvUpload: () => void;
  onTriggerExcelImport: () => void;
}

export function PeopleSection({
  problem,
  attributeDefinitions,
  sessionsCount,
  onAddAttribute,
  onEditAttribute,
  onRemoveAttribute,
  onAddPerson,
  onEditPerson,
  onDeletePerson,
  onOpenBulkAddForm,
  onOpenBulkUpdateForm,
  onTriggerCsvUpload,
  onTriggerExcelImport,
}: PeopleSectionProps) {
  return (
    <div className="space-y-4">
      <AttributeDefinitionsSection
        attributeDefinitions={attributeDefinitions}
        onAddAttribute={onAddAttribute}
        onEditAttribute={onEditAttribute}
        onRemoveAttribute={onRemoveAttribute}
      />
      <PeopleDirectory
        problem={problem}
        attributeDefinitions={attributeDefinitions}
        sessionsCount={sessionsCount}
        onAddPerson={onAddPerson}
        onEditPerson={onEditPerson}
        onDeletePerson={onDeletePerson}
        onOpenBulkAddForm={onOpenBulkAddForm}
        onOpenBulkUpdateForm={onOpenBulkUpdateForm}
        onTriggerCsvUpload={onTriggerCsvUpload}
        onTriggerExcelImport={onTriggerExcelImport}
      />
    </div>
  );
}
