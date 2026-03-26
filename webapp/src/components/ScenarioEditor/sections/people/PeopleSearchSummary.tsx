import React from 'react';

interface PeopleSearchSummaryProps {
  filteredCount: number;
  totalCount: number;
  searchValue: string;
  peopleSearch: string;
  onClear: () => void;
  variant: 'grid' | 'list';
}

export function PeopleSearchSummary({
  filteredCount,
  totalCount,
  searchValue,
  peopleSearch,
  onClear,
  variant,
}: PeopleSearchSummaryProps) {
  if (!searchValue) return null;

  const className =
    variant === 'grid' ? 'mb-3 text-xs px-3 py-2 rounded border' : 'px-6 pt-4 text-xs';
  const style =
    variant === 'grid'
      ? {
          backgroundColor: 'var(--bg-tertiary)',
          borderColor: 'var(--border-secondary)',
          color: 'var(--text-secondary)',
        }
      : { color: 'var(--text-secondary)' };

  return (
    <div className={className} style={style}>
      Showing {filteredCount} of {totalCount} people for "{peopleSearch}".
      <button onClick={onClear} className="ml-2 underline">
        Clear filter
      </button>
    </div>
  );
}
