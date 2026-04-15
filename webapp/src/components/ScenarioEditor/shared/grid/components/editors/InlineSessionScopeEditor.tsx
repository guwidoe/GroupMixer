import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { useOutsideClick } from '../../../../../../hooks';
import { SessionScopeField } from '../../../SessionScopeField';
import { useAnchoredPopoverPosition } from '../../hooks/useAnchoredPopoverPosition';
import {
  createAllSessionScopeDraft,
  formatSessionScopeDraftCompact,
  type SessionScopeDraft,
} from '../../../sessionScope';

interface InlineSessionScopeEditorProps {
  ariaLabel?: string;
  disabled: boolean;
  totalSessions: number;
  value: SessionScopeDraft;
  onCommit: (value: SessionScopeDraft) => void;
}

export function InlineSessionScopeEditor({
  ariaLabel,
  disabled,
  totalSessions,
  value,
  onCommit,
}: InlineSessionScopeEditorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState<SessionScopeDraft>(value ?? createAllSessionScopeDraft());
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  useOutsideClick({ refs: [wrapperRef, buttonRef, panelRef], enabled: isOpen, onOutsideClick: () => setIsOpen(false) });

  React.useEffect(() => {
    if (!isOpen) {
      setDraftValue(value ?? createAllSessionScopeDraft());
    }
  }, [isOpen, value]);

  const normalizedValue = value ?? createAllSessionScopeDraft();
  const displayedValue = isOpen ? draftValue : normalizedValue;
  const summary = React.useMemo(() => {
    return formatSessionScopeDraftCompact(displayedValue, totalSessions);
  }, [displayedValue, totalSessions]);
  const popoverStyle = useAnchoredPopoverPosition({
    isOpen,
    triggerRef: buttonRef,
    panelRef,
    minWidth: 288,
    maxWidth: 384,
  });

  const handleDraftChange = React.useCallback((nextValue: SessionScopeDraft) => {
    setDraftValue(nextValue);
    if (nextValue.mode === 'all' || nextValue.sessions.length > 0) {
      onCommit(nextValue);
    }
  }, [onCommit]);

  return (
    <div ref={wrapperRef} className="relative min-w-[12rem]" data-grid-row-click-ignore="true">
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel ?? 'Edit sessions'}
        className="input flex h-9 min-w-[12rem] items-center justify-between gap-2 px-3 text-left"
        disabled={disabled}
        aria-expanded={isOpen}
        title={summary}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{summary}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-tertiary)' }}
        />
      </button>

      {isOpen && popoverStyle && typeof document !== 'undefined' ? createPortal(
        <div
          ref={panelRef}
          data-grid-popover="true"
          className="space-y-2 overflow-auto rounded-xl border p-2 shadow-xl"
          style={{ ...popoverStyle, borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
        >
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="min-w-0 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {summary}
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-tertiary)' }}
              aria-label={`Close ${ariaLabel ?? 'sessions editor'}`}
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <SessionScopeField
            compact
            selectedModeDefault="empty"
            totalSessions={totalSessions}
            value={draftValue}
            onChange={handleDraftChange}
            disabled={disabled}
          />
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
