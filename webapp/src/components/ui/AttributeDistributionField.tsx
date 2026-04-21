import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  adjustAttributeBucketCount,
  getBarBucketCounts,
  getDividerPositions,
  moveDistributionDivider,
  normalizeAttributeDistributionValue,
  setAttributeBucketCount,
  summarizeAttributeDistribution,
  type AttributeDistributionValue,
  type DistributionBucket,
} from './attributeDistribution';

export type AttributeDistributionFieldVariant = 'default' | 'compact';

interface ActiveDistributionDrag {
  source: 'line' | 'dot';
  dividerIndex: number;
  buckets: DistributionBucket[];
  startClientX: number;
  toggleBucketKey?: string;
}

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
  variant?: AttributeDistributionFieldVariant;
  showSummary?: boolean;
  showChips?: boolean;
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

function buildCenteredClusterOffsets(positions: number[]) {
  const groups = new Map<number, number[]>();

  positions.forEach((position, index) => {
    const group = groups.get(position) ?? [];
    group.push(index);
    groups.set(position, group);
  });

  const offsets = Array.from({ length: positions.length }, () => 0);
  groups.forEach((indexes) => {
    const center = (indexes.length - 1) / 2;
    indexes.forEach((index, order) => {
      offsets[index] = order - center;
    });
  });

  return offsets;
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
  variant = 'default',
  showSummary,
  showChips,
}: AttributeDistributionFieldProps) {
  const normalizedValue = useMemo(() => normalizeAttributeDistributionValue(value, buckets), [value, buckets]);
  const attributeBuckets = useMemo(() => buckets.filter((bucket) => bucket.kind === 'attribute'), [buckets]);
  const activeBarBuckets = useMemo(
    () => buckets.filter((bucket) => bucket.kind === 'unallocated' || Object.prototype.hasOwnProperty.call(normalizedValue, bucket.key)),
    [buckets, normalizedValue],
  );
  const summary = useMemo(
    () => summarizeAttributeDistribution(normalizedValue, buckets, capacity),
    [normalizedValue, buckets, capacity],
  );
  const allBucketCounts = useMemo(
    () => getBarBucketCounts(buckets, normalizedValue, summary.capacity),
    [buckets, normalizedValue, summary.capacity],
  );
  const barBucketCounts = useMemo(
    () => getBarBucketCounts(activeBarBuckets, normalizedValue, summary.capacity),
    [activeBarBuckets, normalizedValue, summary.capacity],
  );
  const dividerPositions = useMemo(() => getDividerPositions(barBucketCounts), [barBucketCounts]);
  const togglePositions = useMemo(() => getDividerPositions(allBucketCounts).slice(0, attributeBuckets.length), [allBucketCounts, attributeBuckets.length]);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDistributionDrag | null>(null);
  const dragMovedRef = useRef(false);
  const dragEnabled = !disabled && summary.capacity > 0 && !summary.isOverallocated;
  const resolvedShowSummary = showSummary ?? variant === 'default';
  const resolvedShowChips = showChips ?? variant === 'default';

  const handleClusterOffsets = useMemo(() => buildCenteredClusterOffsets(dividerPositions), [dividerPositions]);
  const toggleClusterOffsets = useMemo(() => buildCenteredClusterOffsets(togglePositions), [togglePositions]);

  const toggleBucketActive = React.useCallback((bucket: DistributionBucket) => {
    if (bucket.kind !== 'attribute' || disabled) {
      return;
    }

    const nextValue = { ...normalizedValue };
    if (Object.prototype.hasOwnProperty.call(normalizedValue, bucket.key)) {
      delete nextValue[bucket.key];
    } else {
      nextValue[bucket.key] = 0;
    }
    onChange(nextValue);
  }, [disabled, normalizedValue, onChange]);

  useEffect(() => {
    if (activeDrag == null || !dragEnabled) {
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
      if (Math.abs(event.clientX - activeDrag.startClientX) >= 4) {
        dragMovedRef.current = true;
      }

      onChange(moveDistributionDivider(normalizedValue, activeDrag.buckets, activeDrag.dividerIndex, resolvePosition(event.clientX), summary.capacity));
    };

    const stopDragging = () => {
      if (activeDrag.source === 'dot' && !dragMovedRef.current && activeDrag.toggleBucketKey) {
        const bucket = attributeBuckets.find((candidate) => candidate.key === activeDrag.toggleBucketKey);
        if (bucket) {
          toggleBucketActive(bucket);
        }
      }

      setActiveDrag(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [activeDrag, attributeBuckets, dragEnabled, normalizedValue, onChange, summary.capacity, toggleBucketActive]);

  return (
    <div
      className={[
        'attribute-distribution',
        `attribute-distribution--${variant}`,
        disabled ? 'attribute-distribution--disabled' : null,
        className,
      ].filter(Boolean).join(' ')}
    >
      {label ? <div className="attribute-distribution__label">{label}</div> : null}

      {resolvedShowSummary ? (
        <div className="attribute-distribution__summary" aria-live="polite">
          <span>
            Allocated <strong>{summary.allocatedTotal}</strong> / {summary.capacity}
          </span>
          <span>
            Not allocated <strong>{summary.unallocatedCount}</strong>
          </span>
        </div>
      ) : null}

      <div className="attribute-distribution__bar-shell">
        <div
          ref={barRef}
          className={['attribute-distribution__bar', dragEnabled ? null : 'attribute-distribution__bar--static'].filter(Boolean).join(' ')}
          role="group"
          aria-label={typeof label === 'string' ? label : 'Attribute distribution'}
        >
          {summary.capacity > 0 ? (
            <>
              <div className="attribute-distribution__segments" aria-hidden="true">
                {activeBarBuckets.map((bucket, index) => {
                  const units = barBucketCounts[index] ?? 0;
                  if (units <= 0) {
                    return null;
                  }

                  const colorIndex = buckets.findIndex((candidate) => candidate.key === bucket.key);
                  const widthPercent = summary.capacity > 0 ? (units / summary.capacity) * 100 : 0;
                  return (
                    <div
                      key={bucket.key}
                      className={[
                        'attribute-distribution__segment',
                        bucket.kind === 'unallocated' ? 'attribute-distribution__segment--unallocated' : null,
                      ].filter(Boolean).join(' ')}
                      style={{
                        width: `${widthPercent}%`,
                        background: getSegmentColor(colorIndex >= 0 ? colorIndex : 0, bucket.kind),
                      }}
                    >
                      <span className="attribute-distribution__segment-label">{bucket.label}</span>
                      <span className="attribute-distribution__segment-value">{units}</span>
                    </div>
                  );
                })}
              </div>

              {attributeBuckets.map((bucket, index) => {
                const position = togglePositions[index] ?? 0;
                const leftPercent = summary.capacity > 0 ? (position / summary.capacity) * 100 : 0;
                const isActive = Object.prototype.hasOwnProperty.call(normalizedValue, bucket.key);
                return (
                  <button
                    key={`toggle-${bucket.key}`}
                    type="button"
                    className={[
                      'attribute-distribution__toggle-dot',
                      isActive ? 'attribute-distribution__toggle-dot--active' : 'attribute-distribution__toggle-dot--inactive',
                    ].filter(Boolean).join(' ')}
                    style={{
                      left: `${leftPercent}%`,
                      '--attribute-distribution-toggle-offset': `${toggleClusterOffsets[index] * 0.7}rem`,
                      '--attribute-distribution-toggle-color': getSegmentColor(index, bucket.kind),
                    } as React.CSSProperties}
                    aria-label={`${isActive ? 'Disable' : 'Enable'} target for ${bucket.label}`}
                    aria-pressed={isActive}
                    title={bucket.label}
                    disabled={disabled}
                    onPointerDown={(event) => {
                      if (!dragEnabled) {
                        return;
                      }

                      event.preventDefault();
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      dragMovedRef.current = false;
                      setActiveDrag({
                        source: 'dot',
                        dividerIndex: index,
                        buckets,
                        startClientX: event.clientX,
                        toggleBucketKey: bucket.key,
                      });
                    }}
                    onClick={(event) => {
                      if (event.detail === 0) {
                        toggleBucketActive(bucket);
                      }
                    }}
                  >
                    <span className="attribute-distribution__toggle-tooltip" aria-hidden="true">{bucket.label}</span>
                    <span className="sr-only">{bucket.label}</span>
                  </button>
                );
              })}
            </>
          ) : (
            <div className="attribute-distribution__empty">Select a group with capacity to edit the distribution.</div>
          )}

          {summary.capacity > 0
            ? dividerPositions.map((position, index) => {
                const leftPercent = summary.capacity > 0 ? (position / summary.capacity) * 100 : 0;
                const leftBucket = activeBarBuckets[index];
                const rightBucket = activeBarBuckets[index + 1];
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
                      dragMovedRef.current = false;
                      setActiveDrag({
                        source: 'line',
                        dividerIndex: index,
                        buckets: activeBarBuckets,
                        startClientX: event.clientX,
                      });
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
                          activeBarBuckets,
                          index,
                          position + delta * step,
                          summary.capacity,
                        ),
                      );
                    }}
                  >
                    <span className="attribute-distribution__handle-line" aria-hidden="true" />
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

      {resolvedShowChips ? (
        <div className="attribute-distribution__chips">
          {attributeBuckets.map((bucket, index) => {
            const count = normalizedValue[bucket.key] ?? 0;
            const isActive = Object.prototype.hasOwnProperty.call(normalizedValue, bucket.key);
            return (
              <div
                key={bucket.key}
                className={[
                  'attribute-distribution__chip',
                  isActive ? 'attribute-distribution__chip--active' : 'attribute-distribution__chip--inactive',
                  'attribute-distribution__chip--toggleable',
                ].filter(Boolean).join(' ')}
                role="button"
                aria-pressed={isActive}
                tabIndex={0}
                onClick={() => toggleBucketActive(bucket)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleBucketActive(bucket);
                  }
                }}
              >
                <div className="attribute-distribution__chip-heading">
                  <span
                    className="attribute-distribution__chip-swatch"
                    style={{ background: getSegmentColor(index, bucket.kind) }}
                    aria-hidden="true"
                  />
                  <span className="attribute-distribution__chip-label">{bucket.label}</span>
                </div>

                {isActive ? (
                  <div className="attribute-distribution__chip-controls" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="attribute-distribution__stepper"
                      disabled={disabled || count <= 0}
                      aria-label={`Decrease ${bucket.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onChange(adjustAttributeBucketCount(normalizedValue, buckets, bucket.key, -1));
                      }}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="attribute-distribution__chip-input"
                      aria-label={`${bucket.label} count`}
                      disabled={disabled}
                      value={String(count)}
                      onChange={(event) => {
                        const nextRaw = event.target.value;
                        if (!/^\d*$/.test(nextRaw)) {
                          return;
                        }
                        const rounded = nextRaw === '' ? 0 : Math.max(0, Math.round(Number(nextRaw)));
                        onChange(setAttributeBucketCount(normalizedValue, buckets, bucket.key, rounded));
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <button
                      type="button"
                      className="attribute-distribution__stepper"
                      disabled={disabled}
                      aria-label={`Increase ${bucket.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onChange(adjustAttributeBucketCount(normalizedValue, buckets, bucket.key, 1));
                      }}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <div className="attribute-distribution__chip-inactive-note">Not targeted</div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {hint ? <p className="attribute-distribution__hint">{hint}</p> : null}
      {error ? <p className="attribute-distribution__error">{error}</p> : null}
    </div>
  );
}
