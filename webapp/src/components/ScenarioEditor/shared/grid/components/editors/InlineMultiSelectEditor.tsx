import React from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { ScenarioDataGridOption } from '../../types';
import { useOutsideClick } from '../../../../../../hooks';

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
  const [isOpen, setIsOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setDraftValue(value);
  }, [value]);

  React.useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return;
    }

    searchInputRef.current?.focus();
  }, [isOpen]);

  useOutsideClick({ refs: [wrapperRef, buttonRef, panelRef], enabled: isOpen, onOutsideClick: () => setIsOpen(false) });

  const selectedLabelMap = React.useMemo(() => new Map(options.map((option) => [option.value, option.label])), [options]);
  const selectedValueSet = React.useMemo(() => new Set(draftValue), [draftValue]);
  const alphabetizedOptions = React.useMemo(
    () => [...options].sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base', numeric: true })),
    [options],
  );
  const sortedOptions = React.useMemo(
    () => (isOpen
      ? [...alphabetizedOptions].sort((left, right) => {
          const leftSelected = selectedValueSet.has(left.value);
          const rightSelected = selectedValueSet.has(right.value);

          if (leftSelected !== rightSelected) {
            return leftSelected ? -1 : 1;
          }

          return left.label.localeCompare(right.label, undefined, { sensitivity: 'base', numeric: true });
        })
      : []),
    [alphabetizedOptions, isOpen, selectedValueSet],
  );
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

    const nextValues = alphabetizedOptions
      .filter((option) => nextSet.has(option.value))
      .map((option) => option.value);

    setDraftValue(nextValues);
    onCommit(nextValues);
  }, [alphabetizedOptions, draftValue, onCommit]);

  const selectedSummary = React.useMemo(() => {
    if (draftValue.length === 0) {
      return 'Select options';
    }

    const labels = draftValue.map((entry) => selectedLabelMap.get(entry) ?? entry);
    if (labels.length <= 2) {
      return labels.join(', ');
    }

    return `${labels.length} selected`;
  }, [draftValue, selectedLabelMap]);

  return (
    <div ref={wrapperRef} className="relative min-w-[12rem]" data-grid-row-click-ignore="true">
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel ?? 'Edit options'}
        className="input flex h-9 min-w-[12rem] items-center justify-between gap-2 px-3 text-left"
        disabled={disabled}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{selectedSummary}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-tertiary)' }}
        />
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          className="absolute left-0 top-[calc(100%+0.35rem)] z-20 w-[min(22rem,max(16rem,100%))] space-y-2 rounded-xl border p-2 shadow-xl"
          style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
        >
          <div className="flex items-center gap-2">
            <input
              ref={searchInputRef}
              type="text"
              aria-label={ariaLabel ? `Search ${ariaLabel} options` : 'Search options'}
              className="input h-8 w-full rounded-lg px-2 text-xs"
              disabled={disabled}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
              placeholder="Search options…"
            />
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-tertiary)' }}
              aria-label={`Close ${ariaLabel ?? 'options editor'}`}
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            className="max-h-56 space-y-1 overflow-auto rounded-lg border p-1"
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
      ) : null}
    </div>
  );
}
