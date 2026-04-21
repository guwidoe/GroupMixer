import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  adjustAttributeBucketCount,
  getBarBucketCounts,
  getDividerPositions,
  moveDistributionDivider,
  normalizeAttributeDistributionValue,
  summarizeAttributeDistribution,
  type AttributeDistributionValue,
  type DistributionBucket,
} from './attributeDistribution';

interface AttributeDistributionFieldProps {
  buckets: DistributionBucket[];
  value?: AttributeDistributionValue;
  capacity: number;
  onChange: (value: AttributeDistributionValue) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

const SEGMENT_COLORS = [
  'var(--color-accent)',
  '#14b8a6',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#84cc16',
  '#f97316',
];

function getSegmentColor(index: number, bucketKind: DistributionBucket['kind']) {
  if (bucketKind === 'unallocated') {
    return 'color-mix(in srgb, var(--text-tertiary) 28%, var(--bg-tertiary) 72%)';
  }

  return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}

export function AttributeDistributionField({
  buckets,
  value,
  capacity,
  onChange,
  label,
  hint,
  error,
  disabled = false,
  className,
}: AttributeDistributionFieldProps) {
  const normalizedValue = useMemo(() => normalizeAttributeDistributionValue(value, buckets), [value, buckets]);
  const summary = useMemo(
    () => summarizeAttributeDistribution(normalizedValue, buckets, capacity),
    [normalizedValue, buckets, capacity],
  );
  const barBucketCounts = useMemo(
    () => getBarBucketCounts(buckets, normalizedValue, summary.capacity),
    [buckets, normalizedValue, summary.capacity],
  );
  const dividerPositions = useMemo(() => getDividerPositions(barBucketCounts), [barBucketCounts]);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [activeDivider, setActiveDivider] = useState<number | null>(null);
  const dragEnabled = !disabled && summary.capacity > 0 && !summary.isOverallocated;

  const handleClusterOffsets = useMemo(() => {
    const seen = new Map<number, number>();
    return dividerPositions.map((position) => {
      const offset = seen.get(position) ?? 0;
      seen.set(position, offset + 1);
      return offset;
    });
  }, [dividerPositions]);

  useEffect(() => {
    if (activeDivider == null || !dragEnabled) {
      return undefined;
    }

    const resolvePosition = (clientX: number) => {
      const bounds = barRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || summary.capacity <= 0) {
        return 0;
      }

      const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
      return Math.round(ratio * summary.capacity);
    };

    const handlePointerMove = (event: PointerEvent) => {
      onChange(moveDistributionDivider(normalizedValue, buckets, activeDivider, resolvePosition(event.clientX), summary.capacity));
    };

    const stopDragging = () => {
      setActiveDivider(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [activeDivider, buckets, dragEnabled, normalizedValue, onChange, summary.capacity]);

  return (
    <div className={['attribute-distribution', disabled ? 'attribute-distribution--disabled' : null, className].filter(Boolean).join(' ')}>
      {label ? <div className="attribute-distribution__label">{label}</div> : null}

      <div className="attribute-distribution__summary" aria-live="polite">
        <span>
          Allocated <strong>{summary.allocatedTotal}</strong> / {summary.capacity}
        </span>
        <span>
          Not allocated <strong>{summary.unallocatedCount}</strong>
        </span>
      </div>

      <div className="attribute-distribution__bar-shell">
        <div
          ref={barRef}
          className={['attribute-distribution__bar', dragEnabled ? null : 'attribute-distribution__bar--static'].filter(Boolean).join(' ')}
          role="group"
          aria-label={typeof label === 'string' ? label : 'Attribute distribution'}
        >
          {summary.capacity > 0 ? (
            <div className="attribute-distribution__segments" aria-hidden="true">
              {buckets.map((bucket, index) => {
                const units = barBucketCounts[index] ?? 0;
                if (units <= 0) {
                  return null;
                }

                const widthPercent = summary.capacity > 0 ? (units / summary.capacity) * 100 : 0;
                return (
                  <div
                    key={bucket.key}
                    className={['attribute-distribution__segment', bucket.kind === 'unallocated' ? 'attribute-distribution__segment--unallocated' : null]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      width: `${widthPercent}%`,
                      background: getSegmentColor(index, bucket.kind),
                    }}
                  >
                    <span className="attribute-distribution__segment-label">{bucket.label}</span>
                    <span className="attribute-distribution__segment-value">{units}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="attribute-distribution__empty">Select a group with capacity to edit the distribution.</div>
          )}

          {summary.capacity > 0
            ? dividerPositions.map((position, index) => {
                const leftPercent = summary.capacity > 0 ? (position / summary.capacity) * 100 : 0;
                const leftBucket = buckets[index];
                const rightBucket = buckets[index + 1];
                return (
                  <button
                    key={`${leftBucket?.key ?? index}-${rightBucket?.key ?? index}`}
                    type="button"
                    className="attribute-distribution__handle"
                    style={{
                      left: `${leftPercent}%`,
                      '--attribute-distribution-handle-offset': `${handleClusterOffsets[index] * 0.7}rem`,
                    } as React.CSSProperties}
                    aria-label={`Adjust boundary between ${leftBucket?.label ?? 'left'} and ${rightBucket?.label ?? 'right'}`}
                    disabled={!dragEnabled}
                    onPointerDown={(event) => {
                      if (!dragEnabled) {
                        return;
                      }
                      event.preventDefault();
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      setActiveDivider(index);
                    }}
                    onKeyDown={(event) => {
                      if (!dragEnabled) {
                        return;
                      }

                      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                        return;
                      }

                      event.preventDefault();
                      const delta = event.key === 'ArrowRight' ? 1 : -1;
                      const step = event.shiftKey ? 5 : 1;
                      onChange(
                        moveDistributionDivider(
                          normalizedValue,
                          buckets,
                          index,
                          position + delta * step,
                          summary.capacity,
                        ),
                      );
                    }}
                  >
                    <span className="attribute-distribution__handle-line" aria-hidden="true" />
                    <span className="attribute-distribution__handle-grip" aria-hidden="true" />
                  </button>
                );
              })
            : null}
        </div>

        {summary.isOverallocated ? (
          <p className="attribute-distribution__warning">
            Allocated values exceed the current capacity. Reduce manual counts before using the drag bar again.
          </p>
        ) : null}
      </div>

      <div className="attribute-distribution__chips">
        {buckets.map((bucket, index) => {
          const count = bucket.kind === 'unallocated' ? summary.unallocatedCount : normalizedValue[bucket.key] ?? 0;
          return (
            <div key={bucket.key} className="attribute-distribution__chip">
              <div className="attribute-distribution__chip-heading">
                <span
                  className="attribute-distribution__chip-swatch"
                  style={{ background: getSegmentColor(index, bucket.kind) }}
                  aria-hidden="true"
                />
                <span className="attribute-distribution__chip-label">{bucket.label}</span>
              </div>

              {bucket.kind === 'attribute' ? (
                <div className="attribute-distribution__chip-controls">
                  <button
                    type="button"
                    className="attribute-distribution__stepper"
                    disabled={disabled || count <= 0}
                    aria-label={`Decrease ${bucket.label}`}
                    onClick={() => onChange(adjustAttributeBucketCount(normalizedValue, buckets, bucket.key, -1))}
                  >
                    −
                  </button>
                  <span className="attribute-distribution__chip-value" aria-label={`${bucket.label} count`}>
                    {count}
                  </span>
                  <button
                    type="button"
                    className="attribute-distribution__stepper"
                    disabled={disabled}
                    aria-label={`Increase ${bucket.label}`}
                    onClick={() => onChange(adjustAttributeBucketCount(normalizedValue, buckets, bucket.key, 1))}
                  >
                    +
                  </button>
                </div>
              ) : (
                <div className="attribute-distribution__chip-static">
                  <span className="attribute-distribution__chip-value" aria-label="Not allocated count">
                    {count}
                  </span>
                  <span className="attribute-distribution__chip-caption">Derived from remaining capacity</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hint ? <p className="attribute-distribution__hint">{hint}</p> : null}
      {error ? <p className="attribute-distribution__error">{error}</p> : null}
    </div>
  );
}
