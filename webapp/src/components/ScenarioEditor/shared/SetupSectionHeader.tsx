import React from 'react';

interface SetupSectionHeaderProps {
  title: string;
  count: number;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function SetupSectionHeader({ title, count, description, actions }: SetupSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <h3 className="truncate text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h3>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            {count}
          </span>
        </div>
        {description ? (
          <div className="max-w-3xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </div>
        ) : null}
      </div>

      {actions ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
    </div>
  );
}
