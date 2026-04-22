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
    window.removeEventListener('pointerup', stopColumnResize);
    window.removeEventListener('pointercancel', stopColumnResize);
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
    window.removeEventListener('pointerup', stopResize);
    window.removeEventListener('pointercancel', stopResize);
  }, [handleResizePointerMove]);

  useEffect(() => stopColumnResize, [stopColumnResize]);
  useEffect(() => stopResize, [stopResize]);

  const startColumnResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
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
          <div className="landing-participant-columns__columns">
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
