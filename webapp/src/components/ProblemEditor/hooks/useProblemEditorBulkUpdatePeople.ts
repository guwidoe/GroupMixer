import { useState } from 'react';
import type { AttributeDefinition, Person, Problem } from '../../../types';
import { generateUniquePersonId, parseCsv, rowsToCsv } from '../helpers';
import {
  applyAttributeDefinitionUpdates,
  buildPeopleCsvFromCurrent,
  buildProblemWithPeople,
} from './problemEditorBulkUtils';
import type { NotificationPayload } from './useProblemEditorBulkAddPeople';

interface UseProblemEditorBulkUpdatePeopleArgs {
  problem: Problem | null;
  attributeDefinitions: AttributeDefinition[];
  addAttributeDefinition: (definition: AttributeDefinition) => void;
  removeAttributeDefinition: (key: string) => void;
  addNotification: (notification: NotificationPayload) => void;
  setProblem: (problem: Problem) => void;
}

export function useProblemEditorBulkUpdatePeople({
  problem,
  attributeDefinitions,
  addAttributeDefinition,
  removeAttributeDefinition,
  addNotification,
  setProblem,
}: UseProblemEditorBulkUpdatePeopleArgs) {
  const [showForm, setShowForm] = useState(false);
  const [textMode, setTextMode] = useState<'text' | 'grid'>('grid');
  const [csvInput, setCsvInput] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);

  const refreshFromCurrent = () => {
    const current = buildPeopleCsvFromCurrent(problem, attributeDefinitions);
    setHeaders(current.headers);
    setRows(current.rows);
    setCsvInput(rowsToCsv(current.headers, current.rows));
  };

  const openForm = () => {
    refreshFromCurrent();
    setTextMode('grid');
    setShowForm(true);
  };

  const apply = () => {
    let nextHeaders = headers;
    let nextRows = rows;

    if (textMode === 'text') {
      const parsed = parseCsv(csvInput);
      nextHeaders = parsed.headers;
      nextRows = parsed.rows;
    }

    if (!nextHeaders.includes('id')) {
      addNotification({ type: 'error', title: 'Missing Column', message: 'CSV must include an "id" column.' });
      return;
    }
    if (!nextHeaders.includes('name')) {
      addNotification({ type: 'error', title: 'Missing Column', message: 'CSV must include a "name" column.' });
      return;
    }

    const existingPeople = problem?.people || [];
    const existingById = new Map<string, Person>(existingPeople.map((person) => [person.id, person]));
    const usedIds = new Set<string>(existingPeople.map((person) => person.id));
    const updatedById = new Map<string, Person>();

    existingPeople.forEach((person) => {
      updatedById.set(person.id, { ...person, attributes: { ...person.attributes } });
    });

    const newPeopleToAdd: Person[] = [];
    nextRows.forEach((row) => {
      const rawId = (row.id || '').trim();
      const isExisting = rawId && existingById.has(rawId);

      if (isExisting) {
        const person = updatedById.get(rawId)!;
        nextHeaders.forEach((header) => {
          if (header === 'id') return;
          const value = (row[header] ?? '').trim();
          if (value === '__DELETE__') {
            if (header in person.attributes) {
              delete person.attributes[header];
            }
          } else if (value.length > 0) {
            person.attributes[header] = value;
          }
        });
        updatedById.set(rawId, person);
        return;
      }

      const hasAnyData = nextHeaders.some((header) => header !== 'id' && (row[header] ?? '').trim().length > 0);
      if (!hasAnyData) {
        return;
      }

      let newId = rawId;
      if (!newId || usedIds.has(newId)) {
        newId = generateUniquePersonId();
      }
      usedIds.add(newId);

      const attributes: Record<string, string> = {};
      nextHeaders.forEach((header) => {
        if (header === 'id') return;
        const value = (row[header] ?? '').trim();
        if (value.length > 0) {
          attributes[header] = value;
        }
      });

      newPeopleToAdd.push({ id: newId, attributes, sessions: undefined });
    });

    const finalPeople = [...updatedById.values(), ...newPeopleToAdd];
    const valueSets: Record<string, Set<string>> = {};
    const allKeys = new Set<string>();

    finalPeople.forEach((person) => {
      Object.entries(person.attributes || {}).forEach(([key, value]) => {
        if (key === 'name') return;
        if (!valueSets[key]) {
          valueSets[key] = new Set<string>();
        }
        if (typeof value === 'string' && value.length > 0) {
          valueSets[key].add(value);
        }
        allKeys.add(key);
      });
    });

    nextHeaders.forEach((header) => {
      if (header !== 'id' && header !== 'name') {
        allKeys.add(header);
      }
    });

    allKeys.forEach((key) => {
      if (!valueSets[key]) {
        valueSets[key] = new Set<string>();
      }
    });

    applyAttributeDefinitionUpdates({
      attributeDefinitions,
      addAttributeDefinition,
      removeAttributeDefinition,
      valueSets,
    });

    setProblem(buildProblemWithPeople(problem, finalPeople));
    setShowForm(false);
    addNotification({ type: 'success', title: 'Bulk Update Applied', message: `Updated ${nextRows.length} row(s).` });
  };

  return {
    showForm,
    setShowForm,
    textMode,
    setTextMode,
    csvInput,
    setCsvInput,
    headers,
    setHeaders,
    rows,
    setRows,
    openForm,
    refreshFromCurrent,
    apply,
  };
}
