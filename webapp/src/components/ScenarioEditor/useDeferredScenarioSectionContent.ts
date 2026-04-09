import { useEffect, useState } from 'react';
import type { AttributeDefinition, Scenario } from '../../types';
import type { ScenarioEditorSection } from './useScenarioEditorController';

const PEOPLE_SECTION_DEFER_THRESHOLD = 150;
const GROUPS_SECTION_DEFER_THRESHOLD = 80;
const CONSTRAINTS_SECTION_DEFER_THRESHOLD = 120;

function isLargeScenario(scenario: Scenario | null): boolean {
  if (!scenario) {
    return false;
  }

  return (
    scenario.people.length >= PEOPLE_SECTION_DEFER_THRESHOLD ||
    scenario.groups.length >= GROUPS_SECTION_DEFER_THRESHOLD ||
    scenario.constraints.length >= CONSTRAINTS_SECTION_DEFER_THRESHOLD
  );
}

function getScenarioSectionItemCount(activeSection: ScenarioEditorSection, scenario: Scenario | null): number {
  if (!scenario) {
    return 0;
  }

  switch (activeSection) {
    case 'people':
      return scenario.people.length;
    case 'groups':
      return scenario.groups.length;
    case 'immovable-people':
    case 'must-stay-together':
    case 'repeat-encounter':
    case 'should-not-be-together':
    case 'should-stay-together':
    case 'attribute-balance':
    case 'pair-meeting-count':
      return scenario.constraints.length;
    default:
      return 0;
  }
}

export function shouldDeferScenarioSectionContent(activeSection: ScenarioEditorSection, scenario: Scenario | null): boolean {
  const itemCount = getScenarioSectionItemCount(activeSection, scenario);

  switch (activeSection) {
    case 'people':
      return itemCount >= PEOPLE_SECTION_DEFER_THRESHOLD;
    case 'groups':
      return itemCount >= GROUPS_SECTION_DEFER_THRESHOLD;
    case 'immovable-people':
    case 'must-stay-together':
    case 'repeat-encounter':
    case 'should-not-be-together':
    case 'should-stay-together':
    case 'attribute-balance':
    case 'pair-meeting-count':
      return itemCount >= CONSTRAINTS_SECTION_DEFER_THRESHOLD;
    default:
      return false;
  }
}

export function getDeferredScenarioSectionLabel(activeSection: ScenarioEditorSection): string {
  switch (activeSection) {
    case 'people':
      return 'people directory';
    case 'groups':
      return 'group list';
    case 'immovable-people':
      return 'immovable people constraints';
    case 'must-stay-together':
      return 'must stay together constraints';
    case 'repeat-encounter':
      return 'repeat encounter constraints';
    case 'should-not-be-together':
      return 'should not be together constraints';
    case 'should-stay-together':
      return 'should stay together constraints';
    case 'attribute-balance':
      return 'attribute balance constraints';
    case 'pair-meeting-count':
      return 'pair meeting count constraints';
    case 'sessions':
      return 'sessions';
    case 'attributes':
      return 'attribute definitions';
    case 'objectives':
      return 'objectives';
    default:
      return 'section';
  }
}

export function useDeferredScenarioSectionContent(
  activeSection: ScenarioEditorSection,
  scenario: Scenario | null,
  currentScenarioId: string | null,
) {
  const shouldDefer = shouldDeferScenarioSectionContent(activeSection, scenario);
  const [isContentReady, setIsContentReady] = useState(!shouldDefer);

  useEffect(() => {
    if (!shouldDefer) {
      setIsContentReady(true);
      return;
    }

    setIsContentReady(false);
    const timeoutId = window.setTimeout(() => {
      setIsContentReady(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeSection, currentScenarioId, shouldDefer]);

  return {
    isContentReady,
    isContentLoading: shouldDefer && !isContentReady,
    deferredSectionLabel: getDeferredScenarioSectionLabel(activeSection),
  };
}

export function useDeferredScenarioSetupSummary(
  scenario: Scenario | null,
  attributeDefinitions: AttributeDefinition[],
  objectiveCount: number,
  currentScenarioId: string | null,
) {
  const shouldDefer = isLargeScenario(scenario);
  const [areSummaryCountsReady, setAreSummaryCountsReady] = useState(!shouldDefer);

  useEffect(() => {
    if (!shouldDefer) {
      setAreSummaryCountsReady(true);
      return;
    }

    setAreSummaryCountsReady(false);
    const timeoutId = window.setTimeout(() => {
      setAreSummaryCountsReady(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentScenarioId, shouldDefer]);

  return {
    areSummaryCountsReady,
    summaryScenario: areSummaryCountsReady ? scenario : null,
    summaryAttributeDefinitions: areSummaryCountsReady ? attributeDefinitions : [],
    summaryObjectiveCount: areSummaryCountsReady ? objectiveCount : 0,
  };
}
