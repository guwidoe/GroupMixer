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
  onApplyGridPeople: (people: Person[]) => void;
  createGridPersonRow: () => Person;
}

export function PeopleSection({
  scenario,
  attributeDefinitions,
  sessionsCount,
  onAddPerson,
  onEditPerson,
  onDeletePerson,
  onApplyGridPeople,
  createGridPersonRow,
}: PeopleSectionProps) {
  return (
    <PeopleDirectory
      scenario={scenario}
      attributeDefinitions={attributeDefinitions}
      sessionsCount={sessionsCount}
      onAddPerson={onAddPerson}
      onEditPerson={onEditPerson}
      onDeletePerson={onDeletePerson}
      onApplyGridPeople={onApplyGridPeople}
      createGridPersonRow={createGridPersonRow}
    />
  );
}
