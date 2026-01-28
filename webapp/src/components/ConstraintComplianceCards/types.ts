import type { Constraint } from '../../types';

export type ConstraintType = Constraint['type'];

export interface BaseCardData {
  id: number;
  constraint: Constraint;
  type: ConstraintType;
  title: string;
  subtitle?: string;
  adheres: boolean;
  violationsCount: number;
}

export type ViolationDetail =
  | { kind: 'RepeatEncounter'; pair: [string, string]; count: number; maxAllowed: number; sessions: number[] }
  | { kind: 'AttributeBalance'; session: number; groupId: string; attribute: string; desired: number; actual: number }
  | { kind: 'Immovable'; session: number; personId: string; requiredGroup: string; assignedGroup?: string }
  | { kind: 'TogetherSplit'; session: number; people: { personId: string; groupId?: string }[] }
  | { kind: 'NotTogether'; session: number; groupId: string; people: string[] }
  | {
      kind: 'PairMeetingCountSummary';
      people: [string, string];
      target: number;
      actual: number;
      mode: 'at_least' | 'exact' | 'at_most';
      sessions: number[];
    }
  | { kind: 'PairMeetingTogether'; session: number; groupId?: string; people: [string, string] }
  | { kind: 'PairMeetingApart'; session: number; groupId?: string; people: [string, string] };

export interface CardData extends BaseCardData {
  details: ViolationDetail[];
}

export const typeLabels: Partial<Record<ConstraintType, string>> = {
  RepeatEncounter: 'Repeat Encounter',
  ShouldNotBeTogether: 'Should Not Be Together',
  ShouldStayTogether: 'Should Stay Together',
  MustStayTogether: 'Must Stay Together',
  AttributeBalance: 'Attribute Balance',
  ImmovablePerson: 'Immovable Person',
  ImmovablePeople: 'Immovable People',
};
