import { getDefaultSolverSettings } from '../../components/ProblemEditor/helpers';
import type { QuickSetupDraft } from '../../components/LandingTool/types';
import type { AttributeDefinition, Person, Problem } from '../../types';
import { buildAttributeDefinitions } from './buildAttributeDefinitions';
import { buildConstraints } from './buildConstraints';
import { buildGroups } from './buildGroups';
import { parseParticipantInput } from './parseParticipantInput';

export interface QuickSetupProblemBuildResult {
  problem: Problem;
  attributeDefinitions: AttributeDefinition[];
  people: Person[];
}

export function buildProblemFromDraft(draft: QuickSetupDraft): QuickSetupProblemBuildResult {
  const parsed = parseParticipantInput(draft);
  const groups = buildGroups(parsed.people.length, draft);
  const constraints = buildConstraints(draft, parsed.people, groups);
  const attributeDefinitions = buildAttributeDefinitions(parsed.people);

  return {
    problem: {
      people: parsed.people,
      groups,
      num_sessions: Math.max(1, draft.sessions),
      objectives: [{ type: 'maximize_unique_contacts', weight: 1 }],
      constraints,
      settings: getDefaultSolverSettings(),
    },
    attributeDefinitions,
    people: parsed.people,
  };
}
