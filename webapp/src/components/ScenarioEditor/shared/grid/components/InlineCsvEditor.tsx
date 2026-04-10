import React from 'react';

interface InlineCsvEditorProps {
  ariaLabel: string;
  csvErrors: string[];
  helperText?: React.ReactNode;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

export function InlineCsvEditor({ ariaLabel, csvErrors, helperText, onChange, placeholder, value }: InlineCsvEditorProps) {
  return (
    <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
      {helperText ? <div className="mb-3">{helperText}</div> : null}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[24rem] w-full rounded-2xl border p-3 font-mono text-sm"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        aria-label={ariaLabel}
        placeholder={placeholder}
      />
      {csvErrors.length > 0 ? (
        <div className="mt-3 space-y-2 rounded-2xl border px-3 py-3 text-sm" style={{ borderColor: 'var(--color-danger)', backgroundColor: 'color-mix(in srgb, var(--color-danger) 8%, var(--bg-primary) 92%)', color: 'var(--text-primary)' }}>
          <div className="font-semibold">CSV validation errors</div>
          <ul className="list-disc space-y-1 pl-5">
            {csvErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
