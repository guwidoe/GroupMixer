import React from 'react';

export interface ConstraintFamilyNavItem {
  id: string;
  label: string;
  count?: number;
}

interface ConstraintFamilyNavProps {
  items: ConstraintFamilyNavItem[];
  activeItemId: string;
  onChange: (itemId: string) => void;
}

export function ConstraintFamilyNav({ items, activeItemId, onChange }: ConstraintFamilyNavProps) {
  return (
    <div className="mb-4 flex gap-0 border-b" style={{ borderColor: 'var(--border-primary)' }}>
      {items.map((item) => {
        const isActive = activeItemId === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={
              `-mb-px rounded-t-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none ` +
              (isActive
                ? 'z-10 border-x border-t border-b-0 border-[var(--color-accent)] text-[var(--color-accent)] shadow-sm'
                : 'border-0 bg-transparent text-[var(--text-secondary)] hover:text-[var(--color-accent)]')
            }
            style={
              isActive
                ? {
                    borderColor: 'var(--color-accent)',
                    borderBottom: 'none',
                    backgroundColor: 'var(--bg-primary)',
                  }
                : undefined
            }
          >
            {item.label}
            {typeof item.count === 'number' && <span className="ml-1 text-xs">({item.count})</span>}
          </button>
        );
      })}
    </div>
  );
}
