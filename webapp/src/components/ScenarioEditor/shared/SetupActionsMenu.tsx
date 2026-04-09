import React from 'react';
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
  const [isOpen, setIsOpen] = React.useState(false);

  useOutsideClick({
    refs: [menuRef],
    enabled: isOpen,
    onOutsideClick: () => setIsOpen(false),
  });

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="secondary"
        leadingIcon={icon}
        trailingIcon={<ChevronDown className="h-3 w-3" />}
        onClick={() => setIsOpen((open) => !open)}
      >
        {label}
      </Button>
      {isOpen ? (
        <div
          className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border p-2 shadow-lg"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
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
        </div>
      ) : null}
    </div>
  );
}
