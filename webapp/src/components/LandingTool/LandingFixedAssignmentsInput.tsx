import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { QuickSetupFixedAssignment } from './types';
import {
  buildFixedAssignmentRowsFromColumns,
  serializeFixedAssignmentColumnValues,
} from '../../utils/quickSetup/fixedAssignments';
import { splitParticipantColumnValues } from '../../utils/quickSetup/participantColumns';

interface LandingFixedAssignmentsInputProps {
  label: string;
  participantColumnLabel: string;
  participantColumnPlaceholder: string;
  groupColumnLabel: string;
  groupColumnPlaceholder: string;
  assignments: QuickSetupFixedAssignment[];
  onChange: (assignments: QuickSetupFixedAssignment[]) => void;
  minHeight: number;
}

interface EditableTextBlockProps {
  className: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  multiline?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}

const PARTICIPANT_COLUMN_WIDTH = 180;
const GROUP_COLUMN_WIDTH = 140;
const MIN_PARTICIPANT_WIDTH = 120;
const MIN_GROUP_WIDTH = 96;
const HEADER_HEIGHT = 32;
const LINE_HEIGHT = 26;
const BODY_PADDING = 18;
const COLUMN_SEPARATOR_WIDTH = 12;

function areWidthsApproximatelyEqual(left: [number, number], right: [number, number]) {
  return Math.abs(left[0] - right[0]) < 0.5 && Math.abs(left[1] - right[1]) < 0.5;
}

function distributeBalancedWidths(availableWidth: number, minimumWidths: [number, number]): [number, number] {
  const minimumTotal = minimumWidths[0] + minimumWidths[1];
  if (availableWidth <= minimumTotal) {
    return [...minimumWidths] as [number, number];
  }

  const targetWidth = availableWidth / 2;
  if (targetWidth >= minimumWidths[0] && targetWidth >= minimumWidths[1]) {
    return [targetWidth, targetWidth];
  }

  if (targetWidth < minimumWidths[0]) {
    return [minimumWidths[0], availableWidth - minimumWidths[0]];
  }

  return [availableWidth - minimumWidths[1], minimumWidths[1]];
}

function readEditableValue(element: HTMLDivElement) {
  const rawValue = typeof element.innerText === 'string'
    ? element.innerText
    : (element.textContent ?? '');

  return rawValue.replace(/\n+$/g, '');
}

function EditableTextBlock({
  className,
  value,
  onChange,
  ariaLabel,
  multiline = false,
  placeholder,
  style,
}: EditableTextBlockProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    if (document.activeElement === element) {
      return;
    }

    const currentValue = readEditableValue(element);
    if (currentValue !== value) {
      element.textContent = value;
    }
  }, [value]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline={multiline || undefined}
      className={className}
      data-placeholder={placeholder ?? ''}
      data-empty={value.length === 0 ? 'true' : 'false'}
      onInput={(event) => onChange(readEditableValue(event.currentTarget))}
      onBlur={(event) => {
        event.currentTarget.scrollLeft = 0;
      }}
      style={style}
    />
  );
}

export function LandingFixedAssignmentsInput({
  label,
  participantColumnLabel,
  participantColumnPlaceholder,
  groupColumnLabel,
  groupColumnPlaceholder,
  assignments,
  onChange,
  minHeight,
}: LandingFixedAssignmentsInputProps) {
  const [height, setHeight] = useState(minHeight);
  const [columnWidths, setColumnWidths] = useState<[number, number]>([PARTICIPANT_COLUMN_WIDTH, GROUP_COLUMN_WIDTH]);
  const dragStateRef = useRef<{
    startX: number;
    leftWidth: number;
    rightWidth: number;
  } | null>(null);
  const resizeDragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const stopColumnResizeRef = useRef<() => void>(() => {});
  const stopResizeRef = useRef<() => void>(() => {});
  const columnsContainerRef = useRef<HTMLDivElement | null>(null);
  const hasCustomColumnWidthsRef = useRef(false);

  const participantValues = useMemo(() => serializeFixedAssignmentColumnValues(assignments, 'personId'), [assignments]);
  const groupValues = useMemo(() => serializeFixedAssignmentColumnValues(assignments, 'groupId'), [assignments]);
  const maxLineCount = useMemo(() => (
    Math.max(
      1,
      splitParticipantColumnValues(participantValues).length,
      splitParticipantColumnValues(groupValues).length,
    )
  ), [groupValues, participantValues]);
  const contentHeight = Math.max(height - HEADER_HEIGHT - 18, maxLineCount * LINE_HEIGHT + BODY_PADDING);

  useLayoutEffect(() => {
    if (hasCustomColumnWidthsRef.current) {
      return undefined;
    }

    const node = columnsContainerRef.current;
    if (!node) {
      return undefined;
    }

    const measure = () => {
      if (hasCustomColumnWidthsRef.current) {
        return;
      }

      const totalWidth = node.getBoundingClientRect().width;
      if (totalWidth <= 0) {
        return;
      }

      const availableWidth = Math.max(0, totalWidth - COLUMN_SEPARATOR_WIDTH);
      const nextColumnWidths = distributeBalancedWidths(availableWidth, [MIN_PARTICIPANT_WIDTH, MIN_GROUP_WIDTH]);
      setColumnWidths((previous) => (areWidthsApproximatelyEqual(previous, nextColumnWidths) ? previous : nextColumnWidths));
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

  const handleColumnPointerMove = useCallback((event: PointerEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    const delta = event.clientX - dragState.startX;
    const total = dragState.leftWidth + dragState.rightWidth;
    const nextLeftWidth = Math.min(total - MIN_GROUP_WIDTH, Math.max(MIN_PARTICIPANT_WIDTH, dragState.leftWidth + delta));
    const nextRightWidth = total - nextLeftWidth;

    setColumnWidths([nextLeftWidth, nextRightWidth]);
  }, []);

  const stopColumnResize = useCallback(() => {
    dragStateRef.current = null;
    window.removeEventListener('pointermove', handleColumnPointerMove);
    window.removeEventListener('pointerup', stopColumnResizeRef.current);
    window.removeEventListener('pointercancel', stopColumnResizeRef.current);
  }, [handleColumnPointerMove]);

  const handleResizePointerMove = useCallback((event: PointerEvent) => {
    const dragState = resizeDragStateRef.current;
    if (!dragState) {
      return;
    }

    const nextHeight = Math.max(minHeight, dragState.startHeight + (event.clientY - dragState.startY));
    setHeight(nextHeight);
  }, [minHeight]);

  const stopResize = useCallback(() => {
    resizeDragStateRef.current = null;
    window.removeEventListener('pointermove', handleResizePointerMove);
    window.removeEventListener('pointerup', stopResizeRef.current);
    window.removeEventListener('pointercancel', stopResizeRef.current);
  }, [handleResizePointerMove]);

  useEffect(() => {
    stopColumnResizeRef.current = stopColumnResize;
    return stopColumnResize;
  }, [stopColumnResize]);
  useEffect(() => {
    stopResizeRef.current = stopResize;
    return stopResize;
  }, [stopResize]);

  const startColumnResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    hasCustomColumnWidthsRef.current = true;
    const leftElement = event.currentTarget.previousElementSibling as HTMLDivElement | null;
    const rightElement = event.currentTarget.nextElementSibling as HTMLDivElement | null;

    dragStateRef.current = {
      startX: event.clientX,
      leftWidth: leftElement?.getBoundingClientRect().width ?? columnWidths[0],
      rightWidth: rightElement?.getBoundingClientRect().width ?? columnWidths[1],
    };

    window.addEventListener('pointermove', handleColumnPointerMove);
    window.addEventListener('pointerup', stopColumnResize);
    window.addEventListener('pointercancel', stopColumnResize);
  }, [columnWidths, handleColumnPointerMove, stopColumnResize]);

  const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resizeDragStateRef.current = {
      startY: event.clientY,
      startHeight: height,
    };

    window.addEventListener('pointermove', handleResizePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  }, [handleResizePointerMove, height, stopResize]);

  return (
    <div className="landing-resizable-textarea landing-resizable-textarea--structured rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="theme-scrollbar landing-participant-columns" style={{ height: `${height}px` }}>
        <div className="landing-participant-columns__surface">
          <div ref={columnsContainerRef} className="landing-participant-columns__columns">
            <div
              className="landing-participant-columns__column"
              style={{
                minWidth: `${MIN_PARTICIPANT_WIDTH}px`,
                flex: `0 1 ${columnWidths[0]}px`,
              }}
            >
              <div className="landing-participant-columns__header-shell landing-participant-columns__header-shell--static">
                <div className="landing-participant-columns__column-header">
                  <div className="landing-participant-columns__header-label landing-participant-columns__header-text">{participantColumnLabel}</div>
                </div>
              </div>
              <div className="landing-participant-columns__body-shell">
                <EditableTextBlock
                  value={participantValues}
                  onChange={(nextValue) => onChange(buildFixedAssignmentRowsFromColumns(nextValue, groupValues))}
                  ariaLabel={`${label}: ${participantColumnLabel}`}
                  className="landing-participant-columns__textarea"
                  style={{ height: `${contentHeight}px` }}
                  multiline
                  placeholder={participantColumnPlaceholder}
                />
              </div>
            </div>

            <div
              className="landing-participant-columns__separator"
              onPointerDown={startColumnResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize fixed assignment columns"
            >
              <div className="landing-participant-columns__separator-line" />
            </div>

            <div
              className="landing-participant-columns__column"
              style={{
                minWidth: `${MIN_GROUP_WIDTH}px`,
                flex: `1 1 ${columnWidths[1]}px`,
              }}
            >
              <div className="landing-participant-columns__header-shell landing-participant-columns__header-shell--static">
                <div className="landing-participant-columns__column-header">
                  <div className="landing-participant-columns__header-label landing-participant-columns__header-text">{groupColumnLabel}</div>
                </div>
              </div>
              <div className="landing-participant-columns__body-shell">
                <EditableTextBlock
                  value={groupValues}
                  onChange={(nextValue) => onChange(buildFixedAssignmentRowsFromColumns(participantValues, nextValue))}
                  ariaLabel={`${label}: ${groupColumnLabel}`}
                  className="landing-participant-columns__textarea"
                  style={{ height: `${contentHeight}px` }}
                  multiline
                  placeholder={groupColumnPlaceholder}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        className="landing-resizable-textarea__resize-handle"
        onPointerDown={handleResizePointerDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize fixed people input"
      />
    </div>
  );
}
