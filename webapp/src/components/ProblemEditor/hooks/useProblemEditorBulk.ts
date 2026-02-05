import { useRef, useState } from 'react';
import type { AttributeDefinition, Group, Person, Problem } from '../../../types';
import { generateUniquePersonId, getDefaultSolverSettings, parseCsv, rowsToCsv } from '../helpers';

type NotificationPayload = {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
};

interface UseProblemEditorBulkArgs {
  problem: Problem | null;
  attributeDefinitions: AttributeDefinition[];
  addAttributeDefinition: (definition: AttributeDefinition) => void;
  removeAttributeDefinition: (key: string) => void;
  addNotification: (notification: NotificationPayload) => void;
  setProblem: (problem: Problem) => void;
}

export function useProblemEditorBulk({
  problem,
  attributeDefinitions,
  addAttributeDefinition,
  removeAttributeDefinition,
  addNotification,
  setProblem,
}: UseProblemEditorBulkArgs) {
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkTextMode, setBulkTextMode] = useState<'text' | 'grid'>('text');
  const [bulkCsvInput, setBulkCsvInput] = useState('');
  const [bulkHeaders, setBulkHeaders] = useState<string[]>([]);
  const [bulkRows, setBulkRows] = useState<Record<string, string>[]>([]);

  const [showBulkUpdateForm, setShowBulkUpdateForm] = useState(false);
  const [bulkUpdateTextMode, setBulkUpdateTextMode] = useState<'text' | 'grid'>('grid');
  const [bulkUpdateCsvInput, setBulkUpdateCsvInput] = useState('');
  const [bulkUpdateHeaders, setBulkUpdateHeaders] = useState<string[]>([]);
  const [bulkUpdateRows, setBulkUpdateRows] = useState<Record<string, string>[]>([]);

  const openBulkFormFromCsv = (csvText: string) => {
    setBulkCsvInput(csvText);
    const { headers, rows } = parseCsv(csvText);
    setBulkHeaders(headers);
    setBulkRows(rows);
    setBulkTextMode('text');
    setShowBulkForm(true);
  };

  const handleCsvFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      openBulkFormFromCsv(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const openBulkAddForm = () => {
    setBulkCsvInput('');
    setBulkHeaders([]);
    setBulkRows([]);
    setBulkTextMode('text');
    setShowBulkForm(true);
  };

  const handleAddBulkPeople = () => {
    // If in text mode, parse the CSV first to get headers and rows
    let headers = bulkHeaders;
    let rows = bulkRows;
    if (bulkTextMode === 'text') {
      const parsed = parseCsv(bulkCsvInput);
      headers = parsed.headers;
      rows = parsed.rows;
      // Update state so grid view is in sync if user switches
      setBulkHeaders(headers);
      setBulkRows(rows);
    }

    if (!headers.includes('name')) {
      addNotification({ type: 'error', title: 'Missing Column', message: 'CSV must include a "name" column.' });
      return;
    }

    const newPeople: Person[] = rows.map((row) => {
      const personAttrs: Record<string, string> = {};
      headers.forEach((header) => {
        if (row[header]) personAttrs[header] = row[header];
      });
      if (!personAttrs.name) personAttrs.name = `Person ${Date.now()}`;
      return {
        id: generateUniquePersonId(),
        attributes: personAttrs,
        sessions: undefined,
      };
    });

    const attrValueMap: Record<string, Set<string>> = {};
    headers.forEach((header) => {
      if (header === 'name') return;
      attrValueMap[header] = new Set();
    });
    newPeople.forEach((person) => {
      Object.entries(person.attributes).forEach(([key, value]) => {
        if (key !== 'name') attrValueMap[key]?.add(value);
      });
    });
    Object.entries(attrValueMap).forEach(([key, valSet]) => {
      const existing = attributeDefinitions.find((def) => def.key === key);
      const newValues = Array.from(valSet);
      if (!existing) {
        addAttributeDefinition({ key, values: newValues });
      } else {
        const merged = Array.from(new Set([...existing.values, ...newValues]));
        if (merged.length !== existing.values.length) {
          removeAttributeDefinition(existing.key);
          addAttributeDefinition({ key: existing.key, values: merged });
        }
      }
    });

    const updatedProblem: Problem = {
      people: [...(problem?.people || []), ...newPeople],
      groups: problem?.groups || [],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings(),
    };
    setProblem(updatedProblem);
    setShowBulkForm(false);
    setBulkCsvInput('');
    setBulkHeaders([]);
    setBulkRows([]);

    addNotification({ type: 'success', title: 'People Added', message: `${newPeople.length} people added.` });
  };

  const buildPeopleCsvFromCurrent = (): { headers: string[]; rows: Record<string, string>[] } => {
    const people = problem?.people || [];
    const headerSet = new Set<string>(['id', 'name']);
    people.forEach((person) => {
      Object.keys(person.attributes || {}).forEach((key) => {
        if (key !== 'name') headerSet.add(key);
      });
    });
    attributeDefinitions.forEach((def) => {
      if (def.key !== 'name') headerSet.add(def.key);
    });
    const headers = Array.from(headerSet);
    const rows: Record<string, string>[] = people.map((person) => {
      const row: Record<string, string> = {};
      headers.forEach((header) => {
        if (header === 'id') row[header] = person.id;
        else if (header === 'name') row[header] = (person.attributes && person.attributes['name']) || '';
        else row[header] = (person.attributes && (person.attributes[header] ?? '')) as string;
      });
      return row;
    });
    return { headers, rows };
  };

  const refreshBulkUpdateFromCurrent = () => {
    const { headers, rows } = buildPeopleCsvFromCurrent();
    setBulkUpdateHeaders(headers);
    setBulkUpdateRows(rows);
    setBulkUpdateCsvInput(rowsToCsv(headers, rows));
  };

  const openBulkUpdateForm = () => {
    refreshBulkUpdateFromCurrent();
    setBulkUpdateTextMode('grid');
    setShowBulkUpdateForm(true);
  };

  const handleApplyBulkUpdate = () => {
    let headers: string[] = bulkUpdateHeaders;
    let rows: Record<string, string>[] = bulkUpdateRows;
    if (bulkUpdateTextMode === 'text') {
      const parsed = parseCsv(bulkUpdateCsvInput);
      headers = parsed.headers;
      rows = parsed.rows;
    }

    if (!headers.includes('id')) {
      addNotification({ type: 'error', title: 'Missing Column', message: 'CSV must include an "id" column.' });
      return;
    }
    if (!headers.includes('name')) {
      addNotification({ type: 'error', title: 'Missing Column', message: 'CSV must include a "name" column.' });
      return;
    }

    const existingPeople = problem?.people || [];
    const existingById = new Map<string, Person>(existingPeople.map((person) => [person.id, person]));
    const usedIds = new Set<string>(existingPeople.map((person) => person.id));
    const updatedById = new Map<string, Person>();
    existingPeople.forEach((person) => updatedById.set(person.id, { ...person, attributes: { ...person.attributes } }));

    const newPeopleToAdd: Person[] = [];
    rows.forEach((row) => {
      const rawId = (row['id'] || '').trim();
      const isExisting = rawId && existingById.has(rawId);
      if (isExisting) {
        const person = updatedById.get(rawId)!;
        headers.forEach((header) => {
          if (header === 'id') return;
          const val = (row[header] ?? '').trim();
          if (val === '__DELETE__') {
            if (header in person.attributes) delete person.attributes[header];
          } else if (val.length > 0) {
            person.attributes[header] = val;
          }
        });
        updatedById.set(rawId, person);
      } else {
        const hasAnyData = headers.some((header) => header !== 'id' && (row[header] ?? '').trim().length > 0);
        if (!hasAnyData) return;
        let newId = rawId;
        if (!newId || usedIds.has(newId)) {
          newId = generateUniquePersonId();
        }
        usedIds.add(newId);
        const attributes: Record<string, string> = {};
        headers.forEach((header) => {
          if (header === 'id') return;
          const val = (row[header] ?? '').trim();
          if (val.length > 0) attributes[header] = val;
        });
        newPeopleToAdd.push({ id: newId, attributes, sessions: undefined });
      }
    });

    const updatedPeople = Array.from(updatedById.values());
    const finalPeople: Person[] = [...updatedPeople, ...newPeopleToAdd];

    const attrValueMap: Record<string, Set<string>> = {};
    const allKeys = new Set<string>();
    finalPeople.forEach((person) => {
      Object.entries(person.attributes || {}).forEach(([key, value]) => {
        if (key === 'name') return;
        if (!attrValueMap[key]) attrValueMap[key] = new Set<string>();
        if (typeof value === 'string' && value.length > 0) attrValueMap[key].add(value);
        allKeys.add(key);
      });
    });
    headers.forEach((header) => {
      if (header !== 'id' && header !== 'name') allKeys.add(header);
    });

    allKeys.forEach((key) => {
      const existing = attributeDefinitions.find((def) => def.key === key);
      const newValues = Array.from(attrValueMap[key] || new Set<string>());
      if (!existing) {
        addAttributeDefinition({ key, values: newValues });
      } else {
        const merged = Array.from(new Set([...(existing.values || []), ...newValues]));
        if (merged.length !== existing.values.length) {
          removeAttributeDefinition(existing.key);
          addAttributeDefinition({ key: existing.key, values: merged });
        }
      }
    });

    const updatedProblem: Problem = {
      people: finalPeople,
      groups: problem?.groups || [],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings(),
    };
    setProblem(updatedProblem);
    setShowBulkUpdateForm(false);
    addNotification({ type: 'success', title: 'Bulk Update Applied', message: `Updated ${rows.length} row(s).` });
  };

  const groupCsvFileInputRef = useRef<HTMLInputElement>(null);
  const [showGroupBulkForm, setShowGroupBulkForm] = useState(false);
  const [groupBulkTextMode, setGroupBulkTextMode] = useState<'text' | 'grid'>('text');
  const [groupBulkCsvInput, setGroupBulkCsvInput] = useState('');
  const [groupBulkHeaders, setGroupBulkHeaders] = useState<string[]>([]);
  const [groupBulkRows, setGroupBulkRows] = useState<Record<string, string>[]>([]);

  const openGroupBulkFormFromCsv = (csvText: string) => {
    setGroupBulkCsvInput(csvText);
    const { headers, rows } = parseCsv(csvText);
    setGroupBulkHeaders(headers);
    setGroupBulkRows(rows);
    setGroupBulkTextMode('text');
    setShowGroupBulkForm(true);
  };

  const openGroupBulkForm = () => {
    setGroupBulkCsvInput('');
    setGroupBulkHeaders([]);
    setGroupBulkRows([]);
    setGroupBulkTextMode('text');
    setShowGroupBulkForm(true);
  };

  const handleGroupCsvFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      openGroupBulkFormFromCsv(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddGroupBulkPeople = () => {
    // If in text mode, parse the CSV first to get headers and rows
    let headers = groupBulkHeaders;
    let rows = groupBulkRows;
    if (groupBulkTextMode === 'text') {
      const parsed = parseCsv(groupBulkCsvInput);
      headers = parsed.headers;
      rows = parsed.rows;
      // Update state so grid view is in sync if user switches
      setGroupBulkHeaders(headers);
      setGroupBulkRows(rows);
    }

    if (!headers.includes('id')) {
      addNotification({ type: 'error', title: 'Missing Column', message: 'CSV must include an "id" column.' });
      return;
    }

    const existingIds = new Set((problem?.groups || []).map((group) => group.id));
    const newGroups: Group[] = [];
    const duplicateIds: string[] = [];
    rows.forEach((row, idx) => {
      const rawId = row['id'] ?? row['group'] ?? `Group_${Date.now()}_${idx}`;
      const id = rawId.trim();
      const sizeVal = (row['size'] ?? row['capacity'] ?? '').trim();
      const size = parseInt(sizeVal) || 4;
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

    const attrValueMap: Record<string, Set<string>> = {};
    headers.forEach((header) => {
      if (header === 'id') return;
      attrValueMap[header] = new Set();
    });
    newGroups.forEach((group) => {
      Object.entries(group).forEach(([key, value]) => {
        if (key !== 'id') attrValueMap[key]?.add(value);
      });
    });
    Object.entries(attrValueMap).forEach(([key, valSet]) => {
      const existing = attributeDefinitions.find((def) => def.key === key);
      const newValues = Array.from(valSet);
      if (!existing) {
        addAttributeDefinition({ key, values: newValues });
      } else {
        const merged = Array.from(new Set([...existing.values, ...newValues]));
        if (merged.length !== existing.values.length) {
          removeAttributeDefinition(existing.key);
          addAttributeDefinition({ key: existing.key, values: merged });
        }
      }
    });

    const updatedProblem: Problem = {
      people: problem?.people || [],
      groups: [...(problem?.groups || []), ...newGroups],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings(),
    };
    setProblem(updatedProblem);
    setShowGroupBulkForm(false);
    setGroupBulkCsvInput('');
    setGroupBulkHeaders([]);
    setGroupBulkRows([]);

    addNotification({ type: 'success', title: 'Groups Added', message: `${newGroups.length} groups added.` });
  };

  return {
    csvFileInputRef,
    showBulkForm,
    setShowBulkForm,
    bulkTextMode,
    setBulkTextMode,
    bulkCsvInput,
    setBulkCsvInput,
    bulkHeaders,
    setBulkHeaders,
    bulkRows,
    setBulkRows,
    openBulkAddForm,
    openBulkUpdateForm,
    handleCsvFileSelected,
    handleAddBulkPeople,
    showBulkUpdateForm,
    setShowBulkUpdateForm,
    bulkUpdateTextMode,
    setBulkUpdateTextMode,
    bulkUpdateCsvInput,
    setBulkUpdateCsvInput,
    bulkUpdateHeaders,
    setBulkUpdateHeaders,
    bulkUpdateRows,
    setBulkUpdateRows,
    handleApplyBulkUpdate,
    refreshBulkUpdateFromCurrent,
    groupCsvFileInputRef,
    showGroupBulkForm,
    setShowGroupBulkForm,
    groupBulkTextMode,
    setGroupBulkTextMode,
    groupBulkCsvInput,
    setGroupBulkCsvInput,
    groupBulkHeaders,
    setGroupBulkHeaders,
    groupBulkRows,
    setGroupBulkRows,
    openGroupBulkForm,
    handleGroupCsvFileSelected,
    handleAddGroupBulkPeople,
  };
}
