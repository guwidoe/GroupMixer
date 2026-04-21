import React from 'react';
import {
  AttributeDistributionField,
  getAttributeDistributionBuckets,
} from '../../../ui';

interface AttributeBalanceTargetsEditorProps {
  options: string[];
  value?: Record<string, number>;
  onCommit: (value: Record<string, number>) => void;
  disabled?: boolean;
  maxValue?: number;
}

export function AttributeBalanceTargetsEditor({
  options,
  value,
  onCommit,
  disabled = false,
  maxValue,
}: AttributeBalanceTargetsEditorProps) {
  const targets = value ?? {};
  const unknownKeys = Object.keys(targets)
    .filter((key) => !options.includes(key))
    .sort((left, right) => left.localeCompare(right));

  if (options.length === 0) {
    return (
      <div className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-tertiary)' }}>
        Choose an attribute with defined values to edit targets.
      </div>
    );
  }

  const allocatedTotal = Object.values(targets).reduce((sum, count) => sum + Math.max(0, Math.round(Number(count) || 0)), 0);
  const effectiveCapacity = typeof maxValue === 'number' ? Math.max(maxValue, allocatedTotal) : allocatedTotal;

  return (
    <div className="min-w-[16rem]">
      <AttributeDistributionField
        buckets={getAttributeDistributionBuckets(options)}
        value={targets}
        capacity={effectiveCapacity}
        onChange={(nextValue) => onCommit(nextValue)}
        disabled={disabled}
        variant="default"
        showSummary={false}
      />
      {unknownKeys.length > 0 ? (
        <div
          className="mt-2 rounded-xl border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--color-warning)',
            backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, var(--bg-primary) 90%)',
            color: 'var(--text-secondary)',
          }}
        >
          Unknown target keys will not be editable here: {unknownKeys.join(', ')}.
        </div>
      ) : null}
    </div>
  );
}
