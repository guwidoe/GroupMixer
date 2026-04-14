import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}

export function MetricCard({ title, value, icon, colorClass }: MetricCardProps) {
  return (
    <div className="p-4 sm:p-5" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>{title}</p>
          <p className={`mt-3 text-2xl font-semibold tracking-tight sm:text-[1.75rem] ${colorClass}`}>{value}</p>
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)' }}
        >
          {React.createElement(icon, { className: `w-4 h-4 ${colorClass.replace('-600', '-400')}` })}
        </div>
      </div>
    </div>
  );
}
