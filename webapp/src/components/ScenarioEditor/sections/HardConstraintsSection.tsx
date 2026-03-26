import React from 'react';
import type { Constraint } from '../../../types';
import HardConstraintsPanel from '../../constraints/HardConstraintsPanel';

interface HardConstraintsSectionProps {
  onAdd: (type: 'ImmovablePeople' | 'MustStayTogether') => void;
  onEdit: (constraint: Constraint, index: number) => void;
  onDelete: (index: number) => void;
}

export function HardConstraintsSection({ onAdd, onEdit, onDelete }: HardConstraintsSectionProps) {
  return (
    <div className="pt-0">
      <HardConstraintsPanel
        onAddConstraint={onAdd}
        onEditConstraint={onEdit}
        onDeleteConstraint={onDelete}
      />
    </div>
  );
}
