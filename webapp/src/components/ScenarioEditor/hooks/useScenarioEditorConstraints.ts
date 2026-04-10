import { useState } from 'react';
import type { AttributeDefinition, Constraint, Scenario } from '../../../types';
import { findAttributeDefinition, getAttributeDefinitionName, updateAttributeBalanceConstraintReference } from '../../../services/scenarioAttributes';
import type { ConstraintFormState } from '../ConstraintFormModal';
import {
  createAllSessionScopeDraft,
  normalizeSessionSelection,
  optionalSessionsToDraft,
  sessionScopeDraftToOptionalSessions,
} from '../shared/sessionScope';

type NotificationPayload = {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
};

interface UseScenarioEditorConstraintsArgs {
  scenario: Scenario | null;
  attributeDefinitions: AttributeDefinition[];
  sessionsCount: number;
  addNotification: (notification: NotificationPayload) => void;
  setScenario: (scenario: Scenario) => void;
}

export function useScenarioEditorConstraints({
  scenario,
  attributeDefinitions,
  sessionsCount,
  addNotification,
  setScenario,
}: UseScenarioEditorConstraintsArgs) {
  const [showConstraintForm, setShowConstraintForm] = useState(false);
  const [editingConstraint, setEditingConstraint] = useState<{ constraint: Constraint; index: number } | null>(null);
  const [constraintForm, setConstraintForm] = useState<ConstraintFormState>({
    type: 'RepeatEncounter',
    penalty_weight: 1,
    sessionScope: createAllSessionScopeDraft(),
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

  const resolveConstraintAttribute = () => {
    const definition = findAttributeDefinition(attributeDefinitions, {
      id: constraintForm.attribute_id,
      name: constraintForm.attribute_key,
    });

    if (!definition) {
      throw new Error('Please select a valid attribute.');
    }

    return definition;
  };

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

        case 'AttributeBalance': {
          if (!constraintForm.group_id || !constraintForm.desired_values) {
            throw new Error('Please fill in all required fields for attribute balance');
          }
          const definition = resolveConstraintAttribute();
          newConstraint = {
            type: 'AttributeBalance',
            group_id: constraintForm.group_id,
            attribute_id: definition.id,
            attribute_key: definition.name,
            desired_values: constraintForm.desired_values,
            penalty_weight: constraintForm.penalty_weight || 50,
            sessions: sessionScopeDraftToOptionalSessions(
              constraintForm.sessionScope ?? createAllSessionScopeDraft(),
              sessionsCount,
            ),
          };
          break;
        }

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
                  sessions: sessionScopeDraftToOptionalSessions(
                    constraintForm.sessionScope ?? createAllSessionScopeDraft(),
                    sessionsCount,
                  ),
                }
              : {
                  type: 'ShouldNotBeTogether',
                  people: constraintForm.people,
                  penalty_weight: constraintForm.penalty_weight || 1000,
                  sessions: sessionScopeDraftToOptionalSessions(
                    constraintForm.sessionScope ?? createAllSessionScopeDraft(),
                    sessionsCount,
                  ),
                };
          break;

        default:
          throw new Error('Invalid constraint type');
      }

      const updatedScenario: Scenario = {
        ...scenario!,
        constraints: [...(scenario?.constraints || []), newConstraint].map((constraint) =>
          constraint.type === 'AttributeBalance'
            ? ({ ...constraint, ...updateAttributeBalanceConstraintReference(constraint, attributeDefinitions) } as Constraint)
            : constraint,
        ),
      };

      setScenario(updatedScenario);
      setConstraintForm({ type: 'RepeatEncounter', penalty_weight: 1, sessionScope: createAllSessionScopeDraft() });
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
          attribute_id: constraint.attribute_id,
          attribute_key: constraint.attribute_key,
          desired_values: constraint.desired_values,
          penalty_weight: constraint.penalty_weight,
          sessionScope: optionalSessionsToDraft(constraint.sessions, sessionsCount),
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
          sessionScope: optionalSessionsToDraft(constraint.sessions, sessionsCount),
          penalty_weight: undefined,
        });
        break;
      case 'ShouldNotBeTogether':
        setConstraintForm({
          type: 'ShouldNotBeTogether',
          people: constraint.people,
          sessionScope: optionalSessionsToDraft(constraint.sessions, sessionsCount),
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

        case 'AttributeBalance': {
          if (!constraintForm.group_id || !constraintForm.desired_values) {
            throw new Error('Please fill in all required fields for attribute balance');
          }
          const definition = resolveConstraintAttribute();
          updatedConstraint = {
            type: 'AttributeBalance',
            group_id: constraintForm.group_id,
            attribute_id: definition.id,
            attribute_key: definition.name,
            desired_values: constraintForm.desired_values,
            penalty_weight: constraintForm.penalty_weight || 50,
            sessions: sessionScopeDraftToOptionalSessions(
              constraintForm.sessionScope ?? createAllSessionScopeDraft(),
              sessionsCount,
            ),
          };
          break;
        }

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
                  sessions: sessionScopeDraftToOptionalSessions(
                    constraintForm.sessionScope ?? createAllSessionScopeDraft(),
                    sessionsCount,
                  ),
                }
              : {
                  type: 'ShouldNotBeTogether',
                  people: constraintForm.people,
                  penalty_weight: constraintForm.penalty_weight || 1000,
                  sessions: sessionScopeDraftToOptionalSessions(
                    constraintForm.sessionScope ?? createAllSessionScopeDraft(),
                    sessionsCount,
                  ),
                };
          break;

        default:
          throw new Error('Invalid constraint type');
      }

      const updatedConstraints = [...(scenario?.constraints || [])];
      updatedConstraints[editingConstraint.index] = updatedConstraint;

      const updatedScenario: Scenario = {
        ...scenario!,
        constraints: updatedConstraints.map((constraint) =>
          constraint.type === 'AttributeBalance'
            ? ({ ...constraint, ...updateAttributeBalanceConstraintReference(constraint, attributeDefinitions) } as Constraint)
            : constraint,
        ),
      };

      setScenario(updatedScenario);
      setEditingConstraint(null);
      setConstraintForm({ type: 'RepeatEncounter', penalty_weight: 1, sessionScope: createAllSessionScopeDraft() });
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
    const updatedConstraints = scenario?.constraints.filter((_, i) => i !== index) || [];
    const updatedScenario: Scenario = {
      ...scenario!,
      constraints: updatedConstraints,
    };

    setScenario(updatedScenario);

    addNotification({
      type: 'success',
      title: 'Constraint Removed',
      message: 'Constraint has been removed',
    });
  };

  const createRepeatEncounterGridRow = () => ({
    constraint: {
      type: 'RepeatEncounter',
      max_allowed_encounters: 1,
      penalty_function: 'linear',
      penalty_weight: 1,
    } satisfies Constraint,
    index: -1,
  });

  const applyRepeatEncounterGridRows = (
    items: Array<{ constraint: Extract<Constraint, { type: 'RepeatEncounter' }>; index: number }>,
  ) => {
    if (!scenario) {
      return;
    }

    const otherConstraints = scenario.constraints.filter((constraint) => constraint.type !== 'RepeatEncounter');
    const nextRepeatConstraints = items.map(({ constraint }) => ({
      ...constraint,
      max_allowed_encounters: Math.max(1, Math.round(Number(constraint.max_allowed_encounters) || 1)),
      penalty_weight: Math.max(0, Number(constraint.penalty_weight) || 0),
    }) satisfies Constraint);

    setScenario({
      ...scenario,
      constraints: [...otherConstraints, ...nextRepeatConstraints],
    });

    addNotification({
      type: 'success',
      title: 'Repeat Encounter Updated',
      message: `Applied ${nextRepeatConstraints.length} repeat-encounter row${nextRepeatConstraints.length === 1 ? '' : 's'}.`,
    });
  };

  const createAttributeBalanceGridRow = () => {
    const definition = attributeDefinitions[0];
    return {
      constraint: {
        type: 'AttributeBalance',
        group_id: scenario?.groups[0]?.id ?? '',
        attribute_id: definition?.id,
        attribute_key: definition ? getAttributeDefinitionName(definition) : '',
        desired_values: {},
        penalty_weight: 50,
        mode: 'exact',
        sessions: undefined,
      } satisfies Extract<Constraint, { type: 'AttributeBalance' }>,
      index: -1,
    };
  };

  const applyAttributeBalanceGridRows = (
    items: Array<{ constraint: Extract<Constraint, { type: 'AttributeBalance' }>; index: number }>,
  ) => {
    if (!scenario) {
      return;
    }

    const otherConstraints = scenario.constraints.filter((constraint) => constraint.type !== 'AttributeBalance');
    const nextAttributeBalanceConstraints = items.flatMap(({ constraint }) => {
      const reference = updateAttributeBalanceConstraintReference(constraint, attributeDefinitions);
      const definition = findAttributeDefinition(attributeDefinitions, {
        id: reference.attribute_id,
        name: reference.attribute_key,
      });

      const allowedKeys = new Set(definition?.values ?? Object.keys(constraint.desired_values ?? {}));
      const desiredValues = Object.fromEntries(
        Object.entries(constraint.desired_values ?? {}).filter(([key, value]) => {
          const numericValue = Number(value);
          return allowedKeys.has(key) && Number.isFinite(numericValue);
        }).map(([key, value]) => [key, Number(value)]),
      );

      if (!constraint.group_id || !reference.attribute_key) {
        return [];
      }

      const normalizedSessions = constraint.sessions?.length
        ? normalizeSessionSelection(constraint.sessions, scenario.num_sessions)
        : undefined;

      return [{
        ...constraint,
        ...reference,
        desired_values: desiredValues,
        penalty_weight: Math.max(0, Number(constraint.penalty_weight) || 0),
        mode: constraint.mode === 'at_least' ? 'at_least' : 'exact',
        sessions: normalizedSessions,
      } satisfies Constraint];
    });

    setScenario({
      ...scenario,
      constraints: [...otherConstraints, ...nextAttributeBalanceConstraints],
    });

    addNotification({
      type: 'success',
      title: 'Attribute Balance Updated',
      message: `Applied ${nextAttributeBalanceConstraints.length} attribute-balance row${nextAttributeBalanceConstraints.length === 1 ? '' : 's'}.`,
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
    handleAddConstraint,
    handleEditConstraint,
    handleUpdateConstraint,
    handleDeleteConstraint,
    createRepeatEncounterGridRow,
    applyRepeatEncounterGridRows,
    createAttributeBalanceGridRow,
    applyAttributeBalanceGridRows,
  };
}
