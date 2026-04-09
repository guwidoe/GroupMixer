import React from 'react';
import { Clock3, Weight } from 'lucide-react';
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
        ? { backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }
        : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' };

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
  return <div className="mt-2 flex flex-wrap gap-1.5">{items}</div>;
}

export function SetupSessionsBadgeList({ sessions }: { sessions?: number[] }) {
  const labels = sessions && sessions.length > 0 ? sessions.map((session) => `S${session + 1}`) : ['All sessions'];

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
    <dl className="grid gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex flex-wrap items-start gap-2 text-sm">
          <dt className="font-medium" style={{ color: 'var(--text-tertiary)' }}>
            {item.label}
          </dt>
          <dd style={{ color: 'var(--text-primary)' }}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SetupItemActions({
  onEdit,
  onDelete,
  editLabel = 'Edit item',
  deleteLabel = 'Delete item',
}: {
  onEdit: () => void;
  onDelete: () => void;
  editLabel?: string;
  deleteLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" aria-label={editLabel} onClick={onEdit}>
        Edit
      </Button>
      <Button variant="ghost" size="sm" aria-label={deleteLabel} onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}

export function SetupItemCard({
  badges,
  title,
  titleMeta,
  actions,
  children,
}: {
  badges?: React.ReactNode;
  title?: React.ReactNode;
  titleMeta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border px-4 py-4"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
          {title || titleMeta ? (
            <div className="space-y-1">
              {title ? (
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {title}
                </div>
              ) : null}
              {titleMeta ? (
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {titleMeta}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-3">{children}</div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}
