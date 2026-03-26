import { useRef, useState } from 'react';
import type { AttributeDefinition, Person, Scenario } from '../../../types';
import { generateUniquePersonId, parseCsv } from '../helpers';
import type { ScenarioEditorBulkNotification } from './scenarioEditorBulkNotifications';
import { applyAttributeDefinitionUpdates, buildScenarioWithPeople } from './scenarioEditorBulkUtils';

interface UseScenarioEditorBulkAddPeopleArgs {
  scenario: Scenario | null;
  attributeDefinitions: AttributeDefinition[];
  addAttributeDefinition: (definition: AttributeDefinition) => void;
  removeAttributeDefinition: (key: string) => void;
  addNotification: (notification: ScenarioEditorBulkNotification) => void;
  setScenario: (scenario: Scenario) => void;
}

export function useScenarioEditorBulkAddPeople({
  scenario,
  attributeDefinitions,
  addAttributeDefinition,
  removeAttributeDefinition,
  addNotification,
  setScenario,
}: UseScenarioEditorBulkAddPeopleArgs) {
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [textMode, setTextMode] = useState<'text' | 'grid'>('text');
  const [csvInput, setCsvInput] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);

  const openFormFromCsv = (csvText: string) => {
    setCsvInput(csvText);
    const parsed = parseCsv(csvText);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setTextMode('text');
    setShowForm(true);
  };

  const handleCsvFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      openFormFromCsv(reader.result as string);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const openForm = () => {
    setCsvInput('');
    setHeaders([]);
    setRows([]);
    setTextMode('text');
    setShowForm(true);
  };

  const save = () => {
    let nextHeaders = headers;
    let nextRows = rows;

    if (textMode === 'text') {
      const parsed = parseCsv(csvInput);
      nextHeaders = parsed.headers;
      nextRows = parsed.rows;
      setHeaders(nextHeaders);
      setRows(nextRows);
    }

    if (!nextHeaders.includes('name')) {
      addNotification({ type: 'error', title: 'Missing Column', message: 'CSV must include a "name" column.' });
      return;
    }

    const newPeople: Person[] = nextRows.map((row) => {
      const attributes: Record<string, string> = {};
      nextHeaders.forEach((header) => {
        if (row[header]) {
          attributes[header] = row[header];
        }
      });

      if (!attributes.name) {
        attributes.name = `Person ${Date.now()}`;
      }

      return {
        id: generateUniquePersonId(),
        attributes,
        sessions: undefined,
      };
    });

    const valueSets: Record<string, Set<string>> = {};
    nextHeaders.forEach((header) => {
      if (header !== 'name') {
        valueSets[header] = new Set();
      }
    });

    newPeople.forEach((person) => {
      Object.entries(person.attributes).forEach(([key, value]) => {
        if (key !== 'name') {
          valueSets[key]?.add(value);
        }
      });
    });

    applyAttributeDefinitionUpdates({
      attributeDefinitions,
      addAttributeDefinition,
      removeAttributeDefinition,
      valueSets,
    });

    setScenario(buildScenarioWithPeople(scenario, [...(scenario?.people || []), ...newPeople]));
    setShowForm(false);
    setCsvInput('');
    setHeaders([]);
    setRows([]);

    addNotification({ type: 'success', title: 'People Added', message: `${newPeople.length} people added.` });
  };

  return {
    csvFileInputRef,
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
    handleCsvFileSelected,
    save,
  };
}
