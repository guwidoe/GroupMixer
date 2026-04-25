import { Link2, Split } from 'lucide-react';
import type {
  ResultsPairMeetingAnnotation,
  ResultsPairMeetingCell,
  ResultsPairMeetingCellTone,
} from '../../services/results/buildResultsModel';

export function getPairMeetingToneStyles(tone: ResultsPairMeetingCellTone): { backgroundColor: string; color: string; borderColor: string } {
  switch (tone) {
    case 'good':
      return {
        backgroundColor: 'color-mix(in srgb, var(--color-success-500) 18%, var(--bg-secondary))',
        color: 'var(--color-success-600)',
        borderColor: 'color-mix(in srgb, var(--color-success-500) 42%, var(--border-primary))',
      };
    case 'warn':
      return {
        backgroundColor: 'color-mix(in srgb, var(--color-warning-500) 20%, var(--bg-secondary))',
        color: 'var(--color-warning-700)',
        borderColor: 'color-mix(in srgb, var(--color-warning-500) 44%, var(--border-primary))',
      };
    case 'bad':
      return {
        backgroundColor: 'color-mix(in srgb, var(--color-error-500) 18%, var(--bg-secondary))',
        color: 'var(--color-error-600)',
        borderColor: 'color-mix(in srgb, var(--color-error-500) 46%, var(--border-primary))',
      };
    case 'neutral':
      return {
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-tertiary)',
        borderColor: 'var(--border-primary)',
      };
  }
}

export function getPrimaryPairMeetingAnnotationIcon(cell: ResultsPairMeetingCell) {
  const annotation = cell.annotations.find((candidate) => candidate.strength === 'required') ?? cell.annotations[0];
  if (!annotation) {
    return null;
  }

  return annotation.intent === 'together' ? Link2 : Split;
}

export function getPairMeetingToneLabel(tone: ResultsPairMeetingCellTone): string {
  switch (tone) {
    case 'good':
      return 'Good';
    case 'warn':
      return 'Review';
    case 'bad':
      return 'Attention';
    case 'neutral':
      return 'No meeting';
  }
}

export function formatPairMeetingSessions(sessionIndexes: number[]): string {
  if (sessionIndexes.length === 0) {
    return 'No shared sessions';
  }

  return `Shared in ${sessionIndexes.map((sessionIndex) => `Session ${sessionIndex + 1}`).join(', ')}`;
}

export function formatPairMeetingAnnotation(annotation: ResultsPairMeetingAnnotation): string {
  const sessions = annotation.sessions.length > 0
    ? annotation.sessions.map((sessionIndex) => sessionIndex + 1).join(', ')
    : 'all';
  const weight = annotation.penaltyWeight == null ? '' : `, weight ${annotation.penaltyWeight}`;

  return `${annotation.label} (${annotation.strength}, sessions ${sessions}${weight})`;
}

export function formatPairMeetingObjectiveCost(cost: number): string {
  return Number.isInteger(cost) ? String(cost) : cost.toFixed(2);
}

export function getPairMeetingAnnotationBadge(annotation: ResultsPairMeetingAnnotation) {
  const isTogether = annotation.intent === 'together';
  const isRequired = annotation.strength === 'required';
  const label = isTogether ? (isRequired ? 'KT' : 'PT') : (isRequired ? 'KA' : 'PA');
  const title = isTogether ? (isRequired ? 'Keep together' : 'Prefer together') : (isRequired ? 'Keep apart' : 'Prefer apart');

  return { label, title, Icon: isTogether ? Link2 : Split };
}
