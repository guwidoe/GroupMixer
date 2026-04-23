import React from 'react';

export function GridPreparingLoader() {
  return (
    <div
      className="border-t px-4 py-6"
      style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
      role="status"
      aria-live="polite"
      aria-label="Preparing editable table"
      data-testid="scenario-grid-preparing-loader"
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Preparing editable table…
          </div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading rows and columns.
          </div>
        </div>

        <div className="space-y-2" aria-hidden="true">
          <div className="h-10 w-full rounded-2xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />
          <div className="h-10 w-full rounded-2xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />
          <div className="h-10 w-full rounded-2xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />
        </div>
      </div>
    </div>
  );
}
