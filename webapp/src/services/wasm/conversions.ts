import type { Assignment, Solution } from '../../types';
import type { ProgressUpdate, RustResult, WasmRecordLike } from './types';

function getRecordEntries<T>(value: WasmRecordLike<T> | null | undefined): Array<[string, T]> {
  if (!value) {
    return [];
  }

  if (value instanceof Map) {
    return Array.from(value.entries());
  }

  return Object.entries(value);
}

export function convertRustResultToSolution(
  rustResult: RustResult,
  lastProgress?: ProgressUpdate | null,
  fallbackProgress?: ProgressUpdate | null,
): Solution {
  const assignments: Assignment[] = [];

  for (const [sessionName, groups] of getRecordEntries(rustResult.schedule)) {
    const sessionId = parseInt(sessionName.replace('session_', ''));
    for (const [groupId, people] of getRecordEntries(groups)) {
      for (const personId of people) {
        assignments.push({
          person_id: personId,
          group_id: groupId,
          session_id: sessionId,
        });
      }
    }
  }

  const progressToUse = lastProgress ?? fallbackProgress ?? undefined;

  return {
    assignments,
    final_score: rustResult.final_score,
    unique_contacts: rustResult.unique_contacts,
    repetition_penalty: rustResult.repetition_penalty,
    attribute_balance_penalty: rustResult.attribute_balance_penalty,
    constraint_penalty: rustResult.constraint_penalty,
    iteration_count: progressToUse?.iteration || 0,
    elapsed_time_ms: progressToUse ? progressToUse.elapsed_seconds * 1000 : 0,
    weighted_repetition_penalty: rustResult.weighted_repetition_penalty,
    weighted_constraint_penalty: rustResult.weighted_constraint_penalty,
    effective_seed: rustResult.effective_seed,
    move_policy: rustResult.move_policy,
    stop_reason: rustResult.stop_reason,
    benchmark_telemetry: rustResult.benchmark_telemetry,
  };
}
