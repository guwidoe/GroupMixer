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
      className="rounded-lg border p-6 transition-colors"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</p>
          <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
        </div>
        {React.createElement(icon, { className: `w-8 h-8 ${colorClass.replace('text-', 'text-').replace('-600', '-400')}` })}
      </div>
    </div>
  );
}
