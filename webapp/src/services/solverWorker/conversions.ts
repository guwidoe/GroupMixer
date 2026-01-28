import type { Constraint, Problem, Solution } from '../../types';
import type { ProgressUpdate } from '../wasm/types';

interface RustSolverParams {
  initial_temperature: number;
  final_temperature: number;
  reheat_cycles?: number;
  reheat_after_no_improvement: number;
}

interface RustSolverSettings {
  solver_type: string;
  [key: string]: unknown;
}

interface RustResult {
  schedule: Record<string, Record<string, string[]>>;
  final_score: number;
  unique_contacts: number;
  repetition_penalty: number;
  attribute_balance_penalty: number;
  constraint_penalty: number;
  weighted_repetition_penalty: number;
  weighted_constraint_penalty: number;
}

export function convertProblemToRustFormat(problem: Problem): Record<string, unknown> {
  const solverSettings = { ...problem.settings };

  if (solverSettings.solver_params && typeof solverSettings.solver_params === 'object') {
    const solverType = solverSettings.solver_type;
    if (solverType === 'SimulatedAnnealing' && 'SimulatedAnnealing' in solverSettings.solver_params) {
      const params = solverSettings.solver_params.SimulatedAnnealing as RustSolverParams;
      const sanitizeNumber = (v: unknown, d: number) => (typeof v === 'number' && !isNaN(v) ? v : d);
      params.initial_temperature = sanitizeNumber(params.initial_temperature, 1.0);
      params.final_temperature = sanitizeNumber(params.final_temperature, 0.01);
      if (params.reheat_cycles !== undefined) {
        params.reheat_cycles = sanitizeNumber(params.reheat_cycles, 0);
      }
      params.reheat_after_no_improvement = sanitizeNumber(params.reheat_after_no_improvement, 0);

      (solverSettings as RustSolverSettings).solver_params = {
        solver_type: solverType,
        ...solverSettings.solver_params.SimulatedAnnealing,
      };
    }
  }

  const objectives =
    problem.objectives && problem.objectives.length > 0
      ? problem.objectives
      : [
          {
            type: 'maximize_unique_contacts',
            weight: 1.0,
          },
        ];

  const cleanedConstraints = (problem.constraints || []).map((constraint: Constraint) => {
    if (
      (constraint.type === 'ShouldStayTogether' || constraint.type === 'ShouldNotBeTogether') &&
      (constraint.penalty_weight === undefined || constraint.penalty_weight === null)
    ) {
      return { ...constraint, penalty_weight: 1000 };
    }
    if (constraint.type === 'AttributeBalance' && (constraint.penalty_weight === undefined || constraint.penalty_weight === null)) {
      return { ...constraint, penalty_weight: 50 };
    }
    if (constraint.type === 'RepeatEncounter' && (constraint.penalty_weight === undefined || constraint.penalty_weight === null)) {
      return { ...constraint, penalty_weight: 1 };
    }
    return constraint;
  });

  const allSessions = Array.from({ length: problem.num_sessions }, (_, i) => i);
  const normalizedConstraints = cleanedConstraints.map((constraint: Constraint) => {
    if (constraint.type === 'ImmovablePeople') {
      const sessions = (constraint as unknown as { sessions?: number[] }).sessions;
      return {
        ...constraint,
        sessions: Array.isArray(sessions) && sessions.length > 0 ? sessions : allSessions,
      } as Constraint;
    }
    if (constraint.type === 'ImmovablePerson') {
      const sessions = (constraint as unknown as { sessions?: number[] }).sessions;
      return {
        ...constraint,
        sessions: Array.isArray(sessions) && sessions.length > 0 ? sessions : allSessions,
      } as Constraint;
    }
    return constraint;
  });

  return {
    problem: {
      people: problem.people,
      groups: problem.groups,
      num_sessions: problem.num_sessions,
    },
    objectives,
    constraints: normalizedConstraints,
    solver: solverSettings,
  };
}

export function convertRustResultToSolution(
  rustResult: RustResult,
  lastProgress: ProgressUpdate | null,
  fallbackProgress: ProgressUpdate | null,
): Solution {
  const assignments: Array<{ person_id: string; group_id: string; session_id: number }> = [];

  for (const [sessionName, groups] of Object.entries(rustResult.schedule)) {
    const sessionId = parseInt(sessionName.replace('session_', ''));
    for (const [groupId, people] of Object.entries(groups as Record<string, string[]>)) {
      for (const personId of people) {
        assignments.push({
          person_id: personId,
          group_id: groupId,
          session_id: sessionId,
        });
      }
    }
  }

  const progressToUse = lastProgress || fallbackProgress;

  return {
    assignments,
    final_score: rustResult.final_score,
    unique_contacts: rustResult.unique_contacts,
    repetition_penalty: rustResult.repetition_penalty,
    attribute_balance_penalty: rustResult.attribute_balance_penalty,
    constraint_penalty: rustResult.constraint_penalty,
    iteration_count: progressToUse?.iteration || 0,
    elapsed_time_ms: (progressToUse?.elapsed_seconds || 0) * 1000,
    weighted_repetition_penalty: rustResult.weighted_repetition_penalty,
    weighted_constraint_penalty: rustResult.weighted_constraint_penalty,
  };
}
