import type { Scenario } from '../../types';
import type { ComplianceCardData } from '../../services/evaluator';
import { getEffectiveGroupCapacity } from '../../utils/groupCapacities';

type DraftSchedule = Record<number, Record<string, string[]>>;

export function countManualEditorHardViolations(
  compliance: ComplianceCardData[],
  draftSchedule: DraftSchedule,
  effectiveScenario: Scenario | null,
): number {
  let count = 0;

  compliance.forEach((constraintCard) => {
    if (
      constraintCard.type === 'MustStayTogether'
      || constraintCard.type === 'MustStayApart'
      || constraintCard.type === 'ImmovablePerson'
      || constraintCard.type === 'ImmovablePeople'
    ) {
      count += constraintCard.violationsCount;
    }
  });

  if (!effectiveScenario) {
    return count;
  }

  const sessions = Array.from({ length: effectiveScenario.num_sessions }, (_, index) => index);
  sessions.forEach((sessionId) => {
    const groups = draftSchedule[sessionId] || {};
    effectiveScenario.groups.forEach((group) => {
      const assignedCount = (groups[group.id] || []).length;
      const capacity = getEffectiveGroupCapacity(group, sessionId);
      if (assignedCount > capacity) {
        count += assignedCount - capacity;
      }
    });
  });

  return count;
}
