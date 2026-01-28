import React from 'react';
import type { Constraint } from '../../../types';
import SoftConstraintsPanel from '../../constraints/SoftConstraintsPanel';

interface SoftConstraintsSectionProps {
  onAdd: (type: Constraint['type']) => void;
  onEdit: (constraint: Constraint, index: number) => void;
  onDelete: (index: number) => void;
}

export function SoftConstraintsSection({ onAdd, onEdit, onDelete }: SoftConstraintsSectionProps) {
  return (
    <div className="pt-0">
      <SoftConstraintsPanel
        onAddConstraint={onAdd}
        onEditConstraint={onEdit}
        onDeleteConstraint={onDelete}
      />
    </div>
  );
}
