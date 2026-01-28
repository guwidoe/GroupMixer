import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import type { Person, Group, Constraint, Problem, PersonFormData, GroupFormData, AttributeDefinition, SolverSettings } from '../types';

// Extracted components from ProblemEditor directory
import {
  getDefaultSolverSettings,
  generateUniquePersonId,
} from './ProblemEditor/helpers';
import { ProblemEditorForms } from './ProblemEditor/ProblemEditorForms';
import { useProblemEditorBulk } from './ProblemEditor/hooks/useProblemEditorBulk';
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


  const bulk = useProblemEditorBulk({
    problem,
    attributeDefinitions,
    addAttributeDefinition,
    removeAttributeDefinition,
    addNotification,
    setProblem,
  });

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
          onOpenBulkAddForm={bulk.openBulkAddForm}
          onOpenBulkUpdateForm={bulk.openBulkUpdateForm}
          onTriggerCsvUpload={() => bulk.csvFileInputRef.current?.click()}
          onTriggerExcelImport={() => addNotification({ type: 'info', title: 'Coming Soon', message: 'Excel import is not yet implemented.' })}
        />
      )}

      {activeSection === 'groups' && (
        <GroupsSection
          problem={problem ?? null}
          onAddGroup={() => setShowGroupForm(true)}
          onEditGroup={handleEditGroup}
          onDeleteGroup={handleDeleteGroup}
          onOpenBulkAddForm={bulk.openGroupBulkForm}
          onTriggerCsvUpload={() => bulk.groupCsvFileInputRef.current?.click()}
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
        showBulkForm={bulk.showBulkForm}
        bulkTextMode={bulk.bulkTextMode}
        setBulkTextMode={bulk.setBulkTextMode}
        bulkCsvInput={bulk.bulkCsvInput}
        setBulkCsvInput={bulk.setBulkCsvInput}
        bulkHeaders={bulk.bulkHeaders}
        setBulkHeaders={bulk.setBulkHeaders}
        bulkRows={bulk.bulkRows}
        setBulkRows={bulk.setBulkRows}
        onSaveBulkPeople={bulk.handleAddBulkPeople}
        onCloseBulkPeople={() => bulk.setShowBulkForm(false)}
        showBulkUpdateForm={bulk.showBulkUpdateForm}
        bulkUpdateTextMode={bulk.bulkUpdateTextMode}
        setBulkUpdateTextMode={bulk.setBulkUpdateTextMode}
        bulkUpdateCsvInput={bulk.bulkUpdateCsvInput}
        setBulkUpdateCsvInput={bulk.setBulkUpdateCsvInput}
        bulkUpdateHeaders={bulk.bulkUpdateHeaders}
        setBulkUpdateHeaders={bulk.setBulkUpdateHeaders}
        bulkUpdateRows={bulk.bulkUpdateRows}
        setBulkUpdateRows={bulk.setBulkUpdateRows}
        onRefreshBulkUpdate={bulk.refreshBulkUpdateFromCurrent}
        onApplyBulkUpdate={bulk.handleApplyBulkUpdate}
        onCloseBulkUpdate={() => bulk.setShowBulkUpdateForm(false)}
        showGroupBulkForm={bulk.showGroupBulkForm}
        groupBulkTextMode={bulk.groupBulkTextMode}
        setGroupBulkTextMode={bulk.setGroupBulkTextMode}
        groupBulkCsvInput={bulk.groupBulkCsvInput}
        setGroupBulkCsvInput={bulk.setGroupBulkCsvInput}
        groupBulkHeaders={bulk.groupBulkHeaders}
        setGroupBulkHeaders={bulk.setGroupBulkHeaders}
        groupBulkRows={bulk.groupBulkRows}
        setGroupBulkRows={bulk.setGroupBulkRows}
        onSaveGroupBulk={bulk.handleAddGroupBulkPeople}
        onCloseGroupBulk={() => bulk.setShowGroupBulkForm(false)}
        csvFileInputRef={bulk.csvFileInputRef}
        onCsvFileSelected={bulk.handleCsvFileSelected}
        groupCsvFileInputRef={bulk.groupCsvFileInputRef}
        onGroupCsvFileSelected={bulk.handleGroupCsvFileSelected}
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
