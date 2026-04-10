import React from 'react';
import { X } from 'lucide-react';

interface TextTokenFilterPanelProps {
  ariaLabel: string;
  draftText: string;
  placeholder?: string;
  tokens: string[];
  onDraftTextChange: (value: string) => void;
  onAddToken: () => void;
  onRemoveToken: (token: string) => void;
  onClose: () => void;
}

export function TextTokenFilterPanel({
  ariaLabel,
  draftText,
  placeholder,
  tokens,
  onDraftTextChange,
  onAddToken,
  onRemoveToken,
  onClose,
}: TextTokenFilterPanelProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
          Contains
        </label>
        <input
          type="text"
          className="input h-8 w-full rounded-lg px-2 text-xs"
          value={draftText}
          onChange={(event) => onDraftTextChange(event.target.value)}
          placeholder={placeholder ?? 'Type and press Enter'}
          aria-label={ariaLabel}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onAddToken();
            }
            if (event.key === 'Escape') {
              onClose();
            }
          }}
        />
      </div>
      {tokens.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {tokens.map((token) => (
            <button
              key={token}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
              onClick={() => onRemoveToken(token)}
            >
              <span>{token}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Press Enter to add one or more filter tokens for this column.
        </p>
      )}
    </div>
  );
}
