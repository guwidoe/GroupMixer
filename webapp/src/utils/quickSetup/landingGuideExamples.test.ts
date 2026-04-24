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
    expect(LANDING_GUIDE_EXAMPLES.map((example) => example.key).sort()).toEqual(
      GUIDE_PAGE_ROUTES.map((route) => route.key).sort(),
    );
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
});
