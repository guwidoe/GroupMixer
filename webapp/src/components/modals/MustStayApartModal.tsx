import type { Constraint } from '../../types';
import { HardPeopleConstraintModal } from './HardPeopleConstraintModal';

interface Props {
  sessionsCount: number;
  initial?: Extract<Constraint, { type: 'MustStayApart' }> | null;
  onCancel: () => void;
  onSave: (constraint: Extract<Constraint, { type: 'MustStayApart' }>) => void;
}

export function MustStayApartModal({ sessionsCount, initial, onCancel, onSave }: Props) {
  return (
    <HardPeopleConstraintModal
      type="MustStayApart"
      sessionsCount={sessionsCount}
      initial={initial}
      onCancel={onCancel}
      onSave={onSave}
    />
  );
}
