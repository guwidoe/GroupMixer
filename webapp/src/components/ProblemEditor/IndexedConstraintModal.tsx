import type { ReactNode } from 'react';
import type { Constraint, Problem } from '../../types';
import { getIndexedConstraint, saveIndexedConstraint } from './indexedConstraintModalUtils';

interface IndexedConstraintModalProps<T extends Constraint> {
  open: boolean;
  editingIndex: number | null;
  setEditingIndex: (index: number | null) => void;
  setOpen: (open: boolean) => void;
  resolveProblem: () => Problem;
  setProblem: (problem: Problem) => void;
  children: (args: {
    problem: Problem;
    initial: T | null;
    onCancel: () => void;
    onSave: (constraint: T) => void;
  }) => ReactNode;
}

export function IndexedConstraintModal<T extends Constraint>({
  open,
  editingIndex,
  setEditingIndex,
  setOpen,
  resolveProblem,
  setProblem,
  children,
}: IndexedConstraintModalProps<T>) {
  if (!open) {
    return null;
  }

  const problem = resolveProblem();

  const close = () => {
    setOpen(false);
    setEditingIndex(null);
  };

  const handleSave = (constraint: T) => {
    setProblem(saveIndexedConstraint(problem, constraint, editingIndex));
    close();
  };

  return <>{children({ problem, initial: getIndexedConstraint<T>(problem, editingIndex), onCancel: close, onSave: handleSave })}</>;
}
