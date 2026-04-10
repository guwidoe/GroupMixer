import React from 'react';
import { Check } from 'lucide-react';
import type { ScenarioDataGridOption } from '../../types';

interface SelectFilterPanelProps {
  ariaLabel: string;
  optionQuery: string;
  placeholder?: string;
  options: ScenarioDataGridOption[];
  selectedValues: string[];
  onOptionQueryChange: (value: string) => void;
  onToggleSelectedValue: (value: string) => void;
  onClose: () => void;
}

export function SelectFilterPanel({
  ariaLabel,
  optionQuery,
  placeholder,
  options,
  selectedValues,
  onOptionQueryChange,
  onToggleSelectedValue,
  onClose,
}: SelectFilterPanelProps) {
  return (
    <div className="space-y-3">
      <input
        type="text"
        className="input h-8 w-full rounded-lg px-2 text-xs"
        value={optionQuery}
        onChange={(event) => onOptionQueryChange(event.target.value)}
        placeholder={placeholder ?? 'Search options…'}
        aria-label={ariaLabel}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose();
          }
        }}
      />
      <div className="max-h-56 space-y-1 overflow-auto rounded-lg border p-1" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
        {options.length > 0 ? options.map((option) => {
          const checked = selectedValues.includes(option.value);
          return (
            <label
              key={option.value}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-[color:var(--bg-primary)]"
              style={{ color: 'var(--text-primary)' }}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => onToggleSelectedValue(option.value)}
                aria-label={`${checked ? 'Remove' : 'Add'} ${option.label} filter`}
              />
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded border"
                style={{
                  borderColor: checked ? 'var(--color-accent)' : 'var(--border-primary)',
                  backgroundColor: checked ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)' : 'transparent',
                  color: checked ? 'var(--color-accent)' : 'transparent',
                }}
              >
                <Check className="h-3 w-3" />
              </span>
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
