import React from 'react';
import { createPortal } from 'react-dom';
import { Funnel } from 'lucide-react';
import type { Column } from '@tanstack/react-table';
import { useOutsideClick } from '../../../../../../hooks';
import type { ScenarioDataGridColumn, ScenarioDataGridNumberRangeValue, ScenarioDataGridSelectFilterValue, ScenarioDataGridTextFilterValue } from '../../types';
import { isPrimitiveColumn } from '../../model/columnMaterialization';
import { normalizeFilterListValue, normalizeSearchValue, removeFilterListEntry, resolveFilterOptions } from '../../model/filterUtils';
import { resolvePrimitiveFilter } from '../../model/primitiveBehavior';
import { NumberRangeFilterPanel } from './NumberRangeFilterPanel';
import { SelectFilterPanel } from './SelectFilterPanel';
import { TextTokenFilterPanel } from './TextTokenFilterPanel';

interface ColumnFilterControlProps<T> {
  column: Column<T, unknown>;
  sourceColumn: ScenarioDataGridColumn<T>;
  rows: T[];
  isOpen: boolean;
  activeCount: number;
  onToggle: () => void;
  onClose: () => void;
}

export function ColumnFilterControl<T>({ column, sourceColumn, rows, isOpen, activeCount, onToggle, onClose }: ColumnFilterControlProps<T>) {
  const filter = isPrimitiveColumn(sourceColumn) ? resolvePrimitiveFilter(sourceColumn) : sourceColumn.filter;
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [draftText, setDraftText] = React.useState('');
  const [optionQuery, setOptionQuery] = React.useState('');
  const [popoverStyle, setPopoverStyle] = React.useState<React.CSSProperties | null>(null);

  useOutsideClick({ refs: [wrapperRef, popoverRef, triggerRef], enabled: isOpen, onOutsideClick: onClose });

  React.useEffect(() => {
    if (!isOpen) {
      setDraftText('');
      setOptionQuery('');
      setPopoverStyle(null);
    }
  }, [isOpen]);

  React.useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePopoverPosition = () => {
      const triggerNode = triggerRef.current;
      if (!triggerNode || typeof window === 'undefined') {
        return;
      }

      const triggerRect = triggerNode.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(320, Math.max(220, viewportWidth - 16));
      const maxLeft = Math.max(8, viewportWidth - width - 8);
      const left = Math.min(Math.max(triggerRect.right - width, 8), maxLeft);
      const measuredHeight = popoverRef.current?.offsetHeight ?? 0;
      const preferredTop = triggerRect.bottom + 8;
      const availableBelow = viewportHeight - preferredTop - 8;
      const shouldPlaceAbove = measuredHeight > 0 && availableBelow < Math.min(measuredHeight, 220) && triggerRect.top - measuredHeight - 8 >= 8;
      const top = shouldPlaceAbove
        ? Math.max(8, triggerRect.top - measuredHeight - 8)
        : Math.min(preferredTop, Math.max(8, viewportHeight - Math.max(measuredHeight, 160) - 8));

      setPopoverStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: `${Math.max(180, viewportHeight - top - 8)}px`,
        zIndex: 80,
      });
    };

    updatePopoverPosition();
    window.addEventListener('resize', updatePopoverPosition);
    window.addEventListener('scroll', updatePopoverPosition, true);
    return () => {
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [isOpen]);

  if (!filter) {
    return null;
  }

  const addTextToken = () => {
    const token = draftText.trim();
    if (!token) {
      return;
    }
    const currentTokens = normalizeFilterListValue(column.getFilterValue());
    const alreadyExists = currentTokens.some((entry) => entry.toLowerCase() === token.toLowerCase());
    if (!alreadyExists) {
      column.setFilterValue([...currentTokens, token] satisfies ScenarioDataGridTextFilterValue);
    }
    setDraftText('');
  };

  const popoverContent = filter.type === 'text'
    ? (
      <TextTokenFilterPanel
        ariaLabel={filter.ariaLabel ?? `Filter ${sourceColumn.header}`}
        draftText={draftText}
        placeholder={filter.placeholder}
        tokens={normalizeFilterListValue(column.getFilterValue())}
        onDraftTextChange={setDraftText}
        onAddToken={addTextToken}
        onRemoveToken={(token) => column.setFilterValue(removeFilterListEntry(column.getFilterValue(), token))}
        onClose={onClose}
      />
    )
    : filter.type === 'select'
      ? (
        <SelectFilterPanel
          ariaLabel={filter.ariaLabel ?? `Filter ${sourceColumn.header}`}
          optionQuery={optionQuery}
          placeholder={filter.placeholder}
          options={resolveFilterOptions(sourceColumn, rows).filter((option) => {
            const query = normalizeSearchValue(optionQuery);
            return !query || normalizeSearchValue(option.label).includes(query);
          })}
          selectedValues={normalizeFilterListValue(column.getFilterValue())}
          onOptionQueryChange={setOptionQuery}
          onToggleSelectedValue={(value) => {
            const currentValues = normalizeFilterListValue(column.getFilterValue());
            const nextValues = currentValues.includes(value)
              ? currentValues.filter((entry) => entry !== value)
              : [...currentValues, value];
            column.setFilterValue(nextValues.length > 0 ? (nextValues satisfies ScenarioDataGridSelectFilterValue) : undefined);
          }}
          onClose={onClose}
        />
      )
      : (
        <NumberRangeFilterPanel
          ariaLabel={filter.ariaLabel ?? sourceColumn.header}
          rangeValue={(column.getFilterValue() as ScenarioDataGridNumberRangeValue | undefined) ?? {}}
          onChange={(value) => column.setFilterValue(value)}
          onClose={onClose}
        />
      );

  return (
    <div ref={wrapperRef} className="relative flex items-center justify-end">
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors hover:border-[var(--color-accent)] hover:text-[var(--text-primary)]"
        style={{
          borderColor: activeCount > 0 ? 'var(--color-accent)' : 'var(--border-primary)',
          backgroundColor: isOpen ? 'var(--bg-primary)' : 'transparent',
          color: activeCount > 0 ? 'var(--color-accent)' : 'var(--text-tertiary)',
        }}
        aria-label={`${isOpen ? 'Close' : 'Open'} filter for ${sourceColumn.header}`}
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        <Funnel className="h-3.5 w-3.5" />
        {activeCount > 0 ? <span>{activeCount}</span> : null}
      </button>

      {isOpen && typeof document !== 'undefined' ? createPortal(
        <div
          ref={popoverRef}
          className="overflow-auto rounded-2xl border p-3 shadow-xl"
          style={{ ...popoverStyle, backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
              {sourceColumn.header} filter
            </div>
            {activeCount > 0 ? (
              <button type="button" className="text-xs font-medium underline" style={{ color: 'var(--color-accent)' }} onClick={() => column.setFilterValue(undefined)}>
                Clear
              </button>
            ) : null}
          </div>
          {popoverContent}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
