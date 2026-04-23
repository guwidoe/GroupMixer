import React from 'react';

interface GridVerticalResizeHandleProps {
  isResizing: boolean;
  onPointerStart: (clientY: number) => void;
  onReset: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

export function GridVerticalResizeHandle({
  isResizing,
  onPointerStart,
  onReset,
  onKeyDown,
}: GridVerticalResizeHandleProps) {
  return (
    <div className="border-t px-4 py-1.5" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
      <div
        role="separator"
        aria-label="Resize grid height"
        aria-orientation="horizontal"
        tabIndex={0}
        className="flex w-full cursor-row-resize items-center justify-center rounded-md py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] focus-visible:ring-offset-2"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          onPointerStart(event.clientY);
        }}
        onDoubleClick={onReset}
        onKeyDown={onKeyDown}
        title="Drag to resize the table viewport. Double-click or press Escape to reset."
        data-grid-row-click-ignore="true"
      >
        <span className="sr-only">Drag to resize the table viewport</span>
        <span
          aria-hidden="true"
          className={`block h-1.5 w-16 rounded-full transition-colors ${isResizing ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
          style={{ backgroundColor: isResizing ? 'var(--color-accent)' : 'var(--text-tertiary)' }}
        />
      </div>
    </div>
  );
}
