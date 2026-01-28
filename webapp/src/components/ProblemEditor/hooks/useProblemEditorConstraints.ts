import { useEffect, useMemo, useState } from 'react';
import type { Constraint, Problem } from '../../../types';
import type { ConstraintFormState } from '../ConstraintFormModal';

type NotificationPayload = {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
};

interface UseProblemEditorConstraintsArgs {
  problem: Problem | null;
  sessionsCount: number;
  addNotification: (notification: NotificationPayload) => void;
  setProblem: (problem: Problem) => void;
}

export function useProblemEditorConstraints({
  problem,
  sessionsCount,
  addNotification,
  setProblem,
}: UseProblemEditorConstraintsArgs) {
  const [showConstraintForm, setShowConstraintForm] = useState(false);
  const [editingConstraint, setEditingConstraint] = useState<{ constraint: Constraint; index: number } | null>(null);
  const [constraintForm, setConstraintForm] = useState<ConstraintFormState>({
    type: 'RepeatEncounter',
    penalty_weight: 1,
  });

  const [showImmovableModal, setShowImmovableModal] = useState(false);
  const [editingImmovableIndex, setEditingImmovableIndex] = useState<number | null>(null);

  const [showRepeatEncounterModal, setShowRepeatEncounterModal] = useState(false);
  const [showAttributeBalanceModal, setShowAttributeBalanceModal] = useState(false);
  const [showShouldNotBeTogetherModal, setShowShouldNotBeTogetherModal] = useState(false);
  const [showShouldStayTogetherModal, setShowShouldStayTogetherModal] = useState(false);
  const [showMustStayTogetherModal, setShowMustStayTogetherModal] = useState(false);
  const [showPairMeetingCountModal, setShowPairMeetingCountModal] = useState(false);
  const [editingConstraintIndex, setEditingConstraintIndex] = useState<number | null>(null);

  const SOFT_TYPES = useMemo(
    () => ['RepeatEncounter', 'AttributeBalance', 'ShouldNotBeTogether', 'ShouldStayTogether', 'PairMeetingCount'] as const,
    [],
  );
  const HARD_TYPES = useMemo(() => ['ImmovablePeople', 'MustStayTogether'] as const, []);

  type ConstraintCategory = 'soft' | 'hard';
  const [constraintCategoryTab, setConstraintCategoryTab] = useState<ConstraintCategory>('soft');
  const [activeConstraintTab, setActiveConstraintTab] = useState<string>(SOFT_TYPES[0]);

  useEffect(() => {
    const validTypes = (constraintCategoryTab === 'soft' ? SOFT_TYPES : HARD_TYPES) as readonly string[];
    if (!validTypes.includes(activeConstraintTab)) {
      setActiveConstraintTab(validTypes[0]);
    }
  }, [constraintCategoryTab, activeConstraintTab, SOFT_TYPES, HARD_TYPES]);

  const handleAddConstraint = () => {
    let newConstraint: Constraint;

    try {
      switch (constraintForm.type) {
        case 'RepeatEncounter':
          if (
            constraintForm.max_allowed_encounters === null ||
            constraintForm.max_allowed_encounters === undefined ||
            constraintForm.max_allowed_encounters < 0
          ) {
            throw new Error('Please enter a valid maximum allowed encounters');
          }
          if (
            constraintForm.penalty_weight === null ||
            constraintForm.penalty_weight === undefined ||
            constraintForm.penalty_weight <= 0
          ) {
            throw new Error('Please enter a valid penalty weight');
          }
          newConstraint = {
            type: 'RepeatEncounter',
            max_allowed_encounters: constraintForm.max_allowed_encounters,
            penalty_function: constraintForm.penalty_function || 'squared',
            penalty_weight: constraintForm.penalty_weight,
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
            sessions: constraintForm.sessions?.length ? constraintForm.sessions : undefined,
          };
          break;

        case 'ImmovablePeople': {
          if (!constraintForm.people?.length || !constraintForm.group_id) {
            throw new Error('Please select at least one person and a fixed group');
          }
          const allSessions = Array.from({ length: sessionsCount ?? 3 }, (_, i) => i);
          const immovableSessions = constraintForm.sessions?.length ? constraintForm.sessions : allSessions;
          newConstraint = {
            type: 'ImmovablePeople',
            people: constraintForm.people,
            group_id: constraintForm.group_id,
            sessions: immovableSessions,
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
        constraints: [...(problem?.constraints || []), newConstraint],
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

    switch (constraint.type) {
      case 'RepeatEncounter':
        setConstraintForm({
          type: constraint.type,
          max_allowed_encounters: constraint.max_allowed_encounters,
          penalty_function: constraint.penalty_function,
          penalty_weight: constraint.penalty_weight,
        });
        break;
      case 'AttributeBalance':
        setConstraintForm({
          type: constraint.type,
          group_id: constraint.group_id,
          attribute_key: constraint.attribute_key,
          desired_values: constraint.desired_values,
          penalty_weight: constraint.penalty_weight,
          sessions: constraint.sessions,
        });
        break;
      case 'ImmovablePeople':
        setConstraintForm({
          type: constraint.type,
          people: constraint.people,
          group_id: constraint.group_id,
          sessions: constraint.sessions,
          penalty_weight: undefined,
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
            penalty_weight: constraintForm.penalty_weight || 1,
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
            sessions: constraintForm.sessions?.length ? constraintForm.sessions : undefined,
          };
          break;

        case 'ImmovablePeople': {
          if (!constraintForm.people?.length || !constraintForm.group_id) {
            throw new Error('Please select at least one person and a fixed group');
          }
          const allUpdateSessions = Array.from({ length: sessionsCount }, (_, i) => i);
          const immovableUpdateSessions = constraintForm.sessions?.length ? constraintForm.sessions : allUpdateSessions;
          updatedConstraint = {
            type: 'ImmovablePeople',
            people: constraintForm.people,
            group_id: constraintForm.group_id,
            sessions: immovableUpdateSessions,
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
        constraints: updatedConstraints,
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
      constraints: updatedConstraints,
    };

    setProblem(updatedProblem);

    addNotification({
      type: 'success',
      title: 'Constraint Removed',
      message: 'Constraint has been removed',
    });
  };

  return {
    showConstraintForm,
    setShowConstraintForm,
    editingConstraint,
    setEditingConstraint,
    constraintForm,
    setConstraintForm,
    showImmovableModal,
    setShowImmovableModal,
    editingImmovableIndex,
    setEditingImmovableIndex,
    showRepeatEncounterModal,
    setShowRepeatEncounterModal,
    showAttributeBalanceModal,
    setShowAttributeBalanceModal,
    showShouldNotBeTogetherModal,
    setShowShouldNotBeTogetherModal,
    showShouldStayTogetherModal,
    setShowShouldStayTogetherModal,
    showMustStayTogetherModal,
    setShowMustStayTogetherModal,
    showPairMeetingCountModal,
    setShowPairMeetingCountModal,
    editingConstraintIndex,
    setEditingConstraintIndex,
    SOFT_TYPES,
    HARD_TYPES,
    constraintCategoryTab,
    setConstraintCategoryTab,
    activeConstraintTab,
    setActiveConstraintTab,
    handleAddConstraint,
    handleEditConstraint,
    handleUpdateConstraint,
    handleDeleteConstraint,
  };
}
