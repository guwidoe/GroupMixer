import { useRef, useState } from 'react';
import type { AttributeDefinition, Group, Scenario } from '../../../types';
import { parseCsv } from '../helpers';
import type { ScenarioEditorBulkNotification } from './scenarioEditorBulkNotifications';
import { applyAttributeDefinitionUpdates, buildScenarioWithGroups } from './scenarioEditorBulkUtils';

interface UseScenarioEditorBulkAddGroupsArgs {
  scenario: Scenario | null;
  attributeDefinitions: AttributeDefinition[];
  addAttributeDefinition: (definition: AttributeDefinition) => void;
  removeAttributeDefinition: (key: string) => void;
  addNotification: (notification: ScenarioEditorBulkNotification) => void;
  setScenario: (scenario: Scenario) => void;
}

export function useScenarioEditorBulkAddGroups({
  scenario,
  attributeDefinitions,
  addAttributeDefinition,
  removeAttributeDefinition,
  addNotification,
  setScenario,
}: UseScenarioEditorBulkAddGroupsArgs) {
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

    if (!nextHeaders.includes('id')) {
      addNotification({ type: 'error', title: 'Missing Column', message: 'CSV must include an "id" column.' });
      return;
    }

    const existingIds = new Set((scenario?.groups || []).map((group) => group.id));
    const newGroups: Group[] = [];
    const duplicateIds: string[] = [];

    nextRows.forEach((row, index) => {
      const rawId = row.id ?? row.group ?? `Group_${Date.now()}_${index}`;
      const id = rawId.trim();
      const sizeValue = (row.size ?? row.capacity ?? '').trim();
      const size = parseInt(sizeValue, 10) || 4;

      if (existingIds.has(id) || newGroups.some((group) => group.id === id)) {
        duplicateIds.push(id);
      } else {
        newGroups.push({ id, size });
      }
    });

    if (duplicateIds.length > 0) {
      addNotification({
        type: 'error',
        title: 'Duplicate Group IDs',
        message: `The following group IDs already exist or are duplicated: ${duplicateIds.join(', ')}`,
      });
      return;
    }

    const valueSets: Record<string, Set<string>> = {};
    nextHeaders.forEach((header) => {
      if (header !== 'id') {
        valueSets[header] = new Set<string>();
      }
    });

    newGroups.forEach((group) => {
      Object.entries(group).forEach(([key, value]) => {
        if (key !== 'id') {
          valueSets[key]?.add(String(value));
        }
      });
    });

    applyAttributeDefinitionUpdates({
      attributeDefinitions,
      addAttributeDefinition,
      removeAttributeDefinition,
      valueSets,
    });

    setScenario(buildScenarioWithGroups(scenario, [...(scenario?.groups || []), ...newGroups]));
    setShowForm(false);
    setCsvInput('');
    setHeaders([]);
    setRows([]);

    addNotification({ type: 'success', title: 'Groups Added', message: `${newGroups.length} groups added.` });
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
