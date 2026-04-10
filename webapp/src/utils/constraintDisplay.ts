import type { Constraint } from '../types';

export type DisplayConstraintType = Constraint['type'] | 'ImmovablePerson';

interface ConstraintDisplayDefinition {
  name: string;
  tooltipDescription: string;
}

export const CONSTRAINT_DISPLAY: Record<DisplayConstraintType, ConstraintDisplayDefinition> = {
  RepeatEncounter: {
    name: 'Repeat Limit',
    tooltipDescription: 'Cap repeat meetings across sessions.',
  },
  AttributeBalance: {
    name: 'Balance Attributes',
    tooltipDescription: 'Steer groups toward target mixes.',
  },
  ImmovablePerson: {
    name: 'Fixed Placements',
    tooltipDescription: 'Pin people to specific groups.',
  },
  ImmovablePeople: {
    name: 'Fixed Placements',
    tooltipDescription: 'Pin people to specific groups.',
  },
  MustStayTogether: {
    name: 'Keep Together',
    tooltipDescription: 'Require people to share a group.',
  },
  ShouldStayTogether: {
    name: 'Prefer Together',
    tooltipDescription: 'Prefer people to stay grouped.',
  },
  ShouldNotBeTogether: {
    name: 'Prefer Apart',
    tooltipDescription: 'Discourage people from sharing a group.',
  },
  PairMeetingCount: {
    name: 'Pair Encounters',
    tooltipDescription: 'Target how often pairs should meet.',
  },
};

export function getConstraintDisplayName(type: DisplayConstraintType): string {
  return CONSTRAINT_DISPLAY[type].name;
}

export function getConstraintTooltipDescription(type: DisplayConstraintType): string {
  return CONSTRAINT_DISPLAY[type].tooltipDescription;
}

export function getConstraintAddLabel(type: DisplayConstraintType): string {
  return `Add ${getConstraintDisplayName(type)}`;
}

export function getConstraintEditLabel(type: DisplayConstraintType): string {
  return `Edit ${getConstraintDisplayName(type)}`;
}

export function getConstraintUpdatedLabel(type: DisplayConstraintType): string {
  return `${getConstraintDisplayName(type)} Updated`;
}
