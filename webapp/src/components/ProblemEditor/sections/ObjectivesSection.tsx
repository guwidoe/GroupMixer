import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import ObjectiveWeightEditor from '../ObjectiveWeightEditor';

interface ObjectivesSectionProps {
  currentWeight: number;
  onCommit: (weight: number) => void;
}

export function ObjectivesSection({ currentWeight, onCommit }: ObjectivesSectionProps) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Objectives</h3>
      <div className="rounded-md border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowInfo(!showInfo)}
        >
          {showInfo ? (
            <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          )}
          <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>How do Objectives work?</h4>
        </button>
        {showInfo && (
          <div className="p-4 pt-0">
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Objectives tell the solver what to optimize for. Multiple objectives can be combined with different
              weights to create a custom scoring function. Currently the solver only supports the
              <strong> &nbsp;Maximize Unique Contacts&nbsp;</strong> objective.
            </p>
          </div>
        )}
      </div>
      <div className="rounded-lg border p-6 transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <ObjectiveWeightEditor currentWeight={currentWeight} onCommit={onCommit} />
      </div>
    </div>
  );
}
