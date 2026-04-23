/**
 * ObjectiveWeightEditor - Input field for editing the objective weight.
 */

import React, { useState, useEffect } from 'react';
import { NumberField, NUMBER_FIELD_PRESETS } from '../ui';

interface ObjectiveWeightEditorProps {
  currentWeight: number;
  onCommit: (weight: number) => void;
}

const ObjectiveWeightEditor: React.FC<ObjectiveWeightEditorProps> = ({ currentWeight, onCommit }) => {
  const [draftWeight, setDraftWeight] = useState<number | null>(currentWeight);

  // Keep local field in sync when external weight changes (e.g., when scenario loads)
  useEffect(() => {
    setDraftWeight(currentWeight);
  }, [currentWeight]);

  return (
    <div className="space-y-2">
      <NumberField
        label={'Weight for "Maximize Unique Contacts"'}
        value={draftWeight}
        onChange={(value) => setDraftWeight(value ?? 0)}
        onCommit={(value) => onCommit(Math.max(0, value ?? 0))}
        {...NUMBER_FIELD_PRESETS.objectiveWeight}
      />
      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Set to 0 to deactivate this objective. Higher values increase its importance relative to constraint penalties.
      </p>
    </div>
  );
};

export default ObjectiveWeightEditor;
