import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getBarBucketCounts,
  getDividerPositions,
  moveDistributionDivider,
  normalizeAttributeDistributionValue,
  setAttributeBucketCount,
  summarizeAttributeDistribution,
  type AttributeDistributionValue,
  type DistributionBucket,
} from './attributeDistribution';

const INLINE_LABEL_PERCENT_THRESHOLD = 24;
const INLINE_EDITOR_MIN_PX = 112;
const INLINE_COUNT_EDITOR_MIN_PX = 28;
const COMPACT_SEGMENT_LABEL_MIN_PX = 72;

type BucketControlPlacement = 'bar-full' | 'bar-count' | 'legend';

function getCountInputWidth(value: string) {
  return `calc(${Math.max(1, value.length)}ch + 0.35rem)`;
}

function areDistributionValuesEqual(left: AttributeDistributionValue, right: AttributeDistributionValue) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => (left[key] ?? 0) === (right[key] ?? 0));
}

interface ActiveDistributionDrag {
  source: 'line' | 'dot';
  dividerIndex: number;
  buckets: DistributionBucket[];
  startClientX: number;
  toggleBucketKey?: string;
}

interface FrozenBucketLayoutState {
  placement: BucketControlPlacement;
  showLegend: boolean;
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

function getSegmentTextColor(index: number, bucketKind: DistributionBucket['kind']) {
  if (bucketKind === 'unallocated') {
    return 'var(--text-primary)';
  }

  const textColors = [
    '#ffffff',
    '#062b27',
    '#2a1800',
    '#ffffff',
    '#ffffff',
    '#062b35',
    '#1c2400',
    '#2a1606',
  ];

  return textColors[index % textColors.length];
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

function clampMarkerPosition(position: number, capacity: number) {
  if (capacity <= 0) {
    return 0;
  }

  return Math.min(capacity, Math.max(0, position));
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
  showSummary,
  showChips,
}: AttributeDistributionFieldProps) {
  const externalValue = useMemo(() => normalizeAttributeDistributionValue(value, buckets), [value, buckets]);
  const [localValue, setLocalValue] = useState(externalValue);
  const localValueRef = useRef(localValue);
  const pendingChangeFrameRef = useRef<number | null>(null);
  const queuedExternalValueRef = useRef<AttributeDistributionValue | null>(null);
  const lastSentValueRef = useRef<AttributeDistributionValue | null>(null);
  const attributeBuckets = useMemo(() => buckets.filter((bucket) => bucket.kind === 'attribute'), [buckets]);
  const activeBarBuckets = useMemo(
    () => buckets.filter((bucket) => bucket.kind === 'unallocated' || Object.prototype.hasOwnProperty.call(localValue, bucket.key)),
    [buckets, localValue],
  );
  const summary = useMemo(
    () => summarizeAttributeDistribution(localValue, buckets, capacity),
    [localValue, buckets, capacity],
  );
  const barBucketCounts = useMemo(
    () => getBarBucketCounts(activeBarBuckets, localValue, summary.capacity),
    [activeBarBuckets, localValue, summary.capacity],
  );
  const dividerPositions = useMemo(() => getDividerPositions(barBucketCounts), [barBucketCounts]);
  const clampedDividerPositions = useMemo(
    () => dividerPositions.map((position) => clampMarkerPosition(position, summary.capacity)),
    [dividerPositions, summary.capacity],
  );
  const barRef = useRef<HTMLDivElement | null>(null);
  const [barWidth, setBarWidth] = useState(0);
  const editableInputRefs = useRef(new Map<string, HTMLInputElement | null>());
  const pendingFocusKeyRef = useRef<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDistributionDrag | null>(null);
  const [frozenBucketLayout, setFrozenBucketLayout] = useState<Record<string, FrozenBucketLayoutState> | null>(null);
  const [countInputDrafts, setCountInputDrafts] = useState<Record<string, string>>({});
  const dragMovedRef = useRef(false);
  const dragEnabled = !disabled && summary.capacity > 0 && !summary.isOverallocated;
  const resolvedShowSummary = showSummary ?? true;
  const resolvedShowChips = showChips ?? true;
  const allowInlineEdit = resolvedShowChips;
  const bucketStates = useMemo(() => attributeBuckets.map((bucket, index) => {
    const count = localValue[bucket.key] ?? 0;
    const isActive = Object.prototype.hasOwnProperty.call(localValue, bucket.key);
    const widthPercent = summary.capacity > 0 ? (count / summary.capacity) * 100 : 0;
    const segmentWidthPx = barWidth > 0 ? (widthPercent / 100) * barWidth : null;
    const canInlineFullEdit = allowInlineEdit
      && isActive
      && count > 0
      && widthPercent >= INLINE_LABEL_PERCENT_THRESHOLD
      && (segmentWidthPx == null || segmentWidthPx >= INLINE_EDITOR_MIN_PX);
    const canInlineCountEdit = allowInlineEdit
      && isActive
      && count > 0
      && (segmentWidthPx == null || segmentWidthPx >= INLINE_COUNT_EDITOR_MIN_PX);
    const placement: BucketControlPlacement = canInlineFullEdit
      ? 'bar-full'
      : canInlineCountEdit
        ? 'bar-count'
        : 'legend';
    const showLegend = !isActive || count === 0 || placement !== 'bar-full';
    const frozenState = frozenBucketLayout?.[bucket.key];

    return {
      bucket,
      index,
      count,
      isActive,
      color: getSegmentColor(index, bucket.kind),
      textColor: getSegmentTextColor(index, bucket.kind),
      widthPercent,
      segmentWidthPx,
      placement: frozenState?.placement ?? placement,
      showLegend: frozenState?.showLegend ?? showLegend,
    };
  }), [allowInlineEdit, attributeBuckets, barWidth, frozenBucketLayout, localValue, summary.capacity]);
  const bucketStateByKey = useMemo(
    () => new Map(bucketStates.map((state) => [state.bucket.key, state])),
    [bucketStates],
  );

  const registerEditableInput = React.useCallback((key: string, node: HTMLInputElement | null) => {
    if (node) {
      editableInputRefs.current.set(key, node);
    } else {
      editableInputRefs.current.delete(key);
    }
  }, []);

  const handleClusterOffsets = useMemo(() => buildCenteredClusterOffsets(clampedDividerPositions), [clampedDividerPositions]);

  const freezeCurrentLayout = React.useCallback(() => {
    setFrozenBucketLayout(Object.fromEntries(bucketStates.map((state) => [state.bucket.key, {
      placement: state.placement,
      showLegend: state.showLegend,
    }])));
  }, [bucketStates]);

  useEffect(() => {
    localValueRef.current = localValue;
  }, [localValue]);

  const flushQueuedExternalChange = React.useCallback(() => {
    if (pendingChangeFrameRef.current != null) {
      cancelAnimationFrame(pendingChangeFrameRef.current);
      pendingChangeFrameRef.current = null;
    }

    const queuedValue = queuedExternalValueRef.current;
    if (!queuedValue) {
      return;
    }

    queuedExternalValueRef.current = null;
    lastSentValueRef.current = queuedValue;
    onChange(queuedValue);
  }, [onChange]);

  const queueValueChange = React.useCallback((nextValue: AttributeDistributionValue, mode: 'immediate' | 'raf' | 'local' = 'raf') => {
    const normalizedNextValue = normalizeAttributeDistributionValue(nextValue, buckets);
    localValueRef.current = normalizedNextValue;
    setLocalValue(normalizedNextValue);

    if (mode === 'local') {
      return;
    }

    queuedExternalValueRef.current = normalizedNextValue;

    if (mode === 'immediate') {
      flushQueuedExternalChange();
      return;
    }

    if (pendingChangeFrameRef.current != null) {
      return;
    }

    pendingChangeFrameRef.current = requestAnimationFrame(() => {
      pendingChangeFrameRef.current = null;
      flushQueuedExternalChange();
    });
  }, [buckets, flushQueuedExternalChange]);

  const toggleBucketActive = React.useCallback((bucket: DistributionBucket) => {
    if (bucket.kind !== 'attribute' || disabled) {
      return;
    }

    const currentValue = localValueRef.current;
    const nextValue = { ...currentValue };
    if (Object.prototype.hasOwnProperty.call(currentValue, bucket.key)) {
      delete nextValue[bucket.key];
    } else {
      nextValue[bucket.key] = 0;
    }
    queueValueChange(nextValue, 'immediate');
  }, [disabled, queueValueChange]);

  const clearCountInputDraft = React.useCallback((bucketKey: string) => {
    setCountInputDrafts((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, bucketKey)) {
        return current;
      }

      const nextDrafts = { ...current };
      delete nextDrafts[bucketKey];
      return nextDrafts;
    });
  }, []);

  const handleCountInputChange = React.useCallback((
    bucketKey: string,
    nextRaw: string,
    pendingFocusMode: 'when-inline' | 'when-legend',
  ) => {
    if (!/^\d*$/.test(nextRaw)) {
      return;
    }

    setCountInputDrafts((current) => ({
      ...current,
      [bucketKey]: nextRaw,
    }));

    const rounded = nextRaw === '' ? 0 : Math.max(0, Math.round(Number(nextRaw)));
    const nextWidthPercent = summary.capacity > 0 ? (rounded / summary.capacity) * 100 : 0;
    const nextSegmentWidthPx = barWidth > 0 ? (nextWidthPercent / 100) * barWidth : null;
    const nextWillUseBar = allowInlineEdit
      && rounded > 0
      && (nextSegmentWidthPx == null || nextSegmentWidthPx >= INLINE_COUNT_EDITOR_MIN_PX);
    if (
      (pendingFocusMode === 'when-inline' && nextWillUseBar)
      || (pendingFocusMode === 'when-legend' && !nextWillUseBar)
    ) {
      pendingFocusKeyRef.current = bucketKey;
    }

    queueValueChange(setAttributeBucketCount(localValueRef.current, buckets, bucketKey, rounded), 'immediate');
  }, [allowInlineEdit, barWidth, buckets, queueValueChange, summary.capacity]);

  useEffect(() => {
    const lastSentValue = lastSentValueRef.current;
    if (lastSentValue && areDistributionValuesEqual(externalValue, lastSentValue)) {
      lastSentValueRef.current = null;
    }

    const hasPendingExternalSync = queuedExternalValueRef.current != null || lastSentValueRef.current != null;
    if (activeDrag || hasPendingExternalSync || areDistributionValuesEqual(localValueRef.current, externalValue)) {
      return undefined;
    }

    const syncFrame = requestAnimationFrame(() => {
      localValueRef.current = externalValue;
      setLocalValue(externalValue);
    });

    return () => cancelAnimationFrame(syncFrame);
  }, [activeDrag, externalValue]);

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

      queueValueChange(
        moveDistributionDivider(
          localValueRef.current,
          activeDrag.buckets,
          activeDrag.dividerIndex,
          resolvePosition(event.clientX),
          summary.capacity,
        ),
        'local',
      );
    };

    const stopDragging = () => {
      if (dragMovedRef.current) {
        queueValueChange(localValueRef.current, 'immediate');
      } else {
        flushQueuedExternalChange();
      }
      setFrozenBucketLayout(null);

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
  }, [activeDrag, attributeBuckets, dragEnabled, flushQueuedExternalChange, queueValueChange, summary.capacity, toggleBucketActive]);

  useEffect(() => () => {
    if (pendingChangeFrameRef.current != null) {
      cancelAnimationFrame(pendingChangeFrameRef.current);
    }
  }, []);

  useEffect(() => {
    const pendingFocusKey = pendingFocusKeyRef.current;
    if (!pendingFocusKey) {
      return;
    }

    const target = editableInputRefs.current.get(pendingFocusKey);
    if (!target) {
      return;
    }

    target.focus();
    target.select();
    pendingFocusKeyRef.current = null;
  }, [bucketStates]);

  useEffect(() => {
    const node = barRef.current;
    if (!node) {
      return undefined;
    }

    const measure = () => {
      const nextWidth = node.getBoundingClientRect().width;
      setBarWidth((previous) => (Math.abs(previous - nextWidth) < 0.5 ? previous : nextWidth));
    };

    measure();
    window.addEventListener('resize', measure);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => measure());
      observer.observe(node);
    }

    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      className={[
        'attribute-distribution',
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
              <div className="attribute-distribution__segments">
                {activeBarBuckets.map((bucket, index) => {
                  const units = barBucketCounts[index] ?? 0;
                  if (units <= 0) {
                    return null;
                  }

                  const colorIndex = buckets.findIndex((candidate) => candidate.key === bucket.key);
                  const widthPercent = summary.capacity > 0 ? (units / summary.capacity) * 100 : 0;
                  const bucketState = bucket.kind === 'attribute' ? bucketStateByKey.get(bucket.key) : null;
                  const countInputDisplayValue = bucket.kind === 'attribute'
                    ? (countInputDrafts[bucket.key] ?? String(units))
                    : String(units);
                  const showCompactSegmentLabel = bucket.kind === 'unallocated'
                    && ((barWidth > 0 ? (widthPercent / 100) * barWidth : Infinity) >= COMPACT_SEGMENT_LABEL_MIN_PX);
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
                        '--attribute-distribution-segment-text-color': bucketState?.textColor ?? getSegmentTextColor(colorIndex >= 0 ? colorIndex : 0, bucket.kind),
                      }}
                    >
                      {bucket.kind === 'attribute' ? (
                        bucketState && bucketState.placement !== 'legend' ? (
                          <>
                            {bucketState.placement === 'bar-full' ? (
                              <button
                                type="button"
                                className="attribute-distribution__segment-label-button"
                                aria-label={`Disable target for ${bucket.label}`}
                                disabled={disabled}
                                onClick={() => toggleBucketActive(bucket)}
                              >
                                <span className="attribute-distribution__segment-label">{bucket.label}</span>
                              </button>
                            ) : null}
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className="attribute-distribution__segment-input"
                              aria-label={`${bucket.label} count`}
                              disabled={disabled}
                              value={countInputDisplayValue}
                              ref={(node) => registerEditableInput(bucket.key, node)}
                              style={{ width: getCountInputWidth(countInputDisplayValue) }}
                              onChange={(event) => handleCountInputChange(bucket.key, event.target.value, 'when-legend')}
                              onBlur={() => clearCountInputDraft(bucket.key)}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </>
                        ) : null
                      ) : (
                        <>
                          {showCompactSegmentLabel ? <span className="attribute-distribution__segment-label">{bucket.label}</span> : null}
                          <span className="attribute-distribution__segment-value">{units}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

            </>
          ) : (
            <div className="attribute-distribution__empty">Select a group with capacity to edit the distribution.</div>
          )}

          {dragEnabled
            ? dividerPositions.map((_, index) => {
                const position = clampedDividerPositions[index] ?? 0;
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
                    onPointerDown={(event) => {
                      freezeCurrentLayout();
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
                      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                        return;
                      }

                      event.preventDefault();
                      const delta = event.key === 'ArrowRight' ? 1 : -1;
                      const step = event.shiftKey ? 5 : 1;
                      queueValueChange(
                        moveDistributionDivider(
                          localValueRef.current,
                          activeBarBuckets,
                          index,
                          position + delta * step,
                          summary.capacity,
                        ),
                        'immediate',
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
        <div className="attribute-distribution__support-legend">
          {bucketStates.filter((state) => state.showLegend).map((state) => {
            const displayValue = countInputDrafts[state.bucket.key] ?? String(state.count);
            return (
              <div
                key={state.bucket.key}
                className={[
                  'attribute-distribution__support-item',
                  state.isActive ? 'attribute-distribution__support-item--active' : 'attribute-distribution__support-item--inactive',
                ].filter(Boolean).join(' ')}
              >
                <span
                  className="attribute-distribution__support-swatch"
                  style={{ background: state.color }}
                />
                <button
                  type="button"
                  className="attribute-distribution__support-label-button"
                  aria-label={`${state.isActive ? 'Disable' : 'Enable'} target for ${state.bucket.label}`}
                  aria-pressed={state.isActive}
                  disabled={disabled}
                  onClick={() => toggleBucketActive(state.bucket)}
                >
                  <span className="attribute-distribution__support-label">{state.bucket.label}</span>
                </button>
                {state.isActive && state.placement === 'legend' ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="attribute-distribution__support-input"
                    aria-label={`${state.bucket.label} count`}
                    disabled={disabled}
                    value={displayValue}
                    ref={(node) => registerEditableInput(state.bucket.key, node)}
                    style={{ width: getCountInputWidth(displayValue) }}
                    onChange={(event) => handleCountInputChange(state.bucket.key, event.target.value, 'when-inline')}
                    onBlur={() => clearCountInputDraft(state.bucket.key)}
                  />
                ) : null}
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
