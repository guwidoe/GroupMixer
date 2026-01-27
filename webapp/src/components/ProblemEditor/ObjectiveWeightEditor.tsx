/**
 * ObjectiveWeightEditor - Input field for editing the objective weight.
 */

import React, { useState, useEffect } from 'react';

interface ObjectiveWeightEditorProps {
  currentWeight: number;
  onCommit: (weight: number) => void;
}

const ObjectiveWeightEditor: React.FC<ObjectiveWeightEditorProps> = ({ currentWeight, onCommit }) => {
  const [weightInput, setWeightInput] = useState<string>(String(currentWeight));

  // Keep local field in sync when external weight changes (e.g., when problem loads)
  useEffect(() => {
    setWeightInput(String(currentWeight));
  }, [currentWeight]);

  const handleBlur = () => {
    const parsed = parseFloat(weightInput);
    const newWeight = isNaN(parsed) ? 0 : Math.max(0, parsed);
    onCommit(newWeight);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        Weight for "Maximize Unique Contacts"
      </label>
      <input
        type="number"
        min="0"
        step="0.1"
        value={weightInput}
        onChange={(e) => setWeightInput(e.target.value)}
        onBlur={handleBlur}
        className="input w-32"
      />
      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Set to 0 to deactivate this objective. Higher values increase its importance relative to constraint penalties.
      </p>
    </div>
  );
};

export default ObjectiveWeightEditor;
