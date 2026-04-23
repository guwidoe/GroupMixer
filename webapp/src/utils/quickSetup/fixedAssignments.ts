import type { QuickSetupFixedAssignment } from '../../components/LandingTool/types';
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
