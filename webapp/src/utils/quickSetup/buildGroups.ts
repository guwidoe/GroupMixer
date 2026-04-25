import type { Group } from '../../types';
import type { QuickSetupDraft } from '../../components/EmbeddableTool/types';

export function buildGroups(
  participantCount: number,
  draft: Pick<QuickSetupDraft, 'groupingMode' | 'groupingValue'>,
): Group[] {
  const safeParticipantCount = Math.max(0, participantCount);
  const safeGroupingValue = Math.max(1, draft.groupingValue);
  const groupCount =
    draft.groupingMode === 'groupCount'
      ? Math.max(1, safeGroupingValue)
      : Math.max(1, Math.ceil(safeParticipantCount / safeGroupingValue));

  const baseSize = Math.floor(safeParticipantCount / groupCount);
  const remainder = safeParticipantCount % groupCount;

  return Array.from({ length: groupCount }, (_, index) => ({
    id: `Group ${index + 1}`,
    size: baseSize + (index < remainder ? 1 : 0),
  } satisfies Group));
}
