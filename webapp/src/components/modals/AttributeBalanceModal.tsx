import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Constraint } from '../../types';
import { findAttributeDefinition } from '../../services/scenarioAttributes';
import { useAppStore } from '../../store';
import { getConstraintAddLabel, getConstraintEditLabel } from '../../utils/constraintDisplay';
import { SessionScopeField } from '../ScenarioEditor/shared/SessionScopeField';
import { getDraftSessionSelection } from '../ScenarioEditor/shared/sessionScope';
import {
  createAllSessionScopeDraft,
  optionalSessionsToDraft,
  sessionScopeDraftToOptionalSessions,
  type SessionScopeDraft,
} from '../ScenarioEditor/shared/sessionScope';
import {
  AttributeDistributionField,
  getAttributeDistributionBuckets,
  NumberField,
  NUMBER_FIELD_PRESETS,
} from '../ui';
import { buildSuggestedAttributeDistribution, resolveGroupCapacityForSessions } from './attributeBalanceDistribution';

interface Props {
  initial?: Constraint | null;
  onCancel: () => void;
  onSave: (constraint: Constraint) => void;
}

interface FormState {
  group_id: string;
  attribute_id?: string;
  attribute_key: string;
  desired_values: Record<string, number>;
  penalty_weight: number | null;
  sessionScope: SessionScopeDraft;
  mode: 'exact' | 'at_least';
}

export function AttributeBalanceModal({ initial, onCancel, onSave }: Props) {
  const { resolveScenario, attributeDefinitions, ui } = useAppStore();

  const getInitialState = (): FormState => {
    if (ui.isLoading) {
      return {
        group_id: '',
        attribute_key: '',
        desired_values: {},
        penalty_weight: 10,
        sessionScope: createAllSessionScopeDraft(),
        mode: 'exact',
      };
    }

    const scenario = resolveScenario();
    const editing = !!initial;

    if (editing && initial?.type === 'AttributeBalance') {
      return {
        group_id: initial.group_id || '',
        attribute_id: initial.attribute_id,
        attribute_key: initial.attribute_key || '',
        desired_values: initial.desired_values || {},
        penalty_weight: initial.penalty_weight || 10,
        sessionScope: optionalSessionsToDraft(initial.sessions, scenario.num_sessions),
        mode: initial.mode ?? 'exact',
      };
    }

    const defaultGroup = scenario.groups?.[0];
    const defaultAttribute = attributeDefinitions?.[0];
    const defaultSessions = getDraftSessionSelection(createAllSessionScopeDraft(), scenario.num_sessions);
    const defaultCapacity = resolveGroupCapacityForSessions(defaultGroup, defaultSessions).capacity;

    return {
      group_id: scenario.groups?.[0]?.id || '',
      attribute_id: attributeDefinitions?.[0]?.id,
      attribute_key: attributeDefinitions?.[0]?.name || '',
      desired_values: defaultAttribute
        ? buildSuggestedAttributeDistribution({
            people: scenario.people,
            attributeDefinition: defaultAttribute,
            attributeDefinitions,
            sessions: defaultSessions,
            capacity: defaultCapacity,
          })
        : {},
      penalty_weight: 10,
      sessionScope: createAllSessionScopeDraft(),
      mode: 'exact',
    };
  };

  const [formState, setFormState] = useState<FormState>(getInitialState);
  const [validationError, setValidationError] = useState('');
  const [hasCustomizedDistribution, setHasCustomizedDistribution] = useState(
    Boolean(initial && initial.type === 'AttributeBalance'),
  );

  const scenario = ui.isLoading ? null : resolveScenario();
  const editing = !!initial;
  const sessionsCount = scenario?.num_sessions || 0;
  const selectedSessions = getDraftSessionSelection(formState.sessionScope, sessionsCount);

  const selectedAttribute = findAttributeDefinition(attributeDefinitions, {
    id: formState.attribute_id,
    name: formState.attribute_key,
  });
  const selectedGroup = scenario?.groups?.find((group) => group.id === formState.group_id);
  const capacityResolution = resolveGroupCapacityForSessions(selectedGroup, selectedSessions);
  const distributionBuckets = selectedAttribute ? getAttributeDistributionBuckets(selectedAttribute.values) : [];
  const buildSuggestedDesiredValuesForState = (nextState: Pick<FormState, 'group_id' | 'attribute_id' | 'attribute_key' | 'sessionScope'>) => {
    if (!scenario) {
      return {};
    }

    const nextAttribute = findAttributeDefinition(attributeDefinitions, {
      id: nextState.attribute_id,
      name: nextState.attribute_key,
    });
    const nextGroup = scenario.groups?.find((group) => group.id === nextState.group_id);
    if (!nextAttribute || !nextGroup) {
      return {};
    }

    const nextSessions = getDraftSessionSelection(nextState.sessionScope, sessionsCount);
    const nextCapacity = resolveGroupCapacityForSessions(nextGroup, nextSessions).capacity;

    return buildSuggestedAttributeDistribution({
      people: scenario.people,
      attributeDefinition: nextAttribute,
      attributeDefinitions,
      sessions: nextSessions,
      capacity: nextCapacity,
    });
  };

  const isPenaltyWeightValid = (value: number | null) => value !== null && value > 0;

  const distributionHint = selectedAttribute
    ? [
        'Drag the divider handles to repartition the group, or use the chips for precise edits and intentional over-allocation.',
        capacityResolution.hasVariance
          ? `Using the smallest selected-session group capacity (${capacityResolution.capacity}) because capacity varies by session.`
          : null,
        'Suggested counts are seeded from the selected sessions\' attribute mix, including missing values as Not allocated.',
      ]
        .filter(Boolean)
        .join(' ')
    : undefined;

  if (!scenario) {
    return null;
  }

  const handleSave = () => {
    setValidationError('');

    if (!formState.group_id) {
      setValidationError('Please select a group.');
      return;
    }
    if (!formState.attribute_key) {
      setValidationError('Please select an attribute.');
      return;
    }
    if (Object.keys(formState.desired_values).length === 0) {
      setValidationError('Please allocate at least one attribute value in the distribution.');
      return;
    }
    if (!isPenaltyWeightValid(formState.penalty_weight)) {
      setValidationError('Penalty weight must be a positive number.');
      return;
    }

    const newConstraint: Constraint = {
      type: 'AttributeBalance',
      group_id: formState.group_id,
      attribute_id: formState.attribute_id,
      attribute_key: formState.attribute_key,
      desired_values: formState.desired_values,
      penalty_weight: formState.penalty_weight!,
      mode: formState.mode,
      sessions: sessionScopeDraftToOptionalSessions(formState.sessionScope, sessionsCount),
    };

    onSave(newConstraint);
  };

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="rounded-lg p-4 sm:p-6 w-full max-w-3xl mx-auto modal-content max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {editing ? getConstraintEditLabel('AttributeBalance') : getConstraintAddLabel('AttributeBalance')}
          </h3>
          <button
            onClick={onCancel}
            className="transition-colors p-2 -m-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {validationError ? (
          <div
            className="mb-4 p-3 rounded-md border"
            style={{
              backgroundColor: 'var(--color-error-50)',
              borderColor: 'var(--color-error-200)',
              color: 'var(--color-error-700)',
            }}
          >
            {validationError}
          </div>
        ) : null}

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Group *
            </label>
            <select
              name="group_id"
              value={formState.group_id}
              onChange={(event) => {
                setFormState((previous) => {
                  const nextState = { ...previous, group_id: event.target.value };
                  if (!editing && !hasCustomizedDistribution) {
                    return {
                      ...nextState,
                      desired_values: buildSuggestedDesiredValuesForState(nextState),
                    };
                  }
                  return nextState;
                });
              }}
              className="select w-full text-base py-3"
            >
              {scenario.groups?.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Attribute *
            </label>
            <select
              name="attribute_id"
              value={formState.attribute_id || ''}
              onChange={(event) => {
                const selectedDefinition = attributeDefinitions.find((definition) => definition.id === event.target.value);
                const nextState = {
                  ...formState,
                  attribute_id: selectedDefinition?.id,
                  attribute_key: selectedDefinition?.name || '',
                  desired_values: {},
                };
                setHasCustomizedDistribution(false);
                setFormState({
                  ...nextState,
                  desired_values: buildSuggestedDesiredValuesForState(nextState),
                });
              }}
              className="select w-full text-base py-3"
            >
              {attributeDefinitions.map((attributeDefinition) => (
                <option key={attributeDefinition.id} value={attributeDefinition.id}>
                  {attributeDefinition.name}
                </option>
              ))}
            </select>
          </div>

          <SessionScopeField
            compact
            label="Sessions"
            totalSessions={sessionsCount}
            value={formState.sessionScope}
            onChange={(sessionScope) => {
              setFormState((previous) => {
                const nextState = { ...previous, sessionScope };
                if (!editing && !hasCustomizedDistribution) {
                  return {
                    ...nextState,
                    desired_values: buildSuggestedDesiredValuesForState(nextState),
                  };
                }
                return nextState;
              });
            }}
          />

          {selectedAttribute ? (
            <div>
              <AttributeDistributionField
                label="Desired Distribution *"
                buckets={distributionBuckets}
                value={formState.desired_values}
                capacity={capacityResolution.capacity}
                hint={distributionHint}
                error={validationError.includes('distribution') ? validationError : undefined}
                onChange={(desiredValues) => {
                  setHasCustomizedDistribution(true);
                  setFormState((previous) => ({ ...previous, desired_values: desiredValues }));
                }}
              />
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Mode
            </label>
            <select
              value={formState.mode}
              onChange={(event) => setFormState((previous) => ({ ...previous, mode: event.target.value as 'exact' | 'at_least' }))}
              className="select w-full text-base py-3"
            >
              <option value="exact">Exact (penalize deviation both ways)</option>
              <option value="at_least">At least (penalize only shortfalls)</option>
            </select>
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              Choose &quot;At least&quot; to enforce minimum counts without penalizing overshoot.
            </p>
          </div>

          <div>
            <NumberField
              label="Penalty Weight"
              value={formState.penalty_weight}
              onChange={(value) => setFormState((previous) => ({ ...previous, penalty_weight: value }))}
              error={!isPenaltyWeightValid(formState.penalty_weight) ? 'Enter a positive weight.' : undefined}
              {...NUMBER_FIELD_PRESETS.penaltyWeight}
            />
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              Higher values make the solver prioritize this constraint more.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-3 mt-8 pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
          <button onClick={onCancel} className="btn-secondary flex-1 sm:flex-none px-6 py-3 text-base font-medium">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary flex-1 sm:flex-none px-6 py-3 text-base font-medium">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
