import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Users, Calendar, Settings, Plus, Save, Upload, Trash2, Edit, X, Zap, Hash, Clock, ChevronDown, ChevronRight, Tag, BarChart3, ArrowUpDown, Table, Lock } from 'lucide-react';
import type { Person, Group, Constraint, Problem, PersonFormData, GroupFormData, AttributeDefinition, SolverSettings } from '../types';

// Extracted components from ProblemEditor directory
import {
  getDefaultSolverSettings,
  parseCsv,
  rowsToCsv,
  generateUniquePersonId,
} from './ProblemEditor/helpers';
import type { DemoCaseWithMetrics, AttributeBalanceConstraint } from './ProblemEditor/types';
import { PersonForm, GroupForm, AttributeForm } from './ProblemEditor/forms';
import { BulkAddPeopleForm, BulkUpdatePeopleForm, BulkAddGroupsForm } from './ProblemEditor/bulk';
import ObjectiveWeightEditor from './ProblemEditor/ObjectiveWeightEditor';
import PersonCard from './PersonCard';
import HardConstraintsPanel from './constraints/HardConstraintsPanel';
import SoftConstraintsPanel from './constraints/SoftConstraintsPanel';
import ImmovablePeopleModal from './modals/ImmovablePeopleModal';
import RepeatEncounterModal from './modals/RepeatEncounterModal';
import AttributeBalanceModal from './modals/AttributeBalanceModal';
import ShouldNotBeTogetherModal from './modals/ShouldNotBeTogetherModal';
import ShouldStayTogetherModal from './modals/ShouldStayTogetherModal';
import MustStayTogetherModal from './modals/MustStayTogetherModal';
import PairMeetingCountModal from './modals/PairMeetingCountModal';
import AttributeBalanceDashboard from './AttributeBalanceDashboard';
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
    demoDropdownOpen,
    setDemoDropdownOpen,
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

  const [showAttributesSection, setShowAttributesSection] = useState(false);
  const [peopleViewMode, setPeopleViewMode] = useState<'grid' | 'list'>('grid');
  const [peopleSortBy, setPeopleSortBy] = useState<'name' | 'sessions'>('name');
  const [peopleSortOrder, setPeopleSortOrder] = useState<'asc' | 'desc'>('asc');
  const [peopleSearch, setPeopleSearch] = useState('');

  // Auto-expand attributes section when there are no attributes defined
  useEffect(() => {
    if (attributeDefinitions.length === 0 && activeSection === 'people') {
      setShowAttributesSection(true);
    }
  }, [attributeDefinitions.length, activeSection]);
  
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
  const [sessionsFormInputs, setSessionsFormInputs] = useState<{ count?: string }>({});

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

  // Demo dropdown refs & positioning helpers
  const demoDropdownRef = useRef<HTMLDivElement>(null); // wraps the trigger button
  const dropdownMenuRef = useRef<HTMLDivElement>(null); // portal menu element
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  
  // Demo cases with metrics state
  const [demoCasesWithMetrics, setDemoCasesWithMetrics] = useState<DemoCaseWithMetrics[]>([]);
  const [loadingDemoMetrics, setLoadingDemoMetrics] = useState(false);

  // Load demo cases with metrics when dropdown is opened
  useEffect(() => {
    if (demoDropdownOpen && demoCasesWithMetrics.length === 0 && !loadingDemoMetrics) {
      setLoadingDemoMetrics(true);
      // Dynamic import to enable code splitting (avoids static + dynamic import warning)
      import('../services/demoDataService')
        .then(module => module.loadDemoCasesWithMetrics())
        .then(cases => {
          setDemoCasesWithMetrics(cases);
        })
        .catch(error => {
          console.error('Failed to load demo cases with metrics:', error);
          addNotification({
            type: 'error',
            title: 'Demo Cases Load Failed',
            message: 'Failed to load demo case metrics',
          });
        })
        .finally(() => {
          setLoadingDemoMetrics(false);
        });
    }
  }, [demoDropdownOpen, demoCasesWithMetrics.length, loadingDemoMetrics, addNotification]);

  // When dropdown opens, calculate its viewport position (20rem wide → 320px)
  useEffect(() => {
    if (demoDropdownOpen && demoDropdownRef.current) {
      const rect = demoDropdownRef.current.getBoundingClientRect();
      const dropdownWidth = 320;
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4, // 4px gap (mt-1)
        left: rect.right - dropdownWidth + window.scrollX,
      });
    }
  }, [demoDropdownOpen]);

  // Click outside to close demo dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        demoDropdownRef.current &&
        !demoDropdownRef.current.contains(target) &&
        dropdownMenuRef.current &&
        !dropdownMenuRef.current.contains(target)
      ) {
        setDemoDropdownOpen(false);
      }
    };

    if (demoDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [demoDropdownOpen, setDemoDropdownOpen]);

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
  const [constraintForm, setConstraintForm] = useState<{
    type: Constraint['type'];
    // RepeatEncounter
    max_allowed_encounters?: number;
    penalty_function?: 'linear' | 'squared';
    penalty_weight?: number;
    // AttributeBalance  
    group_id?: string;
    attribute_key?: string;
    desired_values?: Record<string, number>;
    // ImmovablePerson
    person_id?: string;
    // MustStayTogether / ShouldNotBeTogether
    people?: string[];
    sessions?: number[];
  }>({
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
  const [showConstraintInfo, setShowConstraintInfo] = useState<boolean>(false);
  const [showSessionsInfo, setShowSessionsInfo] = useState<boolean>(false);
  const [showObjectivesInfo, setShowObjectivesInfo] = useState<boolean>(false);

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

  const handleDemoCaseClick = (demoCaseId: string) => {
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
    }
  };

  const handleDemoLoadNew = () => {
    if (pendingDemoCaseId) {
      loadDemoCaseNewProblem(pendingDemoCaseId);
      setShowDemoWarningModal(false);
      setPendingDemoCaseId(null);
    }
  };

  const handleDemoCancel = () => {
    setShowDemoWarningModal(false);
    setPendingDemoCaseId(null);
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

  const sortPeople = (people: Person[]) => {
    return [...people].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      if (peopleSortBy === 'name') {
        aValue = (a.attributes.name || a.id).toLowerCase();
        bValue = (b.attributes.name || b.id).toLowerCase();
      } else if (peopleSortBy === 'sessions') {
        aValue = a.sessions ? a.sessions.length : sessionsCount;
        bValue = b.sessions ? b.sessions.length : sessionsCount;
      } else {
        return 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return peopleSortOrder === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return peopleSortOrder === 'asc' 
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      }
    });
  };

  const handleSortToggle = (sortBy: 'name' | 'sessions') => {
    if (peopleSortBy === sortBy) {
      setPeopleSortOrder(peopleSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setPeopleSortBy(sortBy);
      setPeopleSortOrder('asc');
    }
  };

  const renderPersonCard = (person: Person) => {
    const displayName = person.attributes.name || person.id;
    const sessionText = person.sessions 
      ? `Sessions: ${person.sessions.map(s => s + 1).join(', ')}`
      : 'All sessions';

    return (
              <div key={person.id} className="rounded-lg border p-4 hover:shadow-md transition-all" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
              <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{displayName}</h4>
            <div className="space-y-1">
              <p className="text-sm flex items-center gap-1" style={{ color: 'var(--color-accent)' }}>
                <Clock className="w-3 h-3" />
                {sessionText}
              </p>
              {Object.entries(person.attributes).map(([key, value]) => {
                if (key === 'name') return null;
                return (
                  <div key={key} className="flex items-center gap-1 text-xs">
                    <Tag className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{key}:</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{value}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => handleEditPerson(person)}
              className="p-1 transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-accent)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDeletePerson(person.id)}
              className="p-1 transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-error-600)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPeopleGrid = () => {
    if (!problem?.people.length) {
      return (
        <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
          <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p>No people added yet</p>
          <p className="text-sm">
            {attributeDefinitions.length === 0 
              ? "Consider defining attributes first, then add people to get started"
              : "Add people to get started with your optimization problem"
            }
          </p>
        </div>
      );
    }

    const searchValue = peopleSearch.trim().toLowerCase();
    const basePeople = problem.people;
    const filteredPeople = searchValue
      ? basePeople.filter(p => {
          const name = (p.attributes?.name || '').toString().toLowerCase();
          const id = p.id.toLowerCase();
          return name.includes(searchValue) || id.includes(searchValue);
        })
      : basePeople;

    const sortedPeople = sortPeople(filteredPeople);

    return (
      <>
        {searchValue && (
          <div className="mb-3 text-xs px-3 py-2 rounded border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-secondary)', color: 'var(--text-secondary)' }}>
            Showing {sortedPeople.length} of {basePeople.length} people for "{peopleSearch}".
            <button onClick={() => setPeopleSearch('')} className="ml-2 underline">Clear filter</button>
          </div>
        )}
        {sortedPeople.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
            <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
            <p>No matching people</p>
            {searchValue && (
              <p className="text-sm">Try a different search or <button onClick={() => setPeopleSearch('')} className="underline">clear the filter</button>.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedPeople.map(renderPersonCard)}
          </div>
        )}
      </>
    );
  };

  const renderPeopleList = () => {
    if (!problem?.people.length) {
      return (
        <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
          <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p>No people added yet</p>
          <p className="text-sm">
            {attributeDefinitions.length === 0 
              ? "Consider defining attributes first, then add people to get started"
              : "Add people to get started with your optimization problem"
            }
          </p>
        </div>
      );
    }

    const searchValue = peopleSearch.trim().toLowerCase();
    const basePeople = problem.people;
    const filteredPeople = searchValue
      ? basePeople.filter(p => {
          const name = (p.attributes?.name || '').toString().toLowerCase();
          const id = p.id.toLowerCase();
          return name.includes(searchValue) || id.includes(searchValue);
        })
      : basePeople;

    const sortedPeople = sortPeople(filteredPeople);
    
    return (
      <div className="rounded-lg border overflow-hidden transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        {searchValue && (
          <div className="px-6 pt-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Showing {sortedPeople.length} of {basePeople.length} people for "{peopleSearch}". <button onClick={() => setPeopleSearch('')} className="underline">Clear filter</button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
            <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  <button
                    onClick={() => handleSortToggle('name')}
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                  >
                    Name
                    <ArrowUpDown className="w-3 h-3" />
                    {peopleSortBy === 'name' && (
                      <span className="text-xs">{peopleSortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  <button
                    onClick={() => handleSortToggle('sessions')}
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                  >
                    Sessions
                    <ArrowUpDown className="w-3 h-3" />
                    {peopleSortBy === 'sessions' && (
                      <span className="text-xs">{peopleSortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
                {attributeDefinitions.map(attr => (
                  <th key={attr.key} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    {attr.key}
                  </th>
                ))}
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-secondary)' }}>
              {sortedPeople.length === 0 ? (
                <tr>
                  <td className="px-6 py-6 text-center" colSpan={2 + attributeDefinitions.length + 1} style={{ color: 'var(--text-secondary)' }}>
                    No matching people{searchValue ? ' for your search' : ''}.
                  </td>
                </tr>
              ) : (
              sortedPeople.map(person => {
                const displayName = person.attributes.name || person.id;
                const sessionText = person.sessions 
                  ? `${person.sessions.length}/${sessionsCount} (${person.sessions.map(s => s + 1).join(', ')})`
                  : `All (${sessionsCount})`;
                
                return (
                  <tr 
                    key={person.id} 
                    className="transition-colors hover:bg-tertiary" 
                    style={{ backgroundColor: 'var(--bg-primary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Users className="w-4 h-4 mr-2" style={{ color: 'var(--text-tertiary)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{displayName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm flex items-center gap-1" style={{ color: 'var(--color-accent)' }}>
                        <Clock className="w-3 h-3" />
                        {sessionText}
                      </span>
                    </td>
                    {attributeDefinitions.map(attr => (
                      <td key={attr.key} className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                          {person.attributes[attr.key] || '-'}
                        </span>
                      </td>
                    ))}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleEditPerson(person)}
                          className="p-1 transition-colors"
                          style={{ color: 'var(--text-tertiary)' }}
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-accent)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeletePerson(person.id)}
                          className="p-1 transition-colors"
                          style={{ color: 'var(--text-tertiary)' }}
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-error-600)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }))
              }
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderGroupCard = (group: Group) => {
    return (
              <div key={group.id} className="rounded-lg border p-4 hover:shadow-md transition-all" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
              <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{group.id}</h4>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Capacity: {group.size} people per session</p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => handleEditGroup(group)}
              className="p-1 transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-accent)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDeleteGroup(group.id)}
              className="p-1 transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-error-600)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPersonForm = () => {
    const isEditing = editingPerson !== null;
    const sessions = Array.from({ length: sessionsCount }, (_, i) => i);

    return (
      <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
                  <div className="rounded-lg p-4 sm:p-6 w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto modal-content">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              {isEditing ? 'Edit Person' : 'Add Person'}
            </h3>
            <button
              onClick={() => {
                setShowPersonForm(false);
                setEditingPerson(null);
                setPersonForm({ attributes: {}, sessions: [] });
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Name (required) */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Name *
              </label>
              <input
                type="text"
                value={personForm.attributes.name || ''}
                onChange={(e) => setPersonForm(prev => ({
                  ...prev,
                  attributes: { ...prev.attributes, name: e.target.value }
                }))}
                className="input"
                placeholder="Enter person's name"
              />
            </div>

            {/* Attributes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Attributes
                </label>
                <button
                  type="button"
                  onClick={() => setShowAttributeForm(true)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)' }}
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
              </div>
              <div className="space-y-2">
                {attributeDefinitions.map(def => (
                  <div key={def.key}>
                    <label className="block text-xs mb-1 capitalize" style={{ color: 'var(--text-tertiary)' }}>
                      {def.key}
                    </label>
                    <select
                      value={personForm.attributes[def.key] || ''}
                      onChange={(e) => setPersonForm(prev => ({
                        ...prev,
                        attributes: { ...prev.attributes, [def.key]: e.target.value }
                      }))}
                      className="select text-sm"
                    >
                      <option value="">Select {def.key}</option>
                      {def.values.map(value => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Sessions */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Session Participation
              </label>
              <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                Leave empty for all sessions. Select specific sessions for late arrivals/early departures.
              </p>
              <div className="flex flex-wrap gap-2">
                {sessions.map(sessionIdx => (
                  <label key={sessionIdx} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={personForm.sessions.includes(sessionIdx)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setPersonForm(prev => ({
                            ...prev,
                            sessions: [...prev.sessions, sessionIdx].sort()
                          }));
                        } else {
                          setPersonForm(prev => ({
                            ...prev,
                            sessions: prev.sessions.filter(s => s !== sessionIdx)
                          }));
                        }
                      }}
                      className="rounded border-gray-300 focus:ring-2"
                      style={{ color: 'var(--color-accent)', accentColor: 'var(--color-accent)' }}
                    />
                    Session {sessionIdx + 1}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              onClick={isEditing ? handleUpdatePerson : handleAddPerson}
              className="btn-primary flex-1 px-4 py-2"
            >
              {isEditing ? 'Update' : 'Add'} Person
            </button>
            <button
              onClick={() => {
                setShowPersonForm(false);
                setEditingPerson(null);
                setPersonForm({ attributes: {}, sessions: [] });
              }}
              className="btn-secondary px-4 py-2 rounded-md"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderGroupForm = () => {
    const isEditing = editingGroup !== null;

    return (
      <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
                  <div className="rounded-lg p-4 sm:p-6 w-full max-w-md mx-auto modal-content max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              {isEditing ? 'Edit Group' : 'Add Group'}
            </h3>
            <button
              onClick={() => {
                setShowGroupForm(false);
                setEditingGroup(null);
                setGroupForm({ size: 4 });
                setGroupFormInputs({});
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Group ID *
              </label>
              <input
                type="text"
                value={groupForm.id || ''}
                onChange={(e) => setGroupForm(prev => ({ ...prev, id: e.target.value }))}
                className="input"
                placeholder="e.g., team-alpha, group-1"
                disabled={isEditing}
              />
              {isEditing && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Group ID cannot be changed when editing</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Capacity (people per session) *
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={groupFormInputs.size ?? groupForm.size?.toString() ?? ''}
                onChange={(e) => {
                  setGroupFormInputs(prev => ({ ...prev, size: e.target.value }));
                }}
                className={`input ${(() => {
                  const inputValue = groupFormInputs.size;
                  if (inputValue !== undefined) {
                    return inputValue === '' || isNaN(parseInt(inputValue)) || parseInt(inputValue) < 1;
                  }
                  return groupForm.size < 1;
                })() ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Maximum number of people that can be assigned to this group in any single session
              </p>
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              onClick={isEditing ? handleUpdateGroup : handleAddGroup}
              className="btn-primary flex-1 px-4 py-2"
            >
              {isEditing ? 'Update' : 'Add'} Group
            </button>
            <button
              onClick={() => {
                setShowGroupForm(false);
                setEditingGroup(null);
                setGroupForm({ size: 4 });
                setGroupFormInputs({});
              }}
              className="btn-secondary px-4 py-2 rounded-md"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderConstraintForm = () => {
    const isEditing = editingConstraint !== null;
    const sessions = Array.from({ length: sessionsCount }, (_, i) => i);

    return (
      <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50">
        <div className="rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto modal-content">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              {isEditing ? 'Edit Constraint' : 'Add Constraint'}
            </h3>
            <button
              onClick={() => {
                setShowConstraintForm(false);
                setEditingConstraint(null);
                setConstraintForm({ type: 'RepeatEncounter', penalty_weight: 1 });
              }}
              className="transition-colors p-2 -m-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Constraint Type */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Constraint Type *
              </label>
              <select
                value={constraintForm.type}
                onChange={(e) => setConstraintForm(prev => ({ 
                  type: e.target.value as Constraint['type'],
                  penalty_weight: prev.penalty_weight 
                }))}
                className="select"
                disabled={isEditing}
              >
                <option value="RepeatEncounter">Repeat Encounter Limit</option>
                <option value="AttributeBalance">Attribute Balance</option>
                <option value="MustStayTogether">Must Stay Together</option>
                <option value="ShouldNotBeTogether">Should Not Be Together</option>
                <option value="ImmovablePeople">Immovable People</option>
              </select>
              {isEditing && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Constraint type cannot be changed when editing</p>
              )}
            </div>

            {/* Constraint-specific fields */}
            {constraintForm.type === 'RepeatEncounter' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Maximum Allowed Encounters *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={constraintForm.max_allowed_encounters ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || /^\d*$/.test(value)) {
                        setConstraintForm(prev => ({ 
                          ...prev, 
                          max_allowed_encounters: value === '' ? undefined : parseInt(value)
                        }));
                      }
                    }}
                    className={`input ${(constraintForm.max_allowed_encounters === undefined || constraintForm.max_allowed_encounters < 0) ? 'border-red-500 focus:border-red-500' : ''}`}
                    placeholder="e.g., 1"
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Maximum number of times any two people can be in the same group across all sessions
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Penalty Function
                  </label>
                  <select
                    value={constraintForm.penalty_function || 'squared'}
                    onChange={(e) => setConstraintForm(prev => ({ 
                      ...prev, 
                      penalty_function: e.target.value as 'linear' | 'squared' 
                    }))}
                    className="select"
                  >
                    <option value="linear">Linear</option>
                    <option value="squared">Squared (recommended)</option>
                  </select>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Squared penalties increase more rapidly for multiple violations
                  </p>
                </div>
              </>
            )}

            {constraintForm.type === 'AttributeBalance' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Target Group *
                  </label>
                  <select
                    value={constraintForm.group_id || ''}
                    onChange={(e) => setConstraintForm(prev => ({ ...prev, group_id: e.target.value }))}
                    className="select"
                  >
                    <option value="">Select a group</option>
                    {problem?.groups.map(group => (
                      <option key={group.id} value={group.id}>{group.id}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Attribute to Balance *
                  </label>
                  <select
                    value={constraintForm.attribute_key || ''}
                    onChange={(e) => setConstraintForm(prev => ({ 
                      ...prev, 
                      attribute_key: e.target.value,
                      desired_values: {} // Reset when attribute changes
                    }))}
                    className="select"
                  >
                    <option value="">Select an attribute</option>
                    {attributeDefinitions.map(def => (
                      <option key={def.key} value={def.key}>{def.key}</option>
                    ))}
                  </select>
                </div>

                {constraintForm.attribute_key && (
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Desired Distribution *
                    </label>
                    <div className="space-y-2">
                      {attributeDefinitions
                        .find(def => def.key === constraintForm.attribute_key)
                        ?.values.map(value => (
                          <div key={value} className="flex items-center gap-2">
                            <span className="w-20 text-sm capitalize" style={{ color: 'var(--text-secondary)' }}>{value}:</span>
                            <input
                              type="number"
                              min="0"
                              max="20"
                              value={constraintForm.desired_values?.[value] ?? ''}
                              onChange={(e) => {
                                const inputValue = e.target.value;
                                if (inputValue === '' || /^\d*$/.test(inputValue)) {
                                  setConstraintForm(prev => {
                                    const newDesiredValues = { ...prev.desired_values };
                                    if (inputValue === '') {
                                      delete newDesiredValues[value];
                                    } else {
                                      newDesiredValues[value] = parseInt(inputValue);
                                    }
                                    return {
                                      ...prev,
                                      desired_values: newDesiredValues
                                    };
                                  });
                                }
                              }}
                              className="input flex-1"
                              placeholder="0"
                            />
                          </div>
                        ))}
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Desired number of people with each attribute value in this group
                    </p>
                  </div>
                )}

                {/* Sessions selector for AttributeBalance */}
                {constraintForm.type === 'AttributeBalance' && (
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Apply to Sessions (optional)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {sessions.map(sessionIdx => (
                        <label key={sessionIdx} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={constraintForm.sessions?.includes(sessionIdx) || false}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setConstraintForm(prev => ({
                                  ...prev,
                                  sessions: [...(prev.sessions || []), sessionIdx].sort()
                                }));
                              } else {
                                setConstraintForm(prev => ({
                                  ...prev,
                                  sessions: (prev.sessions || []).filter(s => s !== sessionIdx)
                                }));
                              }
                            }}
                            className="rounded border-gray-300 focus:ring-2"
                            style={{ color: 'var(--color-accent)', accentColor: 'var(--color-accent)' }}
                          />
                          Session {sessionIdx + 1}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Leave empty to apply to all sessions
                    </p>
                  </div>
                )}
              </>
            )}

            {constraintForm.type === 'ImmovablePeople' && (
              <>
                {/* People multi-select */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    People * (select at least 1)
                  </label>
                  <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2" style={{ borderColor: 'var(--border-secondary)' }}>
                    {problem?.people.map(person => (
                      <label key={person.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={constraintForm.people?.includes(person.id) || false}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setConstraintForm(prev => ({
                                ...prev,
                                people: [...(prev.people || []), person.id]
                              }));
                            } else {
                              setConstraintForm(prev => ({
                                ...prev,
                                people: (prev.people || []).filter(id => id !== person.id)
                              }));
                            }
                          }}
                          className="rounded border-gray-300 focus:ring-2"
                          style={{ color: 'var(--color-accent)', accentColor: 'var(--color-accent)' }}
                        />
                        {person.attributes.name || person.id}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Fixed group selection */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Fixed Group *
                  </label>
                  <select
                    value={constraintForm.group_id || ''}
                    onChange={(e) => setConstraintForm(prev => ({ ...prev, group_id: e.target.value }))}
                    className="select"
                  >
                    <option value="">Select a group</option>
                    {problem?.groups.map(group => (
                      <option key={group.id} value={group.id}>{group.id}</option>
                    ))}
                  </select>
                </div>

                {/* Sessions checkbox selector */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Apply to Sessions (optional)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {sessions.map(sessionIdx => (
                      <label key={sessionIdx} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={constraintForm.sessions?.includes(sessionIdx) || false}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setConstraintForm(prev => ({
                                ...prev,
                                sessions: [...(prev.sessions || []), sessionIdx].sort()
                              }));
                            } else {
                              setConstraintForm(prev => ({
                                ...prev,
                                sessions: (prev.sessions || []).filter(s => s !== sessionIdx)
                              }));
                            }
                          }}
                          className="rounded border-gray-300 focus:ring-2"
                          style={{ color: 'var(--color-accent)', accentColor: 'var(--color-accent)' }}
                        />
                        Session {sessionIdx + 1}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Leave empty to apply to all sessions
                  </p>
                </div>
              </>
            )}

            {(constraintForm.type === 'MustStayTogether' || constraintForm.type === 'ShouldNotBeTogether') && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    People * (select at least 2)
                  </label>
                  <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2" style={{ borderColor: 'var(--border-secondary)' }}>
                    {problem?.people.map(person => (
                      <label key={person.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={constraintForm.people?.includes(person.id) || false}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setConstraintForm(prev => ({
                                ...prev,
                                people: [...(prev.people || []), person.id]
                              }));
                            } else {
                              setConstraintForm(prev => ({
                                ...prev,
                                people: (prev.people || []).filter(id => id !== person.id)
                              }));
                            }
                          }}
                          className="rounded border-gray-300 focus:ring-2"
                          style={{ color: 'var(--color-accent)', accentColor: 'var(--color-accent)' }}
                        />
                        {person.attributes.name || person.id}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Apply to Sessions (optional)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {sessions.map(sessionIdx => (
                      <label key={sessionIdx} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={constraintForm.sessions?.includes(sessionIdx) || false}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setConstraintForm(prev => ({
                                ...prev,
                                sessions: [...(prev.sessions || []), sessionIdx].sort()
                              }));
                            } else {
                              setConstraintForm(prev => ({
                                ...prev,
                                sessions: (prev.sessions || []).filter(s => s !== sessionIdx)
                              }));
                            }
                          }}
                          className="rounded border-gray-300 focus:ring-2"
                          style={{ color: 'var(--color-accent)', accentColor: 'var(--color-accent)' }}
                        />
                        Session {sessionIdx + 1}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Leave empty to apply to all sessions
                  </p>
                </div>
              </>
            )}

            {/* Penalty Weight - only for constraints that use it */}
            {constraintForm.type !== 'ImmovablePeople' && (
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Penalty Weight
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={constraintForm.penalty_weight ?? ''}
                  onChange={(e) => {
                    const numValue = e.target.value === '' ? undefined : parseFloat(e.target.value);
                    setConstraintForm(prev => ({ 
                      ...prev, 
                      penalty_weight: numValue 
                    }));
                  }}
                  className={`input ${(constraintForm.penalty_weight === undefined || constraintForm.penalty_weight <= 0) ? 'border-red-500 focus:border-red-500' : ''}`}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Higher values make this constraint more important (1-10000). 
                  Use 1000+ for hard constraints, 10-100 for preferences.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-6">
            <button
              onClick={isEditing ? handleUpdateConstraint : handleAddConstraint}
              className="btn-primary flex-1 px-4 py-2"
            >
              {isEditing ? 'Update' : 'Add'} Constraint
            </button>
            <button
              onClick={() => {
                setShowConstraintForm(false);
                setEditingConstraint(null);
                setConstraintForm({ type: 'RepeatEncounter', penalty_weight: 1 });
              }}
              className="btn-secondary px-4 py-2 rounded-md"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Bulk add dropdown & modal states
  const bulkDropdownRef = useRef<HTMLDivElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [bulkDropdownOpen, setBulkDropdownOpen] = useState(false);
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

  // Close bulk dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bulkDropdownRef.current && !bulkDropdownRef.current.contains(event.target as Node)) {
        setBulkDropdownOpen(false);
      }
    };
    if (bulkDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [bulkDropdownOpen]);

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

  const renderBulkAddForm = () => {
    return (
      <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50">
        <div className="rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto modal-content">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Bulk Add People</h3>
            <button
              onClick={() => setShowBulkForm(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => {
                if (bulkTextMode === 'grid') {
                  setBulkCsvInput(rowsToCsv(bulkHeaders, bulkRows));
                }
                setBulkTextMode('text');
              }}
              className={`px-3 py-1 rounded text-sm ${bulkTextMode === 'text' ? 'font-bold' : ''}`}
              style={{ color: 'var(--text-primary)', backgroundColor: bulkTextMode === 'text' ? 'var(--bg-tertiary)' : 'transparent' }}
            >
              CSV Text
            </button>
            <button
              onClick={() => {
                if (bulkTextMode === 'text') {
                  const { headers, rows } = parseCsv(bulkCsvInput);
                  setBulkHeaders(headers);
                  setBulkRows(rows);
                }
                setBulkTextMode('grid');
              }}
              className={`px-3 py-1 rounded text-sm ${bulkTextMode === 'grid' ? 'font-bold' : ''}`}
              style={{ color: 'var(--text-primary)', backgroundColor: bulkTextMode === 'grid' ? 'var(--bg-tertiary)' : 'transparent' }}
            >
              Data Grid
            </button>
          </div>

          {bulkTextMode === 'text' ? (
            <textarea
              value={bulkCsvInput}
              onChange={(e) => setBulkCsvInput(e.target.value)}
              className="w-full h-64 p-2 border rounded"
              placeholder="Paste CSV here. First row should contain column headers (e.g., name, attribute1, attribute2)"
            ></textarea>
          ) : (
            <div className="overflow-x-auto max-h-64 mb-4">
              {bulkHeaders.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No data parsed yet.</p>
              ) : (
                <table className="min-w-full divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
                  <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <tr>
                      {bulkHeaders.map(h => (
                        <th key={h} className="px-2 py-1 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-secondary)' }}>
                    {bulkRows.map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        {bulkHeaders.map(h => (
                          <td key={h} className="px-2 py-1">
                            <input
                              type="text"
                              value={row[h] || ''}
                              onChange={(e) => {
                                const newRows = [...bulkRows];
                                newRows[rowIdx][h] = e.target.value;
                                setBulkRows(newRows);
                              }}
                              className="w-full text-sm border rounded p-1"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-4">
            {bulkTextMode === 'text' && (
              <button
                onClick={() => {
                  const { headers, rows } = parseCsv(bulkCsvInput);
                  setBulkHeaders(headers);
                  setBulkRows(rows);
                  setBulkTextMode('grid');
                }}
                className="btn-secondary"
              >
                Preview Grid
              </button>
            )}
            <button
              onClick={handleAddBulkPeople}
              className="btn-primary flex-1 px-4 py-2"
            >
              Add People
            </button>
          </div>
        </div>
      </div>
    );
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

  const renderBulkUpdateForm = () => {
    return (
      <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50">
        <div className="rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto modal-content">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Bulk Update People</h3>
            <button
              onClick={() => setShowBulkUpdateForm(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            <p>
              Use this to update existing people by <b>id</b>, add new columns (attributes), or add new people (leave id empty or use a new unique id).
              Leave cells blank to keep current values. Use <code>__DELETE__</code> to remove an attribute from a person.
            </p>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => {
                if (bulkUpdateTextMode === 'grid') {
                  setBulkUpdateCsvInput(rowsToCsv(bulkUpdateHeaders, bulkUpdateRows));
                }
                setBulkUpdateTextMode('text');
              }}
              className={`px-3 py-1 rounded text-sm ${bulkUpdateTextMode === 'text' ? 'font-bold' : ''}`}
              style={{ color: 'var(--text-primary)', backgroundColor: bulkUpdateTextMode === 'text' ? 'var(--bg-tertiary)' : 'transparent' }}
            >
              CSV Text
            </button>
            <button
              onClick={() => {
                if (bulkUpdateTextMode === 'text') {
                  const { headers, rows } = parseCsv(bulkUpdateCsvInput);
                  setBulkUpdateHeaders(headers);
                  setBulkUpdateRows(rows);
                }
                setBulkUpdateTextMode('grid');
              }}
              className={`px-3 py-1 rounded text-sm ${bulkUpdateTextMode === 'grid' ? 'font-bold' : ''}`}
              style={{ color: 'var(--text-primary)', backgroundColor: bulkUpdateTextMode === 'grid' ? 'var(--bg-tertiary)' : 'transparent' }}
            >
              Data Grid
            </button>
            <button
              onClick={() => {
                const { headers, rows } = buildPeopleCsvFromCurrent();
                setBulkUpdateHeaders(headers);
                setBulkUpdateRows(rows);
                setBulkUpdateCsvInput(rowsToCsv(headers, rows));
              }}
              className="ml-auto btn-secondary px-3 py-1 text-sm"
            >
              Refresh from Current
            </button>
          </div>

          {bulkUpdateTextMode === 'text' ? (
            <textarea
              value={bulkUpdateCsvInput}
              onChange={(e) => setBulkUpdateCsvInput(e.target.value)}
              className="w-full h-64 p-2 border rounded"
              placeholder="Edit CSV here. First row contains headers (e.g., id,name,attribute1,attribute2)"
            ></textarea>
          ) : (
            <div className="overflow-x-auto max-h-64 mb-4">
              {bulkUpdateHeaders.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No data parsed yet.</p>
              ) : (
                <table className="min-w-full divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
                  <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <tr>
                      {bulkUpdateHeaders.map(h => (
                        <th key={h} className="px-2 py-1 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-secondary)' }}>
                    {bulkUpdateRows.map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        {bulkUpdateHeaders.map(h => (
                          <td key={h} className="px-2 py-1">
                            <input
                              type="text"
                              value={row[h] || ''}
                              onChange={(e) => {
                                const newRows = [...bulkUpdateRows];
                                newRows[rowIdx][h] = e.target.value;
                                setBulkUpdateRows(newRows);
                              }}
                              className="w-full text-sm border rounded p-1"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-4">
            {bulkUpdateTextMode === 'text' && (
              <button
                onClick={() => {
                  const { headers, rows } = parseCsv(bulkUpdateCsvInput);
                  setBulkUpdateHeaders(headers);
                  setBulkUpdateRows(rows);
                  setBulkUpdateTextMode('grid');
                }}
                className="btn-secondary"
              >
                Preview Grid
              </button>
            )}
            <button
              onClick={handleApplyBulkUpdate}
              className="btn-primary flex-1 px-4 py-2"
            >
              Apply Changes
            </button>
          </div>
        </div>
      </div>
    );
  };

  const groupBulkDropdownRef = useRef<HTMLDivElement>(null);
  const groupCsvFileInputRef = useRef<HTMLInputElement>(null);
  const [groupBulkDropdownOpen, setGroupBulkDropdownOpen] = useState(false);
  const [showGroupBulkForm, setShowGroupBulkForm] = useState(false);
  const [groupBulkTextMode, setGroupBulkTextMode] = useState<'text' | 'grid'>('text');
  const [groupBulkCsvInput, setGroupBulkCsvInput] = useState('');
  const [groupBulkHeaders, setGroupBulkHeaders] = useState<string[]>([]);
  const [groupBulkRows, setGroupBulkRows] = useState<Record<string, string>[]>([]);


  // Close group bulk dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (groupBulkDropdownRef.current && !groupBulkDropdownRef.current.contains(event.target as Node)) {
        setGroupBulkDropdownOpen(false);
      }
    };
    if (groupBulkDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [groupBulkDropdownOpen]);

  const openGroupBulkFormFromCsv = (csvText: string) => {
    setGroupBulkCsvInput(csvText);
    const { headers, rows } = parseCsv(csvText);
    setGroupBulkHeaders(headers);
    setGroupBulkRows(rows);
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

  const renderGroupBulkAddForm = () => {
    return (
      <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50">
        <div className="rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto modal-content">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Bulk Add Groups</h3>
            <button
              onClick={() => setShowGroupBulkForm(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => {
                if (groupBulkTextMode === 'grid') {
                  setGroupBulkCsvInput(rowsToCsv(groupBulkHeaders, groupBulkRows));
                }
                setGroupBulkTextMode('text');
              }}
              className={`px-3 py-1 rounded text-sm ${groupBulkTextMode === 'text' ? 'font-bold' : ''}`}
              style={{ color: 'var(--text-primary)', backgroundColor: groupBulkTextMode === 'text' ? 'var(--bg-tertiary)' : 'transparent' }}
            >
              CSV Text
            </button>
            <button
              onClick={() => {
                if (groupBulkTextMode === 'text') {
                  const { headers, rows } = parseCsv(groupBulkCsvInput);
                  setGroupBulkHeaders(headers);
                  setGroupBulkRows(rows);
                }
                setGroupBulkTextMode('grid');
              }}
              className={`px-3 py-1 rounded text-sm ${groupBulkTextMode === 'grid' ? 'font-bold' : ''}`}
              style={{ color: 'var(--text-primary)', backgroundColor: groupBulkTextMode === 'grid' ? 'var(--bg-tertiary)' : 'transparent' }}
            >
              Data Grid
            </button>
          </div>

          {groupBulkTextMode === 'text' ? (
            <textarea
              value={groupBulkCsvInput}
              onChange={(e) => setGroupBulkCsvInput(e.target.value)}
              className="w-full h-64 p-2 border rounded"
              placeholder="Paste CSV here. First row should contain column headers (e.g., id, size)"
            ></textarea>
          ) : (
            <div className="overflow-x-auto max-h-64 mb-4">
              {groupBulkHeaders.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No data parsed yet.</p>
              ) : (
                <table className="min-w-full divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
                  <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <tr>
                      {groupBulkHeaders.map(h => (
                        <th key={h} className="px-2 py-1 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-secondary)' }}>
                    {groupBulkRows.map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        {groupBulkHeaders.map(h => (
                          <td key={h} className="px-2 py-1">
                            <input
                              type="text"
                              value={row[h] || ''}
                              onChange={(e) => {
                                const newRows = [...groupBulkRows];
                                newRows[rowIdx][h] = e.target.value;
                                setGroupBulkRows(newRows);
                              }}
                              className="w-full text-sm border rounded p-1"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-4">
            {groupBulkTextMode === 'text' && (
              <button
                onClick={() => {
                  const { headers, rows } = parseCsv(groupBulkCsvInput);
                  setGroupBulkHeaders(headers);
                  setGroupBulkRows(rows);
                  setGroupBulkTextMode('grid');
                }}
                className="btn-secondary"
              >
                Preview Grid
              </button>
            )}
            <button
              onClick={handleAddGroupBulkPeople}
              className="btn-primary flex-1 px-4 py-2"
            >
              Add Groups
            </button>
          </div>
        </div>
      </div>
    );
  };

  // === Shared CSV helpers ===
  const parseCsv = (text: string): { headers: string[]; rows: Record<string, string>[] } => {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const cells = line.split(',');
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = (cells[idx] || '').trim();
      });
      return row;
    });
    return { headers, rows };
  };

  const rowsToCsv = (headers: string[], rows: Record<string, string>[]) => {
    const headerLine = headers.join(',');
    const dataLines = rows.map(r => headers.map(h => r[h] ?? '').join(','));
    return [headerLine, ...dataLines].join('\n');
  };

  // === Helper: Generate a unique person ID across all existing people in all problems ===
  const generateUniquePersonId = (): string => {
    // Get all person IDs across all problems
    const allProblems = useAppStore.getState().savedProblems;
    const allPersonIds = new Set<string>();
    Object.values(allProblems).forEach(p => p.problem.people.forEach(person => allPersonIds.add(person.id)));
    // Also include people in the current unsaved problem
    if (problem?.people) {
      problem.people.forEach(person => allPersonIds.add(person.id));
    }
    let newId: string;
    do {
      newId = `person_${Math.random().toString(36).slice(2, 10)}`;
    } while (allPersonIds.has(newId));
    return newId;
  };

  // Don't render until loading is complete to avoid creating new problems
  if (ui.isLoading) {
    return <div className="animate-fade-in">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Problem Setup</h2>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
            Configure people, groups, and constraints for optimization
          </p>
        </div>
        <div className="w-full overflow-x-auto">
          <div className="flex flex-row flex-nowrap gap-2 justify-end w-full overflow-visible">
            <button
              onClick={handleLoadProblem}
              className="flex items-center gap-1 sm:gap-2 justify-center px-1.5 sm:px-3 py-1.5 rounded-md font-medium transition-colors btn-secondary min-w-0 text-xs sm:text-sm focus-visible:outline-none"
              style={{ outline: 'none', boxShadow: 'none' }}
            >
              <Upload className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span className="truncate">Load</span>
            </button>
            <button
              onClick={handleSaveProblem}
              className="flex items-center gap-1 sm:gap-2 justify-center px-1.5 sm:px-3 py-1.5 rounded-md font-medium transition-colors btn-secondary min-w-0 text-xs sm:text-sm focus-visible:outline-none"
              style={{ outline: 'none', boxShadow: 'none' }}
            >
              <Save className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span className="truncate">Save</span>
            </button>
            <div className="relative" ref={demoDropdownRef}>
              <button
                onClick={() => setDemoDropdownOpen(!demoDropdownOpen)}
                className="flex items-center gap-1 sm:gap-2 justify-center px-1.5 sm:px-3 py-1.5 rounded-md font-medium transition-colors btn-secondary min-w-0 text-xs sm:text-sm focus-visible:outline-none"
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <span>Demo Data</span>
                <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              </button>
              {/* Dropdown menu rendered in portal; inline fallback removed */}
            </div>
          </div>
        </div>
      </div>

      {/* === Demo Data dropdown rendered in a portal so it's not clipped by its parent === */}
      {demoDropdownOpen && dropdownPosition && createPortal(
        <div
          ref={dropdownMenuRef}
          className="fixed z-50 w-80 rounded-md shadow-lg border overflow-hidden max-h-96 overflow-y-auto"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-primary)',
          }}
        >
          {loadingDemoMetrics ? (
            <div className="p-4 text-center" style={{ color: 'var(--text-secondary)' }}>
              <div
                className="inline-block animate-spin rounded-full h-4 w-4 border-b-2"
                style={{ borderColor: 'var(--color-accent)' }}
              ></div>
              <span className="ml-2 text-sm">Loading demo cases...</span>
            </div>
          ) : (
            <>
              {(['Simple', 'Intermediate', 'Advanced', 'Benchmark'] as const).map((category) => {
                const casesInCategory = demoCasesWithMetrics.filter((c) => c.category === category);
                if (casesInCategory.length === 0) return null;

                return (
                  <div key={category}>
                    <div
                      className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        borderColor: 'var(--border-primary)',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {category}
                    </div>
                    {casesInCategory.map((demoCase) => (
                      <button
                        key={demoCase.id}
                        onClick={() => handleDemoCaseClick(demoCase.id)}
                        className="flex flex-col w-full px-3 py-3 text-left transition-colors border-b last:border-b-0"
                        style={{
                          color: 'var(--text-primary)',
                          backgroundColor: 'transparent',
                          borderColor: 'var(--border-primary)',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{demoCase.name}</span>
                          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            <Users className="w-3 h-3" />
                            <span>{demoCase.peopleCount}</span>
                            <Hash className="w-3 h-3 ml-1" />
                            <span>{demoCase.groupCount}</span>
                            <Calendar className="w-3 h-3 ml-1" />
                            <span>{demoCase.sessionCount}</span>
                          </div>
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                          {demoCase.description}
                        </p>
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>,
        document.body
      )}

      {/* Navigation */}
      <div className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
        {/*
          Responsive tab bar:
          - Justified: tabs are distributed evenly to fill each row
          - Uses CSS grid with auto-fit and minmax
          - Tabs wrap to new rows as needed, but only if there is not enough space for even one more tab
          - All icons are the same size at all breakpoints
        */}
        <nav
          className="flex flex-wrap justify-between gap-y-2"
        >
          {[
            { id: 'people', label: 'People', icon: Users, count: (problem?.people ?? []).length },
            { id: 'groups', label: 'Groups', icon: Hash, count: (problem?.groups ?? []).length },
            { id: 'sessions', label: 'Sessions', icon: Calendar, count: problem?.num_sessions ?? 0 },
            { id: 'objectives', label: 'Objectives', icon: BarChart3, count: objectiveCount > 0 ? objectiveCount : undefined },
            { id: 'hard', label: 'Hard Constraints', icon: Lock, count: problem?.constraints ? problem.constraints.filter(c=>['ImmovablePeople','MustStayTogether'].includes(c.type as string)).length : 0 },
            { id: 'soft', label: 'Soft Constraints', icon: Zap, count: problem?.constraints ? problem.constraints.filter(c=>['RepeatEncounter','AttributeBalance','ShouldNotBeTogether','ShouldStayTogether','PairMeetingCount'].includes(c.type as string)).length : 0 },
          ].map(tab => (
            <button
              className={`flex-1 flex flex-row items-center justify-center min-w-[140px] gap-1 px-3 py-1.5 rounded-md font-medium transition-colors ${activeSection === tab.id ? 'bg-[var(--bg-tertiary)] text-[var(--color-accent)]' : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--color-accent)]'}`}
              key={tab.id}
              onClick={() => navigate(`/app/problem/${tab.id}`)}
            >
              <tab.icon className="w-5 h-5" />
              <span className="whitespace-nowrap">{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{tab.count}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
        {activeSection === 'people' && (
          <div className="space-y-4">
            {/* Attributes Section Header */}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setShowAttributesSection(!showAttributesSection)}
                className="flex items-center gap-2 text-left transition-colors min-w-0"
                style={{ flex: '1 1 0%' }}
              >
                {showAttributesSection ? (
                  <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                ) : (
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                )}
                <Tag className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
                <h3 className="text-base font-medium truncate" style={{ color: 'var(--text-primary)', maxWidth: '100%', fontSize: 'clamp(0.9rem, 4vw, 1.1rem)' }}>
                  Attribute Definitions ({attributeDefinitions.length})
                </h3>
              </button>
              <button
                onClick={() => setShowAttributeForm(true)}
                className="btn-primary flex items-center gap-2 px-3 py-1.5 text-sm"
              >
                <Plus className="w-3 h-3" />
                Add Attribute
              </button>
            </div>

            {/* Collapsible Attributes Section */}
            {showAttributesSection && (
              <div className="rounded-lg border transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
                <div className="p-4 space-y-3">
                  <div className="rounded-md p-3 border text-sm" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
                    <p style={{ color: 'var(--text-secondary)' }}>
                      Attributes are key-value pairs that describe people (e.g., gender, department, seniority).
                      Define them here before adding people to use them in constraints like attribute balance.
                    </p>
                  </div>

                  {attributeDefinitions.length ? (
                    <div className="space-y-2">
                      {attributeDefinitions.map(def => (
                        <div key={def.key} className="rounded-lg border p-3 transition-colors" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium capitalize text-sm" style={{ color: 'var(--text-primary)' }}>{def.key}</h4>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {def.values.map(value => (
                                  <span key={value} style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }} className="px-2 py-0.5 rounded-full text-xs font-medium">
                                    {value}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleEditAttribute(def)}
                                className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => removeAttributeDefinition(def.key)}
                                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                      <Tag className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
                      <p className="text-sm">No attributes defined yet</p>
                      <p className="text-xs">Click "Add Attribute" to get started</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* People Section */}
            <div className="rounded-lg border transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
              <div className="border-b px-6 py-4" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
                  <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                    People ({problem?.people.length || 0})
                  </h3>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    {/* Search */}
                    <div className="w-full sm:w-64">
                      <input
                        type="text"
                        className="input w-full"
                        placeholder="Search people by name or ID..."
                        value={peopleSearch}
                        onChange={(e) => setPeopleSearch(e.target.value)}
                      />
                    </div>
                    {/* View Toggle */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPeopleViewMode('grid')}
                        className="px-3 py-1 rounded text-sm transition-colors"
                        style={{
                          backgroundColor: peopleViewMode === 'grid' ? 'var(--bg-tertiary)' : 'transparent',
                          color: peopleViewMode === 'grid' ? 'var(--color-accent)' : 'var(--text-secondary)',
                          border: peopleViewMode === 'grid' ? '1px solid var(--color-accent)' : '1px solid transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (peopleViewMode !== 'grid') {
                            e.currentTarget.style.color = 'var(--text-primary)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (peopleViewMode !== 'grid') {
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }
                        }}
                      >
                        <Hash className="w-4 h-4 inline mr-1" />
                        Grid
                      </button>
                      <button
                        onClick={() => setPeopleViewMode('list')}
                        className="px-3 py-1 rounded text-sm transition-colors"
                        style={{
                          backgroundColor: peopleViewMode === 'list' ? 'var(--bg-tertiary)' : 'transparent',
                          color: peopleViewMode === 'list' ? 'var(--color-accent)' : 'var(--text-secondary)',
                          border: peopleViewMode === 'list' ? '1px solid var(--color-accent)' : '1px solid transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (peopleViewMode !== 'list') {
                            e.currentTarget.style.color = 'var(--text-primary)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (peopleViewMode !== 'list') {
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }
                        }}
                      >
                        <BarChart3 className="w-4 h-4 inline mr-1" />
                        List
                      </button>
                    </div>
                    {/* Add Person Button Replacement */}
                    <div className="flex items-center gap-2">
                      {/* Bulk Add Dropdown */}
                      <div className="relative" ref={bulkDropdownRef}>
                        <button
                          onClick={() => setBulkDropdownOpen(!bulkDropdownOpen)}
                          className="btn-secondary flex items-center gap-2"
                        >
                          <Upload className="w-4 h-4" />
                          Bulk Add
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {bulkDropdownOpen && (
                          <div className="absolute right-0 mt-1 w-56 rounded-md shadow-lg z-10 border overflow-hidden"
                               style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
                            <button
                              onClick={() => {
                                setBulkDropdownOpen(false);
                                csvFileInputRef.current?.click();
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors border-b last:border-b-0"
                              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <Upload className="w-4 h-4" />
                              Upload CSV
                            </button>
                            <button
                              onClick={() => {
                                setBulkDropdownOpen(false);
                                addNotification({ type: 'info', title: 'Coming Soon', message: 'Excel import is not yet implemented.' });
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors border-b last:border-b-0"
                              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <Upload className="w-4 h-4" />
                              Upload Excel
                            </button>
                            <button
                              onClick={() => {
                                setBulkDropdownOpen(false);
                                setBulkCsvInput('');
                                setBulkHeaders([]);
                                setBulkRows([]);
                                setBulkTextMode('text');
                                setShowBulkForm(true);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                              style={{ color: 'var(--text-primary)' }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <Table className="w-4 h-4" />
                              Open Bulk Form
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Add Person Button */}
                      <button
                        onClick={() => setShowPersonForm(true)}
                        className="btn-primary flex items-center gap-2 px-4 py-2"
                      >
                        <Plus className="w-4 h-4" />
                        Add Person
                      </button>
                      {/* Bulk Update Button */}
                      <button
                        onClick={openBulkUpdateForm}
                        className="btn-secondary flex items-center gap-2 px-4 py-2"
                      >
                        <Edit className="w-4 h-4" />
                        Bulk Update
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-6">
                {peopleViewMode === 'grid' ? renderPeopleGrid() : renderPeopleList()}
              </div>
            </div>
        </div>
      )}

      {activeSection === 'groups' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Groups ({problem?.groups.length || 0})</h3>
            <div className="flex items-center gap-2">
              {/* Bulk Add Groups Dropdown */}
              <div className="relative" ref={groupBulkDropdownRef}>
                <button
                  onClick={() => setGroupBulkDropdownOpen(!groupBulkDropdownOpen)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Bulk Add
                  <ChevronDown className="w-3 h-3" />
                </button>
                {groupBulkDropdownOpen && (
                  <div className="absolute right-0 mt-1 w-56 rounded-md shadow-lg z-10 border overflow-hidden"
                       style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
                    <button
                      onClick={() => {
                        setGroupBulkDropdownOpen(false);
                        groupCsvFileInputRef.current?.click();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors border-b last:border-b-0"
                      style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Upload className="w-4 h-4" />
                      Upload CSV
                    </button>
                    <button
                      onClick={() => {
                        setGroupBulkDropdownOpen(false);
                        setGroupBulkCsvInput('');
                        setGroupBulkHeaders([]);
                        setGroupBulkRows([]);
                        setGroupBulkTextMode('text');
                        setShowGroupBulkForm(true);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Table className="w-4 h-4" />
                      Open Bulk Form
                    </button>
                  </div>
                )}
              </div>
              {/* Add Group Button */}
              <button
                onClick={() => setShowGroupForm(true)}
                className="btn-primary flex items-center gap-2 px-4 py-2"
              >
                <Plus className="w-4 h-4" />
                Add Group
              </button>
            </div>
          </div>

          {problem?.groups.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {problem.groups.map(renderGroupCard)}
            </div>
          ) : (
            <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
              <Hash className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
              <p>No groups added yet</p>
              <p className="text-sm">Add groups where people will be assigned</p>
            </div>
          )}
        </div>
      )}

      {activeSection === 'sessions' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Sessions</h3>
          {/* Collapsible info box OUTSIDE the main box */}
          <div className="rounded-md border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
            <button
              className="flex items-center gap-2 w-full p-4 text-left"
              onClick={() => setShowSessionsInfo(!showSessionsInfo)}
            >
              {showSessionsInfo ? (
                <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              ) : (
                <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              )}
              <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>How do Sessions work?</h4>
            </button>
            {showSessionsInfo && (
              <div className="p-4 pt-0">
                <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                  <li>• Each session represents a time period (e.g., morning, afternoon, day 1, day 2)</li>
                  <li>• People are assigned to groups within each session</li>
                  <li>• The algorithm maximizes unique contacts across all sessions</li>
                  <li>• People can participate in all sessions or only specific ones</li>
                </ul>
              </div>
            )}
          </div>
          <div className="rounded-lg border p-6 transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Number of Sessions
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={sessionsFormInputs.count ?? sessionsCount?.toString() ?? ''}
                  onChange={(e) => {
                    setSessionsFormInputs(prev => ({ ...prev, count: e.target.value }));
                  }}
                  onBlur={() => {
                    // Validate and apply the sessions count from input
                    const countValue = sessionsFormInputs.count || sessionsCount.toString();
                    const count = parseInt(countValue);
                    if (!isNaN(count) && count >= 1) {
                      handleSessionsCountChange(count);
                      setSessionsFormInputs({});
                    }
                  }}
                  className={`input w-32 ${(() => {
                    const inputValue = sessionsFormInputs.count;
                    if (inputValue !== undefined) {
                      return inputValue === '' || isNaN(parseInt(inputValue)) || parseInt(inputValue) < 1;
                    }
                    return sessionsCount < 1;
                  })() ? 'border-red-500 focus:border-red-500' : ''}`}
                />
                <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                  The algorithm will distribute people into groups across {sessionsCount} sessions. Each person can be assigned to one group per session.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'objectives' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Objectives</h3>
          {/* Collapsible info box OUTSIDE the main box */}
          <div className="rounded-md border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
            <button
              className="flex items-center gap-2 w-full p-4 text-left"
              onClick={() => setShowObjectivesInfo(!showObjectivesInfo)}
            >
              {showObjectivesInfo ? (
                <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              ) : (
                <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              )}
              <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>How do Objectives work?</h4>
            </button>
            {showObjectivesInfo && (
              <div className="p-4 pt-0">
                <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Objectives tell the solver what to optimize for. Multiple objectives can be combined with different
                  weights to create a custom scoring function. Currently the solver only supports the
                  <strong> &nbsp;Maximize Unique Contacts&nbsp;</strong> objective.
                </p>
              </div>
            )}
          </div>
          <div className="rounded-lg border p-6 transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
            {/* Unique Contacts Objective Editor */}
            <ObjectiveWeightEditor
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
          </div>
        </div>
      )}

      {activeSection === 'hard' && (
        <div className="pt-0">
          <HardConstraintsPanel
            onAddConstraint={(type: 'ImmovablePeople'| 'MustStayTogether') => {
              if(type==='ImmovablePeople'){
                setEditingImmovableIndex(null);
                setShowImmovableModal(true);
              }else if(type==='MustStayTogether'){
                setEditingConstraintIndex(null);
                setShowMustStayTogetherModal(true);
              }else{
                setConstraintForm((prev) => ({ ...prev, type }));
                setShowConstraintForm(true);
              }
            }}
            onEditConstraint={(c: Constraint, i: number) => {
               if(c.type==='ImmovablePeople'){
                   setEditingImmovableIndex(i);
                   setShowImmovableModal(true);
               } else if(c.type==='MustStayTogether'){
                   setEditingConstraintIndex(i);
                   setShowMustStayTogetherModal(true);
               } else {
                   handleEditConstraint(c,i);
               }
            }}
            onDeleteConstraint={(i: number) => handleDeleteConstraint(i)}
          />
        </div>
      )}

      {activeSection === 'soft' && (
        <div className="pt-0">
          <SoftConstraintsPanel
            onAddConstraint={(type: Constraint['type']) => {
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
                  // Fallback to legacy modal for any other types
                  setConstraintForm((prev) => ({ ...prev, type }));
                  setShowConstraintForm(true);
              }
            }}
            onEditConstraint={(c: Constraint, i: number) => {
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
                  // Fallback to legacy modal for any other types
                  handleEditConstraint(c, i);
              }
            }}
            onDeleteConstraint={(i: number) => handleDeleteConstraint(i)}
          />
        </div>
      )}

      {activeSection === 'constraints' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Constraints ({problem?.constraints.length || 0})</h3>
            <button
              onClick={() => setShowConstraintForm(true)}
              className="btn-primary flex items-center gap-2 px-4 py-2"
            >
              <Plus className="w-4 h-4" />
              Add Constraint
            </button>
          </div>
          
          {/* Collapsible "About Constraints" info pane */}
          <div className="rounded-md border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
            <button
              className="flex items-center gap-2 w-full p-4 text-left"
              onClick={() => setShowConstraintInfo(!showConstraintInfo)}
            >
              {showConstraintInfo ? (
                <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              ) : (
                <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              )}
              <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>About Constraints</h4>
            </button>
            {showConstraintInfo && (
              <div className="p-4 pt-0">
                <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Constraints guide the optimization process by defining rules and preferences:
                </p>
                <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                  <li>• <strong>RepeatEncounter:</strong> Limit how often people meet across sessions</li>
                  <li>• <strong>AttributeBalance:</strong> Maintain desired distributions (e.g., gender balance)</li>
                  <li>• <strong>MustStayTogether:</strong> Keep certain people in the same group</li>
                  <li>• <strong>ShouldNotBeTogether:</strong> Prevent certain people from being grouped</li>
                  <li>• <strong>ImmovablePeople:</strong> Fix someone to a specific group in specific sessions</li>
                </ul>
              </div>
            )}
          </div>

          {/* Sub-tabs for individual constraint types */}
          {(() => {
            const constraintTypeLabels = {
              'RepeatEncounter': 'Repeat Encounter Limits',
              'AttributeBalance': 'Attribute Balance',
              'ImmovablePeople': 'Immovable People',
              'MustStayTogether': 'Must Stay Together',
              'ShouldNotBeTogether': 'Should Not Be Together'
            } as const;

            const constraintsByType = (problem?.constraints || []).reduce((acc: Record<string, { constraint: Constraint; index: number }[]>, constraint, index) => {
              if (!acc[constraint.type]) {
                acc[constraint.type] = [];
              }
              acc[constraint.type].push({ constraint, index });
              return acc;
            }, {});

            const tabOrder = [...(constraintCategoryTab === 'soft' ? SOFT_TYPES : HARD_TYPES)] as (keyof typeof constraintTypeLabels)[];
            const selectedItems = constraintsByType[activeConstraintTab] || [];

            return (
              <>
                {/* Category tabs */}
                <div className="flex gap-2 mb-4">
                  {(['soft', 'hard'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setConstraintCategoryTab(cat);
                        const firstType = cat === 'soft' ? SOFT_TYPES[0] : HARD_TYPES[0];
                        setActiveConstraintTab(firstType);
                      }}
                      className={
                        'px-3 py-1 rounded-md text-sm font-medium transition-colors ' +
                        (constraintCategoryTab === cat ? 'btn-primary' : 'btn-secondary')
                      }
                    >
                      {cat === 'soft' ? 'Soft Constraints' : 'Hard Constraints'}
                    </button>
                  ))}
                </div>

                {/* Tab list */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {tabOrder.map((type) => (
                    <button
                      key={type}
                      onClick={() => setActiveConstraintTab(type)}
                      className={
                        'px-3 py-1 rounded-md text-sm font-medium transition-colors ' +
                        (activeConstraintTab === type ? 'btn-primary' : 'btn-secondary')
                      }
                    >
                      {constraintTypeLabels[type]}
                      <span className="ml-1 text-xs">({constraintsByType[type]?.length || 0})</span>
                    </button>
                  ))}
                </div>

                {/* Content for selected tab */}
                {problem?.constraints.length ? (
                  selectedItems.length ? (
                    <div className="space-y-3">
                      <h4 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }}></div>
                        {constraintTypeLabels[activeConstraintTab as keyof typeof constraintTypeLabels]}
                        <span className="text-sm font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                          {selectedItems.length}
                        </span>
                      </h4>

                      {/* Dashboard for Attribute Balance */}
                      {activeConstraintTab === 'AttributeBalance' && (
                        <AttributeBalanceDashboard constraints={selectedItems.map(i => i.constraint as AttributeBalanceConstraint)} problem={problem!} />
                      )}

                      <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
                        {selectedItems.map(({ constraint, index }) => (
                          <div key={index} className="rounded-lg border p-4 transition-colors hover:shadow-md" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xs font-medium px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                                    {constraint.type}
                                  </span>
                                  {constraint.type !== 'ImmovablePeople' && (
                                    <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}>
                                      Weight: {(constraint as Constraint & { penalty_weight: number }).penalty_weight}
                                    </span>
                                  )}
                                </div>
                                
                                <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                                  {constraint.type === 'RepeatEncounter' && (
                                    <>
                                      <div>Max encounters: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.max_allowed_encounters}</span></div>
                                      <div>Penalty function: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.penalty_function}</span></div>
                                    </>
                                  )}
                                  
                                  {constraint.type === 'AttributeBalance' && (
                                    <>
                                      <div>Group: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.group_id}</span></div>
                                      <div>Attribute: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.attribute_key}</span></div>
                                      <div className="break-words">Distribution: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{Object.entries(constraint.desired_values || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}</span></div>
                                      {constraint.sessions && constraint.sessions.length > 0 ? (
                                        <div>Sessions: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.sessions.map(s => s + 1).join(', ')}</span></div>
                                      ) : (
                                        <div>Sessions: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>All sessions</span></div>
                                      )}
                                    </>
                                  )}
                                  
                                  {constraint.type === 'ImmovablePeople' && (
                                    <>
                                      <div className="break-words flex flex-wrap items-center gap-1">
                                        <span>People:</span>
                                        {constraint.people.map((pid, idx) => {
                                          const per = problem?.people.find(p => p.id === pid);
                                          return (
                                            <React.Fragment key={pid}>
                                              {per ? <PersonCard person={per} /> : <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{pid}</span>}
                                              {idx < constraint.people.length - 1 && <span></span>}
                                            </React.Fragment>
                                          );
                                        })}
                                      </div>
                                      <div>Fixed to: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.group_id}</span></div>
                                      {constraint.sessions && constraint.sessions.length > 0 ? (
                                        <div>Sessions: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.sessions.map(s => s + 1).join(', ')}</span></div>
                                      ) : (
                                        <div>Sessions: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>All sessions</span></div>
                                      )}
                                    </>
                                  )}
                                  
                                  {(constraint.type === 'MustStayTogether' || constraint.type === 'ShouldNotBeTogether') && (
                                    <>
                                      <div className="break-words flex flex-wrap items-center gap-1">
                                        <span>People:</span>
                                        {constraint.people.map((pid, idx) => {
                                          const per = problem?.people.find(p => p.id === pid);
                                          return (
                                            <React.Fragment key={pid}>
                                              {per ? <PersonCard person={per} /> : <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{pid}</span>}
                                              {idx < constraint.people.length - 1 && <span></span>}
                                            </React.Fragment>
                                          );
                                        })}
                                      </div>
                                      {constraint.sessions && constraint.sessions.length > 0 ? (
                                        <div>Sessions: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.sessions.map(s => s + 1).join(', ')}</span></div>
                                      ) : (
                                        <div>Sessions: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>All sessions</span></div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex gap-1 ml-2">
                                <button
                                  onClick={() => handleEditConstraint(constraint, index)}
                                  className="p-1.5 rounded transition-colors"
                                  style={{ color: 'var(--text-tertiary)' }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = 'var(--color-accent)';
                                    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = 'var(--text-tertiary)';
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                  }}
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteConstraint(index)}
                                  className="p-1.5 rounded transition-colors"
                                  style={{ color: 'var(--text-tertiary)' }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = 'var(--color-error-600)';
                                    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = 'var(--text-tertiary)';
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                      <p>No {constraintTypeLabels[activeConstraintTab as keyof typeof constraintTypeLabels]} constraints defined yet.</p>
                    </div>
                  )
                ) : (
                  <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
                    <Settings className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                    <p>No constraints added yet</p>
                    <p className="text-sm">Add constraints to guide the optimization process</p>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Forms */}
      {showPersonForm && renderPersonForm()}
      {showGroupForm && renderGroupForm()}
      {showConstraintForm && renderConstraintForm()}
      
      {showAttributeForm && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50">
          <div className="rounded-lg p-6 w-full max-w-md mx-4 modal-content max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {editingAttribute ? 'Edit Attribute Definition' : 'Add Attribute Definition'}
                </h3>
              <button
                onClick={() => {
                  setShowAttributeForm(false);
                  setNewAttribute({ key: '', values: [''] });
                  setEditingAttribute(null);
                }}
                className="transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Attribute Name *
                </label>
                <input
                  type="text"
                  value={newAttribute.key}
                  onChange={(e) => setNewAttribute(prev => ({ ...prev, key: e.target.value }))}
                  className="input"
                  placeholder="e.g., department, experience, location"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Possible Values *
                </label>
                <div className="max-h-48 overflow-y-auto space-y-2 border rounded p-3" style={{ borderColor: 'var(--border-secondary)' }}>
                  {newAttribute.values.map((value, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => {
                          const newValues = [...newAttribute.values];
                          newValues[index] = e.target.value;
                          setNewAttribute(prev => ({ ...prev, values: newValues }));
                        }}
                        className="input flex-1"
                        placeholder={`Value ${index + 1}`}
                      />
                      {newAttribute.values.length > 1 && (
                        <button
                          onClick={() => {
                            const newValues = newAttribute.values.filter((_, i) => i !== index);
                            setNewAttribute(prev => ({ ...prev, values: newValues }));
                          }}
                          className="px-3 py-2 rounded-md transition-colors"
                          style={{ 
                            backgroundColor: 'var(--color-error-100)', 
                            color: 'var(--color-error-700)' 
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-error-200)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-error-100)'}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setNewAttribute(prev => ({ ...prev, values: [...prev.values, ''] }))}
                  className="btn-secondary text-sm mt-2"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Value
                </button>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={editingAttribute ? handleUpdateAttribute : handleAddAttribute}
                className="btn-primary flex-1 px-4 py-2"
              >
                {editingAttribute ? 'Update Attribute' : 'Add Attribute'}
              </button>
              <button
                onClick={() => {
                  setShowAttributeForm(false);
                  setNewAttribute({ key: '', values: [''] });
                  setEditingAttribute(null);
                }}
                className="btn-secondary px-4 py-2 rounded-md"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showBulkForm && renderBulkAddForm()}
      {showBulkUpdateForm && renderBulkUpdateForm()}
      {showGroupBulkForm && renderGroupBulkAddForm()}

      <input type="file" accept=".csv,text/csv" ref={csvFileInputRef} className="hidden" onChange={handleCsvFileSelected} />
      <input type="file" accept=".csv,text/csv" ref={groupCsvFileInputRef} className="hidden" onChange={handleGroupCsvFileSelected} />
      {showImmovableModal && (
        <ImmovablePeopleModal
           sessionsCount={sessionsCount}
           initial={editingImmovableIndex!==null ? (GetProblem().constraints[editingImmovableIndex] || null) : null}
           onCancel={()=>{setShowImmovableModal(false); setEditingImmovableIndex(null);} }
           onSave={(con)=>{
              const currentProblem = GetProblem();
              const updatedConstraints=[...currentProblem.constraints];
              if(editingImmovableIndex!==null){ 
                updatedConstraints[editingImmovableIndex]=con; 
              }
              else{ 
                updatedConstraints.push(con);
              } 
              
              setProblem({ 
                ...currentProblem, 
                constraints: updatedConstraints 
              });
              
              setShowImmovableModal(false);
              setEditingImmovableIndex(null);
           }}
        />
      )}

      {/* New individual constraint modals */}
      {showRepeatEncounterModal && (
        <RepeatEncounterModal
          initial={editingConstraintIndex !== null ? (GetProblem().constraints[editingConstraintIndex] || null) : null}
          onCancel={() => {
            setShowRepeatEncounterModal(false);
            setEditingConstraintIndex(null);
          }}
          onSave={(constraint) => {
            const currentProblem = GetProblem();
            const updatedConstraints = [...currentProblem.constraints];
            if (editingConstraintIndex !== null) {
              updatedConstraints[editingConstraintIndex] = constraint;
            } else {
              updatedConstraints.push(constraint);
            }
            
            setProblem({
              ...currentProblem,
              constraints: updatedConstraints
            });
            
            setShowRepeatEncounterModal(false);
            setEditingConstraintIndex(null);
          }}
        />
      )}

      {showAttributeBalanceModal && (
        <AttributeBalanceModal
          initial={editingConstraintIndex !== null ? (GetProblem().constraints[editingConstraintIndex] || null) : null}
          onCancel={() => {
            setShowAttributeBalanceModal(false);
            setEditingConstraintIndex(null);
          }}
          onSave={(constraint) => {
            const currentProblem = GetProblem();
            const updatedConstraints = [...currentProblem.constraints];
            if (editingConstraintIndex !== null) {
              updatedConstraints[editingConstraintIndex] = constraint;
            } else {
              updatedConstraints.push(constraint);
            }
            
            setProblem({
              ...currentProblem,
              constraints: updatedConstraints
            });
            
            setShowAttributeBalanceModal(false);
            setEditingConstraintIndex(null);
          }}
        />
      )}

      {showShouldNotBeTogetherModal && (
        <ShouldNotBeTogetherModal
          sessionsCount={sessionsCount}
          initial={editingConstraintIndex !== null ? (GetProblem().constraints[editingConstraintIndex] || null) : null}
          onCancel={() => {
            setShowShouldNotBeTogetherModal(false);
            setEditingConstraintIndex(null);
          }}
          onSave={(constraint) => {
            const currentProblem = GetProblem();
            const updatedConstraints = [...currentProblem.constraints];
            if (editingConstraintIndex !== null) {
              updatedConstraints[editingConstraintIndex] = constraint;
            } else {
              updatedConstraints.push(constraint);
            }
            
            setProblem({
              ...currentProblem,
              constraints: updatedConstraints
            });
            
            setShowShouldNotBeTogetherModal(false);
            setEditingConstraintIndex(null);
          }}
        />
      )}

      {showShouldStayTogetherModal && (
        <ShouldStayTogetherModal
          sessionsCount={sessionsCount}
          initial={editingConstraintIndex !== null ? (GetProblem().constraints[editingConstraintIndex] || null) : null}
          onCancel={() => {
            setShowShouldStayTogetherModal(false);
            setEditingConstraintIndex(null);
          }}
          onSave={(constraint) => {
            const currentProblem = GetProblem();
            const updatedConstraints = [...currentProblem.constraints];
            if (editingConstraintIndex !== null) {
              updatedConstraints[editingConstraintIndex] = constraint;
            } else {
              updatedConstraints.push(constraint);
            }
            setProblem({
              ...currentProblem,
              constraints: updatedConstraints,
            });
            setShowShouldStayTogetherModal(false);
            setEditingConstraintIndex(null);
          }}
        />
      )}

      {showPairMeetingCountModal && (
        <PairMeetingCountModal
          people={problem?.people ?? []}
          totalSessions={problem?.num_sessions ?? 0}
          initial={editingConstraintIndex !== null && problem ? problem.constraints[editingConstraintIndex] : null}
          onCancel={() => setShowPairMeetingCountModal(false)}
          onSave={(constraint) => {
            if (!problem) {
              setShowPairMeetingCountModal(false);
              return;
            }
            const next = [...problem.constraints];
            if (editingConstraintIndex !== null) next[editingConstraintIndex] = constraint;
            else next.push(constraint);
            setProblem({ ...problem, constraints: next });
            setShowPairMeetingCountModal(false);
          }}
        />
      )}

      {showMustStayTogetherModal && (
        <MustStayTogetherModal
          sessionsCount={sessionsCount}
          initial={editingConstraintIndex !== null ? (GetProblem().constraints[editingConstraintIndex] || null) : null}
          onCancel={() => {
            setShowMustStayTogetherModal(false);
            setEditingConstraintIndex(null);
          }}
          onSave={(constraint) => {
            const currentProblem = GetProblem();
            const updatedConstraints = [...currentProblem.constraints];
            if (editingConstraintIndex !== null) {
              updatedConstraints[editingConstraintIndex] = constraint;
            } else {
              updatedConstraints.push(constraint);
            }
            
            setProblem({
              ...currentProblem,
              constraints: updatedConstraints
            });
            
            setShowMustStayTogetherModal(false);
            setEditingConstraintIndex(null);
          }}
        />
      )}

      {/* Demo Data Warning Modal */}
      <DemoDataWarningModal
        isOpen={showDemoWarningModal}
        onClose={handleDemoCancel}
        onOverwrite={handleDemoOverwrite}
        onLoadNew={handleDemoLoadNew}
        demoCaseName={pendingDemoCaseId ? demoCasesWithMetrics.find(c => c.id === pendingDemoCaseId)?.name || 'Demo Case' : 'Demo Case'}
      />
    </div>
  );
} 