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
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const sortedOptions = React.useMemo(() => [...options].sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base', numeric: true })), [options]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = React.useMemo(
    () => sortedOptions.filter((option) => {
      if (!normalizedQuery) {
        return true;
      }
      return option.label.toLowerCase().includes(normalizedQuery) || option.value.toLowerCase().includes(normalizedQuery);
    }),
    [normalizedQuery, sortedOptions],
  );

  const toggleValue = React.useCallback((optionValue: string) => {
    const nextSet = new Set(draftValue);
    if (nextSet.has(optionValue)) {
      nextSet.delete(optionValue);
    } else {
      nextSet.add(optionValue);
    }

    const nextValues = sortedOptions
      .filter((option) => nextSet.has(option.value))
      .map((option) => option.value);

    setDraftValue(nextValues);
    onCommit(nextValues);
  }, [draftValue, onCommit, sortedOptions]);

  return (
    <div className="min-w-[12rem] space-y-2" data-grid-row-click-ignore="true">
      <input
        type="text"
        aria-label={ariaLabel ? `Search ${ariaLabel} options` : 'Search options'}
        className="input h-8 w-full rounded-lg px-2 text-xs"
        disabled={disabled}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search options…"
      />

      <div
        className="max-h-40 space-y-1 overflow-auto rounded-lg border p-1"
        style={{
          borderColor: 'var(--border-primary)',
          backgroundColor: disabled ? 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)' : 'var(--bg-secondary)',
        }}
      >
        {filteredOptions.length > 0 ? filteredOptions.map((option) => {
          const checked = draftValue.includes(option.value);
          return (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-[color:var(--bg-primary)]"
              style={{
                color: 'var(--text-primary)',
                opacity: disabled ? 0.7 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggleValue(option.value)}
              />
              <span className="min-w-0 truncate">{option.label}</span>
            </label>
          );
        }) : (
          <div className="px-2 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
            No options match.
          </div>
        )}
      </div>
    </div>
  );
}
