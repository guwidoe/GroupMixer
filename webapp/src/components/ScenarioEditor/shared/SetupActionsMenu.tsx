import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useOutsideClick } from '../../../hooks';
import { Button } from '../../ui';

export interface SetupActionsMenuItem {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

interface SetupActionsMenuProps {
  label: string;
  icon?: React.ReactNode;
  items: SetupActionsMenuItem[];
  summary?: React.ReactNode;
}

export function SetupActionsMenu({ label, icon, items, summary }: SetupActionsMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [popoverStyle, setPopoverStyle] = React.useState<React.CSSProperties | null>(null);

  useOutsideClick({
    refs: [menuRef, popoverRef, triggerRef],
    enabled: isOpen,
    onOutsideClick: () => setIsOpen(false),
  });

  React.useLayoutEffect(() => {
    if (!isOpen) {
      setPopoverStyle(null);
      return;
    }

    const updatePosition = () => {
      const triggerNode = triggerRef.current;
      if (!triggerNode || typeof window === 'undefined') {
        return;
      }

      const triggerRect = triggerNode.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(288, Math.max(220, viewportWidth - 16));
      const maxLeft = Math.max(8, viewportWidth - width - 8);
      const left = Math.min(Math.max(triggerRect.right - width, 8), maxLeft);
      const measuredHeight = popoverRef.current?.offsetHeight ?? 0;
      const preferredTop = triggerRect.bottom + 8;
      const availableBelow = viewportHeight - preferredTop - 8;
      const shouldPlaceAbove = measuredHeight > 0 && availableBelow < Math.min(measuredHeight, 200) && triggerRect.top - measuredHeight - 8 >= 8;
      const top = shouldPlaceAbove
        ? Math.max(8, triggerRect.top - measuredHeight - 8)
        : Math.min(preferredTop, Math.max(8, viewportHeight - Math.max(measuredHeight, 160) - 8));

      setPopoverStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: `${Math.max(180, viewportHeight - top - 8)}px`,
        zIndex: 80,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        ref={triggerRef}
        variant="secondary"
        leadingIcon={icon}
        trailingIcon={<ChevronDown className="h-3 w-3" />}
        onClick={() => setIsOpen((open) => !open)}
      >
        {label}
      </Button>
      {isOpen && typeof document !== 'undefined' ? createPortal(
        <div
          ref={popoverRef}
          className="overflow-auto rounded-2xl border p-2 shadow-lg"
          style={{
            ...popoverStyle,
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-primary)',
          }}
        >
          {summary ? (
            <div className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
              {summary}
            </div>
          ) : null}
          <div className="space-y-1">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                className="flex w-full flex-col items-start rounded-xl px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ color: 'var(--text-primary)' }}
                onClick={() => {
                  if (item.disabled) {
                    return;
                  }
                  setIsOpen(false);
                  item.onSelect();
                }}
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.description ? (
                  <span className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {item.description}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
