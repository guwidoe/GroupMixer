import { useState } from 'react';
import type { AttributeDefinition, Group, GroupFormData, Person, PersonFormData, Problem } from '../../../types';
import { generateUniquePersonId, getDefaultSolverSettings } from '../helpers';

type NotificationPayload = {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
};

interface UseProblemEditorEntitiesArgs {
  problem: Problem | null;
  addAttributeDefinition: (definition: AttributeDefinition) => void;
  removeAttributeDefinition: (key: string) => void;
  addNotification: (notification: NotificationPayload) => void;
  setProblem: (problem: Problem) => void;
}

export function useProblemEditorEntities({
  problem,
  addAttributeDefinition,
  removeAttributeDefinition,
  addNotification,
  setProblem,
}: UseProblemEditorEntitiesArgs) {
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
  const [groupFormInputs, setGroupFormInputs] = useState<{ size?: string }>({});

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
      id: generateUniquePersonId(),
      attributes: { ...personForm.attributes },
      sessions: personForm.sessions.length > 0 ? personForm.sessions : undefined,
    };

    const updatedProblem: Problem = {
      people: [...(problem?.people || []), newPerson],
      groups: problem?.groups || [],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings(),
    };

    setProblem(updatedProblem);
    setPersonForm({ attributes: {}, sessions: [] });
    setShowPersonForm(false);

    addNotification({
      type: 'success',
      title: 'Person Added',
      message: `${newPerson.attributes.name} has been added to the problem`,
    });
  };

  const handleEditPerson = (person: Person) => {
    setEditingPerson(person);
    setPersonForm({
      attributes: { ...person.attributes },
      sessions: person.sessions || [],
    });
    setShowPersonForm(true);
  };

  const handleUpdatePerson = () => {
    if (!editingPerson || !personForm.attributes.name?.trim()) return;

    const updatedPerson: Person = {
      ...editingPerson,
      attributes: { ...personForm.attributes },
      sessions: personForm.sessions.length > 0 ? personForm.sessions : undefined,
    };

    const updatedProblem: Problem = {
      people: problem?.people.map((person) => (person.id === editingPerson.id ? updatedPerson : person)) || [],
      groups: problem?.groups || [],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings(),
    };

    setProblem(updatedProblem);
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
    const updatedProblem: Problem = {
      people: problem?.people.filter((person) => person.id !== personId) || [],
      groups: problem?.groups || [],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings(),
    };

    setProblem(updatedProblem);

    addNotification({
      type: 'success',
      title: 'Person Removed',
      message: 'Person has been removed from the problem',
    });
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

    const idExists = problem?.groups.some((group) => group.id === groupForm.id?.trim());
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

    const newGroup: Group = {
      id: groupForm.id,
      size,
    };

    const updatedProblem: Problem = {
      people: problem?.people || [],
      groups: [...(problem?.groups || []), newGroup],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings(),
    };

    setProblem(updatedProblem);
    setGroupForm({ size: 4 });
    setGroupFormInputs({});
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
    });
    setGroupFormInputs({
      size: group.size.toString(),
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

    const updatedGroup: Group = {
      id: groupForm.id,
      size,
    };

    const updatedProblem: Problem = {
      people: problem?.people || [],
      groups: problem?.groups.map((group) => (group.id === editingGroup.id ? updatedGroup : group)) || [],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings(),
    };

    setProblem(updatedProblem);
    setEditingGroup(null);
    setGroupForm({ size: 4 });
    setGroupFormInputs({});
    setShowGroupForm(false);

    addNotification({
      type: 'success',
      title: 'Group Updated',
      message: `Group "${updatedGroup.id}" has been updated`,
    });
  };

  const handleDeleteGroup = (groupId: string) => {
    const updatedProblem: Problem = {
      people: problem?.people || [],
      groups: problem?.groups.filter((group) => group.id !== groupId) || [],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings(),
    };

    setProblem(updatedProblem);

    addNotification({
      type: 'success',
      title: 'Group Removed',
      message: `Group "${groupId}" has been removed`,
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

    const definition: AttributeDefinition = {
      key: newAttribute.key,
      values: newAttribute.values.filter((value) => value.trim()),
    };

    addAttributeDefinition(definition);
    setNewAttribute({ key: '', values: [''] });
    setShowAttributeForm(false);

    addNotification({
      type: 'success',
      title: 'Attribute Added',
      message: `Attribute "${definition.key}" has been added`,
    });
  };

  const handleEditAttribute = (attribute: AttributeDefinition) => {
    setEditingAttribute(attribute);
    setNewAttribute({
      key: attribute.key,
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

    removeAttributeDefinition(editingAttribute.key);

    const updatedDefinition: AttributeDefinition = {
      key: newAttribute.key.trim(),
      values: newAttribute.values.filter((value) => value.trim()),
    };

    addAttributeDefinition(updatedDefinition);

    setNewAttribute({ key: '', values: [''] });
    setEditingAttribute(null);
    setShowAttributeForm(false);

    addNotification({
      type: 'success',
      title: 'Attribute Updated',
      message: `Attribute "${updatedDefinition.key}" has been updated`,
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
    handleAddGroup,
    handleEditGroup,
    handleUpdateGroup,
    handleDeleteGroup,
    handleAddAttribute,
    handleEditAttribute,
    handleUpdateAttribute,
  };
}
