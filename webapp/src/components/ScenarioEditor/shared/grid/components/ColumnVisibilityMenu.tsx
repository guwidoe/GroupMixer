import React from 'react';
import type { Table } from '@tanstack/react-table';
import { useOutsideClick } from '../../../../../hooks';

interface ColumnVisibilityMenuProps<T> {
  table: Table<T>;
  onClose: () => void;
}

export function ColumnVisibilityMenu<T>({ table, onClose }: ColumnVisibilityMenuProps<T>) {
  const menuRef = React.useRef<HTMLDivElement>(null);

  useOutsideClick({ refs: [menuRef], enabled: true, onOutsideClick: onClose });

  return (
    <div ref={menuRef} className="absolute right-0 top-full z-30 mt-2 min-w-56 rounded-2xl border p-3 shadow-lg" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
        Visible columns
      </div>
      <div className="space-y-2">
        {table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => {
          const title = String(column.columnDef.header ?? column.id);
          return (
            <label key={column.id} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={column.getIsVisible()} onChange={(event) => column.toggleVisibility(event.target.checked)} />
              <span>{title}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
