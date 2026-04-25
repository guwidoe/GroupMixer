import type { QuickSetupFixedAssignment } from '../../components/EmbeddableTool/types';
import type { Group } from '../../types';
import { splitParticipantColumnValues } from './participantColumns';

export function normalizeFixedAssignmentRows(fixedAssignments: QuickSetupFixedAssignment[] | undefined): QuickSetupFixedAssignment[] {
  return (fixedAssignments ?? [])
    .map((assignment) => ({
      personId: assignment.personId.trim(),
      groupId: assignment.groupId.trim(),
    }))
    .filter((assignment) => assignment.personId.length > 0 || assignment.groupId.length > 0);
}

export function buildFixedAssignmentRowsFromColumns(
  participantValues: string,
  groupValues: string,
): QuickSetupFixedAssignment[] {
  const participantLines = splitParticipantColumnValues(participantValues);
  const groupLines = splitParticipantColumnValues(groupValues);
  const rowCount = Math.max(participantLines.length, groupLines.length);

  return normalizeFixedAssignmentRows(
    Array.from({ length: rowCount }, (_, index) => ({
      personId: participantLines[index] ?? '',
      groupId: groupLines[index] ?? '',
    })),
  );
}

export function serializeFixedAssignmentColumnValues(
  fixedAssignments: QuickSetupFixedAssignment[] | undefined,
  key: keyof QuickSetupFixedAssignment,
): string {
  return normalizeFixedAssignmentRows(fixedAssignments)
    .map((assignment) => assignment[key])
    .join('\n');
}

export function resolveFixedAssignmentGroupId(groupValue: string, groups: Group[]): string | null {
  const normalizedValue = groupValue.trim();
  if (normalizedValue.length === 0) {
    return null;
  }

  const groupIndex = Number(normalizedValue);
  if (Number.isInteger(groupIndex) && groupIndex >= 1 && groupIndex <= groups.length) {
    return groups[groupIndex - 1]?.id ?? null;
  }

  return groups.find((group) => group.id.toLowerCase() === normalizedValue.toLowerCase())?.id ?? null;
}

export function formatFixedAssignmentGroupValue(groupId: string, groups: Group[]): string {
  const normalizedValue = groupId.trim();
  if (normalizedValue.length === 0) {
    return '';
  }

  const groupIndex = groups.findIndex((group) => group.id.toLowerCase() === normalizedValue.toLowerCase());
  return groupIndex >= 0 ? String(groupIndex + 1) : normalizedValue;
}
