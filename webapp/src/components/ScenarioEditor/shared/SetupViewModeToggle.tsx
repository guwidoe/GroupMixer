import React from 'react';
import { LayoutGrid, Rows3 } from 'lucide-react';
import type { SetupCollectionViewMode } from './useSetupCollectionViewMode';

interface SetupViewModeToggleProps {
  viewMode: SetupCollectionViewMode;
  onChange: (mode: SetupCollectionViewMode) => void;
}

function ToggleButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150"
      style={{
        backgroundColor: active
          ? 'color-mix(in srgb, var(--color-accent) 10%, var(--bg-tertiary) 90%)'
          : hovered
            ? 'var(--bg-primary)'
            : 'transparent',
        color: active ? 'var(--color-accent)' : 'var(--text-secondary)',
        border: active
          ? '1px solid color-mix(in srgb, var(--color-accent) 72%, white 28%)'
          : hovered
            ? '1px solid var(--border-primary)'
            : '1px solid transparent',
        boxShadow: hovered
          ? '0 1px 2px color-mix(in srgb, black 8%, transparent)'
          : 'none',
      }}
      aria-pressed={active}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function SetupViewModeToggle({ viewMode, onChange }: SetupViewModeToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border px-1 py-1" style={{ borderColor: 'var(--border-primary)' }}>
      <ToggleButton
        active={viewMode === 'cards'}
        label="Cards"
        icon={<LayoutGrid className="h-4 w-4" />}
        onClick={() => onChange('cards')}
      />
      <ToggleButton
        active={viewMode === 'list'}
        label="List"
        icon={<Rows3 className="h-4 w-4" />}
        onClick={() => onChange('list')}
      />
    </div>
  );
}
