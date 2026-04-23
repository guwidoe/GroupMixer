import React from 'react';
import type { Constraint, Scenario } from '../../../../types';
import { findAttributeDefinition, getAttributeDefinitionName } from '../../../../services/scenarioAttributes';
import { useAppStore } from '../../../../store';
import ConstraintPersonChip from '../../../ConstraintPersonChip';
import { removePersonFromPeopleConstraint } from '../../../constraints/constraintMutations';
import { AttributeDistributionField, getAttributeDistributionBuckets } from '../../../ui';
import { resolveGroupCapacityForSessions } from '../../../modals/attributeBalanceDistribution';
import {
  SetupCardGrid,
  SetupKeyValueList,
  SetupPeopleNodeList,
  SetupSessionsBadgeList,
} from '../../shared/cards';
import type {
  AttributeBalanceConstraint,
  IndexedConstraint,
  PairMeetingCountConstraint,
  PeopleConstraint,
} from './types';

export function useConstraintScenario() {
  const { resolveScenario, setScenario, ui, attributeDefinitions, addNotification } = useAppStore();

  if (ui.isLoading) {
    return { scenario: null, setScenario, attributeDefinitions: [], addNotification, isLoading: true } as const;
  }

  return {
    scenario: resolveScenario(),
    setScenario,
    attributeDefinitions,
    addNotification,
    isLoading: false,
  } as const;
}

export function getIndexedConstraints<T extends Constraint['type']>(scenario: Scenario, type: T) {
  return scenario.constraints
    .map((constraint, index) => ({ constraint, index }))
    .filter((item): item is IndexedConstraint<Extract<Constraint, { type: T }>> => item.constraint.type === type);
}

export function resolveAttributeBalanceDefinition(
  constraint: AttributeBalanceConstraint,
  attributeDefinitions: ReturnType<typeof useAppStore.getState>['attributeDefinitions'],
) {
  return findAttributeDefinition(attributeDefinitions, {
    id: constraint.attribute_id,
    name: constraint.attribute_key,
  });
}

export function getAttributeBalanceAttributeName(
  constraint: AttributeBalanceConstraint,
  attributeDefinitions: ReturnType<typeof useAppStore.getState>['attributeDefinitions'],
) {
  const definition = resolveAttributeBalanceDefinition(constraint, attributeDefinitions);
  return definition ? getAttributeDefinitionName(definition) : constraint.attribute_key;
}

export function getAttributeBalanceTargetOptions(
  constraint: AttributeBalanceConstraint,
  attributeDefinitions: ReturnType<typeof useAppStore.getState>['attributeDefinitions'],
) {
  const definition = resolveAttributeBalanceDefinition(constraint, attributeDefinitions);
  return definition?.values ?? [];
}

export function formatAttributeBalanceTargets(targets: Record<string, number> | undefined) {
  const entries = Object.entries(targets ?? {});
  if (entries.length === 0) {
    return '—';
  }

  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');
}

function createPeopleNodes(
  scenario: Scenario,
  people: string[],
  index: number,
  minimumRemainingPeople: number,
  setScenario: (scenario: Scenario) => void,
  invalidRemovalMessage: string,
) {
  return people.map((personId) => (
    <ConstraintPersonChip
      key={personId}
      personId={personId}
      people={scenario.people}
      onRemove={(removeId) => {
        const remainingPeople = people.filter((id) => id !== removeId);
        const willBeInvalid = remainingPeople.length < minimumRemainingPeople;
        if (willBeInvalid) {
          if (!window.confirm(invalidRemovalMessage)) return;
        }
        setScenario(removePersonFromPeopleConstraint(scenario, index, removeId, minimumRemainingPeople));
      }}
    />
  ));
}

export function renderPeopleConstraintContent(
  scenario: Scenario,
  constraint: PeopleConstraint,
  index: number,
  setScenario: (scenario: Scenario) => void,
) {
  const minimumRemainingPeople = constraint.type === 'ImmovablePeople' ? 1 : 2;
  const invalidRemovalMessage =
    constraint.type === 'ImmovablePeople'
      ? 'Removing this person will leave the constraint empty. Remove the entire constraint?'
      : 'Removing this person will leave the constraint invalid. Remove the entire constraint?';

  return (
    <>
      <SetupPeopleNodeList
        label={constraint.type === 'PairMeetingCount' ? 'Pair' : 'People'}
        people={createPeopleNodes(scenario, constraint.people, index, minimumRemainingPeople, setScenario, invalidRemovalMessage)}
      />
      {'group_id' in constraint ? <SetupKeyValueList items={[{ label: 'Group', value: constraint.group_id }]} /> : null}
      <SetupSessionsBadgeList sessions={constraint.sessions} />
    </>
  );
}

export function renderAttributeBalanceContent(
  scenario: Scenario,
  constraint: AttributeBalanceConstraint,
  index: number,
  setScenario: (scenario: Scenario) => void,
  attributeDefinitions: ReturnType<typeof useAppStore.getState>['attributeDefinitions'],
) {
  const targetOptions = getAttributeBalanceTargetOptions(constraint, attributeDefinitions);
  const selectedSessions = constraint.sessions?.length
    ? constraint.sessions
    : Array.from({ length: scenario.num_sessions }, (_, sessionIndex) => sessionIndex);
  const selectedGroup = scenario.groups.find((group) => group.id === constraint.group_id);
  const capacityResolution = resolveGroupCapacityForSessions(selectedGroup, selectedSessions);

  return (
    <>
      <div className="space-y-2">
        <SetupKeyValueList
          items={[
            { label: 'Group', value: constraint.group_id },
            { label: 'Attribute', value: constraint.attribute_key },
            { label: 'Mode', value: constraint.mode ?? 'exact' },
          ]}
        />
        {targetOptions.length > 0 ? (
          <div
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <AttributeDistributionField
              buckets={getAttributeDistributionBuckets(targetOptions)}
              value={constraint.desired_values}
              capacity={capacityResolution.capacity}
              onChange={(desiredValues) => {
                setScenario({
                  ...scenario,
                  constraints: scenario.constraints.map((candidate, candidateIndex) => (
                    candidateIndex === index && candidate.type === 'AttributeBalance'
                      ? { ...candidate, desired_values: desiredValues }
                      : candidate
                  )),
                });
              }}
              showSummary={false}
            />
          </div>
        ) : null}
      </div>
      <SetupSessionsBadgeList sessions={constraint.sessions} />
    </>
  );
}

export function renderPairMeetingCountContent(scenario: Scenario, constraint: PairMeetingCountConstraint) {
  return (
    <>
      <SetupPeopleNodeList
        label="Pair"
        people={constraint.people.map((personId) => (
          <ConstraintPersonChip key={personId} personId={personId} people={scenario.people} />
        ))}
      />
      <SetupKeyValueList
        items={[
          { label: 'Target meetings', value: constraint.target_meetings },
          { label: 'Mode', value: constraint.mode || 'at_least' },
        ]}
      />
      <SetupSessionsBadgeList sessions={constraint.sessions} />
    </>
  );
}

export function ConstraintCards<T extends Constraint>({
  items,
  renderCard,
}: {
  items: Array<IndexedConstraint<T>>;
  renderCard: (item: IndexedConstraint<T>) => React.ReactNode;
}) {
  return <SetupCardGrid minColumnWidth="19rem">{items.map(renderCard)}</SetupCardGrid>;
}
