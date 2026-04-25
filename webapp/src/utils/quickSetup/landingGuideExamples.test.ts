import { describe, expect, it } from 'vitest';
import { GUIDE_PAGE_ROUTES } from '../../pages/guidePageConfigs';
import type { QuickSetupDraft } from '../../components/EmbeddableTool/types';
import { buildScenarioFromDraft } from './buildScenarioFromDraft';
import {
  createLandingGuideExampleDraft,
  LANDING_GUIDE_EXAMPLES,
} from './landingGuideExamples';

const baseDraft: QuickSetupDraft = {
  participantInput: '',
  groupingMode: 'groupCount',
  groupingValue: 2,
  sessions: 1,
  avoidRepeatPairings: false,
  preset: 'random',
  keepTogetherInput: '',
  avoidPairingsInput: '',
  inputMode: 'names',
  fixedAssignments: [],
  balanceAttributeKey: null,
  balanceTargets: {},
  manualBalanceAttributeKeys: [],
  advancedOpen: false,
  workspaceScenarioId: null,
};

describe('landing guide examples', () => {
  it('provides one curated example for every guide topic', () => {
    const exampleKeys = LANDING_GUIDE_EXAMPLES.map((example) => example.key);
    const guideKeys = new Set(GUIDE_PAGE_ROUTES.map((route) => route.key));
    const guideExampleKeys = exampleKeys.filter((key) => guideKeys.has(key));
    for (const route of GUIDE_PAGE_ROUTES) {
      expect(exampleKeys).toContain(route.key);
    }
    expect(new Set(guideExampleKeys).size).toBe(GUIDE_PAGE_ROUTES.length);
  });

  it('builds valid quick setup scenarios with display names and intended teaching controls', () => {
    for (const example of LANDING_GUIDE_EXAMPLES) {
      const draft = createLandingGuideExampleDraft(example.key, baseDraft);
      const { scenario } = buildScenarioFromDraft(draft);
      const names = scenario.people.map((person) => person.name);

      expect(scenario.people.length, example.key).toBeGreaterThanOrEqual(16);
      expect(new Set(names).size, example.key).toBe(names.length);
      expect(scenario.people.every((person) => person.name && person.name !== person.id), example.key).toBe(true);
      expect(scenario.groups.length, example.key).toBeGreaterThan(1);
      expect(scenario.num_sessions, example.key).toBe(example.sessions);

      if (example.sessions > 1) {
        expect(scenario.constraints.some((constraint) => constraint.type === 'RepeatEncounter'), example.key).toBe(true);
      }

      for (const attributeKey of example.balanceAttributeKeys) {
        expect(
          scenario.constraints.some((constraint) =>
            constraint.type === 'AttributeBalance' && constraint.attribute_key === attributeKey,
          ),
          `${example.key}:${attributeKey}`,
        ).toBe(true);
      }
    }
  });

  it('includes a complex landing benchmark without session-aware entities or unsupported soft constraints', () => {
    const example = LANDING_GUIDE_EXAMPLES.find((candidate) => candidate.key === 'sailing-flotilla-stress-test');
    expect(example).toBeDefined();

    const draft = createLandingGuideExampleDraft('sailing-flotilla-stress-test', baseDraft);
    const { scenario } = buildScenarioFromDraft(draft);

    expect(example?.category).toBe('Benchmark');
    expect(scenario.people.length).toBe(132);
    expect(scenario.groups.length).toBe(11);
    expect(scenario.num_sessions).toBe(6);
    expect(scenario.people.every((person) => !person.sessions)).toBe(true);
    expect(scenario.groups.every((group) => !group.session_sizes)).toBe(true);

    const allowedConstraintTypes = new Set(['RepeatEncounter', 'AttributeBalance', 'ImmovablePeople', 'MustStayApart']);
    expect(scenario.constraints.every((constraint) => allowedConstraintTypes.has(constraint.type))).toBe(true);
    expect(scenario.constraints.some((constraint) => constraint.type === 'RepeatEncounter')).toBe(true);
    expect(scenario.constraints.filter((constraint) => constraint.type === 'AttributeBalance')).toHaveLength(11);
    expect(scenario.constraints.some((constraint) => constraint.type === 'ShouldStayTogether')).toBe(false);
    expect(scenario.constraints.some((constraint) => constraint.type === 'ShouldNotBeTogether')).toBe(false);
    expect(scenario.constraints.some((constraint) => constraint.type === 'PairMeetingCount')).toBe(false);
    expect(scenario.constraints.every((constraint) => !('sessions' in constraint) || !constraint.sessions)).toBe(true);
  });
});
