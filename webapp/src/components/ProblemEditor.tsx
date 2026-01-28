import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import type { Person, Group, Constraint, Problem, PersonFormData, GroupFormData, AttributeDefinition, SolverSettings } from '../types';

// Extracted components from ProblemEditor directory
import {
  getDefaultSolverSettings,
  parseCsv,
  rowsToCsv,
  generateUniquePersonId,
} from './ProblemEditor/helpers';
import { ProblemEditorForms } from './ProblemEditor/ProblemEditorForms';
import { PeopleSection } from './ProblemEditor/sections/PeopleSection';
import { GroupsSection } from './ProblemEditor/sections/GroupsSection';
import { SessionsSection } from './ProblemEditor/sections/SessionsSection';
import { ObjectivesSection } from './ProblemEditor/sections/ObjectivesSection';
import { HardConstraintsSection } from './ProblemEditor/sections/HardConstraintsSection';
import { SoftConstraintsSection } from './ProblemEditor/sections/SoftConstraintsSection';
import { ConstraintsSection } from './ProblemEditor/sections/ConstraintsSection';
import { ProblemEditorHeader } from './ProblemEditor/ProblemEditorHeader';
import { ProblemEditorTabs } from './ProblemEditor/ProblemEditorTabs';
import { ConstraintFormModal } from './ProblemEditor/ConstraintFormModal';
import type { ConstraintFormState } from './ProblemEditor/ConstraintFormModal';
import { ProblemEditorConstraintModals } from './ProblemEditor/ProblemEditorConstraintModals';
import { DemoDataWarningModal } from './modals/DemoDataWarningModal';

export function ProblemEditor() {
  const { 
    problem, 
    setProblem, 
    GetProblem,
    addNotification, 
    loadDemoCase,
    loadDemoCaseOverwrite,
    loadDemoCaseNewProblem,
    attributeDefinitions,
    addAttributeDefinition,
    removeAttributeDefinition,
    setShowProblemManager,
    currentProblemId,
    saveProblem,
    updateCurrentProblem,
    updateProblem,
    ui
  } = useAppStore();
  
  const { section } = useParams<{ section: string }>();
  const activeSection = section || 'people';
  const navigate = useNavigate();


  // Form states
  const [showPersonForm, setShowPersonForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showAttributeForm, setShowAttributeForm] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editingAttribute, setEditingAttribute] = useState<AttributeDefinition | null>(null);

  // Form data
  const [personForm, setPersonForm] = useState<PersonFormData>({
    attributes: {},
    sessions: []
  });

  const [groupForm, setGroupForm] = useState<GroupFormData>({
    size: 4
  });
  const [groupFormInputs, setGroupFormInputs] = useState<{ size?: string }>({});

  const [newAttribute, setNewAttribute] = useState({ key: '', values: [''] });
  const [sessionsCount, setSessionsCount] = useState(problem?.num_sessions || 3);

  // === Objectives Helpers ===
  const getCurrentObjectiveWeight = () => {
    if (problem?.objectives && problem.objectives.length > 0) {
      return problem.objectives[0].weight;
    }
    return 1; // Default implicit objective
  };

  const objectiveCount = (() => {
    if (problem?.objectives && problem.objectives.length > 0) {
      // Count only objectives with weight > 0
      return problem.objectives.filter((o) => o.weight > 0).length;
    }
    // Implicit default objective (weight 1)
    return 1;
  })();

  // Auto-save functionality
  useEffect(() => {
    if (problem && currentProblemId) {
      // Debounced auto-save will be handled by the storage service
      updateCurrentProblem(currentProblemId, problem);
    }
  }, [problem, currentProblemId, updateCurrentProblem]);

  // Constraint form states
  const [showConstraintForm, setShowConstraintForm] = useState(false);
  const [editingConstraint, setEditingConstraint] = useState<{ constraint: Constraint; index: number } | null>(null);
  const [constraintForm, setConstraintForm] = useState<ConstraintFormState>({
    type: 'RepeatEncounter',
    penalty_weight: 1
  });

  const [showImmovableModal,setShowImmovableModal]=useState(false);
  const [editingImmovableIndex,setEditingImmovableIndex]=useState<number|null>(null);

  // New individual constraint modal states
  const [showRepeatEncounterModal, setShowRepeatEncounterModal] = useState(false);
  const [showAttributeBalanceModal, setShowAttributeBalanceModal] = useState(false);
  const [showShouldNotBeTogetherModal, setShowShouldNotBeTogetherModal] = useState(false);
  const [showShouldStayTogetherModal, setShowShouldStayTogetherModal] = useState(false);
  const [showMustStayTogetherModal, setShowMustStayTogetherModal] = useState(false);
  const [showPairMeetingCountModal, setShowPairMeetingCountModal] = useState(false);
  const [editingConstraintIndex, setEditingConstraintIndex] = useState<number | null>(null);

  // Demo data warning modal state
  const [showDemoWarningModal, setShowDemoWarningModal] = useState(false);
  const [pendingDemoCaseId, setPendingDemoCaseId] = useState<string | null>(null);
  const [pendingDemoCaseName, setPendingDemoCaseName] = useState<string | null>(null);

  // New UI state for Constraints tab
  const SOFT_TYPES = useMemo(() => ['RepeatEncounter', 'AttributeBalance', 'ShouldNotBeTogether', 'ShouldStayTogether', 'PairMeetingCount'] as const, []);
  const HARD_TYPES = useMemo(() => ['ImmovablePeople', 'MustStayTogether'] as const, []);

  type ConstraintCategory = 'soft' | 'hard';

  const [constraintCategoryTab, setConstraintCategoryTab] = useState<ConstraintCategory>('soft');

  // Ensure activeConstraintTab is always valid for current category
  const [activeConstraintTab, setActiveConstraintTab] = useState<string>(SOFT_TYPES[0]);

  useEffect(() => {
    const validTypes = (constraintCategoryTab === 'soft' ? SOFT_TYPES : HARD_TYPES) as readonly string[];
    if (!validTypes.includes(activeConstraintTab)) {
      setActiveConstraintTab(validTypes[0]);
    }
  }, [constraintCategoryTab, activeConstraintTab, SOFT_TYPES, HARD_TYPES]);

  const handleSaveProblem = () => {
    if (!problem) return;

    if (currentProblemId) {
      updateCurrentProblem(currentProblemId, problem);
      addNotification({ type: 'success', title: 'Saved', message: 'Problem saved.' });
    } else {
      const defaultName = 'Untitled Problem';
      saveProblem(defaultName);
    }
  };

  const handleLoadProblem = () => {
    // Simply open the Problem Manager modal
    setShowProblemManager(true);
  };

  const handleDemoCaseClick = (demoCaseId: string, demoCaseName: string) => {
    // Check if current problem has content
    const currentProblem = problem;
    const hasContent = currentProblem && (
      currentProblem.people.length > 0 || 
      currentProblem.groups.length > 0 || 
      currentProblem.constraints.length > 0
    );

    if (hasContent) {
      // Show warning modal
      setPendingDemoCaseId(demoCaseId);
      setPendingDemoCaseName(demoCaseName);
      setShowDemoWarningModal(true);
    } else {
      // Load directly if no content
      loadDemoCase(demoCaseId);
    }
  };

  const handleDemoOverwrite = () => {
    if (pendingDemoCaseId) {
      loadDemoCaseOverwrite(pendingDemoCaseId);
      setShowDemoWarningModal(false);
      setPendingDemoCaseId(null);
      setPendingDemoCaseName(null);
    }
  };

  const handleDemoLoadNew = () => {
    if (pendingDemoCaseId) {
      loadDemoCaseNewProblem(pendingDemoCaseId);
      setShowDemoWarningModal(false);
      setPendingDemoCaseId(null);
      setPendingDemoCaseName(null);
    }
  };

  const handleDemoCancel = () => {
    setShowDemoWarningModal(false);
    setPendingDemoCaseId(null);
    setPendingDemoCaseName(null);
  };

  const handleSessionsCountChange = (count: number | null) => {
    if (count !== null) {
      setSessionsCount(count);
      
      const updatedProblem: Problem = {
        people: problem?.people || [],
        groups: problem?.groups || [],
        num_sessions: count,
        constraints: problem?.constraints || [],
        settings: problem?.settings || getDefaultSolverSettings()
      };

      setProblem(updatedProblem);
    }
  };

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
      sessions: personForm.sessions.length > 0 ? personForm.sessions : undefined
    };

    const updatedProblem: Problem = {
      people: [...(problem?.people || []), newPerson],
      groups: problem?.groups || [],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings()
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
      sessions: person.sessions || []
    });
    setShowPersonForm(true);
  };

  const handleUpdatePerson = () => {
    if (!editingPerson || !personForm.attributes.name?.trim()) return;

    const updatedPerson: Person = {
      ...editingPerson,
      attributes: { ...personForm.attributes },
      sessions: personForm.sessions.length > 0 ? personForm.sessions : undefined
    };

    const updatedProblem: Problem = {
      people: problem?.people.map(p => p.id === editingPerson.id ? updatedPerson : p) || [],
      groups: problem?.groups || [],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings()
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
      people: problem?.people.filter(p => p.id !== personId) || [],
      groups: problem?.groups || [],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings()
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

    const idExists = problem?.groups.some(g => g.id === groupForm.id?.trim());
    if (idExists) {
      addNotification({
        type: 'error',
        title: 'Duplicate Group ID',
        message: `Group ID "${groupForm.id.trim()}" already exists`,
      });
      return;
    }

    // Validate size from input
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
      size: size
    };

    const updatedProblem: Problem = {
      people: problem?.people || [],
      groups: [...(problem?.groups || []), newGroup],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings()
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
      size: group.size
    });
    setGroupFormInputs({
      size: group.size.toString()
    });
    setShowGroupForm(true);
  };

  const handleUpdateGroup = () => {
    if (!editingGroup || !groupForm.id?.trim()) return;

    // Validate size from input
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
      size: size
    };

    const updatedProblem: Problem = {
      people: problem?.people || [],
      groups: problem?.groups.map(g => g.id === editingGroup.id ? updatedGroup : g) || [],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings()
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
      groups: problem?.groups.filter(g => g.id !== groupId) || [],
      num_sessions: problem?.num_sessions || 3,
      constraints: problem?.constraints || [],
      settings: problem?.settings || getDefaultSolverSettings()
    };

    setProblem(updatedProblem);
    
    addNotification({
      type: 'success',
      title: 'Group Removed',
      message: `Group "${groupId}" has been removed`,
    });
  };

  const handleAddAttribute = () => {
    if (!newAttribute.key.trim() || newAttribute.values.some(v => !v.trim())) {
      addNotification({
        type: 'error',
        title: 'Invalid Input',
        message: 'Please enter an attribute key and at least one value',
      });
      return;
    }

    const definition: AttributeDefinition = {
      key: newAttribute.key,
      values: newAttribute.values.filter(v => v.trim())
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
      values: [...attribute.values]
    });
    setShowAttributeForm(true);
  };

  const handleUpdateAttribute = () => {
    if (!editingAttribute || !newAttribute.key.trim() || newAttribute.values.some(v => !v.trim())) {
      addNotification({
        type: 'error',
        title: 'Invalid Input',
        message: 'Please enter an attribute key and at least one value',
      });
      return;
    }

    // Remove the old attribute and add the new one
    removeAttributeDefinition(editingAttribute.key);
    
    const updatedDefinition: AttributeDefinition = {
      key: newAttribute.key.trim(),
      values: newAttribute.values.filter(v => v.trim())
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

  const handleAddConstraint = () => {
    let newConstraint: Constraint;

    try {
      switch (constraintForm.type) {
        case 'RepeatEncounter':
          if (constraintForm.max_allowed_encounters === null || constraintForm.max_allowed_encounters === undefined || constraintForm.max_allowed_encounters < 0) {
            throw new Error('Please enter a valid maximum allowed encounters');
          }
          if (constraintForm.penalty_weight === null || constraintForm.penalty_weight === undefined || constraintForm.penalty_weight <= 0) {
            throw new Error('Please enter a valid penalty weight');
          }
          newConstraint = {
            type: 'RepeatEncounter',
            max_allowed_encounters: constraintForm.max_allowed_encounters!,
            penalty_function: constraintForm.penalty_function || 'squared',
            penalty_weight: constraintForm.penalty_weight!
          };
          break;

        case 'AttributeBalance':
          if (!constraintForm.group_id || !constraintForm.attribute_key || !constraintForm.desired_values) {
            throw new Error('Please fill in all required fields for attribute balance');
          }
          newConstraint = {
            type: 'AttributeBalance',
            group_id: constraintForm.group_id,
            attribute_key: constraintForm.attribute_key,
            desired_values: constraintForm.desired_values,
            penalty_weight: constraintForm.penalty_weight || 50,
            sessions: constraintForm.sessions?.length ? constraintForm.sessions : undefined
          };
          break;

        case 'ImmovablePeople': {
          if (!constraintForm.people?.length || !constraintForm.group_id) {
            throw new Error('Please select at least one person and a fixed group');
          }
          // If no sessions selected, apply to all sessions
          const allSessions = Array.from({ length: sessionsCount ?? 3 }, (_, i) => i);
          const immovableSessions = constraintForm.sessions?.length ? constraintForm.sessions : allSessions;
          newConstraint = {
            type: 'ImmovablePeople',
            people: constraintForm.people,
            group_id: constraintForm.group_id,
            sessions: immovableSessions
          };
          break;
        }

        case 'MustStayTogether':
        case 'ShouldNotBeTogether':
          if (!constraintForm.people?.length || constraintForm.people.length < 2) {
            throw new Error('Please select at least 2 people');
          }
          newConstraint =
            constraintForm.type === 'MustStayTogether'
              ? {
                  type: 'MustStayTogether',
                  people: constraintForm.people,
                  sessions: constraintForm.sessions?.length ? constraintForm.sessions : undefined,
                }
              : {
                  type: 'ShouldNotBeTogether',
                  people: constraintForm.people,
                  penalty_weight: constraintForm.penalty_weight || 1000,
                  sessions: constraintForm.sessions?.length ? constraintForm.sessions : undefined,
                };
          break;

        default:
          throw new Error('Invalid constraint type');
      }

      const updatedProblem: Problem = {
        ...problem!,
        constraints: [...(problem?.constraints || []), newConstraint]
      };

      setProblem(updatedProblem);
      setConstraintForm({ type: 'RepeatEncounter', penalty_weight: 1 });
      setShowConstraintForm(false);
      
      addNotification({
        type: 'success',
        title: 'Constraint Added',
        message: `${constraintForm.type} constraint has been added`,
      });
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Invalid Input',
        message: error instanceof Error ? error.message : 'Please check your input',
      });
    }
  };

  const handleEditConstraint = (constraint: Constraint, index: number) => {
    setEditingConstraint({ constraint, index });
    
    // Extract fields based on constraint type
    switch (constraint.type) {
      case 'RepeatEncounter':
        setConstraintForm({
          type: constraint.type,
          max_allowed_encounters: constraint.max_allowed_encounters,
          penalty_function: constraint.penalty_function,
          penalty_weight: constraint.penalty_weight
        });
        break;
      case 'AttributeBalance':
        setConstraintForm({
          type: constraint.type,
          group_id: constraint.group_id,
          attribute_key: constraint.attribute_key,
          desired_values: constraint.desired_values,
          penalty_weight: constraint.penalty_weight,
          sessions: constraint.sessions
        });
        break;
      case 'ImmovablePeople':
        setConstraintForm({
          type: constraint.type,
          people: constraint.people,
          group_id: constraint.group_id,
          sessions: constraint.sessions,
          penalty_weight: undefined // ImmovablePeople doesn't have penalty_weight
        });
        break;
      case 'MustStayTogether':
        setConstraintForm({
          type: 'MustStayTogether',
          people: constraint.people,
          sessions: constraint.sessions,
          penalty_weight: undefined,
        });
        break;
      case 'ShouldNotBeTogether':
        setConstraintForm({
          type: 'ShouldNotBeTogether',
          people: constraint.people,
          sessions: constraint.sessions,
          penalty_weight: constraint.penalty_weight,
        });
        break;
    }
    
    setShowConstraintForm(true);
  };

  const handleUpdateConstraint = () => {
    if (!editingConstraint) return;

    try {
      let updatedConstraint: Constraint;

      switch (constraintForm.type) {
        case 'RepeatEncounter':
          if (!constraintForm.max_allowed_encounters || constraintForm.max_allowed_encounters < 0) {
            throw new Error('Please enter a valid maximum allowed encounters');
          }
          updatedConstraint = {
            type: 'RepeatEncounter',
            max_allowed_encounters: constraintForm.max_allowed_encounters,
            penalty_function: constraintForm.penalty_function || 'squared',
            penalty_weight: constraintForm.penalty_weight || 1
          };
          break;

        case 'AttributeBalance':
          if (!constraintForm.group_id || !constraintForm.attribute_key || !constraintForm.desired_values) {
            throw new Error('Please fill in all required fields for attribute balance');
          }
          updatedConstraint = {
            type: 'AttributeBalance',
            group_id: constraintForm.group_id,
            attribute_key: constraintForm.attribute_key,
            desired_values: constraintForm.desired_values,
            penalty_weight: constraintForm.penalty_weight || 50,
            sessions: constraintForm.sessions?.length ? constraintForm.sessions : undefined
          };
          break;

        case 'ImmovablePeople': {
          if (!constraintForm.people?.length || !constraintForm.group_id) {
            throw new Error('Please select at least one person and a fixed group');
          }
          // If no sessions selected, apply to all sessions
          const allUpdateSessions = Array.from({ length: sessionsCount }, (_, i) => i);
          const immovableUpdateSessions = constraintForm.sessions?.length ? constraintForm.sessions : allUpdateSessions;
          updatedConstraint = {
            type: 'ImmovablePeople',
            people: constraintForm.people,
            group_id: constraintForm.group_id,
            sessions: immovableUpdateSessions
          };
          break;
        }

        case 'MustStayTogether':
        case 'ShouldNotBeTogether':
          if (!constraintForm.people?.length || constraintForm.people.length < 2) {
            throw new Error('Please select at least 2 people');
          }
          updatedConstraint =
            constraintForm.type === 'MustStayTogether'
              ? {
                  type: 'MustStayTogether',
                  people: constraintForm.people,
                  sessions: constraintForm.sessions?.length ? constraintForm.sessions : undefined,
                }
              : {
                  type: 'ShouldNotBeTogether',
                  people: constraintForm.people,
                  penalty_weight: constraintForm.penalty_weight || 1000,
                  sessions: constraintForm.sessions?.length ? constraintForm.sessions : undefined,
                };
          break;

        default:
          throw new Error('Invalid constraint type');
      }

      const updatedConstraints = [...(problem?.constraints || [])];
      updatedConstraints[editingConstraint.index] = updatedConstraint;

      const updatedProblem: Problem = {
        ...problem!,
        constraints: updatedConstraints
      };

      setProblem(updatedProblem);
      setEditingConstraint(null);
      setConstraintForm({ type: 'RepeatEncounter', penalty_weight: 1 });
      setShowConstraintForm(false);
      
      addNotification({
        type: 'success',
        title: 'Constraint Updated',
        message: `${constraintForm.type} constraint has been updated`,
      });
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Invalid Input',
        message: error instanceof Error ? error.message : 'Please check your input',
      });
    }
  };

  const handleDeleteConstraint = (index: number) => {
    const updatedConstraints = problem?.constraints.filter((_, i) => i !== index) || [];
    const updatedProblem: Problem = {
      ...problem!,
      constraints: updatedConstraints
    };

    setProblem(updatedProblem);
    
    addNotification({
      type: 'success',
      title: 'Constraint Removed',
      message: 'Constraint has been removed',
    });
  };


  // Bulk add dropdown & modal states
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkTextMode, setBulkTextMode] = useState<'text' | 'grid'>('text');
  const [bulkCsvInput, setBulkCsvInput] = useState('');
  const [bulkHeaders, setBulkHeaders] = useState<string[]>([]);
  const [bulkRows, setBulkRows] = useState<Record<string, string>[]>([]);

  // Bulk update modal state
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
    // reset value so same file can be selected again
    e.target.value = '';
  };

  const handleAddBulkPeople = () => {
    if (!bulkHeaders.includes('name')) {
      addNotification({ type: 'error', title: 'Missing Column', message: 'CSV must include a "name" column.' });
      return;
    }

    const newPeople: Person[] = bulkRows.map((row) => {
      const personAttrs: Record<string, string> = {};
      bulkHeaders.forEach(h => {
        if (row[h]) personAttrs[h] = row[h];
      });
      if (!personAttrs.name) personAttrs.name = `Person ${Date.now()}`;
      return {
        id: generateUniquePersonId(),
        attributes: personAttrs,
        sessions: undefined,
      };
    });

    // Collect new attribute definitions
    const attrValueMap: Record<string, Set<string>> = {};
    bulkHeaders.forEach(h => {
      if (h === 'name') return;
      attrValueMap[h] = new Set();
    });
    newPeople.forEach(p => {
      Object.entries(p.attributes).forEach(([k, v]) => {
        if (k !== 'name') attrValueMap[k]?.add(v);
      });
    });
    Object.entries(attrValueMap).forEach(([key, valSet]) => {
      const existing = attributeDefinitions.find(def => def.key === key);
      const newValues = Array.from(valSet);
      if (!existing) {
        addAttributeDefinition({ key, values: newValues });
      } else {
        const merged = Array.from(new Set([...existing.values, ...newValues]));
        // Replace definition only if new values were added
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
      settings: problem?.settings || getDefaultSolverSettings()
    };
    setProblem(updatedProblem);
    setShowBulkForm(false);
    setBulkCsvInput('');
    setBulkHeaders([]);
    setBulkRows([]);

    addNotification({ type: 'success', title: 'People Added', message: `${newPeople.length} people added.` });
  };

  // === Bulk Update Helpers & Modal ===
  const buildPeopleCsvFromCurrent = (): { headers: string[]; rows: Record<string, string>[] } => {
    const people = problem?.people || [];
    const headerSet = new Set<string>(['id', 'name']);
    people.forEach(p => {
      Object.keys(p.attributes || {}).forEach(k => {
        if (k !== 'name') headerSet.add(k);
      });
    });
    attributeDefinitions.forEach(def => {
      if (def.key !== 'name') headerSet.add(def.key);
    });
    const headers = Array.from(headerSet);
    const rows: Record<string, string>[] = people.map(p => {
      const row: Record<string, string> = {};
      headers.forEach(h => {
        if (h === 'id') row[h] = p.id;
        else if (h === 'name') row[h] = (p.attributes && p.attributes['name']) || '';
        else row[h] = (p.attributes && (p.attributes[h] ?? '')) as string;
      });
      return row;
    });
    return { headers, rows };
  };

  const openBulkUpdateForm = () => {
    const { headers, rows } = buildPeopleCsvFromCurrent();
    setBulkUpdateHeaders(headers);
    setBulkUpdateRows(rows);
    setBulkUpdateCsvInput(rowsToCsv(headers, rows));
    setBulkUpdateTextMode('grid');
    setShowBulkUpdateForm(true);
  };

  const openBulkAddForm = () => {
    setBulkCsvInput('');
    setBulkHeaders([]);
    setBulkRows([]);
    setBulkTextMode('text');
    setShowBulkForm(true);
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
    const existingById = new Map<string, Person>(existingPeople.map(p => [p.id, p]));
    const usedIds = new Set<string>(existingPeople.map(p => p.id));
    const updatedById = new Map<string, Person>();
    existingPeople.forEach(p => updatedById.set(p.id, { ...p, attributes: { ...p.attributes } }));

    const newPeopleToAdd: Person[] = [];
    rows.forEach((row) => {
      const rawId = (row['id'] || '').trim();
      const isExisting = rawId && existingById.has(rawId);
      if (isExisting) {
        const person = updatedById.get(rawId)!;
        headers.forEach(h => {
          if (h === 'id') return;
          const val = (row[h] ?? '').trim();
          if (val === '__DELETE__') {
            if (h in person.attributes) delete person.attributes[h];
          } else if (val.length > 0) {
            person.attributes[h] = val;
          }
        });
        updatedById.set(rawId, person);
      } else {
        const hasAnyData = headers.some(h => h !== 'id' && (row[h] ?? '').trim().length > 0);
        if (!hasAnyData) return;
        let newId = rawId;
        if (!newId || usedIds.has(newId)) {
          newId = generateUniquePersonId();
        }
        usedIds.add(newId);
        const attributes: Record<string, string> = {};
        headers.forEach(h => {
          if (h === 'id') return;
          const val = (row[h] ?? '').trim();
          if (val.length > 0) attributes[h] = val;
        });
        newPeopleToAdd.push({ id: newId, attributes, sessions: undefined });
      }
    });

    const updatedPeople = Array.from(updatedById.values());
    const finalPeople: Person[] = [...updatedPeople, ...newPeopleToAdd];

    const attrValueMap: Record<string, Set<string>> = {};
    const allKeys = new Set<string>();
    finalPeople.forEach(p => {
      Object.entries(p.attributes || {}).forEach(([k, v]) => {
        if (k === 'name') return;
        if (!attrValueMap[k]) attrValueMap[k] = new Set<string>();
        if (typeof v === 'string' && v.length > 0) attrValueMap[k].add(v);
        allKeys.add(k);
      });
    });
    headers.forEach(h => { if (h !== 'id' && h !== 'name') allKeys.add(h); });

    allKeys.forEach(key => {
      const existing = attributeDefinitions.find(def => def.key === key);
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
      settings: problem?.settings || getDefaultSolverSettings()
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
    // reset value so same file can be selected again
    e.target.value = '';
  };

  const handleAddGroupBulkPeople = () => {
    if (!groupBulkHeaders.includes('id')) {
      addNotification({ type: 'error', title: 'Missing Column', message: 'CSV must include an "id" column.' });
      return;
    }

    // Validate and build groups, collecting duplicates
    const existingIds = new Set((problem?.groups || []).map(g => g.id));
    const newGroups: Group[] = [];
    const duplicateIds: string[] = [];
    groupBulkRows.forEach((row, idx) => {
      const rawId = row['id'] ?? row['group'] ?? `Group_${Date.now()}_${idx}`;
      const id = rawId.trim();
      const sizeVal = (row['size'] ?? row['capacity'] ?? '').trim();
      const size = parseInt(sizeVal) || 4;
      if (existingIds.has(id) || newGroups.some(g => g.id === id)) {
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

    // Collect new attribute definitions
    const attrValueMap: Record<string, Set<string>> = {};
    groupBulkHeaders.forEach(h => {
      if (h === 'id') return;
      attrValueMap[h] = new Set();
    });
    newGroups.forEach(g => {
      Object.entries(g).forEach(([k, v]) => {
        if (k !== 'id') attrValueMap[k]?.add(v);
      });
    });
    Object.entries(attrValueMap).forEach(([key, valSet]) => {
      const existing = attributeDefinitions.find(def => def.key === key);
      const newValues = Array.from(valSet);
      if (!existing) {
        addAttributeDefinition({ key, values: newValues });
      } else {
        const merged = Array.from(new Set([...existing.values, ...newValues]));
        // Replace definition only if new values were added
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
      settings: problem?.settings || getDefaultSolverSettings()
    };
    setProblem(updatedProblem);
    setShowGroupBulkForm(false);
    setGroupBulkCsvInput('');
    setGroupBulkHeaders([]);
    setGroupBulkRows([]);

    addNotification({ type: 'success', title: 'Groups Added', message: `${newGroups.length} groups added.` });
  };

  // Don't render until loading is complete to avoid creating new problems
  if (ui.isLoading) {
    return <div className="animate-fade-in">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <ProblemEditorHeader
        onLoadProblem={handleLoadProblem}
        onSaveProblem={handleSaveProblem}
        onDemoCaseClick={handleDemoCaseClick}
      />

      {/* Navigation */}
      <ProblemEditorTabs
        activeSection={activeSection}
        problem={problem ?? null}
        objectiveCount={objectiveCount}
        onNavigate={(sectionId) => navigate(`/app/problem/${sectionId}`)}
      />

      {/* Content */}
      {activeSection === 'people' && (
        <PeopleSection
          problem={problem ?? null}
          attributeDefinitions={attributeDefinitions}
          sessionsCount={sessionsCount}
          onAddAttribute={() => setShowAttributeForm(true)}
          onEditAttribute={handleEditAttribute}
          onRemoveAttribute={removeAttributeDefinition}
          onAddPerson={() => setShowPersonForm(true)}
          onEditPerson={handleEditPerson}
          onDeletePerson={handleDeletePerson}
          onOpenBulkAddForm={openBulkAddForm}
          onOpenBulkUpdateForm={openBulkUpdateForm}
          onTriggerCsvUpload={() => csvFileInputRef.current?.click()}
          onTriggerExcelImport={() => addNotification({ type: 'info', title: 'Coming Soon', message: 'Excel import is not yet implemented.' })}
        />
      )}

      {activeSection === 'groups' && (
        <GroupsSection
          problem={problem ?? null}
          onAddGroup={() => setShowGroupForm(true)}
          onEditGroup={handleEditGroup}
          onDeleteGroup={handleDeleteGroup}
          onOpenBulkAddForm={openGroupBulkForm}
          onTriggerCsvUpload={() => groupCsvFileInputRef.current?.click()}
        />
      )}

      {activeSection === 'sessions' && (
        <SessionsSection
          sessionsCount={sessionsCount}
          onChangeSessionsCount={handleSessionsCountChange}
        />
      )}

      {activeSection === 'objectives' && (
        <ObjectivesSection
          currentWeight={getCurrentObjectiveWeight()}
          onCommit={(newWeight) => {
            if (!problem) return;
            const newObjectives = [
              {
                type: 'maximize_unique_contacts',
                weight: newWeight,
              },
            ];
            updateProblem({ objectives: newObjectives });
          }}
        />
      )}

      {activeSection === 'hard' && (
        <HardConstraintsSection
          onAdd={(type) => {
            if (type === 'ImmovablePeople') {
              setEditingImmovableIndex(null);
              setShowImmovableModal(true);
            } else if (type === 'MustStayTogether') {
              setEditingConstraintIndex(null);
              setShowMustStayTogetherModal(true);
            } else {
              setConstraintForm((prev) => ({ ...prev, type }));
              setShowConstraintForm(true);
            }
          }}
          onEdit={(c, i) => {
            if (c.type === 'ImmovablePeople') {
              setEditingImmovableIndex(i);
              setShowImmovableModal(true);
            } else if (c.type === 'MustStayTogether') {
              setEditingConstraintIndex(i);
              setShowMustStayTogetherModal(true);
            } else {
              handleEditConstraint(c, i);
            }
          }}
          onDelete={handleDeleteConstraint}
        />
      )}

      {activeSection === 'soft' && (
        <SoftConstraintsSection
          onAdd={(type) => {
            setEditingConstraintIndex(null);
            switch (type) {
              case 'RepeatEncounter':
                setShowRepeatEncounterModal(true);
                break;
              case 'AttributeBalance':
                setShowAttributeBalanceModal(true);
                break;
              case 'ShouldNotBeTogether':
                setShowShouldNotBeTogetherModal(true);
                break;
              case 'ShouldStayTogether':
                setShowShouldStayTogetherModal(true);
                break;
              case 'PairMeetingCount':
                setShowPairMeetingCountModal(true);
                break;
              default:
                setConstraintForm((prev) => ({ ...prev, type }));
                setShowConstraintForm(true);
            }
          }}
          onEdit={(c, i) => {
            setEditingConstraintIndex(i);
            switch (c.type) {
              case 'RepeatEncounter':
                setShowRepeatEncounterModal(true);
                break;
              case 'AttributeBalance':
                setShowAttributeBalanceModal(true);
                break;
              case 'ShouldNotBeTogether':
                setShowShouldNotBeTogetherModal(true);
                break;
              case 'ShouldStayTogether':
                setShowShouldStayTogetherModal(true);
                break;
              case 'PairMeetingCount':
                setShowPairMeetingCountModal(true);
                break;
              default:
                handleEditConstraint(c, i);
            }
          }}
          onDelete={handleDeleteConstraint}
        />
      )}

      {activeSection === 'constraints' && (
        <ConstraintsSection
          problem={problem ?? null}
          activeConstraintTab={activeConstraintTab}
          constraintCategoryTab={constraintCategoryTab}
          hardTypes={HARD_TYPES}
          softTypes={SOFT_TYPES}
          onChangeCategory={setConstraintCategoryTab}
          onChangeTab={setActiveConstraintTab}
          onAddConstraint={() => setShowConstraintForm(true)}
          onEditConstraint={handleEditConstraint}
          onDeleteConstraint={handleDeleteConstraint}
        />
      )}

      {/* Forms */}
      <ProblemEditorForms
        showPersonForm={showPersonForm}
        editingPerson={editingPerson}
        personForm={personForm}
        setPersonForm={setPersonForm}
        attributeDefinitions={attributeDefinitions}
        sessionsCount={sessionsCount}
        onSavePerson={handleAddPerson}
        onUpdatePerson={handleUpdatePerson}
        onCancelPerson={() => {
          setShowPersonForm(false);
          setEditingPerson(null);
          setPersonForm({ attributes: {}, sessions: [] });
        }}
        onShowAttributeForm={() => setShowAttributeForm(true)}
        showGroupForm={showGroupForm}
        editingGroup={editingGroup}
        groupForm={groupForm}
        setGroupForm={setGroupForm}
        groupFormInputs={groupFormInputs}
        setGroupFormInputs={setGroupFormInputs}
        onSaveGroup={handleAddGroup}
        onUpdateGroup={handleUpdateGroup}
        onCancelGroup={() => {
          setShowGroupForm(false);
          setEditingGroup(null);
          setGroupForm({ size: 4 });
          setGroupFormInputs({});
        }}
        showAttributeForm={showAttributeForm}
        editingAttribute={editingAttribute}
        newAttribute={newAttribute}
        setNewAttribute={setNewAttribute}
        onSaveAttribute={handleAddAttribute}
        onUpdateAttribute={handleUpdateAttribute}
        onCancelAttribute={() => {
          setShowAttributeForm(false);
          setNewAttribute({ key: '', values: [''] });
          setEditingAttribute(null);
        }}
        showBulkForm={showBulkForm}
        bulkTextMode={bulkTextMode}
        setBulkTextMode={setBulkTextMode}
        bulkCsvInput={bulkCsvInput}
        setBulkCsvInput={setBulkCsvInput}
        bulkHeaders={bulkHeaders}
        setBulkHeaders={setBulkHeaders}
        bulkRows={bulkRows}
        setBulkRows={setBulkRows}
        onSaveBulkPeople={handleAddBulkPeople}
        onCloseBulkPeople={() => setShowBulkForm(false)}
        showBulkUpdateForm={showBulkUpdateForm}
        bulkUpdateTextMode={bulkUpdateTextMode}
        setBulkUpdateTextMode={setBulkUpdateTextMode}
        bulkUpdateCsvInput={bulkUpdateCsvInput}
        setBulkUpdateCsvInput={setBulkUpdateCsvInput}
        bulkUpdateHeaders={bulkUpdateHeaders}
        setBulkUpdateHeaders={setBulkUpdateHeaders}
        bulkUpdateRows={bulkUpdateRows}
        setBulkUpdateRows={setBulkUpdateRows}
        onRefreshBulkUpdate={() => {
          const { headers, rows } = buildPeopleCsvFromCurrent();
          setBulkUpdateHeaders(headers);
          setBulkUpdateRows(rows);
          setBulkUpdateCsvInput(rowsToCsv(headers, rows));
        }}
        onApplyBulkUpdate={handleApplyBulkUpdate}
        onCloseBulkUpdate={() => setShowBulkUpdateForm(false)}
        showGroupBulkForm={showGroupBulkForm}
        groupBulkTextMode={groupBulkTextMode}
        setGroupBulkTextMode={setGroupBulkTextMode}
        groupBulkCsvInput={groupBulkCsvInput}
        setGroupBulkCsvInput={setGroupBulkCsvInput}
        groupBulkHeaders={groupBulkHeaders}
        setGroupBulkHeaders={setGroupBulkHeaders}
        groupBulkRows={groupBulkRows}
        setGroupBulkRows={setGroupBulkRows}
        onSaveGroupBulk={handleAddGroupBulkPeople}
        onCloseGroupBulk={() => setShowGroupBulkForm(false)}
        csvFileInputRef={csvFileInputRef}
        onCsvFileSelected={handleCsvFileSelected}
        groupCsvFileInputRef={groupCsvFileInputRef}
        onGroupCsvFileSelected={handleGroupCsvFileSelected}
      />
      <ConstraintFormModal
        isOpen={showConstraintForm}
        isEditing={editingConstraint !== null}
        constraintForm={constraintForm}
        setConstraintForm={setConstraintForm}
        problem={problem ?? null}
        attributeDefinitions={attributeDefinitions}
        sessionsCount={sessionsCount}
        onAdd={handleAddConstraint}
        onUpdate={handleUpdateConstraint}
        onClose={() => {
          setShowConstraintForm(false);
          setEditingConstraint(null);
          setConstraintForm({ type: 'RepeatEncounter', penalty_weight: 1 });
        }}
      />
      <ProblemEditorConstraintModals
        problem={problem ?? null}
        sessionsCount={sessionsCount}
        getProblem={GetProblem}
        setProblem={setProblem}
        showImmovableModal={showImmovableModal}
        setShowImmovableModal={setShowImmovableModal}
        editingImmovableIndex={editingImmovableIndex}
        setEditingImmovableIndex={setEditingImmovableIndex}
        showRepeatEncounterModal={showRepeatEncounterModal}
        setShowRepeatEncounterModal={setShowRepeatEncounterModal}
        showAttributeBalanceModal={showAttributeBalanceModal}
        setShowAttributeBalanceModal={setShowAttributeBalanceModal}
        showShouldNotBeTogetherModal={showShouldNotBeTogetherModal}
        setShowShouldNotBeTogetherModal={setShowShouldNotBeTogetherModal}
        showShouldStayTogetherModal={showShouldStayTogetherModal}
        setShowShouldStayTogetherModal={setShowShouldStayTogetherModal}
        showMustStayTogetherModal={showMustStayTogetherModal}
        setShowMustStayTogetherModal={setShowMustStayTogetherModal}
        showPairMeetingCountModal={showPairMeetingCountModal}
        setShowPairMeetingCountModal={setShowPairMeetingCountModal}
        editingConstraintIndex={editingConstraintIndex}
        setEditingConstraintIndex={setEditingConstraintIndex}
      />

      {/* Demo Data Warning Modal */}
      <DemoDataWarningModal
        isOpen={showDemoWarningModal}
        onClose={handleDemoCancel}
        onOverwrite={handleDemoOverwrite}
        onLoadNew={handleDemoLoadNew}
        demoCaseName={pendingDemoCaseName || 'Demo Case'}
      />
    </div>
  );
} 
