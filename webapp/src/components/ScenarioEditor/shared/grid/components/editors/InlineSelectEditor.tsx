import React from 'react';
import type { ScenarioDataGridOption } from '../../types';

interface InlineSelectEditorProps {
  ariaLabel?: string;
  disabled: boolean;
  options: ScenarioDataGridOption[];
  value: string;
  onCommit: (value: string) => void;
}

export function InlineSelectEditor({ ariaLabel, disabled, options, value, onCommit }: InlineSelectEditorProps) {
  return (
    <select
      aria-label={ariaLabel}
      className="input h-9 min-w-[10rem]"
      disabled={disabled}
      value={value}
      onChange={(event) => onCommit(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
