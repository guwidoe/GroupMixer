import { describe, expect, it } from 'vitest';
import {
  getProblemSetupSectionById,
  getProblemSetupSectionCount,
  getProblemSetupSectionGroups,
  getProblemSetupSections,
  getProblemSetupSectionsByGroup,
  isProblemSetupSectionId,
} from './problemSetupNav';

describe('problemSetupNav', () => {
  it('returns canonical available sections for the legacy tabs surface', () => {
    const sections = getProblemSetupSections({ surface: 'legacy-tabs' });

    expect(sections.map((section) => section.id)).toEqual([
      'sessions',
      'groups',
      'people',
      'hard',
      'soft',
      'objectives',
    ]);
  });

  it('keeps planned sections in the shared registry for future sidebar work', () => {
    const sections = getProblemSetupSections({ includePlanned: true });
    const attributes = sections.find((section) => section.id === 'attributes');

    expect(attributes).toBeDefined();
    expect(attributes?.status).toBe('planned');
    expect(attributes?.surfaces).toEqual(['sidebar']);
  });

  it('groups sections into model, rules, and goals in canonical order', () => {
    const grouped = getProblemSetupSectionsByGroup({ includePlanned: true });

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
    const groups = getProblemSetupSectionGroups();

    expect(groups.map((group) => group.id)).toEqual(['model', 'rules', 'goals']);
    expect(groups[0]?.label).toBe('Model');
    expect(groups[1]?.label).toBe('Rules');
    expect(groups[2]?.label).toBe('Goals');
  });

  it('computes count badges from context via schema helpers', () => {
    const softSection = getProblemSetupSectionById('soft');
    const attributesSection = getProblemSetupSectionById('attributes');
    const objectivesSection = getProblemSetupSectionById('objectives');

    expect(softSection).toBeDefined();
    expect(attributesSection).toBeDefined();
    expect(objectivesSection).toBeDefined();

    const context = {
      problem: {
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

    expect(getProblemSetupSectionCount(softSection!, context)).toBe(2);
    expect(getProblemSetupSectionCount(attributesSection!, context)).toBe(1);
    expect(getProblemSetupSectionCount(objectivesSection!, context)).toBe(1);
  });

  it('validates known section ids', () => {
    expect(isProblemSetupSectionId('sessions')).toBe(true);
    expect(isProblemSetupSectionId('attributes')).toBe(true);
    expect(isProblemSetupSectionId('constraints')).toBe(false);
  });
});
