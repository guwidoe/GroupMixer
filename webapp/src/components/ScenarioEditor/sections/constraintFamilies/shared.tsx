import React from 'react';
import type { Constraint, Scenario } from '../../../../types';
import { findAttributeDefinition } from '../../../../services/scenarioAttributes';
import { useAppStore } from '../../../../store';
import ConstraintPersonChip from '../../../ConstraintPersonChip';
import { removePersonFromPeopleConstraint } from '../../../constraints/constraintMutations';
import {
  SetupCardGrid,
  SetupKeyValueList,
  SetupPeopleNodeList,
  SetupSessionsBadgeList,
  SetupTagList,
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

export function getAttributeBalanceStructuredKeys(
  items: Array<IndexedConstraint<AttributeBalanceConstraint>>,
  attributeDefinitions: ReturnType<typeof useAppStore.getState>['attributeDefinitions'],
) {
  const seen = new Set<string>();
  const keys = items.flatMap(({ constraint }) => {
    const definition = findAttributeDefinition(attributeDefinitions, {
      id: constraint.attribute_id,
      name: constraint.attribute_key,
    });
    return definition?.values ?? Object.keys(constraint.desired_values ?? {});
  });

  return keys
    .map((value) => String(value).trim())
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    })
    .map((value) => ({ value, label: value }));
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

export function renderAttributeBalanceContent(constraint: AttributeBalanceConstraint) {
  return (
    <>
      <SetupKeyValueList
        items={[
          { label: 'Group', value: constraint.group_id },
          { label: 'Attribute', value: constraint.attribute_key },
        ]}
      />
      <SetupTagList
        items={Object.entries(constraint.desired_values || {}).map(([key, value]) => (
          <span
            key={key}
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
          >
            {key}: {value}
          </span>
        ))}
      />
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
