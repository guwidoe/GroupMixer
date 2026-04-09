import React from 'react';
import { Check, Clock3, Trash2, Weight } from 'lucide-react';
import { Button } from '../../ui';

export function SetupBadge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'solid';
}) {
  const style =
    tone === 'solid'
      ? { backgroundColor: 'var(--color-accent)', color: 'white' }
      : tone === 'accent'
        ? { backgroundColor: 'var(--bg-secondary)', color: 'var(--color-accent)', border: '1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)' }
        : { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' };

  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={style}>
      {children}
    </span>
  );
}

export function SetupTypeBadge({ label }: { label: string }) {
  return <SetupBadge>{label}</SetupBadge>;
}

export function SetupWeightBadge({ weight }: { weight: number }) {
  return (
    <SetupBadge tone="solid">
      <Weight className="h-3 w-3" />
      <span>Weight {weight}</span>
    </SetupBadge>
  );
}

export function SetupTagList({ items }: { items: Array<React.ReactNode> }) {
  return <div className="flex flex-wrap gap-1.5">{items}</div>;
}

export function SetupSessionsBadgeList({ sessions }: { sessions?: number[] }) {
  const labels = sessions && sessions.length > 0 ? sessions.map((session) => String(session + 1)) : ['All sessions'];

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
      <Clock3 className="h-3.5 w-3.5" style={{ color: 'var(--color-accent)' }} />
      {labels.map((label) => (
        <SetupBadge key={label} tone="accent">
          {label}
        </SetupBadge>
      ))}
    </div>
  );
}

export function SetupPeopleNodeList({ label, people }: { label: string; people: React.ReactNode[] }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">{people}</div>
    </div>
  );
}

export function SetupKeyValueList({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <dl className="grid gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-sm">
          <dt className="font-medium" style={{ color: 'var(--text-tertiary)' }}>
            {item.label}
          </dt>
          <dd className="min-w-0" style={{ color: 'var(--text-primary)' }}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SetupSelectionToggle({
  selected,
  onToggle,
  label,
}: {
  selected: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors"
      style={{
        borderColor: selected ? 'var(--color-accent)' : 'var(--border-primary)',
        backgroundColor: selected ? 'color-mix(in srgb, var(--color-accent) 14%, var(--bg-primary) 86%)' : 'var(--bg-primary)',
        color: selected ? 'var(--color-accent)' : 'var(--text-secondary)',
      }}
      aria-pressed={selected}
      aria-label={label ?? (selected ? 'Deselect card' : 'Select card')}
    >
      {selected ? <Check className="h-3.5 w-3.5" /> : null}
      <span>{selected ? 'Selected' : 'Select'}</span>
    </button>
  );
}

export function SetupItemActions({
  onEdit,
  onDelete,
  editLabel = 'Edit item',
  deleteLabel = 'Delete item',
  variant = 'table',
}: {
  onEdit?: () => void;
  onDelete: () => void;
  editLabel?: string;
  deleteLabel?: string;
  variant?: 'table' | 'card';
}) {
  if (variant === 'card') {
    return (
      <button
        type="button"
        aria-label={deleteLabel}
        title={deleteLabel}
        onClick={onDelete}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-[color:var(--bg-secondary)]"
        style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {onEdit ? (
        <Button variant="ghost" size="sm" aria-label={editLabel} onClick={onEdit}>
          Edit
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" aria-label={deleteLabel} onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}

export function SetupCardGrid({
  children,
  minColumnWidth = '18rem',
}: {
  children: React.ReactNode;
  minColumnWidth?: string;
}) {
  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}, 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

export function SetupItemCard({
  badges,
  title,
  titleMeta,
  actions,
  onOpen,
  openLabel,
  children,
}: {
  badges?: React.ReactNode;
  title?: React.ReactNode;
  titleMeta?: React.ReactNode;
  actions?: React.ReactNode;
  onOpen?: () => void;
  openLabel?: string;
  children: React.ReactNode;
}) {
  const body = (
    <div className="space-y-3">
      {(title || titleMeta) ? (
        <div className="space-y-1.5">
          {title ? (
            <div className="text-[0.98rem] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
              {title}
            </div>
          ) : null}
          {titleMeta ? (
            <div className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              {titleMeta}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-3">{children}</div>
    </div>
  );

  return (
    <div
      className="h-full rounded-[1.15rem] border p-3.5 shadow-sm transition-shadow hover:shadow-md"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="flex h-full items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2.5">
          {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              aria-label={openLabel}
              className="block w-full rounded-xl p-1 text-left transition-colors hover:bg-[color:var(--bg-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
            >
              {body}
            </button>
          ) : (
            <div className="p-1">{body}</div>
          )}
        </div>
        {actions ? <div className="flex shrink-0 items-start gap-2 pt-1">{actions}</div> : null}
      </div>
    </div>
  );
}
