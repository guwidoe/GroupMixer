import type { Constraint } from '../../../../types';

export type HardConstraintFamily = 'ImmovablePeople' | 'MustStayTogether' | 'MustStayApart';
export type SoftConstraintFamily =
  | 'ShouldNotBeTogether'
  | 'ShouldStayTogether'
  | 'AttributeBalance'
  | 'PairMeetingCount';

export type IndexedConstraint<T extends Constraint> = { constraint: T; index: number };

export type PeopleConstraint = Extract<Constraint, {
  type: 'ImmovablePeople' | 'MustStayTogether' | 'MustStayApart' | 'ShouldNotBeTogether' | 'ShouldStayTogether'
}>;
export type AttributeBalanceConstraint = Extract<Constraint, { type: 'AttributeBalance' }>;
export type PairMeetingCountConstraint = Extract<Constraint, { type: 'PairMeetingCount' }>;

export interface HardConstraintFamilySectionProps {
  family: HardConstraintFamily;
  onAdd: (type: HardConstraintFamily) => void;
  onEdit: (constraint: Constraint, index: number) => void;
  onDelete: (index: number) => void;
}

export interface SoftConstraintFamilySectionProps {
  family: SoftConstraintFamily;
  onAdd: (type: SoftConstraintFamily) => void;
  onEdit: (constraint: Constraint, index: number) => void;
  onDelete: (index: number) => void;
  onApplyAttributeBalanceRows?: (items: Array<IndexedConstraint<AttributeBalanceConstraint>>) => void;
  createAttributeBalanceRow?: () => IndexedConstraint<AttributeBalanceConstraint>;
}
