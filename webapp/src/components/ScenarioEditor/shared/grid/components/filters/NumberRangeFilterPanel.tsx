import React from 'react';
import type { ScenarioDataGridNumberRangeValue } from '../../types';

interface NumberRangeFilterPanelProps {
  ariaLabel: string;
  rangeValue: ScenarioDataGridNumberRangeValue;
  onChange: (value: ScenarioDataGridNumberRangeValue) => void;
  onClose: () => void;
}

export function NumberRangeFilterPanel({ ariaLabel, rangeValue, onChange, onClose }: NumberRangeFilterPanelProps) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <input
        type="number"
        className="input h-8 w-full rounded-lg px-2 text-xs"
        value={rangeValue.min ?? ''}
        onChange={(event) => onChange({ ...rangeValue, min: event.target.value || undefined })}
        placeholder="Min"
        aria-label={`${ariaLabel} minimum`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose();
          }
        }}
      />
      <input
        type="number"
        className="input h-8 w-full rounded-lg px-2 text-xs"
        value={rangeValue.max ?? ''}
        onChange={(event) => onChange({ ...rangeValue, max: event.target.value || undefined })}
        placeholder="Max"
        aria-label={`${ariaLabel} maximum`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose();
          }
        }}
      />
    </div>
  );
}
