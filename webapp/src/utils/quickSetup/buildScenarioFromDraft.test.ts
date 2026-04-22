import { describe, expect, it } from 'vitest';
import type { QuickSetupDraft } from '../../components/LandingTool/types';
import { createAttributeDefinition } from '../../services/scenarioAttributes';
import { buildGroups } from './buildGroups';
import { buildScenarioFromDraft } from './buildScenarioFromDraft';
import { parseParticipantInput } from './parseParticipantInput';

function makeDraft(overrides: Partial<QuickSetupDraft> = {}): QuickSetupDraft {
  return {
    participantInput: 'Alice\nBob\nCara\nDan',
    groupingMode: 'groupCount',
    groupingValue: 2,
    sessions: 1,
    preset: 'balanced',
    keepTogetherInput: '',
    avoidPairingsInput: '',
    inputMode: 'names',
    balanceAttributeKey: null,
    advancedOpen: false,
    ...overrides,
  };
}

describe('quick setup scenario mapping', () => {
  it('parses duplicate names into deterministic unique person ids', () => {
    const parsed = parseParticipantInput(
      makeDraft({ participantInput: 'Alice\nAlice\nAlice', inputMode: 'names' }),
    );

    expect(parsed.people.map((person) => person.id)).toEqual([
      'Alice',
      'Alice (2)',
      'Alice (3)',
    ]);
  });

  it('builds evenly distributed groups in group-size mode', () => {
    const groups = buildGroups(
      10,
      makeDraft({ groupingMode: 'groupSize', groupingValue: 4 }),
    );

    expect(groups.map((group) => group.size)).toEqual([4, 3, 3]);
  });

  it('maps csv attributes and user-friendly options into the backend-aligned scenario model', () => {
    const { scenario, attributeDefinitions } = buildScenarioFromDraft(
      makeDraft({
        participantInput: [
          'name,department,level',
          'Alice,Engineering,Senior',
          'Bob,Sales,Junior',
          'Cara,Engineering,Junior',
          'Dan,Sales,Senior',
        ].join('\n'),
        inputMode: 'csv',
        sessions: 3,
        keepTogetherInput: 'Alice, Cara',
        avoidPairingsInput: 'Bob - Dan',
        balanceAttributeKey: 'department',
      }),
    );

    expect(scenario.people).toHaveLength(4);
    expect(scenario.people[0].id).toBe('Alice');
    expect(scenario.people[0].attributes).toEqual({
      department: 'Engineering',
      level: 'Senior',
    });
    expect(scenario.groups.map((group) => group.id)).toEqual(['Group 1', 'Group 2']);
    expect(scenario.num_sessions).toBe(3);
    expect(scenario.settings.solver_type).toBe('SimulatedAnnealing');
    expect(scenario.objectives).toEqual([{ type: 'maximize_unique_contacts', weight: 1 }]);
    expect(scenario.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'RepeatEncounter',
          max_allowed_encounters: 1,
          penalty_weight: 1,
        }),
        expect.objectContaining({
          type: 'MustStayTogether',
          people: ['Alice', 'Cara'],
        }),
        expect.objectContaining({
          type: 'MustStayApart',
          people: ['Bob', 'Dan'],
        }),
        expect.objectContaining({
          type: 'AttributeBalance',
          attribute_key: 'department',
        }),
      ]),
    );
    expect(attributeDefinitions).toEqual([
      createAttributeDefinition('department', ['Engineering', 'Sales'], attributeDefinitions[0]?.id),
      createAttributeDefinition('level', ['Junior', 'Senior'], attributeDefinitions[1]?.id),
    ]);
  });
});
