import React from 'react';
import type { ScenarioDataGridOption } from '../../types';

interface InlineMultiSelectEditorProps {
  ariaLabel?: string;
  disabled: boolean;
  options: ScenarioDataGridOption[];
  value: string[];
  onCommit: (value: string[]) => void;
}

export function InlineMultiSelectEditor({ ariaLabel, disabled, options, value, onCommit }: InlineMultiSelectEditorProps) {
  const [draftValue, setDraftValue] = React.useState<string[]>(value);

  React.useEffect(() => {
    setDraftValue(value);
  }, [value]);

  return (
    <select
      aria-label={ariaLabel}
      multiple
      size={Math.min(Math.max(options.length, 2), 5)}
      className="input min-w-[12rem] py-2"
      disabled={disabled}
      value={draftValue}
      onChange={(event) => {
        const nextValues = Array.from(event.target.selectedOptions, (option) => option.value);
        setDraftValue(nextValues);
        onCommit(nextValues);
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
