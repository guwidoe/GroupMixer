import React from 'react';
import ObjectiveWeightEditor from '../ObjectiveWeightEditor';

interface ObjectivesSectionProps {
  currentWeight: number;
  onCommit: (weight: number) => void;
}

export function ObjectivesSection({ currentWeight, onCommit }: ObjectivesSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Objectives</h3>
      <div className="rounded-lg border p-6 transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <ObjectiveWeightEditor currentWeight={currentWeight} onCommit={onCommit} />
      </div>
    </div>
  );
}
