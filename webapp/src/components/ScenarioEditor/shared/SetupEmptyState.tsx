import React from 'react';

interface SetupEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message: React.ReactNode;
}

export function SetupEmptyState({ icon, title, message }: SetupEmptyStateProps) {
  return (
    <div
      className="rounded-2xl border px-6 py-12 text-center"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      {icon ? <div className="mx-auto mb-4 flex justify-center">{icon}</div> : null}
      <h4 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h4>
      <div className="mx-auto mt-2 max-w-xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
        {message}
      </div>
    </div>
  );
}
