import React from 'react';
import { Search } from 'lucide-react';

interface SetupSearchFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function SetupSearchField({ label = 'Search collection', className, ...props }: SetupSearchFieldProps) {
  return (
    <label className={["relative block min-w-0 flex-1 md:max-w-sm", className].filter(Boolean).join(' ')}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
      <input aria-label={label} className="input w-full pl-9" {...props} />
    </label>
  );
}
