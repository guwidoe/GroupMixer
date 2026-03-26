import type { ReactNode } from 'react';
import type { Constraint, Scenario } from '../../types';
import { getIndexedConstraint, saveIndexedConstraint } from './indexedConstraintModalUtils';

interface IndexedConstraintModalProps<T extends Constraint> {
  open: boolean;
  editingIndex: number | null;
  setEditingIndex: (index: number | null) => void;
  setOpen: (open: boolean) => void;
  resolveScenario: () => Scenario;
  setScenario: (scenario: Scenario) => void;
  children: (args: {
    scenario: Scenario;
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
  resolveScenario,
  setScenario,
  children,
}: IndexedConstraintModalProps<T>) {
  if (!open) {
    return null;
  }

  const scenario = resolveScenario();

  const close = () => {
    setOpen(false);
    setEditingIndex(null);
  };

  const handleSave = (constraint: T) => {
    setScenario(saveIndexedConstraint(scenario, constraint, editingIndex));
    close();
  };

  return <>{children({ scenario, initial: getIndexedConstraint<T>(scenario, editingIndex), onCancel: close, onSave: handleSave })}</>;
}
