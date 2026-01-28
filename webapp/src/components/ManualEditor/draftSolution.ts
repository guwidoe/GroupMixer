import type { Assignment, Solution } from '../../types';
import { computeUniqueContacts } from '../../services/evaluator';
import { cloneAssignments } from './utils';

interface BuildManualDraftSolutionArgs {
  assignments: Assignment[];
  peopleCount: number;
  evaluated?: Solution | null;
}

export function buildManualDraftSolution({ assignments, peopleCount, evaluated }: BuildManualDraftSolutionArgs): Solution {
  const { uniqueContacts } = computeUniqueContacts(assignments, peopleCount);

  return {
    assignments: cloneAssignments(assignments),
    final_score: evaluated?.final_score ?? 0,
    unique_contacts: evaluated?.unique_contacts ?? uniqueContacts,
    repetition_penalty: evaluated?.repetition_penalty ?? 0,
    attribute_balance_penalty: evaluated?.attribute_balance_penalty ?? 0,
    constraint_penalty: evaluated?.constraint_penalty ?? 0,
    iteration_count: 0,
    elapsed_time_ms: 0,
    weighted_repetition_penalty: evaluated?.weighted_repetition_penalty ?? 0,
    weighted_constraint_penalty: evaluated?.weighted_constraint_penalty ?? 0,
  } as unknown as Solution;
}
