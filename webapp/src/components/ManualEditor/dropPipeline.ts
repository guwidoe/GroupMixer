import type { Assignment, Problem, Solution } from '../../types';
import { wasmService } from '../../services/wasm';
import { evaluateCompliance } from '../../services/evaluator';
import type { ChangeReportData } from '../ChangeReportModal';
import type { ComplianceCardData } from '../../services/evaluator';

interface ScoreSummary {
  final_score: number;
  unique_contacts: number;
  repetition_penalty: number;
  attribute_balance_penalty: number;
  constraint_penalty: number;
}

export function findAssignedGroup(
  schedule: Record<number, Record<string, string[]>>,
  sessionId: number,
  personId: string,
): string | undefined {
  return Object.entries(schedule[sessionId] || {}).find(([, people]) => people.includes(personId))?.[0];
}

export function stagePersonMove(
  assignments: Assignment[],
  personId: string,
  targetGroupId: string,
  sessionId: number,
): Assignment[] {
  const staged = assignments.filter(
    (assignment) => !(assignment.person_id === personId && assignment.session_id === sessionId),
  );
  staged.push({ person_id: personId, group_id: targetGroupId, session_id: sessionId });
  return staged;
}

function summarizeSolution(solution: Solution): ScoreSummary {
  return {
    final_score: solution.final_score,
    unique_contacts: solution.unique_contacts,
    repetition_penalty: solution.repetition_penalty,
    attribute_balance_penalty: solution.attribute_balance_penalty,
    constraint_penalty: solution.constraint_penalty,
  };
}

export async function buildMoveBaseline(
  effectiveProblem: Problem | null,
  draftAssignments: Assignment[],
  compliance: ComplianceCardData[],
): Promise<{ score: ScoreSummary; compliance: ComplianceCardData[] }> {
  const emptyScore: ScoreSummary = {
    final_score: 0,
    unique_contacts: 0,
    repetition_penalty: 0,
    attribute_balance_penalty: 0,
    constraint_penalty: 0,
  };

  if (!effectiveProblem) {
    return { score: emptyScore, compliance };
  }

  try {
    const evaluated = await wasmService.evaluateSolution(effectiveProblem, draftAssignments);
    return {
      score: summarizeSolution(evaluated),
      compliance: evaluateCompliance(effectiveProblem, evaluated),
    };
  } catch {
    return { score: emptyScore, compliance };
  }
}

export async function buildMoveReportData(
  effectiveProblem: Problem,
  beforeAssignments: Assignment[],
  afterAssignments: Assignment[],
  beforeCompliance: ComplianceCardData[],
): Promise<ChangeReportData | null> {
  const before = await buildMoveBaseline(effectiveProblem, beforeAssignments, beforeCompliance);

  try {
    const afterEval = await wasmService.evaluateSolution(effectiveProblem, afterAssignments);
    return {
      before,
      after: {
        score: summarizeSolution(afterEval),
        compliance: evaluateCompliance(effectiveProblem, afterEval),
      },
      people: effectiveProblem.people,
    };
  } catch {
    return null;
  }
}
