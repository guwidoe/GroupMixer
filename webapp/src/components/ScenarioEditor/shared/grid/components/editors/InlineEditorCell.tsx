import React from 'react';
import type { ScenarioDataGridColumnEditor, ScenarioDataGridOption } from '../../types';
import { InlineMultiSelectEditor } from './InlineMultiSelectEditor';
import { InlineSelectEditor } from './InlineSelectEditor';
import { InlineTextEditor } from './InlineTextEditor';

function getEditorOptions<T>(editor: ScenarioDataGridColumnEditor<T>, row: T): ScenarioDataGridOption[] {
  if (!editor.options) {
    return [];
  }
  return typeof editor.options === 'function' ? editor.options(row) : editor.options;
}

export function InlineEditorCell<T>({ row, editor }: { row: T; editor: ScenarioDataGridColumnEditor<T> }) {
  const resolvedValue = editor.getValue(row);
  const normalizedValue = React.useMemo(() => {
    if (editor.type === 'multiselect') {
      return Array.isArray(resolvedValue) ? resolvedValue.map(String) : [];
    }
    return resolvedValue == null ? '' : String(resolvedValue);
  }, [editor.type, resolvedValue]);

  const options = React.useMemo(() => getEditorOptions(editor, row), [editor, row]);
  const ariaLabel = typeof editor.ariaLabel === 'function' ? editor.ariaLabel(row) : editor.ariaLabel;
  const disabled = editor.disabled?.(row) ?? false;

  const commit = React.useCallback((nextValue: string | string[]) => {
    const parsedValue = editor.parseValue ? editor.parseValue(nextValue, row) : nextValue;

    if (Array.isArray(normalizedValue)) {
      const nextList = Array.isArray(nextValue) ? nextValue : [nextValue];
      if (JSON.stringify(normalizedValue) === JSON.stringify(nextList)) {
        return;
      }
    } else if (!Array.isArray(nextValue) && normalizedValue === String(nextValue)) {
      return;
    }

    editor.onCommit(row, parsedValue);
  }, [editor, normalizedValue, row]);

  if (editor.type === 'select') {
    return <InlineSelectEditor ariaLabel={ariaLabel} disabled={disabled} options={options} value={typeof normalizedValue === 'string' ? normalizedValue : ''} onCommit={commit} />;
  }

  if (editor.type === 'multiselect') {
    return <InlineMultiSelectEditor ariaLabel={ariaLabel} disabled={disabled} options={options} value={Array.isArray(normalizedValue) ? normalizedValue : []} onCommit={commit} />;
  }

  return (
    <InlineTextEditor
      ariaLabel={ariaLabel}
      disabled={disabled}
      placeholder={editor.placeholder}
      value={typeof normalizedValue === 'string' ? normalizedValue : ''}
      inputType={editor.type === 'number' ? 'number' : 'text'}
      onCommit={(value) => commit(value)}
    />
  );
}
