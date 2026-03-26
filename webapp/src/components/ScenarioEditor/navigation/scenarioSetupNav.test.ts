import { describe, expect, it } from 'vitest';
import {
  getScenarioSetupSectionById,
  getScenarioSetupSectionCount,
  getScenarioSetupSectionGroups,
  getScenarioSetupSections,
  getScenarioSetupSectionsByGroup,
  isScenarioSetupSectionId,
} from './scenarioSetupNav';

describe('scenarioSetupNav', () => {
  it('returns canonical available sections for the legacy tabs surface', () => {
    const sections = getScenarioSetupSections({ surface: 'legacy-tabs' });

    expect(sections.map((section) => section.id)).toEqual([
      'sessions',
      'groups',
      'people',
      'hard',
      'soft',
      'objectives',
    ]);
  });

  it('keeps sidebar-only sections in the shared registry for first-class setup concepts', () => {
    const sections = getScenarioSetupSections({ includePlanned: true });
    const attributes = sections.find((section) => section.id === 'attributes');

    expect(attributes).toBeDefined();
    expect(attributes?.status).toBe('available');
    expect(attributes?.surfaces).toEqual(['sidebar']);
  });

  it('groups sections into model, rules, and goals in canonical order', () => {
    const grouped = getScenarioSetupSectionsByGroup({ includePlanned: true });

    expect(grouped.map((entry) => entry.group.id)).toEqual(['model', 'rules', 'goals']);
    expect(grouped[0]?.sections.map((section) => section.id)).toEqual([
      'sessions',
      'groups',
      'attributes',
      'people',
    ]);
    expect(grouped[1]?.sections.map((section) => section.id)).toEqual(['hard', 'soft']);
    expect(grouped[2]?.sections.map((section) => section.id)).toEqual(['objectives']);
  });

  it('exposes stable group metadata', () => {
    const groups = getScenarioSetupSectionGroups();

    expect(groups.map((group) => group.id)).toEqual(['model', 'rules', 'goals']);
    expect(groups[0]?.label).toBe('Model');
    expect(groups[1]?.label).toBe('Rules');
    expect(groups[2]?.label).toBe('Goals');
  });

  it('computes count badges from context via schema helpers', () => {
    const softSection = getScenarioSetupSectionById('soft');
    const attributesSection = getScenarioSetupSectionById('attributes');
    const objectivesSection = getScenarioSetupSectionById('objectives');

    expect(softSection).toBeDefined();
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
        ],
        settings: {
          max_iterations: 1000,
          max_stagnant_iterations: 200,
          random_seed: 1,
          time_limit_seconds: 10,
          verbose: false,
        },
      },
      attributeDefinitions: [{ key: 'role', values: ['dev', 'pm'] }],
      objectiveCount: 1,
    };

    expect(getScenarioSetupSectionCount(softSection!, context)).toBe(2);
    expect(getScenarioSetupSectionCount(attributesSection!, context)).toBe(1);
    expect(getScenarioSetupSectionCount(objectivesSection!, context)).toBe(1);
  });

  it('validates known section ids', () => {
    expect(isScenarioSetupSectionId('sessions')).toBe(true);
    expect(isScenarioSetupSectionId('attributes')).toBe(true);
    expect(isScenarioSetupSectionId('constraints')).toBe(false);
  });
});
