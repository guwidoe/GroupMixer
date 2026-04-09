import React, { useMemo, useState } from 'react';
import { ArrowLeft, FileSpreadsheet, Plus, RefreshCcw, Table } from 'lucide-react';
import { Button } from '../../../ui';
import { SetupSectionHeader } from '../../shared/SetupSectionHeader';
import { ScenarioDataGrid } from '../../shared/grid/ScenarioDataGrid';
import { parseCsv, rowsToCsv } from '../../helpers';

interface PeopleBulkEditWorkspaceProps {
  textMode: 'text' | 'grid';
  setTextMode: React.Dispatch<React.SetStateAction<'text' | 'grid'>>;
  csvInput: string;
  setCsvInput: React.Dispatch<React.SetStateAction<string>>;
  headers: string[];
  setHeaders: React.Dispatch<React.SetStateAction<string[]>>;
  rows: Record<string, string>[];
  setRows: React.Dispatch<React.SetStateAction<Record<string, string>[]>>;
  onRefreshFromCurrent: () => void;
  onApply: () => void;
  onClose: () => void;
}

type BulkWorkspaceRow = Record<string, string> & { __rowIndex: number };

function normalizeHeaderLabel(header: string) {
  if (header === 'id') return 'ID';
  if (header === 'name') return 'Name';
  return header;
}

export function PeopleBulkEditWorkspace({
  textMode,
  setTextMode,
  csvInput,
  setCsvInput,
  headers,
  setHeaders,
  rows,
  setRows,
  onRefreshFromCurrent,
  onApply,
  onClose,
}: PeopleBulkEditWorkspaceProps) {
  const [newColumnName, setNewColumnName] = useState('');

  const switchMode = (nextMode: 'text' | 'grid') => {
    if (nextMode === textMode) {
      return;
    }

    if (nextMode === 'text') {
      setCsvInput(rowsToCsv(headers, rows));
      setTextMode('text');
      return;
    }

    const parsed = parseCsv(csvInput);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setTextMode('grid');
  };

  const updateCell = (rowIndex: number, header: string, value: string) => {
    setRows((current) => current.map((row, index) => (index === rowIndex ? { ...row, [header]: value } : row)));
  };

  const addRow = () => {
    const emptyRow = Object.fromEntries(headers.map((header) => [header, ''])) as Record<string, string>;
    setRows((current) => [...current, emptyRow]);
  };

  const addColumn = () => {
    const trimmedName = newColumnName.trim();
    if (!trimmedName || headers.includes(trimmedName)) {
      return;
    }

    setHeaders((current) => [...current, trimmedName]);
    setRows((current) => current.map((row) => ({ ...row, [trimmedName]: row[trimmedName] ?? '' })));
    setNewColumnName('');
  };

  const gridRows = useMemo<BulkWorkspaceRow[]>(
    () => rows.map((row, index) => ({ __rowIndex: index, ...row })),
    [rows],
  );

  const gridColumns = useMemo(
    () => headers.map((header) => ({
      id: header,
      header: normalizeHeaderLabel(header),
      cell: (row: BulkWorkspaceRow) => row[header] || '',
      searchValue: (row: BulkWorkspaceRow) => row[header] || '',
      exportValue: (row: BulkWorkspaceRow) => row[header] || '',
      width: header === 'id' ? 160 : header === 'name' ? 220 : 200,
      editor: {
        type: 'text' as const,
        getValue: (row: BulkWorkspaceRow) => row[header] || '',
        onCommit: (row: BulkWorkspaceRow, value: string | number | string[]) => updateCell(row.__rowIndex, header, String(value)),
        ariaLabel: (row: BulkWorkspaceRow) => `Edit ${normalizeHeaderLabel(header)} for bulk row ${row.__rowIndex + 1}`,
      },
    })),
    [headers, updateCell],
  );

  return (
    <div className="space-y-5">
      <SetupSectionHeader
        title="Bulk Edit People"
        count={rows.length}
        description={(
          <p>
            Edit people inline as a grid or raw CSV. Existing rows update by <strong>id</strong>, new rows add people,
            blank cells keep current values, and <code>__DELETE__</code> removes an attribute value.
          </p>
        )}
        actions={(
          <>
            <Button variant="secondary" leadingIcon={<ArrowLeft className="h-4 w-4" />} onClick={onClose}>
              Back to directory
            </Button>
            <Button variant="primary" leadingIcon={<Table className="h-4 w-4" />} onClick={onApply}>
              Apply Changes
            </Button>
          </>
        )}
      />

      <div
        className="rounded-2xl border p-4"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={textMode === 'grid' ? 'primary' : 'secondary'}
              size="sm"
              leadingIcon={<Table className="h-4 w-4" />}
              onClick={() => switchMode('grid')}
            >
              Data Grid
            </Button>
            <Button
              variant={textMode === 'text' ? 'primary' : 'secondary'}
              size="sm"
              leadingIcon={<FileSpreadsheet className="h-4 w-4" />}
              onClick={() => switchMode('text')}
            >
              CSV
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" leadingIcon={<RefreshCcw className="h-4 w-4" />} onClick={onRefreshFromCurrent}>
              Refresh from Current
            </Button>
            {textMode === 'grid' ? (
              <>
                <Button variant="secondary" size="sm" leadingIcon={<Plus className="h-4 w-4" />} onClick={addRow}>
                  Add row
                </Button>
                <div className="flex items-center gap-2 rounded-xl border px-2 py-2" style={{ borderColor: 'var(--border-primary)' }}>
                  <input
                    type="text"
                    value={newColumnName}
                    onChange={(event) => setNewColumnName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addColumn();
                      }
                    }}
                    placeholder="New column"
                    className="input h-9 w-40"
                    aria-label="New bulk-edit column name"
                  />
                  <Button variant="secondary" size="sm" onClick={addColumn} disabled={!newColumnName.trim() || headers.includes(newColumnName.trim())}>
                    Add column
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {textMode === 'grid'
            ? 'Use the inline grid to update current people, add new rows, and introduce new attribute columns.'
            : 'Edit raw CSV inline. Switching back to Data Grid reparses the current CSV.'}
        </div>

        <div className="mt-4">
          {textMode === 'grid' ? (
            headers.length > 0 ? (
              <ScenarioDataGrid
                rows={gridRows}
                rowKey={(row) => String(row.__rowIndex)}
                columns={gridColumns}
                emptyState={<div className="text-sm" style={{ color: 'var(--text-secondary)' }}>No bulk rows yet.</div>}
                showGlobalSearch={false}
                showCsvExport={false}
                defaultEditMode
                showEditToggle={false}
                searchSummary={({ filteredCount }) => (
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Editing {filteredCount} row{filteredCount === 1 ? '' : 's'}.
                  </div>
                )}
                maxHeight="min(62vh, calc(100vh - 21rem))"
              />
            ) : (
              <div className="rounded-xl border px-4 py-10 text-sm" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
                No columns yet. Refresh from current people or add a column to start editing.
              </div>
            )
          ) : (
            <textarea
              value={csvInput}
              onChange={(event) => setCsvInput(event.target.value)}
              className="min-h-[24rem] w-full rounded-2xl border p-3 font-mono text-sm"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              aria-label="Bulk edit CSV"
              placeholder="id,name,attribute1,attribute2"
            />
          )}
        </div>
      </div>
    </div>
  );
}
