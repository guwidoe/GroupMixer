import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}

export function MetricCard({ title, value, icon, colorClass }: MetricCardProps) {
  return (
    <div
      className="rounded-2xl border p-4 transition-colors sm:p-5"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>{title}</p>
          <p className={`mt-2 text-2xl font-semibold tracking-tight ${colorClass}`}>{value}</p>
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          {React.createElement(icon, { className: `w-5 h-5 ${colorClass.replace('-600', '-400')}` })}
        </div>
      </div>
    </div>
  );
}
