import type { Constraint } from '../../types';
import { HardPeopleConstraintModal } from './HardPeopleConstraintModal';

interface Props {
  sessionsCount: number;
  initial?: Extract<Constraint, { type: 'MustStayTogether' }> | null;
  onCancel: () => void;
  onSave: (constraint: Extract<Constraint, { type: 'MustStayTogether' }>) => void;
}

export function MustStayTogetherModal({ sessionsCount, initial, onCancel, onSave }: Props) {
  return (
    <HardPeopleConstraintModal
      type="MustStayTogether"
      sessionsCount={sessionsCount}
      initial={initial}
      onCancel={onCancel}
      onSave={onSave}
    />
  );
}
