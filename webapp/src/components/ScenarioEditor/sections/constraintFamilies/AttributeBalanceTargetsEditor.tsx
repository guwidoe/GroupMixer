import React from 'react';
import { NumberField, NUMBER_FIELD_PRESETS } from '../../../ui';

interface AttributeBalanceTargetsEditorProps {
  options: string[];
  value?: Record<string, number>;
  onCommit: (value: Record<string, number>) => void;
  disabled?: boolean;
}

export function AttributeBalanceTargetsEditor({
  options,
  value,
  onCommit,
  disabled = false,
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

  return (
    <div className="min-w-[14rem] space-y-2">
      {options.map((option) => (
        <label key={option} className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-2 text-sm">
          <span className="truncate" title={option} style={{ color: 'var(--text-secondary)' }}>
            {option}
          </span>
          <NumberField
            label={undefined}
            inputAriaLabel={`Target for ${option}`}
            disabled={disabled}
            value={targets[option] ?? null}
            onChange={(nextValue) => {
              const nextTargets = { ...targets };
              if (nextValue == null) {
                delete nextTargets[option];
              } else {
                nextTargets[option] = nextValue;
              }
              onCommit(nextTargets);
            }}
            variant="compact"
            showSlider={false}
            {...NUMBER_FIELD_PRESETS.attributeTargetCount}
            inputClassName="h-9"
            className="w-full"
          />
        </label>
      ))}
      {unknownKeys.length > 0 ? (
        <div
          className="rounded-xl border px-3 py-2 text-xs"
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
