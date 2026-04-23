import React from 'react';
import { ChevronDown } from 'lucide-react';
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
    <div className="relative min-w-[10rem]">
      <select
        aria-label={ariaLabel}
        className="input h-9 min-w-[10rem] appearance-none pr-9"
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
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
        style={{ color: 'var(--text-tertiary)' }}
      />
    </div>
  );
}
