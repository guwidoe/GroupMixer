import { useState } from 'react';
import type { AttributeDefinition, Group, GroupFormData, Person, PersonFormData, Scenario, ScenarioDocument } from '../../../types';
import {
  applyNamedAttributeValuesToPerson,
  buildPersonFormAttributes,
  createAttributeDefinition,
  getAttributeDefinitionName,
} from '../../../services/scenarioAttributes';
import { generateUniquePersonId, getDefaultSolverSettings } from '../helpers';
import { buildScenarioWithGroups } from './scenarioEditorBulkUtils';

type NotificationPayload = {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
};

interface UseScenarioEditorEntitiesArgs {
  scenario: Scenario | null;
  attributeDefinitions: AttributeDefinition[];
  addAttributeDefinition: (definition: AttributeDefinition) => void;
  setScenarioDocument: (document: ScenarioDocument) => void;
  addNotification: (notification: NotificationPayload) => void;
  setScenario: (scenario: Scenario) => void;
}

type GroupFormInputs = {
  size?: string;
  sessionSizes?: string[];
};

function resetGroupFormState() {
  return {
    form: { size: 4 } as GroupFormData,
    inputs: {} as GroupFormInputs,
  };
}

function generateUniqueGroupId(existingGroups: Group[] | undefined) {
  const usedIds = new Set((existingGroups ?? []).map((group) => group.id));
  let nextIndex = (existingGroups?.length ?? 0) + 1;
  let nextId = `group_${nextIndex}`;
  while (usedIds.has(nextId)) {
    nextIndex += 1;
    nextId = `group_${nextIndex}`;
  }
  return nextId;
}

function parseSessionSizes(
  rawValues: string[] | undefined,
  sessionCount: number,
): { ok: true; value?: number[] } | { ok: false; message: string } {
  if (!rawValues || rawValues.length === 0) {
    return { ok: true, value: undefined };
  }

  if (rawValues.length !== sessionCount) {
    return {
      ok: false,
      message: `Please enter exactly ${sessionCount} session capacities`,
    };
  }

  const parsed: number[] = [];
  for (let index = 0; index < rawValues.length; index += 1) {
    const parsedValue = Number.parseInt(rawValues[index] ?? '', 10);
    if (Number.isNaN(parsedValue) || parsedValue < 0) {
      return {
        ok: false,
        message: `Session ${index + 1} capacity must be 0 or greater`,
      };
    }
    parsed.push(parsedValue);
  }

  return {
    ok: true,
    value: parsed,
  };
}

export function useScenarioEditorEntities({
  scenario,
  attributeDefinitions,
  addAttributeDefinition,
  setScenarioDocument,
  addNotification,
  setScenario,
}: UseScenarioEditorEntitiesArgs) {
  const [showPersonForm, setShowPersonForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showAttributeForm, setShowAttributeForm] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editingAttribute, setEditingAttribute] = useState<AttributeDefinition | null>(null);

  const [personForm, setPersonForm] = useState<PersonFormData>({
    attributes: {},
    sessions: [],
  });

  const [groupForm, setGroupForm] = useState<GroupFormData>({
    size: 4,
  });
  const [groupFormInputs, setGroupFormInputs] = useState<GroupFormInputs>({});

  const [newAttribute, setNewAttribute] = useState({ key: '', values: [''] });

  const handleAddPerson = () => {
    if (!personForm.attributes.name?.trim()) {
      addNotification({
        type: 'error',
        title: 'Invalid Input',
        message: 'Please enter a name for the person',
      });
      return;
    }

    const newPerson: Person = {
      ...applyNamedAttributeValuesToPerson(
        {
          id: generateUniquePersonId(),
          attributes: {},
        },
        personForm.attributes,
        attributeDefinitions,
      ),
      sessions: personForm.sessions.length > 0 ? personForm.sessions : undefined,
    };

    const updatedScenario: Scenario = {
      people: [...(scenario?.people || []), newPerson],
      groups: scenario?.groups || [],
      num_sessions: scenario?.num_sessions || 3,
      constraints: scenario?.constraints || [],
      settings: scenario?.settings || getDefaultSolverSettings(),
    };

    setScenario(updatedScenario);
    setPersonForm({ attributes: {}, sessions: [] });
    setShowPersonForm(false);

    addNotification({
      type: 'success',
      title: 'Person Added',
      message: `${newPerson.attributes.name} has been added to the scenario`,
    });
  };

  const handleEditPerson = (person: Person) => {
    setEditingPerson(person);
    setPersonForm({
      attributes: buildPersonFormAttributes(person, attributeDefinitions),
      sessions: person.sessions || [],
    });
    setShowPersonForm(true);
  };

  const handleUpdatePerson = () => {
    if (!editingPerson || !personForm.attributes.name?.trim()) return;

    const updatedPerson: Person = {
      ...applyNamedAttributeValuesToPerson(editingPerson, personForm.attributes, attributeDefinitions),
      sessions: personForm.sessions.length > 0 ? personForm.sessions : undefined,
    };

    const updatedScenario: Scenario = {
      people: scenario?.people.map((person) => (person.id === editingPerson.id ? updatedPerson : person)) || [],
      groups: scenario?.groups || [],
      num_sessions: scenario?.num_sessions || 3,
      constraints: scenario?.constraints || [],
      settings: scenario?.settings || getDefaultSolverSettings(),
    };

    setScenario(updatedScenario);
    setEditingPerson(null);
    setPersonForm({ attributes: {}, sessions: [] });
    setShowPersonForm(false);

    addNotification({
      type: 'success',
      title: 'Person Updated',
      message: `${updatedPerson.attributes.name} has been updated`,
    });
  };

  const handleDeletePerson = (personId: string) => {
    const updatedScenario: Scenario = {
      people: scenario?.people.filter((person) => person.id !== personId) || [],
      groups: scenario?.groups || [],
      num_sessions: scenario?.num_sessions || 3,
      constraints: scenario?.constraints || [],
      settings: scenario?.settings || getDefaultSolverSettings(),
    };

    setScenario(updatedScenario);

    addNotification({
      type: 'success',
      title: 'Person Removed',
      message: 'Person has been removed from the scenario',
    });
  };

  const handleInlineUpdatePerson = (
    personId: string,
    updates: { attributes?: Record<string, string>; sessions?: number[] | undefined },
  ) => {
    const updatedScenario: Scenario = {
      people:
        scenario?.people.map((person) =>
          person.id === personId
            ? {
                ...(updates.attributes
                  ? applyNamedAttributeValuesToPerson(person, updates.attributes, attributeDefinitions)
                  : person),
                sessions: updates.sessions !== undefined ? updates.sessions : person.sessions,
              }
            : person,
        ) || [],
      groups: scenario?.groups || [],
      num_sessions: scenario?.num_sessions || 3,
      constraints: scenario?.constraints || [],
      settings: scenario?.settings || getDefaultSolverSettings(),
    };

    setScenario(updatedScenario);
  };

  const handleAddGroup = () => {
    if (!groupForm.id?.trim()) {
      addNotification({
        type: 'error',
        title: 'Invalid Input',
        message: 'Please enter a group ID',
      });
      return;
    }

    const idExists = scenario?.groups.some((group) => group.id === groupForm.id?.trim());
    if (idExists) {
      addNotification({
        type: 'error',
        title: 'Duplicate Group ID',
        message: `Group ID "${groupForm.id.trim()}" already exists`,
      });
      return;
    }

    const sizeValue = groupFormInputs.size || groupForm.size.toString();
    const size = parseInt(sizeValue);
    if (isNaN(size) || size < 1) {
      addNotification({
        type: 'error',
        title: 'Invalid Input',
        message: 'Please enter a valid group size (1 or greater)',
      });
      return;
    }

    const sessionSizesResult = parseSessionSizes(
      groupFormInputs.sessionSizes,
      scenario?.num_sessions || 3,
    );
    if (!sessionSizesResult.ok) {
      addNotification({
        type: 'error',
        title: 'Invalid Input',
        message: sessionSizesResult.message,
      });
      return;
    }

    const newGroup: Group = {
      id: groupForm.id,
      size,
      session_sizes: sessionSizesResult.value,
    };

    const updatedScenario: Scenario = {
      people: scenario?.people || [],
      groups: [...(scenario?.groups || []), newGroup],
      num_sessions: scenario?.num_sessions || 3,
      constraints: scenario?.constraints || [],
      settings: scenario?.settings || getDefaultSolverSettings(),
    };

    setScenario(updatedScenario);
    const reset = resetGroupFormState();
    setGroupForm(reset.form);
    setGroupFormInputs(reset.inputs);
    setShowGroupForm(false);

    addNotification({
      type: 'success',
      title: 'Group Added',
      message: `Group "${newGroup.id}" has been added`,
    });
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    setGroupForm({
      id: group.id,
      size: group.size,
      session_sizes: group.session_sizes,
    });
    setGroupFormInputs({
      size: group.size.toString(),
      sessionSizes: group.session_sizes?.map((value) => value.toString()),
    });
    setShowGroupForm(true);
  };

  const handleUpdateGroup = () => {
    if (!editingGroup || !groupForm.id?.trim()) return;

    const sizeValue = groupFormInputs.size || groupForm.size.toString();
    const size = parseInt(sizeValue);
    if (isNaN(size) || size < 1) {
      addNotification({
        type: 'error',
        title: 'Invalid Input',
        message: 'Please enter a valid group size (1 or greater)',
      });
      return;
    }

    const sessionSizesResult = parseSessionSizes(
      groupFormInputs.sessionSizes,
      scenario?.num_sessions || 3,
    );
    if (!sessionSizesResult.ok) {
      addNotification({
        type: 'error',
        title: 'Invalid Input',
        message: sessionSizesResult.message,
      });
      return;
    }

    const updatedGroup: Group = {
      id: groupForm.id,
      size,
      session_sizes: sessionSizesResult.value,
    };

    const updatedScenario: Scenario = {
      people: scenario?.people || [],
      groups: scenario?.groups.map((group) => (group.id === editingGroup.id ? updatedGroup : group)) || [],
      num_sessions: scenario?.num_sessions || 3,
      constraints: scenario?.constraints || [],
      settings: scenario?.settings || getDefaultSolverSettings(),
    };

    setScenario(updatedScenario);
    setEditingGroup(null);
    const reset = resetGroupFormState();
    setGroupForm(reset.form);
    setGroupFormInputs(reset.inputs);
    setShowGroupForm(false);

    addNotification({
      type: 'success',
      title: 'Group Updated',
      message: `Group "${updatedGroup.id}" has been updated`,
    });
  };

  const handleDeleteGroup = (groupId: string) => {
    const updatedScenario: Scenario = {
      people: scenario?.people || [],
      groups: scenario?.groups.filter((group) => group.id !== groupId) || [],
      num_sessions: scenario?.num_sessions || 3,
      constraints: scenario?.constraints || [],
      settings: scenario?.settings || getDefaultSolverSettings(),
    };

    setScenario(updatedScenario);

    addNotification({
      type: 'success',
      title: 'Group Removed',
      message: `Group "${groupId}" has been removed`,
    });
  };

  const createGridGroupRow = () => ({
    id: generateUniqueGroupId(scenario?.groups),
    size: 4,
    session_sizes: undefined,
  } satisfies Group);

  const applyGridGroups = (groups: Group[]) => {
    const sessionsTotal = scenario?.num_sessions || 3;
    const normalizedGroups = groups
      .map((group) => {
        const size = Number.isFinite(group.size) && group.size > 0 ? Math.max(1, Math.round(group.size)) : 1;
        const normalizedSessionSizes = Array.isArray(group.session_sizes)
          ? group.session_sizes.map((value) => Math.max(0, Math.round(Number(value) || 0))).slice(0, sessionsTotal)
          : undefined;

        return {
          ...group,
          id: group.id.trim() || generateUniqueGroupId(scenario?.groups),
          size,
          session_sizes: normalizedSessionSizes && normalizedSessionSizes.length > 0
            ? normalizedSessionSizes
            : undefined,
        } satisfies Group;
      })
      .filter((group) => group.id.length > 0);

    setScenario(buildScenarioWithGroups(scenario, normalizedGroups));
    addNotification({
      type: 'success',
      title: 'Groups Updated',
      message: `Applied ${normalizedGroups.length} grid row${normalizedGroups.length === 1 ? '' : 's'}.`,
    });
  };

  const handleAddAttribute = () => {
    if (!newAttribute.key.trim() || newAttribute.values.some((value) => !value.trim())) {
      addNotification({
        type: 'error',
        title: 'Invalid Input',
        message: 'Please enter an attribute key and at least one value',
      });
      return;
    }

    const definition = createAttributeDefinition(
      newAttribute.key.trim(),
      newAttribute.values.filter((value) => value.trim()),
    );

    addAttributeDefinition(definition);
    setNewAttribute({ key: '', values: [''] });
    setShowAttributeForm(false);

    addNotification({
      type: 'success',
      title: 'Attribute Added',
      message: `Attribute "${definition.name}" has been added`,
    });
  };

  const handleEditAttribute = (attribute: AttributeDefinition) => {
    setEditingAttribute(attribute);
    setNewAttribute({
      key: getAttributeDefinitionName(attribute),
      values: [...attribute.values],
    });
    setShowAttributeForm(true);
  };

  const handleUpdateAttribute = () => {
    if (!editingAttribute || !newAttribute.key.trim() || newAttribute.values.some((value) => !value.trim())) {
      addNotification({
        type: 'error',
        title: 'Invalid Input',
        message: 'Please enter an attribute key and at least one value',
      });
      return;
    }

    const updatedDefinition = createAttributeDefinition(
      newAttribute.key.trim(),
      newAttribute.values.filter((value) => value.trim()),
      editingAttribute.id,
    );

    if (scenario) {
      const nextDefinitions = attributeDefinitions.map((definition) =>
        definition.id === editingAttribute.id ? updatedDefinition : definition,
      );
      setScenarioDocument({
        scenario,
        attributeDefinitions: nextDefinitions,
      });
    }

    setNewAttribute({ key: '', values: [''] });
    setEditingAttribute(null);
    setShowAttributeForm(false);

    addNotification({
      type: 'success',
      title: 'Attribute Updated',
      message: `Attribute "${updatedDefinition.name}" has been updated`,
    });
  };

  const createGridAttributeRow = () => createAttributeDefinition(`attribute_${attributeDefinitions.length + 1}`, []);

  const applyGridAttributes = (definitions: AttributeDefinition[]) => {
    const normalizedDefinitions = definitions
      .map((definition, index) => createAttributeDefinition(
        getAttributeDefinitionName(definition).trim() || `attribute_${index + 1}`,
        (definition.values ?? []).map((value) => value.trim()).filter(Boolean),
        definition.id,
      ));

    if (scenario) {
      setScenarioDocument({
        scenario,
        attributeDefinitions: normalizedDefinitions,
      });
    }
    addNotification({
      type: 'success',
      title: 'Attributes Updated',
      message: `Applied ${normalizedDefinitions.length} attribute row${normalizedDefinitions.length === 1 ? '' : 's'}.`,
    });
  };

  return {
    showPersonForm,
    setShowPersonForm,
    showGroupForm,
    setShowGroupForm,
    showAttributeForm,
    setShowAttributeForm,
    editingPerson,
    setEditingPerson,
    editingGroup,
    setEditingGroup,
    editingAttribute,
    setEditingAttribute,
    personForm,
    setPersonForm,
    groupForm,
    setGroupForm,
    groupFormInputs,
    setGroupFormInputs,
    newAttribute,
    setNewAttribute,
    handleAddPerson,
    handleEditPerson,
    handleUpdatePerson,
    handleDeletePerson,
    handleInlineUpdatePerson,
    handleAddGroup,
    handleEditGroup,
    handleUpdateGroup,
    handleDeleteGroup,
    createGridGroupRow,
    applyGridGroups,
    handleAddAttribute,
    handleEditAttribute,
    handleUpdateAttribute,
    createGridAttributeRow,
    applyGridAttributes,
  };
}
