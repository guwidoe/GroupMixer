import React from 'react';

interface SetupSectionToolbarProps {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function SetupSectionToolbar({ leading, trailing }: SetupSectionToolbarProps) {
  if (!leading && !trailing) {
    return null;
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{leading}</div>
      {trailing ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{trailing}</div> : null}
    </div>
  );
}
