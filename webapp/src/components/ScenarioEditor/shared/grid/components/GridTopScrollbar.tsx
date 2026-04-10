import React from 'react';

interface GridTopScrollbarProps {
  scrollWidth: number;
  clientWidth: number;
  topScrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}

export function GridTopScrollbar({ scrollWidth, clientWidth, topScrollRef, onScroll }: GridTopScrollbarProps) {
  if (scrollWidth <= clientWidth) {
    return null;
  }

  return (
    <div
      ref={topScrollRef}
      className="overflow-x-auto overflow-y-hidden border-b"
      style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
      onScroll={onScroll}
      aria-label="Top horizontal scrollbar"
    >
      <div style={{ width: `${scrollWidth}px`, height: '10px' }} />
    </div>
  );
}
