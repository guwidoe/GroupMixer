import React from 'react';
import { SetupSearchField } from './SetupSearchField';

interface SetupCardSearchToolbarProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClear?: () => void;
  status?: React.ReactNode;
  extra?: React.ReactNode;
}

export function SetupCardSearchToolbar({
  label,
  placeholder,
  value,
  onChange,
  onClear,
  status,
  extra,
}: SetupCardSearchToolbarProps) {
  const hasSearch = value.trim().length > 0;
  const hasMeta = Boolean(status || extra || hasSearch);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center">
      <SetupSearchField
        label={label}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      {hasMeta ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {status ? <span>{status}</span> : null}
          {extra}
          {hasSearch && onClear ? (
            <button type="button" className="underline underline-offset-2" onClick={onClear}>
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
