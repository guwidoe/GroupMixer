import { describe, expect, it } from 'vitest';
import { createAttributeDefinition } from '../../../services/scenarioAttributes';
import {
  getScenarioSetupLegacyRedirect,
  getScenarioSetupSectionById,
  getScenarioSetupSectionCount,
  getScenarioSetupSectionGroups,
  getScenarioSetupSections,
  getScenarioSetupSectionsByGroup,
  isScenarioSetupSectionId,
  resolveScenarioSetupSection,
} from './scenarioSetupNav';

describe('scenarioSetupNav', () => {
  it('keeps the legacy-tabs surface limited to the coarse sections that still use it', () => {
    const sections = getScenarioSetupSections({ surface: 'legacy-tabs' });

    expect(sections.map((section) => section.id)).toEqual([
      'sessions',
      'groups',
      'people',
      'objectives',
    ]);
  });

  it('keeps sidebar-only first-class setup concepts in the shared registry', () => {
    const sections = getScenarioSetupSections({ includePlanned: true });
    const attributes = sections.find((section) => section.id === 'attributes');
    const repeatEncounter = sections.find((section) => section.id === 'repeat-encounter');

    expect(attributes).toBeDefined();
    expect(attributes?.status).toBe('available');
    expect(attributes?.surfaces).toEqual(['sidebar']);
    expect(repeatEncounter?.surfaces).toEqual(['sidebar']);
  });

  it('groups sections into model, requirements, preferences, and optimization in canonical order', () => {
    const grouped = getScenarioSetupSectionsByGroup({ includePlanned: true });

    expect(grouped.map((entry) => entry.group.id)).toEqual(['model', 'requirements', 'preferences', 'optimization']);
    expect(grouped[0]?.sections.map((section) => section.id)).toEqual([
      'sessions',
      'groups',
      'attributes',
      'people',
    ]);
    expect(grouped[1]?.sections.map((section) => section.id)).toEqual(['immovable-people', 'must-stay-together', 'must-stay-apart']);
    expect(grouped[2]?.sections.map((section) => section.id)).toEqual([
      'repeat-encounter',
      'should-not-be-together',
      'should-stay-together',
      'attribute-balance',
      'pair-meeting-count',
    ]);
    expect(grouped[3]?.sections.map((section) => section.id)).toEqual(['objectives']);
  });

  it('exposes stable group metadata', () => {
    const groups = getScenarioSetupSectionGroups();

    expect(groups.map((group) => group.id)).toEqual(['model', 'requirements', 'preferences', 'optimization']);
    expect(groups[0]?.label).toBe('Model');
    expect(groups[1]?.label).toBe('Requirements');
    expect(groups[2]?.label).toBe('Preferences');
    expect(groups[3]?.label).toBe('Optimization');
  });

  it('computes count badges from context via schema helpers', () => {
    const repeatEncounterSection = getScenarioSetupSectionById('repeat-encounter');
    const mustStayTogetherSection = getScenarioSetupSectionById('must-stay-together');
    const mustStayApartSection = getScenarioSetupSectionById('must-stay-apart');
    const attributesSection = getScenarioSetupSectionById('attributes');
    const objectivesSection = getScenarioSetupSectionById('objectives');

    expect(repeatEncounterSection).toBeDefined();
    expect(mustStayTogetherSection).toBeDefined();
    expect(mustStayApartSection).toBeDefined();
    expect(attributesSection).toBeDefined();
    expect(objectivesSection).toBeDefined();

    const context = {
      scenario: {
        people: [],
        groups: [],
        num_sessions: 3,
        constraints: [
          { type: 'RepeatEncounter', max_allowed_encounters: 1, penalty_function: 'linear', penalty_weight: 10 },
          { type: 'ShouldStayTogether', people: ['a', 'b'], penalty_weight: 5 },
          { type: 'ImmovablePeople', people: ['a'], group_id: 'g1' },
          { type: 'MustStayTogether', people: ['a', 'b'] },
          { type: 'MustStayApart', people: ['b', 'c'] },
        ],
        settings: {
          max_iterations: 1000,
          max_stagnant_iterations: 200,
          random_seed: 1,
          time_limit_seconds: 10,
          verbose: false,
        },
      },
      attributeDefinitions: [createAttributeDefinition('role', ['dev', 'pm'], 'attr-role')],
      objectiveCount: 1,
    };

    expect(getScenarioSetupSectionCount(repeatEncounterSection!, context)).toBe(1);
    expect(getScenarioSetupSectionCount(mustStayTogetherSection!, context)).toBe(1);
    expect(getScenarioSetupSectionCount(mustStayApartSection!, context)).toBe(1);
    expect(getScenarioSetupSectionCount(attributesSection!, context)).toBe(1);
    expect(getScenarioSetupSectionCount(objectivesSection!, context)).toBe(1);
  });

  it('resolves and validates known section ids', () => {
    expect(isScenarioSetupSectionId('sessions')).toBe(true);
    expect(isScenarioSetupSectionId('attributes')).toBe(true);
    expect(isScenarioSetupSectionId('repeat-encounter')).toBe(true);
    expect(isScenarioSetupSectionId('constraints')).toBe(false);
    expect(resolveScenarioSetupSection('soft')).toBe('repeat-encounter');
    expect(getScenarioSetupLegacyRedirect('hard')).toBe('immovable-people');
    expect(getScenarioSetupLegacyRedirect('repeat-encounter')).toBeNull();
  });

  it('exposes compact sidebar labels and short tooltip descriptions for long constraint sections', () => {
    expect(getScenarioSetupSectionById('immovable-people')).toEqual(
      expect.objectContaining({
        shortLabel: 'Fixed Placements',
        tooltipDescription: 'Pin people to specific groups.',
      }),
    );
    expect(getScenarioSetupSectionById('must-stay-together')).toEqual(
      expect.objectContaining({
        shortLabel: 'Keep Together',
        tooltipDescription: 'Require people to share a group.',
      }),
    );
    expect(getScenarioSetupSectionById('must-stay-apart')).toEqual(
      expect.objectContaining({
        shortLabel: 'Keep Apart',
        tooltipDescription: 'Require people to stay in different groups.',
      }),
    );
    expect(getScenarioSetupSectionById('repeat-encounter')).toEqual(
      expect.objectContaining({
        shortLabel: 'Repeat Limit',
        tooltipDescription: 'Cap repeat meetings across sessions.',
      }),
    );
    expect(getScenarioSetupSectionById('should-not-be-together')).toEqual(
      expect.objectContaining({
        shortLabel: 'Prefer Apart',
      }),
    );
    expect(getScenarioSetupSectionById('should-stay-together')).toEqual(
      expect.objectContaining({
        shortLabel: 'Prefer Together',
      }),
    );
    expect(getScenarioSetupSectionById('attribute-balance')).toEqual(
      expect.objectContaining({
        shortLabel: 'Balance Attributes',
      }),
    );
    expect(getScenarioSetupSectionById('pair-meeting-count')).toEqual(
      expect.objectContaining({
        shortLabel: 'Pair Encounters',
        tooltipDescription: 'Target how often pairs should meet.',
      }),
    );
  });
});
