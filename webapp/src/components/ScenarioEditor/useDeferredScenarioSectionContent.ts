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
    case 'hard':
    case 'soft':
    case 'constraints':
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
    case 'hard':
    case 'soft':
    case 'constraints':
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
    case 'hard':
      return 'hard constraints';
    case 'soft':
      return 'soft constraints';
    case 'constraints':
      return 'constraints';
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
