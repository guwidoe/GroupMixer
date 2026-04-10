import React from 'react';
import { X } from 'lucide-react';

interface ActiveFilterChip {
  id: string;
  label: string;
  valueLabel: string;
  onRemove: () => void;
}

interface GridActiveFiltersBarProps {
  activeColumnFilters: ActiveFilterChip[];
  onClearFilters: () => void;
}

export function GridActiveFiltersBar({ activeColumnFilters, onClearFilters }: GridActiveFiltersBarProps) {
  if (activeColumnFilters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
      <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
        Filters
      </span>
      {activeColumnFilters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
          style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
          onClick={filter.onRemove}
        >
          <span>{filter.label}: {filter.valueLabel}</span>
          <X className="h-3 w-3" />
        </button>
      ))}
      <button type="button" className="text-xs font-medium underline" style={{ color: 'var(--color-accent)' }} onClick={onClearFilters}>
        Clear filters
      </button>
    </div>
  );
}
